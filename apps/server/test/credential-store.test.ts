import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { StoredCredential } from '../../../packages/core/src/auth.js';
import { createFileCredentialStore } from '../src/auth/credential-store.js';

const encryptionKey = Buffer.alloc(32, 7).toString('base64');
const wrongEncryptionKey = Buffer.alloc(32, 9).toString('base64');
const createdDirectories: string[] = [];

type StoreOptions = Parameters<typeof createFileCredentialStore>[0];

const credential: StoredCredential = {
  accessToken: 'access-secret',
  refreshToken: 'refresh-secret',
  expiresAt: '2026-10-07T08:00:00.000Z',
  refreshExpiresAt: '2026-11-07T08:00:00.000Z',
  scopes: ['openid', 'profile', 'email'],
  subject: 'member-subject',
  mode: 'confidential',
};

async function createStore(options: Partial<StoreOptions> = {}): Promise<{
  directory: string;
  filePath: string;
  store: ReturnType<typeof createFileCredentialStore>;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'linkedin-mcp-credential-store-'));
  createdDirectories.push(directory);
  const filePath = join(directory, 'credentials.json');
  return {
    directory,
    filePath,
    store: createFileCredentialStore({
      filePath,
      encryptionKey,
      ...options,
    }),
  };
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('file credential store', () => {
  it('encrypts credentials with AES-256-GCM and round-trips without plaintext secrets', async () => {
    const { filePath, store } = await createStore();

    await store.save(credential);

    expect(await store.load()).toEqual(credential);
    const raw = await readFile(filePath, 'utf8');
    expect(raw).not.toContain(credential.accessToken);
    expect(raw).not.toContain(credential.refreshToken ?? '');
    expect(raw).toContain('aes-256-gcm');
  });

  it('uses fresh authenticated-encryption material for every save', async () => {
    const { filePath, store } = await createStore();

    await store.save(credential);
    const first = await readFile(filePath, 'utf8');
    await store.save(credential);
    const second = await readFile(filePath, 'utf8');

    expect(second).not.toBe(first);
  });

  it('fails closed with the wrong key without modifying the credential file', async () => {
    const { filePath, store } = await createStore();
    await store.save(credential);
    const original = await readFile(filePath, 'utf8');
    const wrongKeyStore = createFileCredentialStore({
      filePath,
      encryptionKey: wrongEncryptionKey,
    });

    await expect(wrongKeyStore.load()).rejects.toThrow(/credential|decrypt|authentic|key/i);
    expect(await readFile(filePath, 'utf8')).toBe(original);
  });

  it('detects ciphertext tampering without destroying the stored file', async () => {
    const { filePath, store } = await createStore();
    await store.save(credential);
    const envelope = JSON.parse(await readFile(filePath, 'utf8')) as { ciphertext: string };
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
    envelope.ciphertext = ciphertext.toString('base64');
    const tampered = `${JSON.stringify(envelope)}\n`;
    await writeFile(filePath, tampered, 'utf8');

    await expect(store.load()).rejects.toThrow(/credential|decrypt|authentic|tamper/i);
    expect(await readFile(filePath, 'utf8')).toBe(tampered);
  });

  it('creates the persisted credential file with owner-only permissions where supported', async () => {
    const { filePath, store } = await createStore();

    await store.save(credential);

    if (process.platform !== 'win32') {
      expect((await stat(filePath)).mode & 0o777).toBe(0o600);
    }
  });

  it('preserves the previous valid file when atomic replacement fails', async () => {
    const { directory, filePath, store } = await createStore();
    await store.save(credential);
    const original = await readFile(filePath, 'utf8');
    const replacement: StoredCredential = { ...credential, accessToken: 'replacement-secret' };
    const failingStore = createFileCredentialStore({
      filePath,
      encryptionKey,
      filesystem: {
        async rename() {
          throw new Error('simulated rename failure');
        },
      },
    });

    await expect(failingStore.save(replacement)).rejects.toThrow(/rename|replacement|credential/i);
    expect(await readFile(filePath, 'utf8')).toBe(original);
    expect(await store.load()).toEqual(credential);
    expect(await readdir(directory)).toEqual(['credentials.json']);
  });

  it('clears credentials idempotently', async () => {
    const { store } = await createStore();

    expect(await store.load()).toBeNull();
    await store.clear();
    await store.save(credential);
    await store.clear();
    await store.clear();

    expect(await store.load()).toBeNull();
  });

  it('rejects encryption keys that are not canonical base64 for exactly 32 bytes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'linkedin-mcp-credential-store-'));
    createdDirectories.push(directory);
    const filePath = join(directory, 'credentials.json');

    for (const invalidKey of [
      'not-base64',
      Buffer.alloc(31, 7).toString('base64'),
      Buffer.alloc(33, 7).toString('base64'),
      Buffer.alloc(32, 7).toString('base64url'),
    ]) {
      expect(() => createFileCredentialStore({ filePath, encryptionKey: invalidKey })).toThrow(
        /32-byte|base64/i,
      );
    }
  });
});
