import { describe, expect, it } from 'vitest';

import { InvalidToolListPage, paginateToolInventory } from '../src/transport/tool-list-pagination.js';

const inventory = (count: number, descriptionSize = 2_000) =>
  Array.from({ length: count }, (_, i) => ({
    name: `tool_${String(i).padStart(3, '0')}`,
    description: `${i} - ${'x'.repeat(descriptionSize)}`,
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    outputSchema: { type: 'object', additionalProperties: false, properties: {} },
  }));

describe('stateless complete bounded tool-inventory pages', () => {
  const secret = Buffer.alloc(32, 0x42);
  it('returns all 512 descriptors once, stable ordered, with valid deterministic replay', () => {
    const tools = inventory(512);
    const obtained: unknown[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = paginateToolInventory(tools, cursor, secret);
      expect(Object.isFrozen(page)).toBe(true);
      expect(Object.isFrozen(page.tools)).toBe(true);
      expect(Object.isFrozen(page.tools[0])).toBe(true);
      expect(Object.isFrozen(page.tools[0]?.inputSchema)).toBe(true);
      expect(page.tools[0]).not.toBe(tools[obtained.length]);
      expect(page.tools.length).toBeGreaterThan(0);
      if (cursor !== undefined) expect(paginateToolInventory(tools, cursor, secret)).toEqual(page);
      obtained.push(...page.tools);
      cursor = page.nextCursor;
      if (cursor !== undefined) {
        expect(cursors.has(cursor)).toBe(false);
        cursors.add(cursor);
      }
      pages++;
      expect(pages).toBeLessThan(64); // Keep SDK auto-aggregation below its default 64-page cap.
    } while (cursor !== undefined);
    expect(pages).toBeGreaterThan(3);
    expect(obtained).toEqual(tools);
    expect(new Set(obtained.map((tool) => (tool as { name: string }).name)).size).toBe(512);
  });

  it('rejects stale, forged, skipped and oversized cursors without echoing them', () => {
    const tools = inventory(180);
    const first = paginateToolInventory(tools, undefined, secret);
    expect(first.nextCursor).toBeDefined();
    const cursor = first.nextCursor!;
    const next = paginateToolInventory(tools, cursor, secret);
    expect(next.tools.length).toBeGreaterThan(0);
    for (const bad of [
      'PRIVATE_SECRET_CANARY',
      '',
      'v2.' + '0'.repeat(20) + '.1.' + 'x'.repeat(22),
      cursor.replace(/\.(\d+)\./u, '.4.'),
      cursor + ' extra',
      '🔑'.repeat(100),
    ]) {
      try {
        paginateToolInventory(tools, bad, secret);
        throw new Error('expected bad cursor rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidToolListPage);
        if (bad.length >= 10) expect(String(error)).not.toContain(bad);
      }
    }
    expect(() =>
      paginateToolInventory([...tools, { ...tools[0]!, description: 'changed' }], cursor, secret),
    ).toThrow(InvalidToolListPage);
    expect(() => paginateToolInventory(tools, cursor, Buffer.alloc(32, 0x24))).toThrow(InvalidToolListPage);
    const later = next.nextCursor;
    expect(later).toBeDefined();
    const forgedSkip = cursor.replace(/\.(\d+)\./u, `.${later!.split('.')[2]}.`);
    expect(() => paginateToolInventory(tools, forgedSkip, secret)).toThrow(InvalidToolListPage);
  });

  it('fails closed without truncating a too-large descriptor or oversized catalog', () => {
    expect(() => paginateToolInventory(inventory(1, 120_000), undefined, secret)).toThrow(
      InvalidToolListPage,
    );
    expect(() => paginateToolInventory(inventory(513), undefined, secret)).toThrow(InvalidToolListPage);
    expect(() => paginateToolInventory(inventory(512, 4_096), undefined, secret)).toThrow(
      InvalidToolListPage,
    );
    expect(() => paginateToolInventory([], undefined, secret)).toThrow(InvalidToolListPage);
  });
});
