import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, sep } from 'node:path';

import type { SupportedImageMime } from '../../../../packages/core/dist/index.js';

const DEFAULT_MAX_BYTES = 20 * 1_048_576;
const MAX_PIXEL_COUNT = 36_152_320n;
const MAX_GIF_FRAMES = 250;
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const GIF87A = Buffer.from('GIF87a', 'ascii');
const GIF89A = Buffer.from('GIF89a', 'ascii');
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export type MediaFileErrorCode =
  | 'media_not_configured'
  | 'media_path_invalid'
  | 'media_outside_root'
  | 'media_not_regular_file'
  | 'media_too_large'
  | 'media_type_unsupported'
  | 'media_malformed'
  | 'media_dimensions_invalid'
  | 'media_frame_limit_exceeded'
  | 'media_changed';

export class MediaFileError extends Error {
  readonly code: MediaFileErrorCode;

  constructor(code: MediaFileErrorCode, message: string) {
    super(message);
    this.name = 'MediaFileError';
    this.code = code;
  }
}

export interface ValidatedMediaFile {
  sourceName: string;
  bytes: Buffer;
  sha256: string;
  mimeType: SupportedImageMime;
  byteLength: number;
  width: number;
  height: number;
  frameCount?: number;
}

export interface MediaFileReaderOptions {
  root?: string;
  maxBytes?: number;
}

interface ParsedImage {
  mimeType: SupportedImageMime;
  width: number;
  height: number;
  frameCount?: number;
}

function fail(code: MediaFileErrorCode, message: string): never {
  throw new MediaFileError(code, message);
}

function isSameOrInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function validateRelativePath(sourcePath: string): string[] {
  if (
    sourcePath.length === 0 ||
    sourcePath.includes('\0') ||
    sourcePath.includes('\\') ||
    isAbsolute(sourcePath) ||
    /^[A-Za-z]:\//.test(sourcePath)
  ) {
    fail('media_path_invalid', 'Media source path is invalid');
  }
  const segments = sourcePath.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    fail('media_path_invalid', 'Media source path is invalid');
  }
  return segments;
}

function validateDimensions(width: number, height: number): void {
  if (width <= 0 || height <= 0 || BigInt(width) * BigInt(height) >= MAX_PIXEL_COUNT) {
    fail('media_dimensions_invalid', 'Media dimensions are outside the local safety bounds');
  }
}

function parsePng(bytes: Buffer): ParsedImage {
  if (bytes.length < 33) fail('media_malformed', 'PNG header is malformed');
  if (bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    fail('media_malformed', 'PNG header is malformed');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  validateDimensions(width, height);
  return { mimeType: 'image/png', width, height };
}

function parseJpeg(bytes: Buffer): ParsedImage {
  let cursor = 2;
  while (cursor < bytes.length) {
    if (bytes[cursor] !== 0xff) fail('media_malformed', 'JPEG structure is malformed');
    while (cursor < bytes.length && bytes[cursor] === 0xff) cursor += 1;
    if (cursor >= bytes.length) fail('media_malformed', 'JPEG structure is malformed');

    const marker = bytes[cursor] as number;
    cursor += 1;
    if (marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xda) fail('media_malformed', 'JPEG dimensions are missing');
    if (cursor + 2 > bytes.length) fail('media_malformed', 'JPEG structure is malformed');

    const segmentLength = bytes.readUInt16BE(cursor);
    if (segmentLength < 2 || cursor + segmentLength > bytes.length) {
      fail('media_malformed', 'JPEG structure is malformed');
    }
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 8) fail('media_malformed', 'JPEG frame header is malformed');
      const height = bytes.readUInt16BE(cursor + 3);
      const width = bytes.readUInt16BE(cursor + 5);
      validateDimensions(width, height);
      return { mimeType: 'image/jpeg', width, height };
    }
    cursor += segmentLength;
  }
  fail('media_malformed', 'JPEG dimensions are missing');
}

function skipGifSubBlocks(bytes: Buffer, start: number): number {
  let cursor = start;
  while (true) {
    if (cursor >= bytes.length) fail('media_malformed', 'GIF data is truncated');
    const size = bytes[cursor] as number;
    cursor += 1;
    if (size === 0) return cursor;
    if (cursor + size > bytes.length) fail('media_malformed', 'GIF data is truncated');
    cursor += size;
  }
}

function gifColorTableLength(packed: number): number {
  return (packed & 0x80) === 0 ? 0 : 3 * 2 ** ((packed & 0x07) + 1);
}

function parseGif(bytes: Buffer): ParsedImage {
  if (bytes.length < 13) fail('media_malformed', 'GIF header is malformed');
  const width = bytes.readUInt16LE(6);
  const height = bytes.readUInt16LE(8);
  validateDimensions(width, height);

  let cursor = 13 + gifColorTableLength(bytes[10] as number);
  if (cursor > bytes.length) fail('media_malformed', 'GIF color table is truncated');
  let frameCount = 0;
  let sawTrailer = false;

  while (cursor < bytes.length) {
    const block = bytes[cursor] as number;
    if (block === 0x3b) {
      cursor += 1;
      sawTrailer = true;
      break;
    }
    if (block === 0x21) {
      if (cursor + 2 > bytes.length) fail('media_malformed', 'GIF extension is truncated');
      cursor = skipGifSubBlocks(bytes, cursor + 2);
      continue;
    }
    if (block === 0x2c) {
      if (cursor + 10 > bytes.length) fail('media_malformed', 'GIF frame is truncated');
      const packed = bytes[cursor + 9] as number;
      cursor += 10 + gifColorTableLength(packed);
      if (cursor >= bytes.length) fail('media_malformed', 'GIF frame data is truncated');
      cursor += 1;
      cursor = skipGifSubBlocks(bytes, cursor);
      frameCount += 1;
      if (frameCount > MAX_GIF_FRAMES) {
        fail('media_frame_limit_exceeded', 'GIF exceeds the local frame safety limit');
      }
      continue;
    }
    fail('media_malformed', 'GIF structure is malformed');
  }

  if (!sawTrailer || cursor !== bytes.length) fail('media_malformed', 'GIF structure is malformed');
  return { mimeType: 'image/gif', width, height, frameCount };
}

function parseImage(bytes: Buffer): ParsedImage {
  if (bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return parsePng(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return parseJpeg(bytes);
  }
  if (bytes.length >= 6 && (bytes.subarray(0, 6).equals(GIF87A) || bytes.subarray(0, 6).equals(GIF89A))) {
    return parseGif(bytes);
  }
  fail('media_type_unsupported', 'Media type is not supported');
}

export class MediaFileReader {
  private readonly root: string;
  private readonly maxBytes: number;

  constructor(options: MediaFileReaderOptions) {
    this.root = options.root ?? '';
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  async read(sourcePath: string): Promise<ValidatedMediaFile> {
    if (!this.root || !isAbsolute(this.root) || !Number.isInteger(this.maxBytes) || this.maxBytes <= 0) {
      fail('media_not_configured', 'Media reader is not configured');
    }

    const segments = validateRelativePath(sourcePath);
    let resolvedRoot: string;
    try {
      resolvedRoot = await realpath(this.root);
      if (!(await stat(resolvedRoot)).isDirectory()) {
        fail('media_not_configured', 'Media reader is not configured');
      }
    } catch (error) {
      if (error instanceof MediaFileError) throw error;
      fail('media_not_configured', 'Media reader is not configured');
    }

    const candidatePath = join(resolvedRoot, ...segments);
    let resolvedCandidate: string;
    try {
      resolvedCandidate = await realpath(candidatePath);
    } catch {
      fail('media_not_regular_file', 'Media source is not a regular file');
    }
    if (!isSameOrInside(resolvedRoot, resolvedCandidate) || resolvedCandidate === resolvedRoot) {
      fail('media_outside_root', 'Media source resolves outside the configured root');
    }

    let current = resolvedRoot;
    try {
      for (const segment of segments) {
        current = join(current, segment);
        if ((await lstat(current)).isSymbolicLink()) {
          fail('media_path_invalid', 'Media source path must not contain symbolic links');
        }
      }
    } catch (error) {
      if (error instanceof MediaFileError) throw error;
      fail('media_not_regular_file', 'Media source is not a regular file');
    }

    let handle;
    try {
      handle = await open(resolvedCandidate, constants.O_RDONLY | constants.O_NOFOLLOW);
      const before = await handle.stat();
      if (!before.isFile()) fail('media_not_regular_file', 'Media source is not a regular file');
      if (before.size > this.maxBytes) fail('media_too_large', 'Media source exceeds the local byte limit');

      const buffer = Buffer.alloc(Math.min(this.maxBytes + 1, before.size + 1));
      let total = 0;
      while (total < buffer.length) {
        const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total);
        if (bytesRead === 0) break;
        total += bytesRead;
      }
      if (total > this.maxBytes) fail('media_too_large', 'Media source exceeds the local byte limit');

      const after = await handle.stat();
      if (total !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
        fail('media_changed', 'Media source changed while it was being read');
      }
      try {
        if ((await realpath(candidatePath)) !== resolvedCandidate) {
          fail('media_changed', 'Media source changed while it was being read');
        }
      } catch (error) {
        if (error instanceof MediaFileError) throw error;
        fail('media_changed', 'Media source changed while it was being read');
      }

      const bytes = Buffer.from(buffer.subarray(0, total));
      const parsed = parseImage(bytes);
      return {
        sourceName: basename(sourcePath),
        bytes,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        mimeType: parsed.mimeType,
        byteLength: bytes.length,
        width: parsed.width,
        height: parsed.height,
        ...(parsed.frameCount === undefined ? {} : { frameCount: parsed.frameCount }),
      };
    } catch (error) {
      if (error instanceof MediaFileError) throw error;
      throw new MediaFileError('media_not_regular_file', 'Media source could not be read as a regular file');
    } finally {
      await handle?.close();
    }
  }
}
