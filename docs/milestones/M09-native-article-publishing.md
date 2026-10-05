# M09 — Native Article Publishing

Status: **PLANNED**

## Goal
Add optional native long-form LinkedIn article publication through a legitimate configured provider, with interactive browser provider only where no suitable API exists.

## Dependencies
M08 verified.

## In Scope
Editor mapping, cover/media/formatting/SEO fields, preview, explicit final approval, publish verification, human-action-required handling.

## Out of Scope
CAPTCHA/security-challenge bypass, anti-bot evasion, silent fallback presented as official API.

## Acceptance Criteria
Provider is explicit; final publish requires policy approval; security challenges stop safely; resulting URL is verified.

## Tasks / Iterations
Design/plan; provider boundary; editor mapping; approval; verification; safety closeout.

## TDD Evidence
Pending.

## Integration Test Evidence
Pending.

## Security Review
Browser isolation/serialization/rate bounds, challenge handling, credential/session safety.

## Code Review Findings
Pending.

## Fresh Verification Results
Pending.

## Durable Recovery Sources
PRD, capability matrix, M09 spec/plan, Git/PR/CI.

## Completion Checklist
- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.
