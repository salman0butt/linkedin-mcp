# M03 — Media Publishing

Status: **ACTIVE — M03.8 whole-milestone closeout**

## Goal

Add safe, approval-gated member single-image and multi-image publishing with accessible alt text, bounded local file validation, durable checkpoints and conservative official LinkedIn API provenance.

## Dependencies

M02 is merged. Current `main` is `e006d0d21ee6b3531ec6fcd7a4390bfebf704374` after later repository maintenance.

## In Scope

Canonical media contracts, safe media-root configuration, JPEG/PNG/GIF validation, official Images adapter, processing-status verification, durable media idempotency, approval-gated single/multi-image Posts and strict MCP/transport integration.

## Out of Scope

Arbitrary URL fetch, browser fallback, video/document media, organization or sponsored publishing, image transcoding and unverified live capability claims.

## Acceptance Criteria

- Relative local media paths remain inside a dedicated configured root.
- Unsupported/malformed/truncated/oversized files fail closed without path leakage.
- Alt text and ordered 2–20 multi-image descriptors are canonical and bound to explicit subject-bound approval and durable idempotency.
- Upload/checkpoint/restart, cross-runtime concurrency and uncertain remote outcomes never silently duplicate mutations.
- Provider read restrictions never masquerade as verified image processing.
- Six strict media MCP tools are available through the shared stdio/HTTP runtime without exposing author/token/admin-path/read-control inputs.
- Deterministic CI does not claim live LinkedIn member write access.

## Tasks / Iterations

1. **COMPLETE** — M03.1 canonical media-post contracts and capability registry.
2. **COMPLETE** — M03.2 media-root configuration and bounded local image reader.
3. **COMPLETE** — M03.3 official LinkedIn Images adapter.
4. **COMPLETE** — M03.4 durable media checkpoints and v1 ledger migration.
5. **COMPLETE** — M03.5 access-aware image processing verification.
6. **COMPLETE** — M03.6 approval-gated media orchestration and Posts payload mapping.
7. **COMPLETE** — M03.7 strict MCP tool/stdio/HTTP integration.
8. **ACTIVE** — M03.8 whole-milestone review, final exact-head CI, merge and post-merge verification.

## TDD Evidence

- M03.1 GREEN `875efabef785c5e36cd2b725072643d63cbf0e7f`, CI `37900961050`.
- M03.2 GREEN `16d6fa2ffd6088d8973001fece18c2d5ab331ebd`, CI `37964060504`.
- M03.3 final GREEN `f5f4a7d99fdbca41cfdfa9d73838ecd00f9d7f5f`, CI `37966842680` after bounded-response regression RED.
- M03.4 final GREEN `f71e9295e1e1d710b232859ab57e8e5264eaa0e4`, CI `38051403134`.
- M03.5 final GREEN `0eaa01e31f605a576b2b4456a23605c379f7d3eb`, CI `38057237124`.
- M03.6 stalled-status RED `4b92d8d8ea2c44f94c39d0e1483ab01bf2390e36`, CI `38127429915`; real adapter cancellation RED `3c6ee6476bce750377a9b371698c2431985ebf0d`, CI `38127891256`; final reviewed GREEN `e21bf679846564eacdc025de2fa7657e4dc25018`, CI `38127969036` — 411/411 tests across 43 files plus all quality gates.
- M03.7 strict MCP/transport integration GREEN `5851b9dc1c5b97094ec22cf2e40da71ba6f99118`, CI `38129813482` — 423 deterministic tests plus all quality gates.
- M03.8 truncated-media behavioral RED `77cc6c5706dee48777773b247946459fed35d4c2`, CI `38133439691`; parser GREEN `06505689a070f02a3d86a6c550a922b5028e45de`, CI `38135585804` — 424/424 tests plus all quality gates.
- M03.8 cross-runtime duplicate-initialize behavioral RED `0394ae1ffcf725076a0674583c6464c0b7b7f9fa`, CI `38135863252`; replay guard introduced at `0150f157c1af71387bd40f28f28941a41a19a8b5`. The later uploaded-before-post probe passed and therefore is not represented as a RED checkpoint.
- Latest reviewed implementation GREEN `7c4adf9da2fa33d2d597fcf9034d36fd5076a7a8`, CI `38136409125` — **426/426 tests across 46 files**, frozen install, format, lint, typecheck and build passed.

## Integration Test Evidence

M03.7 registers six media tools through the shared MCP server used by both real StdioClientTransport and loopback HTTP smokes. Existing M00–M02 tool behavior stays green. Provider calls remain deterministic/injected in CI; no real LinkedIn media mutation is claimed.

## Security Review

Scoped M03.2–M03.6 reviews are clear after recorded fixes. M03.8 whole-milestone review covered local path containment, malformed/truncated/oversized image handling, provider URL and response bounds, secret/error sanitization, status-read cancellation, approval binding, current-file rehash, ordered media checkpoints, cross-process locking/replay, mutation uncertainty, strict MCP schemas, real transport registration and capability provenance.

Whole-milestone review found and resolved two Important issues:

1. truncated PNG/JPEG terminal structure acceptance;
2. duplicate remote image initialization across independent runtimes sharing one durable ledger.

At `7c4adf9da2fa33d2d597fcf9034d36fd5076a7a8` / CI `38136409125`, unresolved Critical findings: **0**; unresolved Important findings: **0**. PR #4 review threads were empty at the latest closeout check.

No live LinkedIn image upload/status/post verification has occurred. Deterministic implementation evidence must not be represented as live account capability.

## Code Review Findings

- M03.3 Important unbounded successful-provider-response handling was fixed before checkpoint closeout.
- M03.6 Important stalled status-read deadline and missing real-fetch abort forwarding were fixed and re-reviewed.
- M03.8 Important truncated-image terminal validation and cross-runtime duplicate initialization were fixed with regression coverage.
- Current unresolved Critical findings: **0**.
- Current unresolved Important findings: **0**.
- Blocking PR #4 review threads: **0** at the latest closeout check.

## Fresh Verification Results

Reviewed implementation head `7c4adf9da2fa33d2d597fcf9034d36fd5076a7a8`, CI `38136409125`: **426/426 tests across 46 files**, frozen install, format, lint, typecheck and build passed.

Closeout documentation commits after that implementation checkpoint require their own exact-final-head GREEN CI before merge. CI `38136898018` on `55c98105b1a6478668ad613bc7f907ec4482ee02` passed formatting and 425/426 tests but correctly failed the framework guard because this ledger had renamed mandatory section headings; this commit restores those exact required sections. No production behavior changed.

## Completion Checklist

- [x] M03.1 canonical contracts deterministically verified.
- [x] M03.2 behavioral RED and exact-head GREEN.
- [x] M03.3 official Images adapter RED/GREEN and scoped security re-review.
- [x] M03.4 durable checkpoint migration RED/GREEN and scoped review.
- [x] M03.5 processing verification RED/GREEN and scoped review.
- [x] M03.6 media orchestration RED/GREEN and scoped review.
- [x] M03.7 strict MCP/stdio/HTTP integration.
- [x] M03.8 whole-milestone skeptical/security/provenance review; all Critical/Important findings resolved.
- [ ] Closeout-documentation exact-final-head CI verified.
- [ ] PR #4 squash-merged under durable merge gates.
- [ ] Post-merge `main` CI verified before M04 activation.

## Durable Recovery Sources

`docs/progress/project-state.json`, `docs/progress/STATUS.md`, `docs/progress/KNOWN-ISSUES.md`, `docs/milestones/CURRENT.md`, this ledger, `docs/requirements/TRACEABILITY.md`, `docs/product/CAPABILITY-MATRIX.md`, the active spec/plan, M03 evidence file, PR #4, source/tests/reviews and exact-SHA GitHub Actions evidence.

Exact next work: **Verify exact-final-head CI after this ledger repair, then squash-merge PR #4 only if all merge gates remain satisfied; verify post-merge `main` before activating M04.**
