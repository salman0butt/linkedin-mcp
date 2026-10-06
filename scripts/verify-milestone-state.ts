import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type ProjectState = {
  currentMilestone?: unknown;
  currentIteration?: unknown;
  status?: unknown;
  activeBranch?: unknown;
  activePr?: unknown;
  exactNextWork?: unknown;
};

function readState(root: string): ProjectState {
  return JSON.parse(readFileSync(resolve(root, 'docs/progress/project-state.json'), 'utf8')) as ProjectState;
}

export function verifyMilestoneState(root: string): string[] {
  const errors: string[] = [];
  const state = readState(root);
  const current = readFileSync(resolve(root, 'docs/milestones/CURRENT.md'), 'utf8');

  if (typeof state.exactNextWork !== 'string' || state.exactNextWork.trim().length === 0) {
    errors.push('project-state.json must contain exactly one non-empty exactNextWork action');
  }

  if (
    typeof state.currentMilestone !== 'string' ||
    !current.includes(`Milestone: ${state.currentMilestone}`)
  ) {
    errors.push('CURRENT.md disagrees with project-state.json current milestone');
  }

  if (typeof state.currentIteration === 'string' && !current.includes(state.currentIteration)) {
    errors.push('CURRENT.md disagrees with project-state.json current iteration');
  }

  if (typeof state.activeBranch === 'string' && !current.includes(`Branch: \`${state.activeBranch}\``)) {
    errors.push('CURRENT.md disagrees with project-state.json active branch');
  }

  if (typeof state.activePr === 'number' && !current.includes(`PR: #${state.activePr}`)) {
    errors.push('CURRENT.md disagrees with project-state.json active PR');
  }

  return errors;
}
