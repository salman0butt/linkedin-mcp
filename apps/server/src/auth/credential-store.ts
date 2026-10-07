import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  mkdir as fsMkdir,
  readFile as fsReadFile,
  rename as fsRename,
  unlink as fsUnlink,
  writeFile as fsWriteFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import type { StoredCredential } from '../../../../packages/core/dist/index.js';

const ENVELOPE_VERSION = 1 as const;
const ALGORITHM = 'aes-256-gcm' as const;
const AAD = Buffer.from('linkedin-mcp:credential-store:v1', 'utf8');
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

interface CredentialEnvelope {
  version: typeof ENVELOPE_VERSION;
  algorithm: typeof ALGORITHM;
  iv: string;
  authTag: string;
  ciphertext: string;
}

interface CredentialStoreFilesystem {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(
    path: string,
    data: string,
    options: { encoding: 'utf8'; mode: number; flag: 'wx' },
  ): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdir(path: string, options: { recursive: true; mode: number }): Promise<unknown>;
  unlink(path: string): Promise<void>;
}

export interface FileCredentialStoreOptions {
  filePath: string;
  encryptionKey: string;
  filesystem?: Partial<CredentialStoreFilesystem>;
}

export interface CredentialStore {
  load(): Promise<StoredCredential | null>;
  save(value: StoredCredential): Promise<void>;
  clear(): Promise<void>;
}

const defaultFilesystem: CredentialStoreFilesystem = {
  readFile: (path, encoding) => fsReadFile(path, encoding),
  writeFile: (path, data, options) => fsWriteFile(path, data, options),
  rename: (oldPath, newPath) => fsRename(oldPath, newPath),
  mkdir: (path, options) => fsMkdir(path, options),
  unlink: (path) => fsUnlink(path),
};

function isErrno(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function decodeCanonicalBase64(value: string, expectedBytes?: number): Buffer {
  const decoded = Buffer.from(value, 'base64');
  if (
    value === '' ||
    decoded.toString('base64') !== value ||
    (expectedBytes !== undefined && decoded.length !== expectedBytes)
  ) {
    throw new Error(
      expectedBytes === undefined
        ? 'Credential envelope contains invalid base64 data'
        : `Credential encryption key must be canonical base64 for exactly ${expectedBytes} bytes`,
    );
  }
  return decoded;
}

function parseEncryptionKey(value: string): Buffer {
  return decodeCanonicalBase64(value, 32);
}

function parseStoredCredential(value: unknown): StoredCredential {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid credential payload');
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.accessToken !== 'string' ||
    candidate.accessToken === '' ||
    typeof candidate.expiresAt !== 'string' ||
    !Array.isArray(candidate.scopes) ||
    !candidate.scopes.every((scope) => typeof scope === 'string') ||
    (candidate.mode !== 'confidential' && candidate.mode !== 'native_pkce')
  ) {
    throw new Error('invalid credential payload');
  }

  if (candidate.refreshToken !== undefined && typeof candidate.refreshToken !== 'string') {
    throw new Error('invalid credential payload');
  }
  if (
    candidate.refreshExpiresAt !== undefined &&
    typeof candidate.refreshExpiresAt !== 'string'
  ) {
    throw new Error('invalid credential payload');
  }
  if (candidate.subject !== undefined && typeof candidate.subject !== 'string') {
    throw new Error('invalid credential payload');
  }

  return {
    accessToken: candidate.accessToken,
    ...(candidate.refreshToken === undefined ? {} : { refreshToken: candidate.refreshToken }),
    expiresAt: candidate.expiresAt,
    ...(candidate.refreshExpiresAt === undefined
      ? {}
      : { refreshExpiresAt: candidate.refreshExpiresAt }),
    scopes: [...candidate.scopes],
    ...(candidate.subject === undefined ? {} : { subject: candidate.subject }),
    mode: candidate.mode,
  };
}

function parseEnvelope(raw: string): CredentialEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Stored credential could not be decrypted or authenticated');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Stored credential could not be decrypted or authenticated');
  }

  const envelope = parsed as Record<string, unknown>;
  if (
    envelope.version !== ENVELOPE_VERSION ||
    envelope.algorithm !== ALGORITHM ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.authTag !== 'string' ||
    typeof envelope.ciphertext !== 'string'
  ) {
    throw new Error('Stored credential could not be decrypted or authenticated');
  }

  return {
    version: ENVELOPE_VERSION,
    algorithm: ALGORITHM,
    iv: envelope.iv,
    authTag: envelope.authTag,
    ciphertext: envelope.ciphertext,
  };
}

function encryptCredential(value: StoredCredential, key: Buffer): CredentialEnvelope {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);

  return {
    version: ENVELOPE_VERSION,
    algorithm: ALGORITHM,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decryptCredential(envelope: CredentialEnvelope, key: Buffer): StoredCredential {
  try {
    const iv = decodeCanonicalBase64(envelope.iv, IV_BYTES);
    const authTag = decodeCanonicalBase64(envelope.authTag, AUTH_TAG_BYTES);
    const ciphertext = decodeCanonicalBase64(envelope.ciphertext);
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
    decipher.setAAD(AAD);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return parseStoredCredential(JSON.parse(plaintext) as unknown);
  } catch {
    throw new Error('Stored credential could not be decrypted or authenticated');
  }
}

export function createFileCredentialStore(options: FileCredentialStoreOptions): CredentialStore {
  if (options.filePath.trim() === '') {
    throw new Error('Credential store file path is required');
  }

  const key = parseEncryptionKey(options.encryptionKey);
  const filesystem: CredentialStoreFilesystem = {
    ...defaultFilesystem,
    ...options.filesystem,
  };
  const directory = dirname(options.filePath);

  return {
    async load() {
      let raw: string;
      try {
        raw = await filesystem.readFile(options.filePath, 'utf8');
      } catch (error: unknown) {
        if (isErrno(error, 'ENOENT')) return null;
        throw new Error('Stored credential could not be read');
      }

      return decryptCredential(parseEnvelope(raw), key);
    },

    async save(value) {
      const envelope = encryptCredential(parseStoredCredential(value), key);
      const serialized = `${JSON.stringify(envelope)}\n`;
      const temporaryPath = join(
        directory,
        `.${basename(options.filePath)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`,
      );

      await filesystem.mkdir(directory, { recursive: true, mode: 0o700 });
      try {
        await filesystem.writeFile(temporaryPath, serialized, {
          encoding: 'utf8',
          mode: 0o600,
          flag: 'wx',
        });
        await filesystem.rename(temporaryPath, options.filePath);
      } catch {
        try {
          await filesystem.unlink(temporaryPath);
        } catch (cleanupError: unknown) {
          if (!isErrno(cleanupError, 'ENOENT')) {
            // The original credential file remains the source of truth; do not expose cleanup details.
          }
        }
        throw new Error('Credential replacement failed');
      }
    },

    async clear() {
      try {
        await filesystem.unlink(options.filePath);
      } catch (error: unknown) {
        if (!isErrno(error, 'ENOENT')) throw new Error('Credential clear failed');
      }
    },
  };
}
