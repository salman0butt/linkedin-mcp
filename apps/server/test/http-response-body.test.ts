import { describe, expect, it } from 'vitest';

import { readResponseBody } from '../src/transport/response-body.js';

function responseFromChunks(chunks: Uint8Array[], onPull?: () => void): Response {
  let index = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        onPull?.();
        if (index === chunks.length) controller.close();
        else controller.enqueue(chunks[index++]);
      },
    }),
  );
}

describe('HTTP response body accumulation', () => {
  it('preserves bytes at the 256 KiB limit and accepts an empty response', async () => {
    const bytes = await readResponseBody(
      responseFromChunks([new Uint8Array(131_072).fill(0x61), new Uint8Array(131_072).fill(0x62)]),
    );
    expect(bytes?.length).toBe(262_144);
    expect(bytes?.subarray(131_070, 131_074).toString()).toBe('aabb');
    expect(await readResponseBody(new Response(null))).toEqual(Buffer.alloc(0));
  });

  it('discards an oversized response while draining later chunks', async () => {
    let pulls = 0;
    const response = responseFromChunks(
      [new Uint8Array(262_144), new Uint8Array(1), new Uint8Array(17)],
      () => pulls++,
    );
    expect(await readResponseBody(response)).toBeUndefined();
    expect(pulls).toBe(4);
    expect(await readResponseBody(responseFromChunks([new Uint8Array(262_145)]))).toBeUndefined();
  });

  it('reads streams without materializing the complete response body', async () => {
    for (const size of [1024, 262_145]) {
      const response = responseFromChunks([new Uint8Array(size)]);
      response.arrayBuffer = () => Promise.reject(new Error('unbounded response read'));
      const result = await readResponseBody(response);
      if (size === 1024) expect(result?.length).toBe(1024);
      else expect(result).toBeUndefined();
    }
  });

  it('propagates a stream failure instead of returning partial success', async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new Error('stream failed'));
        },
      }),
    );
    await expect(readResponseBody(response)).rejects.toThrow('stream failed');
  });

  it('propagates a stream failure after overflow', async () => {
    let first = true;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (first) {
            first = false;
            controller.enqueue(new Uint8Array(262_145));
          } else controller.error(new Error('stream failed after overflow'));
        },
      }),
    );
    await expect(readResponseBody(response)).rejects.toThrow('stream failed after overflow');
  });
});
