import { existsSync, readFileSync } from 'node:fs';
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

const REQUIRED_UNATTENDED_GITHUB_WRITE_MARKER = 'GITHUB_WRITE_MODE = CONNECTOR_FIRST';

const MILESTONE_LEDGER_FILES = [
  'M00-foundation.md',
  'M01-auth-identity.md',
  'M02-text-publishing.md',
  'M03-media-publishing.md',
  'M04-comments-engagement.md',
  'M05-post-search.md',
  'M06-job-search.md',
  'M07-job-intelligence.md',
  'M08-article-engine.md',
  'M09-native-article-publishing.md',
  'M10-content-intelligence.md',
  'M11-scheduling.md',
  'M12-analytics.md',
  'M13-company-pages.md',
  'M14-networking.md',
  'M15-messaging.md',
  'M16-hosted-multi-account.md',
  'M17-production-hardening.md',
] as const;

const REQUIRED_LEDGER_SECTIONS = [
  'Goal',
  'Dependencies',
  'In Scope',
  'Out of Scope',
  'Acceptance Criteria',
  'TDD Evidence',
  'Integration Test Evidence',
  'Security Review',
  'Code Review Findings',
  'Fresh Verification Results',
  'Durable Recovery Sources',
  'Completion Checklist',
] as const;

export function verifyAutonomousFramework(root: string): string[] {
  const errors: string[] = [];

  for (const path of REQUIRED_RECOVERY_FILES) {
    if (!existsSync(resolve(root, path))) errors.push(`Missing mandatory recovery file: ${path}`);
  }

  const agentsPath = resolve(root, 'AGENTS.md');
  if (
    existsSync(agentsPath) &&
    !readFileSync(agentsPath, 'utf8').includes(REQUIRED_UNATTENDED_GITHUB_WRITE_MARKER)
  ) {
    errors.push(
      `AGENTS.md missing required unattended GitHub write marker: ${REQUIRED_UNATTENDED_GITHUB_WRITE_MARKER}`,
    );
  }

  for (const file of MILESTONE_LEDGER_FILES) {
    const path = resolve(root, 'docs/milestones', file);
    if (!existsSync(path)) {
      errors.push(`Missing milestone ledger: ${file}`);
      continue;
    }

    const markdown = readFileSync(path, 'utf8');
    for (const section of REQUIRED_LEDGER_SECTIONS) {
      if (!markdown.includes(`## ${section}`)) {
        errors.push(`${file} missing required section: ${section}`);
      }
    }
  }

  return errors;
}
