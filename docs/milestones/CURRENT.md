# Current Milestone

Milestone: M00 — Foundation + Autonomous Control Plane
Status: IMPLEMENTING — M00.7 stdio transport / built-process smoke
Branch: `feat/m00-foundation`
PR: #1 — draft
Design: `docs/superpowers/specs/2026-10-05-m00-foundation-design.md`
Plan: `docs/superpowers/plans/2026-10-05-m00-foundation.md`
Ledger: `docs/milestones/M00-foundation.md`

## Recovery

M00.1–M00.6 are complete at the currently verified branch state. Exact-head PR CI run `37353017223` is green on `cdde65df7b8d267646da67684586372421d8c1ff`, including 34 tests, format, lint, typecheck and build. Continue M00.7 with a genuine built-process stdio smoke RED that fails because the stdio entrypoint does not yet exist. Do not start M01 until M00 merge and post-merge `main` CI are proven.
