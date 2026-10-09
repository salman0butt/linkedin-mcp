import { describe, expect, it } from 'vitest';

import { ApprovalServiceError, createApprovalService } from '../src/publishing/approval-service.js';

const payloadHash = 'a'.repeat(64);
const subject = 'linkedin-member-123';

function expectApprovalError(action: () => unknown, kind: string): void {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ApprovalServiceError);
    expect((error as ApprovalServiceError).kind).toBe(kind);
    return;
  }
  throw new Error(`Expected approval error: ${kind}`);
}

describe('M02 approval receipt service', () => {
  it('issues opaque random receipts bound to payload hash and a bounded expiry without publishing', () => {
    const ids = ['receipt-random-1', 'receipt-random-2'];
    const service = createApprovalService({
      now: () => new Date('2026-10-08T09:00:00.000Z'),
      randomId: () => ids.shift() ?? 'unexpected',
      ttlMs: 60_000,
    });

    expect(service.issue({ payloadHash, subject })).toEqual({
      receiptId: 'receipt-random-1',
      payloadHash,
      expiresAt: '2026-10-08T09:01:00.000Z',
      provider: 'LOCAL_ONLY',
    });
    expect(service.issue({ payloadHash, subject }).receiptId).toBe('receipt-random-2');
  });

  it('rejects unknown receipts and exact payload or authenticated-subject mismatches', () => {
    const service = createApprovalService({
      randomId: () => 'receipt-1',
      now: () => new Date('2026-10-08T09:00:00.000Z'),
    });
    const receipt = service.issue({ payloadHash, subject });

    expectApprovalError(
      () =>
        service.consume({
          receiptId: 'missing',
          payloadHash,
          subject,
          idempotencyKey: 'op-1',
        }),
      'not_found',
    );
    expectApprovalError(
      () =>
        service.consume({
          receiptId: receipt.receiptId,
          payloadHash: 'b'.repeat(64),
          subject,
          idempotencyKey: 'op-1',
        }),
      'mismatch',
    );
    expectApprovalError(
      () =>
        service.consume({
          receiptId: receipt.receiptId,
          payloadHash,
          subject: 'different-member',
          idempotencyKey: 'op-1',
        }),
      'mismatch',
    );
  });

  it('expires receipts using the injected clock', () => {
    let now = new Date('2026-10-08T09:00:00.000Z');
    const service = createApprovalService({
      randomId: () => 'receipt-expiring',
      now: () => now,
      ttlMs: 1_000,
    });
    const receipt = service.issue({ payloadHash, subject });
    now = new Date('2026-10-08T09:00:01.001Z');

    expectApprovalError(
      () =>
        service.consume({
          receiptId: receipt.receiptId,
          payloadHash,
          subject,
          idempotencyKey: 'op-expired',
        }),
      'expired',
    );
  });

  it('allows a receipt to initiate one operation and treats the same operation as a safe replay', () => {
    const service = createApprovalService({
      randomId: () => 'receipt-single-use',
      now: () => new Date('2026-10-08T09:00:00.000Z'),
    });
    const receipt = service.issue({ payloadHash, subject });
    const input = {
      receiptId: receipt.receiptId,
      payloadHash,
      subject,
      idempotencyKey: 'operation-1',
    };

    expect(service.consume(input)).toEqual({ status: 'initiated', idempotencyKey: 'operation-1' });
    expect(service.consume(input)).toEqual({ status: 'replay', idempotencyKey: 'operation-1' });
  });

  it('rejects reuse of a consumed receipt for a different operation', () => {
    const service = createApprovalService({
      randomId: () => 'receipt-consumed',
      now: () => new Date('2026-10-08T09:00:00.000Z'),
    });
    const receipt = service.issue({ payloadHash, subject });

    service.consume({
      receiptId: receipt.receiptId,
      payloadHash,
      subject,
      idempotencyKey: 'operation-1',
    });

    expectApprovalError(
      () =>
        service.consume({
          receiptId: receipt.receiptId,
          payloadHash,
          subject,
          idempotencyKey: 'operation-2',
        }),
      'already_consumed',
    );
  });
});
