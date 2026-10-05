import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_COLUMNS = [
  'Capability',
  'Desired behavior',
  'Provider classification',
  'Access / permission dependency',
  'Milestone',
  'State',
  'Verification evidence',
  'Approval / safety',
] as const;

const SUPPORTED_PROVIDERS = new Set([
  'OFFICIAL_API',
  'PARTNER_API',
  'EXTERNAL_DISCOVERY',
  'BROWSER_INTERACTIVE',
  'LOCAL_ONLY',
  'UNAVAILABLE',
]);
const SUPPORTED_STATES = new Set([
  'PLANNED',
  'ACTIVE',
  'BLOCKED',
  'VERIFIED',
  'DEFERRED',
  'REJECTED',
  'UNAVAILABLE',
]);
const EMPTY_EVIDENCE = new Set(['', 'None', 'Pending', '-']);

function tableRows(markdown: string): string[][] {
  return markdown
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .filter((line) => !/^\|[\s|:-]+\|$/.test(line.trim()))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim().replace(/^`|`$/g, '')),
    );
}

export function verifyCapabilityMatrix(root: string): string[] {
  const markdown = readFileSync(resolve(root, 'docs/product/CAPABILITY-MATRIX.md'), 'utf8');
  const rows = tableRows(markdown);
  const header = rows[0] ?? [];
  const errors: string[] = [];

  for (const column of REQUIRED_COLUMNS) {
    if (!header.includes(column)) errors.push(`Capability matrix missing required column: ${column}`);
  }

  const providerIndex = header.indexOf('Provider classification');
  const stateIndex = header.indexOf('State');
  const evidenceIndex = header.indexOf('Verification evidence');

  for (const row of rows.slice(1)) {
    const provider = row[providerIndex] ?? '';
    const state = row[stateIndex] ?? '';
    const evidence = row[evidenceIndex] ?? '';
    if (providerIndex >= 0 && !SUPPORTED_PROVIDERS.has(provider)) {
      errors.push(`Capability matrix has unsupported provider: ${provider}`);
    }
    if (stateIndex >= 0 && !SUPPORTED_STATES.has(state)) {
      errors.push(`Capability matrix has unsupported state: ${state}`);
    }
    if (state === 'VERIFIED' && EMPTY_EVIDENCE.has(evidence)) {
      errors.push('VERIFIED capability requires evidence');
    }
  }

  return errors;
}
