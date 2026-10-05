import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_RECOVERY_FILES = [
  'AGENTS.md',
  'CODEX-START-HERE.md',
  'docs/AUTONOMOUS-DEVELOPMENT.md',
  'docs/progress/project-state.json',
  'docs/progress/STATUS.md',
  'docs/progress/KNOWN-ISSUES.md',
  'docs/milestones/CURRENT.md',
] as const;

export function verifyAutonomousFramework(root: string): string[] {
  return REQUIRED_RECOVERY_FILES.filter((path) => !existsSync(resolve(root, path))).map(
    (path) => `Missing mandatory recovery file: ${path}`,
  );
}
