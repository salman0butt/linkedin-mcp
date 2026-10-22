import { describe, expect, it } from 'vitest';

import { purposePayloadHash } from '../src/publishing/approval-service.js';
import { createTrustedApprovalGrantStore } from '../src/publishing/trusted-approval-grants.js';

const subject = 'member-123';
const payloadHash = 'a'.repeat(64);

describe('trusted out-of-band approval grants', () => {
  it('consumes one exact host-issued grant once', () => {
    const { issuer, consumer } = createTrustedApprovalGrantStore();
    expect('grant' in consumer).toBe(false);
    const grantId = issuer.grant({ subject, purpose: 'posts.text', payloadHash });
    const input = { subject, scopedPayloadHash: purposePayloadHash('posts.text', payloadHash), grantId };

    expect(consumer.consume({ ...input, grantId: 'wrong-grant' })).toBe(false);

    expect(consumer.consume(input)).toBe(true);
    expect(consumer.consume(input)).toBe(false);
  });

  it('rejects a different purpose, subject, or hash without spending the original grant', () => {
    const { issuer, consumer } = createTrustedApprovalGrantStore();
    const grantId = issuer.grant({ subject, purpose: 'reactions.add', payloadHash });

    expect(
      consumer.consume({
        subject,
        scopedPayloadHash: purposePayloadHash('reactions.remove', payloadHash),
        grantId,
      }),
    ).toBe(false);
    expect(
      consumer.consume({
        subject: 'other-member',
        scopedPayloadHash: purposePayloadHash('reactions.add', payloadHash),
        grantId,
      }),
    ).toBe(false);
    expect(
      consumer.consume({
        subject,
        scopedPayloadHash: purposePayloadHash('reactions.add', 'b'.repeat(64)),
        grantId,
      }),
    ).toBe(false);
    expect(
      consumer.consume({
        subject,
        scopedPayloadHash: purposePayloadHash('reactions.add', payloadHash),
        grantId,
      }),
    ).toBe(true);
  });

  it('rejects grants at expiry without issuing a receipt', () => {
    let now = new Date('2026-10-21T09:00:00.000Z');
    const { issuer, consumer } = createTrustedApprovalGrantStore({ now: () => now, ttlMs: 1_000 });
    const grantId = issuer.grant({ subject, purpose: 'comments.reply', payloadHash });
    now = new Date('2026-10-21T09:00:01.000Z');

    expect(
      consumer.consume({
        subject,
        scopedPayloadHash: purposePayloadHash('comments.reply', payloadHash),
        grantId,
      }),
    ).toBe(false);
  });

  it('rejects invalid host inputs and unbounded grant lifetimes', () => {
    expect(() => createTrustedApprovalGrantStore({ ttlMs: 600_001 })).toThrow();
    expect(() => createTrustedApprovalGrantStore({ ttlMs: 0 })).toThrow();
    const { issuer } = createTrustedApprovalGrantStore();
    expect(() => issuer.grant({ subject: '', purpose: 'posts.text', payloadHash })).toThrow();
    expect(() => issuer.grant({ subject, purpose: 'posts.text', payloadHash: 'invalid' })).toThrow();
  });
});
