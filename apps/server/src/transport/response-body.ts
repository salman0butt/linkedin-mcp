const MAX_HTTP_RESPONSE_BYTES = 256 * 1024;

/** Retain bounded response bytes; drain overflow so dispatched work is not cancelled. */
export async function readResponseBody(response: Response): Promise<Buffer | undefined> {
  if (response.body === null) return Buffer.alloc(0);
  const reader = response.body.getReader();
  let buffer: Buffer | undefined;
  let length = 0;
  let overflow = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (overflow || value.byteLength === 0) continue;
      if (value.byteLength > MAX_HTTP_RESPONSE_BYTES - length) {
        overflow = true;
        buffer = undefined;
        continue;
      }
      const needed = length + value.byteLength;
      if (buffer === undefined || needed > buffer.length) {
        const capacity = Math.min(MAX_HTTP_RESPONSE_BYTES, Math.max(1024, needed, (buffer?.length ?? 0) * 2));
        const next = Buffer.allocUnsafe(capacity);
        buffer?.copy(next, 0, 0, length);
        buffer = next;
      }
      buffer.set(value, length);
      length += value.byteLength;
    }
    return overflow ? undefined : (buffer?.subarray(0, length) ?? Buffer.alloc(0));
  } finally {
    reader.releaseLock();
  }
}
