import { randomBytes } from 'node:crypto';
import {
  mkdir as fsMkdir,
  readFile as fsReadFile,
  rename as fsRename,
  unlink as fsUnlink,
  writeFile as fsWriteFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const STORE_VERSION = 2 as const;
const LEGACY_STORE_VERSION = 1 as const;
const terminalStates = ['succeeded', 'failed_terminal', 'outcome_unknown'] as const;
const mediaUploadStates = ['pending', 'uploaded', 'available', 'verification_unavailable'] as const;

export type MutationState = 'reserved' | (typeof terminalStates)[number];
export type MediaUploadState = (typeof mediaUploadStates)[number];
export type IdempotencyLedgerErrorKind =
  | 'conflict'
  | 'not_reserved'
  | 'corrupt_store'
  | 'store_unavailable'
  | 'write_failed';

export class IdempotencyLedgerError extends Error {
  readonly kind: IdempotencyLedgerErrorKind;

  constructor(kind: IdempotencyLedgerErrorKind) {
    super(`Idempotency ledger rejected operation: ${kind}`);
    this.name = 'IdempotencyLedgerError';
    this.kind = kind;
  }
}

export interface MutationResult {
  postUrn?: string;
  errorCode?: string;
}

export interface MediaCheckpoint {
  sha256: string;
  imageUrn?: string;
  uploadState: MediaUploadState;
}

export interface MutationRecord {
  idempotencyKey: string;
  payloadHash: string;
  state: MutationState;
  createdAt: string;
  updatedAt: string;
  result?: MutationResult;
  media?: MediaCheckpoint[];
}

export interface ReserveMutationInput {
  idempotencyKey: string;
  payloadHash: string;
}

export interface ReserveMutationResult {
  status: 'reserved' | 'replay';
  record: MutationRecord;
}

export interface CompleteMutationInput extends ReserveMutationInput {
  state: Exclude<MutationState, 'reserved'>;
  result?: MutationResult;
}

export interface CheckpointMediaInput extends ReserveMutationInput {
  index: number;
  checkpoint: MediaCheckpoint;
}

export interface IdempotencyLedger {
  reserve(input: ReserveMutationInput): Promise<ReserveMutationResult>;
  complete(input: CompleteMutationInput): Promise<MutationRecord>;
}

export interface MediaIdempotencyLedger extends IdempotencyLedger {
  checkpointMedia(input: CheckpointMediaInput): Promise<MutationRecord>;
}

interface PersistedStore {
  version: typeof STORE_VERSION;
  records: MutationRecord[];
}

interface IdempotencyFilesystem {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(
    path: string,
    data: string,
    options: { encoding: 'utf8'; mode: number; flag: 'wx' },
  ): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdir(path: string, options: { recursive: true; mode: number }): Promise<unknown>;
  unlink(path: string): Promise<void>;
}

export interface FileIdempotencyLedgerOptions {
  filePath: string;
  now?: () => Date;
  filesystem?: Partial<IdempotencyFilesystem>;
}

const defaultFilesystem: IdempotencyFilesystem = {
  readFile: (path, encoding) => fsReadFile(path, encoding),
  writeFile: (path, data, options) => fsWriteFile(path, data, options),
  rename: (oldPath, newPath) => fsRename(oldPath, newPath),
  mkdir: (path, options) => fsMkdir(path, options),
  unlink: (path) => fsUnlink(path),
};

function isErrno(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) throw new Error(`${name} must be non-empty`);
}

function assertPayloadHash(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('payloadHash must be a lowercase SHA-256 hex digest');
  }
}

function assertExactKeys(candidate: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(candidate).some((key) => !allowed.includes(key))) {
    throw new IdempotencyLedgerError('corrupt_store');
  }
}

function parseIsoDate(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new IdempotencyLedgerError('corrupt_store');
  }
  return value;
}

function parseResult(value: unknown): MutationResult | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new IdempotencyLedgerError('corrupt_store');
  }

  const candidate = value as Record<string, unknown>;
  assertExactKeys(candidate, ['postUrn', 'errorCode']);
  if (candidate.postUrn !== undefined && typeof candidate.postUrn !== 'string') {
    throw new IdempotencyLedgerError('corrupt_store');
  }
  if (candidate.errorCode !== undefined && typeof candidate.errorCode !== 'string') {
    throw new IdempotencyLedgerError('corrupt_store');
  }

  return {
    ...(candidate.postUrn === undefined ? {} : { postUrn: candidate.postUrn }),
    ...(candidate.errorCode === undefined ? {} : { errorCode: candidate.errorCode }),
  };
}

function parseMediaCheckpoint(value: unknown): MediaCheckpoint {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new IdempotencyLedgerError('corrupt_store');
  }

  const candidate = value as Record<string, unknown>;
  assertExactKeys(candidate, ['sha256', 'imageUrn', 'uploadState']);
  if (typeof candidate.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(candidate.sha256)) {
    throw new IdempotencyLedgerError('corrupt_store');
  }
  if (
    candidate.imageUrn !== undefined &&
    (typeof candidate.imageUrn !== 'string' || !/^urn:li:image:[^\s]+$/.test(candidate.imageUrn))
  ) {
    throw new IdempotencyLedgerError('corrupt_store');
  }
  if (!mediaUploadStates.includes(candidate.uploadState as MediaUploadState)) {
    throw new IdempotencyLedgerError('corrupt_store');
  }

  return {
    sha256: candidate.sha256,
    ...(candidate.imageUrn === undefined ? {} : { imageUrn: candidate.imageUrn }),
    uploadState: candidate.uploadState as MediaUploadState,
  };
}

function parseRecord(value: unknown, allowMedia: boolean): MutationRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new IdempotencyLedgerError('corrupt_store');
  }

  const candidate = value as Record<string, unknown>;
  assertExactKeys(candidate, [
    'idempotencyKey',
    'payloadHash',
    'state',
    'createdAt',
    'updatedAt',
    'result',
    ...(allowMedia ? ['media'] : []),
  ]);
  if (
    typeof candidate.idempotencyKey !== 'string' ||
    candidate.idempotencyKey.trim() === '' ||
    typeof candidate.payloadHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(candidate.payloadHash) ||
    (candidate.state !== 'reserved' && !terminalStates.includes(candidate.state as never))
  ) {
    throw new IdempotencyLedgerError('corrupt_store');
  }

  const result = parseResult(candidate.result);
  if (candidate.state === 'reserved' && result !== undefined) {
    throw new IdempotencyLedgerError('corrupt_store');
  }
  if (candidate.media !== undefined && !Array.isArray(candidate.media)) {
    throw new IdempotencyLedgerError('corrupt_store');
  }
  const media = candidate.media?.map(parseMediaCheckpoint);

  return {
    idempotencyKey: candidate.idempotencyKey,
    payloadHash: candidate.payloadHash,
    state: candidate.state as MutationState,
    createdAt: parseIsoDate(candidate.createdAt),
    updatedAt: parseIsoDate(candidate.updatedAt),
    ...(result === undefined ? {} : { result }),
    ...(media === undefined ? {} : { media }),
  };
}

function parseStore(raw: string): PersistedStore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new IdempotencyLedgerError('corrupt_store');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new IdempotencyLedgerError('corrupt_store');
  }
  const candidate = parsed as Record<string, unknown>;
  assertExactKeys(candidate, ['version', 'records']);
  if (
    (candidate.version !== LEGACY_STORE_VERSION && candidate.version !== STORE_VERSION) ||
    !Array.isArray(candidate.records)
  ) {
    throw new IdempotencyLedgerError('corrupt_store');
  }

  const allowMedia = candidate.version === STORE_VERSION;
  const records = candidate.records.map((record) => parseRecord(record, allowMedia));
  const keys = new Set<string>();
  for (const record of records) {
    if (keys.has(record.idempotencyKey)) throw new IdempotencyLedgerError('corrupt_store');
    keys.add(record.idempotencyKey);
  }

  return { version: STORE_VERSION, records };
}

function cloneCheckpoint(checkpoint: MediaCheckpoint): MediaCheckpoint {
  return {
    sha256: checkpoint.sha256,
    ...(checkpoint.imageUrn === undefined ? {} : { imageUrn: checkpoint.imageUrn }),
    uploadState: checkpoint.uploadState,
  };
}

function cloneRecord(record: MutationRecord): MutationRecord {
  return {
    idempotencyKey: record.idempotencyKey,
    payloadHash: record.payloadHash,
    state: record.state,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.result === undefined ? {} : { result: { ...record.result } }),
    ...(record.media === undefined ? {} : { media: record.media.map(cloneCheckpoint) }),
  };
}

function validateResult(result: MutationResult | undefined): MutationResult | undefined {
  if (result === undefined) return undefined;
  if (result.postUrn !== undefined) assertNonEmpty(result.postUrn, 'postUrn');
  if (result.errorCode !== undefined) assertNonEmpty(result.errorCode, 'errorCode');
  return { ...result };
}

function validateCheckpoint(checkpoint: MediaCheckpoint): MediaCheckpoint {
  if (checkpoint === null || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) {
    throw new Error('Media checkpoint is invalid');
  }
  const candidate = checkpoint as unknown as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (keys.some((key) => key !== 'sha256' && key !== 'imageUrn' && key !== 'uploadState')) {
    throw new Error('Media checkpoint contains unsupported fields');
  }
  if (typeof checkpoint.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(checkpoint.sha256)) {
    throw new Error('Media checkpoint sha256 must be a lowercase SHA-256 hex digest');
  }
  if (checkpoint.imageUrn !== undefined && !/^urn:li:image:[^\s]+$/.test(checkpoint.imageUrn)) {
    throw new Error('Media checkpoint imageUrn is invalid');
  }
  if (!mediaUploadStates.includes(checkpoint.uploadState)) {
    throw new Error('Media checkpoint uploadState is invalid');
  }
  return cloneCheckpoint(checkpoint);
}

function canTransitionMediaState(from: MediaUploadState, to: MediaUploadState): boolean {
  if (from === to) return true;
  if (from === 'pending') return to === 'uploaded';
  if (from === 'uploaded') return to === 'available' || to === 'verification_unavailable';
  return false;
}

export function createFileIdempotencyLedger(
  options: FileIdempotencyLedgerOptions,
): MediaIdempotencyLedger {
  if (options.filePath.trim() === '') throw new Error('Idempotency ledger file path is required');

  const now = options.now ?? (() => new Date());
  const filesystem: IdempotencyFilesystem = {
    ...defaultFilesystem,
    ...options.filesystem,
  };
  const directory = dirname(options.filePath);
  const lockPath = join(directory, `.${basename(options.filePath)}.lock`);
  let queue: Promise<void> = Promise.resolve();

  async function withFileLock<T>(action: () => Promise<T>): Promise<T> {
    try {
      await filesystem.mkdir(directory, { recursive: true, mode: 0o700 });
      await filesystem.writeFile(lockPath, '', {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
    } catch {
      throw new IdempotencyLedgerError('store_unavailable');
    }

    let result: T;
    try {
      result = await action();
    } catch (error: unknown) {
      try {
        await filesystem.unlink(lockPath);
      } catch {
        // Leave an unremovable lock in place so later writers fail closed.
      }
      throw error;
    }

    try {
      await filesystem.unlink(lockPath);
    } catch {
      throw new IdempotencyLedgerError('store_unavailable');
    }
    return result;
  }

  async function load(): Promise<PersistedStore> {
    try {
      return parseStore(await filesystem.readFile(options.filePath, 'utf8'));
    } catch (error: unknown) {
      if (isErrno(error, 'ENOENT')) return { version: STORE_VERSION, records: [] };
      if (error instanceof IdempotencyLedgerError) throw error;
      throw new IdempotencyLedgerError('store_unavailable');
    }
  }

  async function persist(store: PersistedStore): Promise<void> {
    const temporaryPath = join(
      directory,
      `.${basename(options.filePath)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`,
    );
    const serialized = `${JSON.stringify({ version: STORE_VERSION, records: store.records })}\n`;

    try {
      await filesystem.mkdir(directory, { recursive: true, mode: 0o700 });
      await filesystem.writeFile(temporaryPath, serialized, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      await filesystem.rename(temporaryPath, options.filePath);
    } catch {
      try {
        await filesystem.unlink(temporaryPath);
      } catch (cleanupError: unknown) {
        if (!isErrno(cleanupError, 'ENOENT')) {
          // Preserve the original failure while leaving the prior ledger as source of truth.
        }
      }
      throw new IdempotencyLedgerError('write_failed');
    }
  }

  function serialize<T>(action: () => Promise<T>): Promise<T> {
    const result = queue.then(action, action);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return {
    reserve(input) {
      return serialize(() =>
        withFileLock(async () => {
          assertNonEmpty(input.idempotencyKey, 'idempotencyKey');
          assertPayloadHash(input.payloadHash);

          const store = await load();
          const existing = store.records.find((record) => record.idempotencyKey === input.idempotencyKey);
          if (existing !== undefined) {
            if (existing.payloadHash !== input.payloadHash) {
              throw new IdempotencyLedgerError('conflict');
            }
            return { status: 'replay' as const, record: cloneRecord(existing) };
          }

          const timestamp = now().toISOString();
          const record: MutationRecord = {
            idempotencyKey: input.idempotencyKey,
            payloadHash: input.payloadHash,
            state: 'reserved',
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          store.records.push(record);
          await persist(store);
          return { status: 'reserved' as const, record: cloneRecord(record) };
        }),
      );
    },

    checkpointMedia(input) {
      return serialize(() =>
        withFileLock(async () => {
          assertNonEmpty(input.idempotencyKey, 'idempotencyKey');
          assertPayloadHash(input.payloadHash);
          if (!Number.isInteger(input.index) || input.index < 0) {
            throw new Error('Media checkpoint index must be a non-negative integer');
          }
          const checkpoint = validateCheckpoint(input.checkpoint);

          const store = await load();
          const existing = store.records.find((record) => record.idempotencyKey === input.idempotencyKey);
          if (existing === undefined) throw new IdempotencyLedgerError('not_reserved');
          if (existing.payloadHash !== input.payloadHash) throw new IdempotencyLedgerError('conflict');
          if (existing.state !== 'reserved') return cloneRecord(existing);

          const media = existing.media ?? [];
          if (input.index > media.length) throw new IdempotencyLedgerError('conflict');
          const previous = media[input.index];
          if (previous !== undefined) {
            if (previous.sha256 !== checkpoint.sha256) throw new IdempotencyLedgerError('conflict');
            if (
              previous.imageUrn !== undefined &&
              checkpoint.imageUrn !== undefined &&
              previous.imageUrn !== checkpoint.imageUrn
            ) {
              throw new IdempotencyLedgerError('conflict');
            }
            if (!canTransitionMediaState(previous.uploadState, checkpoint.uploadState)) {
              throw new IdempotencyLedgerError('conflict');
            }
            media[input.index] = {
              sha256: previous.sha256,
              ...(previous.imageUrn === undefined && checkpoint.imageUrn === undefined
                ? {}
                : { imageUrn: previous.imageUrn ?? checkpoint.imageUrn }),
              uploadState: checkpoint.uploadState,
            };
          } else {
            media.push(checkpoint);
          }

          existing.media = media;
          existing.updatedAt = now().toISOString();
          await persist(store);
          return cloneRecord(existing);
        }),
      );
    },

    complete(input) {
      return serialize(() =>
        withFileLock(async () => {
          assertNonEmpty(input.idempotencyKey, 'idempotencyKey');
          assertPayloadHash(input.payloadHash);
          if (!terminalStates.includes(input.state)) throw new Error('Completion state must be terminal');
          const result = validateResult(input.result);

          const store = await load();
          const existing = store.records.find((record) => record.idempotencyKey === input.idempotencyKey);
          if (existing === undefined) throw new IdempotencyLedgerError('not_reserved');
          if (existing.payloadHash !== input.payloadHash) throw new IdempotencyLedgerError('conflict');
          if (existing.state !== 'reserved') return cloneRecord(existing);

          existing.state = input.state;
          existing.updatedAt = now().toISOString();
          if (result !== undefined) existing.result = result;
          await persist(store);
          return cloneRecord(existing);
        }),
      );
    },
  };
}
