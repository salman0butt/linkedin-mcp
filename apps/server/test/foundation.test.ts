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

    const futureCapabilities = result.data.capabilities.filter(
      (capability) => capability.milestone !== 'M00',
    );
    for (const capability of futureCapabilities) {
      if (['jobs.analyze', 'jobs.compare', 'article.draft'].includes(capability.id)) {
        expect(capability).toMatchObject({
          provider: 'LOCAL_ONLY',
          status: 'VERIFIED',
          availability: 'AVAILABLE',
        });
      } else if (
        [
          'research.analyze',
          'research.group_themes',
          'research.references.index',
          'research.compare_cohorts',
          'research.repurposing.prepare',
          'calendar.preview',
        ].includes(capability.id)
      ) {
        expect(capability).toMatchObject({
          provider: 'LOCAL_ONLY',
          status: 'ACTIVE',
          availability: 'AVAILABLE',
          milestone: capability.id === 'calendar.preview' ? 'M11' : 'M10',
        });
      } else {
        expect(capability.status).not.toBe('VERIFIED');
        expect(capability.availability).toBe('UNAVAILABLE');
      }
    }
    expect(
      result.data.capabilities.find((capability) => capability.id === 'research.references.index'),
    ).toMatchObject({
      status: 'ACTIVE',
      availability: 'AVAILABLE',
      provider: 'LOCAL_ONLY',
    });
    expect(
      result.data.capabilities.find((capability) => capability.id === 'research.compare_cohorts'),
    ).toMatchObject({
      status: 'ACTIVE',
      availability: 'AVAILABLE',
      provider: 'LOCAL_ONLY',
      milestone: 'M10',
    });
    expect(
      result.data.capabilities.find((capability) => capability.id === 'research.repurposing.prepare'),
    ).toMatchObject({
      status: 'ACTIVE',
      availability: 'AVAILABLE',
      provider: 'LOCAL_ONLY',
      milestone: 'M10',
    });
    expect(result.data.capabilities.find((capability) => capability.id === 'calendar.preview')).toMatchObject(
      {
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        provider: 'LOCAL_ONLY',
        milestone: 'M11',
        approvalRequired: false,
      },
    );
    expect(
      result.data.capabilities.find((capability) => capability.id === 'article.native.publish'),
    ).toMatchObject({
      status: 'PLANNED',
      availability: 'UNAVAILABLE',
    });
  });
});
