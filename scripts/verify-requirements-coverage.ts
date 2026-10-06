import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_COLUMNS = [
  'Requirement',
  'Milestone',
  'Spec',
  'Plan',
  'Implementation',
  'Tests',
  'Verification',
  'Status',
] as const;

const SUPPORTED_STATUSES = new Set(['PLANNED', 'ACTIVE', 'BLOCKED', 'VERIFIED', 'DEFERRED', 'REJECTED']);

function tableRows(markdown: string): string[][] {
  return markdown
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .filter((line) => !/^\|[\s|:-]+\|$/.test(line.trim()))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

export function verifyRequirementsCoverage(root: string): string[] {
  const markdown = readFileSync(resolve(root, 'docs/requirements/TRACEABILITY.md'), 'utf8');
  const rows = tableRows(markdown);
  const header = rows[0] ?? [];
  const errors: string[] = [];

  for (const column of REQUIRED_COLUMNS) {
    if (!header.includes(column)) errors.push(`Traceability table missing required column: ${column}`);
  }

  const statusIndex = header.indexOf('Status');
  if (statusIndex >= 0) {
    for (const row of rows.slice(1)) {
      const status = row[statusIndex] ?? '';
      if (!SUPPORTED_STATUSES.has(status))
        errors.push(`Traceability table has unsupported status: ${status}`);
    }
  }

  return errors;
}
