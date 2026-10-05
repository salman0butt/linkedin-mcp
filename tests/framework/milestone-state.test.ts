import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { verifyMilestoneState } from '../../scripts/verify-milestone-state.js';

const roots: string[] = [];

function fixture(state: Record<string, unknown>, current: string): string {
  const root = mkdtempSync(join(tmpdir(), 'linkedin-mcp-state-'));
  roots.push(root);
  mkdirSync(join(root, 'docs/progress'), { recursive: true });
  mkdirSync(join(root, 'docs/milestones'), { recursive: true });
  writeFileSync(join(root, 'docs/progress/project-state.json'), JSON.stringify(state));
  writeFileSync(join(root, 'docs/milestones/CURRENT.md'), current);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('verifyMilestoneState', () => {
  const state = {
    currentMilestone: 'M00',
    currentIteration: 'M00.2',
    status: 'ACTIVE',
    activeBranch: 'feat/m00-foundation',
    activePr: 1,
    exactNextWork: 'Implement verifier.',
  };
  const current =
    'Milestone: M00 — Foundation\nStatus: ACTIVE — M00.2\nBranch: `feat/m00-foundation`\nPR: #1 — draft\n';

  it('accepts matching machine and markdown state with one next work action', () => {
    expect(verifyMilestoneState(fixture(state, current))).toEqual([]);
  });

  it('rejects missing exact next work', () => {
    const root = fixture({ ...state, exactNextWork: '' }, current);
    expect(verifyMilestoneState(root).some((error) => error.includes('exactNextWork'))).toBe(true);
  });

  it('rejects milestone disagreement', () => {
    const root = fixture(state, current.replace('M00 — Foundation', 'M01 — Authentication'));
    expect(verifyMilestoneState(root).some((error) => error.includes('current milestone'))).toBe(true);
  });
});
