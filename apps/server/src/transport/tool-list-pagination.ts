import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Stateless, public-only pagination of the MCP SDK's generated tool metadata. */
const MAX_TOOLS = 512;
const MAX_FULL_LIST_BYTES = 2_097_152;
const PAGE_WIRE_BUDGET = 96 * 1024;
const PAGE_CURSOR_PATTERN = /^v2\.([0-9a-f]{20})\.([1-9][0-9]{0,3})\.([A-Za-z0-9_-]{22})$/u;
const WORST_CASE_JSON_RPC_ID = '\u0000'.repeat(128);

export class InvalidToolListPage extends Error {
  constructor() {
    super('Invalid tool inventory cursor.');
    this.name = 'InvalidToolListPage';
  }
}

const unsafe = (): never => {
  throw new InvalidToolListPage();
};

type JsonTool = { name: string; [key: string]: unknown };

function deepFreezeParsedJson(value: unknown, depth = 0): void {
  if (value === null || typeof value !== 'object') return;
  if (depth > 64) unsafe();
  for (const child of Object.values(value)) deepFreezeParsedJson(child, depth + 1);
  Object.freeze(value);
}

export interface ToolInventoryPage {
  tools: readonly JsonTool[];
  nextCursor?: string;
}

/**
 * Use an upper-bound 128-byte JSON-RPC ID *after JSON escaping* to keep
 * page boundaries identical for every request ID and transport client.
 * Neither cursor nor caller ID participates in the content fingerprint.
 */
function eventUpperBound(toolBytes: number, count: number): number {
  const empty = JSON.stringify({
    jsonrpc: '2.0',
    id: WORST_CASE_JSON_RPC_ID,
    result: { tools: [], nextCursor: `v2.${'f'.repeat(20)}.512.${'x'.repeat(22)}` },
  });
  return (
    Buffer.byteLength('event: message\ndata: \n\n', 'utf8') +
    Buffer.byteLength(empty, 'utf8') +
    toolBytes +
    Math.max(0, count - 1)
  );
}

export function paginateToolInventory(
  tools: unknown,
  cursor: unknown,
  secret: Uint8Array,
): ToolInventoryPage {
  if (!(secret instanceof Uint8Array) || secret.byteLength < 32) unsafe();
  if (!Array.isArray(tools) || tools.length === 0 || tools.length > MAX_TOOLS) unsafe();
  const serialized = JSON.stringify(tools);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_FULL_LIST_BYTES) unsafe();

  // The SDK wire body has already been parsed as JSON. Take a fresh inert
  // snapshot so callers can never mutate descriptors or invalidate the page
  // after it was returned, without freezing/mutating the input objects.
  const entries = JSON.parse(serialized) as JsonTool[];
  deepFreezeParsedJson(entries);
  const bytes = entries.map((tool) => {
    if (
      tool === null ||
      typeof tool !== 'object' ||
      Array.isArray(tool) ||
      typeof tool.name !== 'string' ||
      tool.name.length === 0
    )
      unsafe();
    return Buffer.byteLength(JSON.stringify(tool), 'utf8');
  });

  const fingerprint = createHash('sha256').update(serialized).digest('hex').slice(0, 20);
  const macFor = (offset: number) =>
    createHmac('sha256', secret)
      .update(`v2:${fingerprint}:${offset}`)
      .digest()
      .subarray(0, 16)
      .toString('base64url');
  const starts = [0];
  const ends: number[] = [];
  let index = 0;
  while (index < entries.length) {
    let pageBytes = 0;
    let count = 0;
    while (
      index < entries.length &&
      eventUpperBound(pageBytes + bytes[index]!, count + 1) <= PAGE_WIRE_BUDGET
    ) {
      pageBytes += bytes[index]!;
      index++;
      count++;
    }
    if (count === 0) unsafe(); // A single descriptor must never be truncated.
    ends.push(index);
    if (index < entries.length) starts.push(index);
  }

  let pageIndex = 0;
  if (cursor !== undefined) {
    if (typeof cursor !== 'string' || cursor.length > 80) throw new InvalidToolListPage();
    const match = PAGE_CURSOR_PATTERN.exec(cursor);
    if (!match || match[1] !== fingerprint) throw new InvalidToolListPage();
    const start = Number(match[2]);
    if (!Number.isSafeInteger(start)) unsafe();
    const suppliedMac = Buffer.from(match[3]!);
    const expectedMac = Buffer.from(macFor(start));
    if (suppliedMac.length !== expectedMac.length || !timingSafeEqual(suppliedMac, expectedMac)) unsafe();
    pageIndex = starts.indexOf(start);
    if (pageIndex <= 0) unsafe();
  }
  const start = starts[pageIndex]!;
  const end = ends[pageIndex]!;
  const nextCursor = end < entries.length ? `v2.${fingerprint}.${end}.${macFor(end)}` : undefined;
  return Object.freeze({
    tools: Object.freeze(entries.slice(start, end)),
    ...(nextCursor === undefined ? {} : { nextCursor }),
  });
}
