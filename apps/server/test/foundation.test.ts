import { describe, expect, it } from 'vitest';

import { createCapabilitiesResult, createHealthResult, createVersionResult } from '../src/foundation.js';

const deps = {
  requestId: 'req-123',
  now: () => new Date('2026-10-05T12:00:00.000Z'),
};

describe('foundation result factories', () => {
  it('creates deterministic local-only health without claiming LinkedIn connectivity', () => {
    expect(createHealthResult(deps)).toEqual({
      status: 'succeeded',
      data: {
        ok: true,
        service: 'linkedin-mcp',
        linkedinConnected: false,
      },
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      metadata: { requestId: 'req-123', timestamp: '2026-10-05T12:00:00.000Z' },
    });
  });

  it('creates deterministic local-only version metadata', () => {
    expect(createVersionResult({ ...deps, version: '1.2.3' })).toMatchObject({
      status: 'succeeded',
      data: { name: 'linkedin-mcp', version: '1.2.3' },
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
    });
  });

  it('returns the truthful capability registry without upgrading future LinkedIn capabilities', () => {
    const result = createCapabilitiesResult(deps);

    expect(result.status).toBe('succeeded');
    expect(result.provider).toEqual({ type: 'LOCAL_ONLY', name: 'linkedin-mcp' });
    expect(result.data.capabilities.length).toBeGreaterThan(0);
    expect(
      result.data.capabilities
        .filter((capability) => capability.milestone !== 'M00')
        .every(
          (capability) =>
            capability.status !== 'VERIFIED' && capability.availability === 'UNAVAILABLE',
        ),
    ).toBe(true);
  });
});
