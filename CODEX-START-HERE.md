# CODEX — START HERE

This repository is designed for long-running autonomous development across fresh sessions.

## Mandatory startup

1. Invoke/read Superpowers `using-superpowers` before engineering actions.
2. Read `AGENTS.md`.
3. Read `docs/AUTONOMOUS-DEVELOPMENT.md`.
4. Recover GitHub state: default branch/head, active branches/PRs, reviews/threads, exact-head CI.
5. Confirm the scheduled/unattended write policy from `AGENTS.md`: use connector-first GitHub persistence and never assume raw `git push` credentials survive a fresh run.
6. Read `docs/progress/project-state.json`, `STATUS.md`, and `KNOWN-ISSUES.md`.
7. Read `docs/milestones/CURRENT.md` and the active milestone ledger.
8. Read relevant PRD/traceability/capability-matrix entries.
9. Read the active Superpowers spec and plan.
10. Compare docs with actual Git/code/tests/CI and repair stale state.
11. Continue the highest-priority unfinished work.

## Source precedence

```text
Git graph > source/tests > exact-SHA CI > PR/reviews > project-state.json > status/milestone docs > PRD/traceability/capability matrix > old handoffs > chat memory
```

Routine design/spec/plan gates are pre-authorized by the owner, but all Superpowers rigor remains mandatory. Repository writes remain subject to the active GitHub connection's permissions and any platform approval boundary; never bypass those controls or claim a blocked write succeeded.
