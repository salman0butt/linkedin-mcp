import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MediaFileReader } from '../src/publishing/media-file.js';

function png(width = 2, height = 3): Buffer {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8;
  ihdr[17] = 2;
  const iend = Buffer.from('0000000049454e4400000000', 'hex');
  return Buffer.concat([signature, ihdr, iend]);
}

function jpeg(width = 4, height = 5): Buffer {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x0b, 8, 0, height, 0, width, 1, 1, 0x11, 0]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.from([0xff, 0xd9])]);
}

function gif(frames = 1, width = 2, height = 3): Buffer {
  const header = Buffer.from('47494638396100000000000000', 'hex');
  header.writeUInt16LE(width, 6);
  header.writeUInt16LE(height, 8);
  const frame = Buffer.from([0x2c, 0, 0, 0, 0, 2, 0, 3, 0, 0, 2, 2, 0x4c, 1, 0]);
  return Buffer.concat([header, ...Array.from({ length: frames }, () => frame), Buffer.from([0x3b])]);
}

describe('MediaFileReader', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'linkedin-media-test-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads a nested regular PNG by signature, returns exact bytes and safe metadata', async () => {
    await mkdir(join(root, 'nested'));
    const bytes = png();
    await writeFile(join(root, 'nested', 'photo.jpg'), bytes);
    const result = await new MediaFileReader({ root }).read('nested/photo.jpg');
    expect(result).toMatchObject({
      sourceName: 'photo.jpg',
      mimeType: 'image/png',
      width: 2,
      height: 3,
      byteLength: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    expect(result.bytes).toEqual(bytes);
    expect(JSON.stringify({ ...result, bytes: undefined })).not.toContain(root);
  });

  it('parses JPEG and GIF dimensions and counts GIF frames', async () => {
    await writeFile(join(root, 'a.png'), jpeg());
    await writeFile(join(root, 'b.gif'), gif(2));
    expect(await new MediaFileReader({ root }).read('a.png')).toMatchObject({
      mimeType: 'image/jpeg',
      width: 4,
      height: 5,
    });
    expect(await new MediaFileReader({ root }).read('b.gif')).toMatchObject({
      mimeType: 'image/gif',
      width: 2,
      height: 3,
      frameCount: 2,
    });
  });

  it.each(['', '.', '..', '../escape.png', 'nested/../photo.png', 'nested//photo.png', 'a\\b.png', 'a\0b.png', '/etc/passwd'])(
    'rejects unsafe source path %j',
    async (path) => {
      await expect(new MediaFileReader({ root }).read(path)).rejects.toMatchObject({
        code: 'media_path_invalid',
      });
    },
  );

  it('rejects symlinks, including final links and directory escapes', async () => {
    await writeFile(join(root, 'real.png'), png());
    await symlink('real.png', join(root, 'link.png'));
    await symlink(tmpdir(), join(root, 'escape'));
    await expect(new MediaFileReader({ root }).read('link.png')).rejects.toMatchObject({
      code: 'media_path_invalid',
    });
    await expect(new MediaFileReader({ root }).read('escape/anything')).rejects.toMatchObject({
      code: 'media_outside_root',
    });
  });

  it('rejects missing and nonregular files without exposing paths', async () => {
    const reader = new MediaFileReader({ root });
    for (const path of ['missing.png', 'directory']) {
      if (path === 'directory') await mkdir(join(root, path));
      await expect(reader.read(path)).rejects.toMatchObject({
        code: 'media_not_regular_file',
      });
    }
  });

  it('enforces bounded reads before returning any oversized bytes', async () => {
    await writeFile(join(root, 'large.png'), Buffer.alloc(1_048_577));
    await expect(new MediaFileReader({ root, maxBytes: 1_048_576 }).read('large.png')).rejects.toMatchObject({
      code: 'media_too_large',
    });
  });

  it('rejects unsupported signatures and malformed/truncated files', async () => {
    const reader = new MediaFileReader({ root });
    await writeFile(join(root, 'unknown.png'), Buffer.from('not-an-image'));
    await expect(reader.read('unknown.png')).rejects.toMatchObject({ code: 'media_type_unsupported' });
    for (const [name, bytes] of [
      ['bad.png', png().subarray(0, 18)],
      ['bad.jpg', jpeg().subarray(0, 9)],
      ['bad.gif', gif().subarray(0, 16)],
    ] as const) {
      await writeFile(join(root, name), bytes);
      await expect(reader.read(name)).rejects.toMatchObject({ code: 'media_malformed' });
    }
  });

  it('rejects zero or excessive pixel dimensions and too many GIF frames', async () => {
    const reader = new MediaFileReader({ root });
    await writeFile(join(root, 'zero.png'), png(0, 3));
    await writeFile(join(root, 'huge.png'), png(10_000, 10_000));
    await writeFile(join(root, 'frames.gif'), gif(251));
    await expect(reader.read('zero.png')).rejects.toMatchObject({ code: 'media_dimensions_invalid' });
    await expect(reader.read('huge.png')).rejects.toMatchObject({ code: 'media_dimensions_invalid' });
    await expect(reader.read('frames.gif')).rejects.toMatchObject({ code: 'media_frame_limit_exceeded' });
  });

  it('rejects an unconfigured or missing root', async () => {
    await expect(new MediaFileReader({ root: '' }).read('a.png')).rejects.toMatchObject({
      code: 'media_not_configured',
    });
    await expect(new MediaFileReader({ root: join(root, 'missing') }).read('a.png')).rejects.toMatchObject({
      code: 'media_not_configured',
    });
  });
});
