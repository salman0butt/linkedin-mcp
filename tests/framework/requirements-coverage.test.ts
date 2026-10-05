import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { verifyRequirementsCoverage } from '../../scripts/verify-requirements-coverage.js';

const roots: string[] = [];

function fixture(markdown: string): string {
  const root = mkdtempSync(join(tmpdir(), 'linkedin-mcp-requirements-'));
  roots.push(root);
  mkdirSync(join(root, 'docs/requirements'), { recursive: true });
  writeFileSync(join(root, 'docs/requirements/TRACEABILITY.md'), markdown);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('verifyRequirementsCoverage', () => {
  const header = '| Requirement | Milestone | Spec | Plan | Implementation | Tests | Verification | Status |\n| --- | --- | --- | --- | --- | --- | --- | --- |';

  it('accepts required columns and supported statuses', () => {
    const root = fixture(`${header}\n| R-1 | M00 | spec | plan | code | tests | evidence | ACTIVE |\n`);
    expect(verifyRequirementsCoverage(root)).toEqual([]);
  });

  it('rejects missing required columns', () => {
    const root = fixture('| Requirement | Milestone | Status |\n| --- | --- | --- |\n| R-1 | M00 | ACTIVE |\n');
    expect(verifyRequirementsCoverage(root).some((error) => error.includes('missing required column'))).toBe(true);
  });

  it('rejects unsupported requirement status values', () => {
    const root = fixture(`${header}\n| R-1 | M00 | spec | plan | code | tests | evidence | DONE |\n`);
    expect(verifyRequirementsCoverage(root).some((error) => error.includes('unsupported status'))).toBe(true);
  });
});
