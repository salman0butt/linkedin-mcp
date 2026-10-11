import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseConfig } from '../src/config.js';
import { createLinkedInRuntime } from '../src/runtime.js';

describe('M03 media runtime wiring', () => {
  it('creates the media post service only from trusted local configuration', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm03-runtime-'));
    const mediaRoot = join(directory, 'media');
    await mkdir(mediaRoot);

    try {
      const withoutRoot = createLinkedInRuntime(
        parseConfig({
          LINKEDIN_MCP_API_VERSION: '202610',
          LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: join(directory, 'text-only-ledger.json'),
        }),
      );
      expect(withoutRoot.publishing.mediaPostService).toBeUndefined();

      const withRoot = createLinkedInRuntime(
        parseConfig({
          LINKEDIN_MCP_API_VERSION: '202610',
          LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: join(directory, 'media-ledger.json'),
          LINKEDIN_MCP_MEDIA_ROOT: mediaRoot,
          LINKEDIN_MCP_MEDIA_MAX_BYTES: '1048576',
          LINKEDIN_MCP_IMAGE_STATUS_READ_ENABLED: 'true',
        }),
      );

      expect(withRoot.publishing.mediaPostService).toBeDefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
