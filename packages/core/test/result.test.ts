import { describe, expect, it } from 'vitest';

import { isProviderType, isToolResultStatus, providerTypes, toolResultStatuses } from '../src/result.js';

describe('provider/result contracts', () => {
  it('accepts only executing provider classifications', () => {
    expect(providerTypes).toEqual([
      'OFFICIAL_API',
      'PARTNER_API',
      'EXTERNAL_DISCOVERY',
      'BROWSER_INTERACTIVE',
      'LOCAL_ONLY',
    ]);
    expect(isProviderType('OFFICIAL_API')).toBe(true);
    expect(isProviderType('UNAVAILABLE')).toBe(false);
  });

  it('accepts the standard tool result statuses', () => {
    expect(toolResultStatuses).toContain('succeeded');
    expect(toolResultStatuses).toContain('human_action_required');
    expect(toolResultStatuses).toContain('partner_access_required');
    expect(toolResultStatuses).toContain('failed');
    expect(isToolResultStatus('succeeded')).toBe(true);
    expect(isToolResultStatus('done')).toBe(false);
  });
});
