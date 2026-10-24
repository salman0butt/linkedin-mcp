import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, normalize, parse } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { types as utilTypes } from 'node:util';

import { normalizeArticleDraft, type ArticleDraft } from './article-project.js';

const MAX_PROJECTS = 50;
const MAX_HISTORY = 2_048;
const MAX_BYTES = 8 * 1_048_576;
const INITIALIZED = 'linkedin-mcp.article-store.initialized.v1\n';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,127}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export type ArticleStoreErrorKind =
  | 'invalid_input'
  | 'not_found'
  | 'revision_conflict'
  | 'idempotency_conflict'
  | 'capacity'
  | 'unsafe_store'
  | 'outcome_unknown';

/** Stable, sanitized error taxonomy; never includes a user source, path or draft text. */
export class ArticleStoreError extends Error {
  constructor(readonly kind: ArticleStoreErrorKind) {
    super(
      (
        {
          invalid_input: 'Invalid article-store input.',
          not_found: 'Article project does not exist.',
          revision_conflict: 'Article project revision is stale.',
          idempotency_conflict: 'Article creation key conflicts with an earlier request.',
          capacity: 'Private article-store capacity exceeded.',
          unsafe_store: 'Private article-store state is unsafe or unavailable.',
          outcome_unknown: 'Article-store commit outcome is uncertain; inspect or retry using the same key.',
        } as const
      )[kind],
    );
    this.name = 'ArticleStoreError';
  }
}

function fail(kind: ArticleStoreErrorKind): never {
  throw new ArticleStoreError(kind);
}

export interface ArticleProject {
  readonly id: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly draft: ArticleDraft;
}

export interface ArticleProjectSummary {
  readonly id: string;
  readonly title: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LocalArticleStore {
  create(input: { idempotencyKey: string; draft: unknown }): Promise<ArticleProject>;
  update(input: { id: string; expectedRevision: number; draft: unknown }): Promise<ArticleProject>;
  get(input: { id: string }): Promise<ArticleProject | null>;
  list(): Promise<readonly ArticleProjectSummary[]>;
  remove(input: { id: string; expectedRevision: number }): Promise<boolean>;
}

interface CreateHistory {
  key: string;
  payloadHash: string;
  projectId: string;
}

interface StoreState {
  version: 1;
  projects: ArticleProject[];
  idempotency: CreateHistory[];
}

function record(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    fail('invalid_input');
  }
  const object = value as Record<string, unknown>;
  if (Object.getPrototypeOf(object) !== Object.prototype) fail('invalid_input');
  const keys = Reflect.ownKeys(object);
  if (keys.some((key) => typeof key !== 'string' || (!required.includes(key) && !optional.includes(key)))) {
    fail('invalid_input');
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail('invalid_input');
  }
  if (required.some((key) => !Object.hasOwn(object, key))) fail('invalid_input');
  return object;
}

function uuid(input: unknown): string {
  if (typeof input !== 'string' || !UUID.test(input)) fail('invalid_input');
  return input;
}

function revision(input: unknown): number {
  if (!Number.isSafeInteger(input) || (input as number) < 1) fail('invalid_input');
  return input as number;
}

function timestamp(input: unknown): string {
  if (typeof input !== 'string' || !DATE.test(input)) fail('invalid_input');
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== input) fail('invalid_input');
  return input;
}

function key(input: unknown): string {
  if (typeof input !== 'string' || !KEY.test(input)) fail('invalid_input');
  return input;
}

function cleanDraft(input: unknown): ArticleDraft {
  try {
    return normalizeArticleDraft(input);
  } catch {
    fail('invalid_input');
  }
}

function hash(draft: ArticleDraft): string {
  return createHash('sha256').update(JSON.stringify(draft)).digest('hex');
}

function parseState(bytes: string): StoreState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch {
    fail('unsafe_store');
  }
  let validated: StoreState;
  try {
    const root = record(parsed, ['version', 'projects', 'idempotency']);
    if (root.version !== 1 || !Array.isArray(root.projects) || !Array.isArray(root.idempotency))
      fail('invalid_input');
    if (root.projects.length > MAX_PROJECTS || root.idempotency.length > MAX_HISTORY) fail('invalid_input');
    const projects: ArticleProject[] = [];
    const ids = new Set<string>();
    for (const value of root.projects) {
      const entry = record(value, ['id', 'revision', 'createdAt', 'updatedAt', 'draft']);
      const id = uuid(entry.id);
      if (ids.has(id)) fail('invalid_input');
      ids.add(id);
      const createdAt = timestamp(entry.createdAt);
      const updatedAt = timestamp(entry.updatedAt);
      if (updatedAt < createdAt) fail('invalid_input');
      const currentRevision = revision(entry.revision);
      const draft = cleanDraft(entry.draft);
      if (JSON.stringify(draft) !== JSON.stringify(entry.draft)) fail('invalid_input');
      projects.push({ id, revision: currentRevision, createdAt, updatedAt, draft });
    }
    const idempotency: CreateHistory[] = [];
    const keys = new Set<string>();
    for (const value of root.idempotency) {
      const entry = record(value, ['key', 'payloadHash', 'projectId']);
      const idempotencyKey = key(entry.key);
      const payloadHash = entry.payloadHash;
      const projectId = uuid(entry.projectId);
      if (typeof payloadHash !== 'string' || !HASH.test(payloadHash) || keys.has(idempotencyKey)) {
        fail('invalid_input');
      }
      keys.add(idempotencyKey);
      // History deliberately retains deleted project IDs (tombstones), so a
      // replay after deletion cannot recreate a supposedly one-time request.
      idempotency.push({ key: idempotencyKey, payloadHash, projectId });
    }
    if (root.projects.length > 0 && root.idempotency.length === 0) fail('invalid_input');
    for (const project of projects) {
      const linked = idempotency.filter((entry) => entry.projectId === project.id);
      if (linked.length !== 1) fail('invalid_input');
      if (project.revision === 1 && linked[0]!.payloadHash !== hash(project.draft)) {
        fail('invalid_input');
      }
    }
    validated = { version: 1, projects, idempotency };
    if (JSON.stringify(validated) !== bytes) fail('invalid_input');
  } catch {
    fail('unsafe_store');
  }
  return validated;
}

interface StatShape {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
  mode: number;
  uid: number;
  nlink: number;
}

function checkStat(stat: StatShape, type: 'file' | 'directory', strict: boolean): void {
  if (stat.isSymbolicLink() || (type === 'file' ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())) {
    fail('unsafe_store');
  }
  const userId = process.getuid?.();
  if (userId === undefined || (strict ? stat.uid !== userId : stat.uid !== userId && stat.uid !== 0)) {
    fail('unsafe_store');
  }
  const mode = stat.mode & 0o7777;
  if (strict && mode !== (type === 'file' ? 0o600 : 0o700)) fail('unsafe_store');
  if (!strict && (mode & 0o022) !== 0 && !(stat.uid === 0 && (mode & 0o1000) !== 0)) {
    fail('unsafe_store');
  }
}

interface DirectoryPin {
  path: string;
  dev: number;
  ino: number;
  strict: boolean;
}

async function pinParent(path: string): Promise<readonly DirectoryPin[]> {
  const parent = dirname(path);
  const parts: string[] = [];
  let current = parent;
  while (current !== parse(current).root) {
    parts.unshift(current);
    current = dirname(current);
  }
  parts.unshift(current);
  const pinned: DirectoryPin[] = [];
  for (const part of parts) {
    let stat;
    try {
      stat = await lstat(part);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try {
        await mkdir(part, { mode: 0o700 });
      } catch (created) {
        // Two independent STDIO instances may both initialize the same
        // private directory; validate the winner after EEXIST.
        if ((created as NodeJS.ErrnoException).code !== 'EEXIST') throw created;
      }
      stat = await lstat(part);
    }
    checkStat(stat, 'directory', part === parent);
    pinned.push({ path: part, dev: stat.dev, ino: stat.ino, strict: part === parent });
  }
  return pinned;
}

async function assertPinned(pins: readonly DirectoryPin[]): Promise<void> {
  for (const pin of pins) {
    const stat = await lstat(pin.path);
    checkStat(stat, 'directory', pin.strict);
    if (stat.dev !== pin.dev || stat.ino !== pin.ino) fail('unsafe_store');
  }
}

async function syncParent(path: string, check: () => Promise<void>): Promise<void> {
  await check();
  const folder = await open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const stat = await folder.stat();
    const current = await lstat(dirname(path));
    if (stat.dev !== current.dev || stat.ino !== current.ino) fail('unsafe_store');
    await folder.sync();
  } finally {
    await folder.close();
  }
  await check();
}

async function statFile(path: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    const stat = await lstat(path);
    checkStat(stat, 'file', true);
    return stat;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function secureRead(path: string, maxBytes: number): Promise<string | null> {
  const before = await statFile(path);
  if (before === null) return null;
  if (before.size > maxBytes) fail('unsafe_store');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const after = await handle.stat();
    checkStat(after, 'file', true);
    if (after.dev !== before.dev || after.ino !== before.ino || after.size > maxBytes) {
      fail('unsafe_store');
    }
    const bytes = await handle.readFile();
    if (bytes.length > maxBytes) fail('unsafe_store');
    // Buffer's UTF-8 decoding silently replaces corrupt bytes with U+FFFD.
    // That can transform author prose after a later revision's SHA is no
    // longer identical to its original create history. Reject byte corruption.
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      fail('unsafe_store');
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return fail('unsafe_store');
    }
  } finally {
    await handle.close();
  }
}

async function noOrphanTemp(path: string): Promise<void> {
  const prefix = `.${basename(path)}.`;
  if ((await readdir(dirname(path))).some((entry) => entry.startsWith(prefix) && entry.endsWith('.tmp'))) {
    fail('unsafe_store');
  }
}

async function readState(path: string): Promise<StoreState | null> {
  await noOrphanTemp(path);
  const sentinel = await secureRead(path + '.initialized', 256);
  const state = await secureRead(path, MAX_BYTES);
  if (sentinel === null && state === null) return null;
  if (sentinel !== INITIALIZED || state === null) fail('unsafe_store');
  return parseState(state);
}

/** Commit a prepared state atomically. After rename any error is outcome_unknown. */
async function commitState(path: string, state: StoreState, check: () => Promise<void>): Promise<void> {
  if (state.projects.length > MAX_PROJECTS || state.idempotency.length > MAX_HISTORY) fail('capacity');
  const serialized = JSON.stringify(state);
  const bytes = Buffer.from(serialized);
  if (bytes.length > MAX_BYTES) fail('capacity');
  await check();
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  const handle = await open(
    temp,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  let renamed = false;
  try {
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await check();
    await statFile(path);
    await check();
    await rename(temp, path);
    renamed = true;
    await syncParent(path, check);
    const persisted = await secureRead(path, MAX_BYTES);
    if (persisted !== serialized) fail('outcome_unknown');
    await check();
  } catch {
    if (renamed) fail('outcome_unknown');
    fail('unsafe_store');
  }
  // Interrupted pre-rename temps are deliberately retained for manual recovery.
}

async function initializeSentinel(path: string, check: () => Promise<void>): Promise<void> {
  await check();
  if ((await statFile(path + '.initialized')) !== null || (await statFile(path)) !== null) {
    fail('unsafe_store');
  }
  const handle = await open(
    path + '.initialized',
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(INITIALIZED);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncParent(path, check);
}

function summary(project: ArticleProject): ArticleProjectSummary {
  return {
    id: project.id,
    title: project.draft.title,
    revision: project.revision,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/**
 * OS-user private local project store. Never construct from untrusted MCP input.
 * A malicious actor controlling the same OS UID can race ordinary path-based
 * operations; atomic openat semantics are not claimed.
 */
export function createLocalArticleStore(options: {
  transport: 'stdio' | 'http';
  filePath?: string;
  lockTimeoutMs?: number;
}): LocalArticleStore | null {
  if (options.transport === 'http' || (options.transport === 'stdio' && options.filePath === undefined)) {
    return null;
  }
  const filePath = options.filePath;
  if (
    options.transport !== 'stdio' ||
    typeof filePath !== 'string' ||
    !isAbsolute(filePath) ||
    normalize(filePath) !== filePath ||
    filePath === parse(filePath).root ||
    filePath.endsWith('/') ||
    filePath.length > 2_048 ||
    filePath.includes('\0') ||
    filePath.split(/[\\/]/u).some((segment) => segment === '.' || segment === '..') ||
    basename(filePath).endsWith('.lock') ||
    basename(filePath).endsWith('.initialized')
  ) {
    fail('invalid_input');
  }
  const path = filePath;
  const timeout = options.lockTimeoutMs ?? 5_000;
  if (!Number.isSafeInteger(timeout) || timeout < 10 || timeout > 30_000) fail('invalid_input');
  const lockPath = path + '.lock';

  async function withLock<T>(
    fn: (state: StoreState | null, check: () => Promise<void>, markWrite: () => void) => T | Promise<T>,
  ): Promise<T> {
    try {
      const pins = await pinParent(path);
      const check = () => assertPinned(pins);
      await check();
      const deadline = Date.now() + timeout;
      let lock: Awaited<ReturnType<typeof open>>;
      for (;;) {
        try {
          lock = await open(
            lockPath,
            constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
            0o600,
          );
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          if (Date.now() >= deadline) fail('unsafe_store');
          await delay(Math.min(10, Math.max(1, deadline - Date.now())));
        }
      }
      const lockIdentity = await lock.stat();
      let writeStarted = false;
      try {
        await check();
        const state = await readState(path);
        await check();
        const result = await fn(state, check, () => {
          writeStarted = true;
        });
        await check();
        return result;
      } finally {
        try {
          await lock.close();
          await check();
          const current = await lstat(lockPath);
          checkStat(current, 'file', true);
          if (current.dev !== lockIdentity.dev || current.ino !== lockIdentity.ino) fail('unsafe_store');
          await unlink(lockPath);
        } catch {
          // A post-commit cleanup failure must never be reported as definite
          // failure when a write may already have been persisted.
          fail(writeStarted ? 'outcome_unknown' : 'unsafe_store');
        }
      }
    } catch (error) {
      if (error instanceof ArticleStoreError) throw error;
      fail('unsafe_store');
    }
  }

  const requireState = (state: StoreState | null): StoreState => state ?? fail('not_found');
  return {
    async create(input) {
      const args = record(input, ['idempotencyKey', 'draft']);
      const idempotencyKey = key(args.idempotencyKey);
      const canonical = cleanDraft(args.draft);
      const payloadHash = hash(canonical);
      return withLock(async (state, check, markWrite) => {
        if (state === null) {
          markWrite();
          await initializeSentinel(path, check);
          state = { version: 1, projects: [], idempotency: [] };
        }
        const used = state.idempotency.find((entry) => entry.key === idempotencyKey);
        if (used) {
          if (used.payloadHash !== payloadHash) fail('idempotency_conflict');
          const project = state.projects.find((item) => item.id === used.projectId);
          if (!project) fail('idempotency_conflict');
          return project;
        }
        if (state.projects.length >= MAX_PROJECTS || state.idempotency.length >= MAX_HISTORY)
          fail('capacity');
        const now = new Date().toISOString();
        const project: ArticleProject = {
          id: randomUUID(),
          revision: 1,
          createdAt: now,
          updatedAt: now,
          draft: canonical,
        };
        state.projects.push(project);
        state.idempotency.push({ key: idempotencyKey, payloadHash, projectId: project.id });
        markWrite();
        await commitState(path, state, check);
        return project;
      });
    },
    async update(input) {
      const args = record(input, ['id', 'expectedRevision', 'draft']);
      const id = uuid(args.id);
      const expectedRevision = revision(args.expectedRevision);
      const canonical = cleanDraft(args.draft);
      return withLock(async (raw, check, markWrite) => {
        const state = requireState(raw);
        const index = state.projects.findIndex((project) => project.id === id);
        if (index === -1) fail('not_found');
        const previous = state.projects[index]!;
        if (previous.revision !== expectedRevision) fail('revision_conflict');
        if (previous.revision >= Number.MAX_SAFE_INTEGER) fail('capacity');
        const project: ArticleProject = {
          ...previous,
          revision: previous.revision + 1,
          updatedAt: new Date(Math.max(Date.now(), Date.parse(previous.updatedAt))).toISOString(),
          draft: canonical,
        };
        state.projects[index] = project;
        markWrite();
        await commitState(path, state, check);
        return project;
      });
    },
    async get(input) {
      const args = record(input, ['id']);
      const id = uuid(args.id);
      return withLock((state) => state?.projects.find((project) => project.id === id) ?? null);
    },
    async list() {
      return withLock((state) => (state?.projects ?? []).map(summary));
    },
    async remove(input) {
      const args = record(input, ['id', 'expectedRevision']);
      const id = uuid(args.id);
      const expectedRevision = revision(args.expectedRevision);
      return withLock(async (raw, check, markWrite) => {
        if (raw === null) return false;
        const index = raw.projects.findIndex((project) => project.id === id);
        if (index === -1) return false;
        if (raw.projects[index]!.revision !== expectedRevision) fail('revision_conflict');
        raw.projects.splice(index, 1);
        markWrite();
        await commitState(path, raw, check);
        return true;
      });
    },
  };
}
