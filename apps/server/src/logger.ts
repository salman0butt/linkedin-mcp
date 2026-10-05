type Sink = (line: string) => void;

type JsonObject = Record<string, unknown>;

const REDACTED = '[REDACTED]';

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    normalized.includes('token') ||
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized === 'authorization' ||
    normalized === 'cookie' ||
    normalized === 'setcookie'
  );
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value === null || typeof value !== 'object') return value;

  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = isSensitiveKey(key) ? REDACTED : redact(item);
  }
  return result;
}

export interface StructuredLogger {
  info(payload: JsonObject, message?: string): void;
}

export function createLogger(sink: Sink = (line) => process.stderr.write(`${line}\n`)): StructuredLogger {
  return {
    info(payload, message) {
      sink(
        JSON.stringify({
          level: 'info',
          ...(message === undefined ? {} : { message }),
          ...(redact(payload) as JsonObject),
        }),
      );
    },
  };
}
