import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { verifyAutonomousFramework } from '../../scripts/verify-autonomous-framework.js';

const roots: string[] = [];

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'linkedin-mcp-framework-'));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('verifyAutonomousFramework', () => {
  it('accepts the repository when mandatory recovery files and milestone ledgers exist', () => {
    expect(verifyAutonomousFramework(process.cwd())).toEqual([]);
  });

  it('rejects a missing mandatory recovery file', () => {
    const root = fixture({});
    expect(verifyAutonomousFramework(root)).toContain('Missing mandatory recovery file: AGENTS.md');
  });

  it('rejects a milestone ledger missing required sections', () => {
    const root = fixture({
      'AGENTS.md': '# policy',
      'CODEX-START-HERE.md': '# start',
      'docs/AUTONOMOUS-DEVELOPMENT.md': '# autonomous',
      'docs/progress/project-state.json': '{}',
      'docs/progress/STATUS.md': '# status',
      'docs/progress/KNOWN-ISSUES.md': '# issues',
      'docs/milestones/CURRENT.md': '# current',
      'docs/milestones/M00-foundation.md': '# M00\n\n## Goal\nFoundation',
    });
    expect(verifyAutonomousFramework(root).some((error) => error.includes('M00-foundation.md missing required section'))).toBe(true);
  });
});
