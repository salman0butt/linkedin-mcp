import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { verifyCapabilityMatrix } from '../../scripts/verify-capability-matrix.js';

const roots: string[] = [];

function fixture(markdown: string): string {
  const root = mkdtempSync(join(tmpdir(), 'linkedin-mcp-capabilities-'));
  roots.push(root);
  mkdirSync(join(root, 'docs/product'), { recursive: true });
  writeFileSync(join(root, 'docs/product/CAPABILITY-MATRIX.md'), markdown);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('verifyCapabilityMatrix', () => {
  const header = '| Capability | Desired behavior | Provider classification | Access / permission dependency | Milestone | State | Verification evidence | Approval / safety |\n| --- | --- | --- | --- | --- | --- | --- | --- |';

  it('accepts supported provider/state combinations', () => {
    const root = fixture(`${header}\n| x | Local | LOCAL_ONLY | None | M00 | ACTIVE | Pending | Read-only |\n`);
    expect(verifyCapabilityMatrix(root)).toEqual([]);
  });

  it('rejects unsupported provider classifications', () => {
    const root = fixture(`${header}\n| x | Local | MAGIC_API | None | M00 | ACTIVE | Pending | Read-only |\n`);
    expect(verifyCapabilityMatrix(root).some((error) => error.includes('unsupported provider'))).toBe(true);
  });

  it('rejects verified capabilities without evidence', () => {
    const root = fixture(`${header}\n| x | Local | LOCAL_ONLY | None | M00 | VERIFIED | Pending | Read-only |\n`);
    expect(verifyCapabilityMatrix(root).some((error) => error.includes('VERIFIED capability requires evidence'))).toBe(true);
  });

  it('accepts unavailable capability state separately from provider execution', () => {
    const root = fixture(`${header}\n| x | Future | UNAVAILABLE | TBD | M15 | PLANNED | None | Approval |\n`);
    expect(verifyCapabilityMatrix(root)).toEqual([]);
  });
});
