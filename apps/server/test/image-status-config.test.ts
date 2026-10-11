import { describe, expect, it } from 'vitest';

import { parseConfig } from '../src/config.js';

describe('image status read configuration', () => {
  it('defaults disabled', () => {
    expect(parseConfig({})).toMatchObject({ imageStatusReadEnabled: false });
  });

  it('accepts exact true', () => {
    const config = parseConfig({ LINKEDIN_MCP_IMAGE_STATUS_READ_ENABLED: 'true' });
    expect(config.imageStatusReadEnabled).toBe(true);
  });

  it.each(['yes', '1', 'TRUE', ' false ', ''])('rejects non-exact flag %j', (value) => {
    const env = { LINKEDIN_MCP_IMAGE_STATUS_READ_ENABLED: value };
    expect(() => parseConfig(env)).toThrow(/true or false/i);
  });
});
