import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { parseConfig } from '../src/config.js';

const created: string[] = [];
afterEach(async () => {
  for (const path of created.splice(0)) await rm(path, { recursive: true, force: true });
});

describe('M03 media configuration', () => {
  it('remains optional and defaults to a 20 MiB local safety bound', async () => {
    expect(parseConfig({}).mediaRoot).toBeUndefined();
    expect(parseConfig({}).mediaMaxBytes).toBe(20 * 1_048_576);
    const root = await mkdtemp(join(tmpdir(), 'media-config-'));
    created.push(root);
    expect(parseConfig({ LINKEDIN_MCP_MEDIA_ROOT: root }).mediaRoot).toBe(root);
    const oneMiB = parseConfig({
      LINKEDIN_MCP_MEDIA_ROOT: root,
      LINKEDIN_MCP_MEDIA_MAX_BYTES: '1048576',
    });
    const fiftyMiB = parseConfig({
      LINKEDIN_MCP_MEDIA_ROOT: root,
      LINKEDIN_MCP_MEDIA_MAX_BYTES: '52428800',
    });
    expect(oneMiB.mediaMaxBytes).toBe(1_048_576);
    expect(fiftyMiB.mediaMaxBytes).toBe(52_428_800);
  });

  it('rejects relative, blank, nonexistent and non-directory media roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-config-'));
    created.push(root);
    await mkdir(join(root, 'directory'));
    for (const value of ['', 'relative/root', join(root, 'missing')]) {
      expect(() => parseConfig({ LINKEDIN_MCP_MEDIA_ROOT: value })).toThrow(/media root/i);
    }
  });

  it.each(['0', '1', '1048575', '52428801', '-1', '1.5', 'abc', ''])(
    'rejects invalid local media byte bound %j',
    (value) => {
      expect(() => parseConfig({ LINKEDIN_MCP_MEDIA_MAX_BYTES: value })).toThrow(/media max bytes/i);
    },
  );

  it('rejects credential store and ledger locations inside the media root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-config-'));
    created.push(root);
    const base = {
      LINKEDIN_MCP_MEDIA_ROOT: root,
      LINKEDIN_MCP_OAUTH_MODE: 'native_pkce',
      LINKEDIN_MCP_CLIENT_ID: 'client-id',
      LINKEDIN_MCP_REDIRECT_URI: 'http://127.0.0.1:17890/oauth/callback',
      LINKEDIN_MCP_CREDENTIAL_STORE_PATH: join(root, 'secret.json'),
      LINKEDIN_MCP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    };
    expect(() => parseConfig(base)).toThrow(/credential store.*media root/i);
    expect(() =>
      parseConfig({
        LINKEDIN_MCP_MEDIA_ROOT: root,
        LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: join(root, 'ledger.json'),
      }),
    ).toThrow(/ledger.*media root/i);
  });
});
