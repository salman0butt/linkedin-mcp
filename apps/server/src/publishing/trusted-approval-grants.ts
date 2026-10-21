import { randomBytes } from 'node:crypto';

import { purposePayloadHash } from './approval-service.js';

export type TrustedApprovalPurpose =
  | 'posts.text'
  | 'posts.media'
  | 'comments.reply'
  | 'reactions.add'
  | 'reactions.remove';

export interface TrustedApprovalGrantInput {
  subject: string;
  purpose: TrustedApprovalPurpose;
  payloadHash: string;
}

export interface TrustedApprovalGrantConsumer {
  consume(input: { subject: string; scopedPayloadHash: string; grantId?: string }): boolean;
}

export interface TrustedApprovalGrantIssuer {
  grant(input: TrustedApprovalGrantInput): string;
}

const purposes = new Set<TrustedApprovalPurpose>([
  'posts.text',
  'posts.media',
  'comments.reply',
  'reactions.add',
  'reactions.remove',
]);

const defaultTtlMs = 300_000;
const maxTtlMs = 600_000;

export function createTrustedApprovalGrantStore(
  options: {
    now?: () => Date;
    ttlMs?: number;
  } = {},
): { issuer: TrustedApprovalGrantIssuer; consumer: TrustedApprovalGrantConsumer } {
  const now = options.now ?? (() => new Date());
  const ttlMs = options.ttlMs ?? defaultTtlMs;
  if (!Number.isInteger(ttlMs) || ttlMs <= 0 || ttlMs > maxTtlMs) {
    throw new Error('Trusted approval grant lifetime must be a positive integer at most ten minutes');
  }

  const pending = new Map<string, { subject: string; scopedPayloadHash: string; expiresAtMs: number }>();

  return {
    issuer: {
      grant(input) {
        if (typeof input.subject !== 'string' || input.subject.trim() === '') {
          throw new Error('Trusted approval subject must be non-empty');
        }
        if (!purposes.has(input.purpose)) throw new Error('Unsupported trusted approval purpose');
        const scopedPayloadHash = purposePayloadHash(input.purpose, input.payloadHash);
        const grantId = randomBytes(32).toString('base64url');
        pending.set(grantId, {
          subject: input.subject,
          scopedPayloadHash,
          expiresAtMs: now().getTime() + ttlMs,
        });
        return grantId;
      },
    },
    consumer: {
      consume(input) {
        if (typeof input.subject !== 'string' || input.subject.trim() === '') return false;
        if (!/^[a-f0-9]{64}$/.test(input.scopedPayloadHash)) return false;
        if (typeof input.grantId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.grantId)) return false;
        const grant = pending.get(input.grantId);
        if (grant === undefined) return false;
        if (grant.subject !== input.subject || grant.scopedPayloadHash !== input.scopedPayloadHash)
          return false;
        pending.delete(input.grantId);
        return now().getTime() < grant.expiresAtMs;
      },
    },
  };
}
