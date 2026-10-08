import { randomBytes } from 'node:crypto';

const provider = 'LOCAL_ONLY' as const;
const defaultTtlMs = 5 * 60_000;
const maxTtlMs = 10 * 60_000;

export type ApprovalServiceErrorKind = 'not_found' | 'mismatch' | 'expired' | 'already_consumed';

export class ApprovalServiceError extends Error {
  readonly kind: ApprovalServiceErrorKind;

  constructor(kind: ApprovalServiceErrorKind) {
    super(`Approval receipt rejected: ${kind}`);
    this.name = 'ApprovalServiceError';
    this.kind = kind;
  }
}

export interface ApprovalReceipt {
  receiptId: string;
  payloadHash: string;
  expiresAt: string;
  provider: typeof provider;
}

export interface ApprovalIssueInput {
  payloadHash: string;
  subject: string;
}

export interface ApprovalConsumeInput extends ApprovalIssueInput {
  receiptId: string;
  idempotencyKey: string;
}

export interface ApprovalConsumeResult {
  status: 'initiated' | 'replay';
  idempotencyKey: string;
}

export interface ApprovalService {
  issue(input: ApprovalIssueInput): ApprovalReceipt;
  consume(input: ApprovalConsumeInput): ApprovalConsumeResult;
}

interface ApprovalServiceDeps {
  now?: () => Date;
  randomId?: () => string;
  ttlMs?: number;
}

interface ApprovalRecord {
  payloadHash: string;
  subject: string;
  expiresAtMs: number;
  consumedBy?: string;
}

function defaultRandomId(): string {
  return randomBytes(32).toString('base64url');
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) throw new Error(`${name} must be non-empty`);
}

function assertPayloadHash(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('payloadHash must be a lowercase SHA-256 hex digest');
}

export function createApprovalService(deps: ApprovalServiceDeps = {}): ApprovalService {
  const now = deps.now ?? (() => new Date());
  const randomId = deps.randomId ?? defaultRandomId;
  const ttlMs = deps.ttlMs ?? defaultTtlMs;

  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > maxTtlMs) {
    throw new Error(`Approval ttlMs must be greater than zero and at most ${maxTtlMs}`);
  }

  const records = new Map<string, ApprovalRecord>();

  return {
    issue(input) {
      assertPayloadHash(input.payloadHash);
      assertNonEmpty(input.subject, 'subject');

      const receiptId = randomId();
      assertNonEmpty(receiptId, 'receiptId');
      if (records.has(receiptId)) throw new Error('Approval receipt identifier collision');

      const expiresAtMs = now().getTime() + ttlMs;
      records.set(receiptId, {
        payloadHash: input.payloadHash,
        subject: input.subject,
        expiresAtMs,
      });

      return {
        receiptId,
        payloadHash: input.payloadHash,
        expiresAt: new Date(expiresAtMs).toISOString(),
        provider,
      };
    },

    consume(input) {
      assertNonEmpty(input.receiptId, 'receiptId');
      assertPayloadHash(input.payloadHash);
      assertNonEmpty(input.subject, 'subject');
      assertNonEmpty(input.idempotencyKey, 'idempotencyKey');

      const record = records.get(input.receiptId);
      if (record === undefined) throw new ApprovalServiceError('not_found');
      if (record.payloadHash !== input.payloadHash || record.subject !== input.subject) {
        throw new ApprovalServiceError('mismatch');
      }

      if (record.consumedBy !== undefined) {
        if (record.consumedBy === input.idempotencyKey) {
          return { status: 'replay', idempotencyKey: input.idempotencyKey };
        }
        throw new ApprovalServiceError('already_consumed');
      }

      if (now().getTime() >= record.expiresAtMs) throw new ApprovalServiceError('expired');

      record.consumedBy = input.idempotencyKey;
      return { status: 'initiated', idempotencyKey: input.idempotencyKey };
    },
  };
}
