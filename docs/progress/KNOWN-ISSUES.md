# Known Issues

## Current unresolved issues

### Minor — private package boundary is repository-relative

`@linkedin-mcp/server` is private and currently imports the built private core package through `../../../packages/core/dist/index.js`, while its build script explicitly builds core first. Monorepo tests/build/real transport smokes verify this arrangement. When package-consumer boundaries expand, replace it with an explicit `@linkedin-mcp/core` workspace dependency and regenerate the lockfile under the repository supply-chain policy.

### External verification gate — live LinkedIn capability availability

M01 deterministic implementation is verified, but ordinary CI has no configured LinkedIn developer application/member credentials/product access. Therefore live `profile.me` availability has not been verified; native PKCE enablement and programmatic refresh are also access-dependent. This is not an implementation defect and must not be converted into a VERIFIED capability claim.

### Interactive connector/container limitations

GitHub Actions is the authoritative exact-head execution environment when interactive package/network execution is unavailable. Repository writes may use the Git data API with an exact-head lease when the Contents API is transiently unavailable; this does not relax concurrency or security policy.

## Resolved access interruption — 2026-10-08

GitHub API requests initially failed at the CONNECT proxy; native Git and web reads remained available. A minimal `api.github.com` network addition was saved to the onboarding draft for owner review. Later, fresh normal `gh api`/GraphQL requests succeeded and recovered repository/PR/CI state: main `3dbf3e2ced5303b52fc27303de9c086a998835c7`, draft PR #3 head `84b36492da74961965ba3ae2cfb6e9c8a4c239e6`, CI `37793478842` success, no reviews/threads, mergeable. Runtime policy metadata did not establish that the draft was applied; successful actual commands establish current API access. This interruption is resolved for this run. No automation settings were changed.

## Review state

M01.8 skeptical/security self-review completed because no subagent reviewer tool was exposed in this session. Three Important integration findings were resolved through regression RED→GREEN cycles: structured auth result mapping, real transport AuthService wiring, and structured logout cleanup failure. Unresolved Critical findings: 0. Unresolved Important findings: 0.

M02.5 independent scoped review found two Important findings (post identifier validation and incomplete safety coverage) and one Minor storage-error sanitization finding. All were addressed and re-reviewed before checkpoint `84b36492da74961965ba3ae2cfb6e9c8a4c239e6`; exact-head CI `37793478842` succeeded. Historical Task5 pre-implementation behavioral RED coverage was incomplete; durable evidence qualifies it rather than reconstructing a false history. Unresolved Critical/Important findings in reviewed scope: 0/0. Tasks6–8 remain unfinished and require their own review/verification.

M02 Task6 final scoped independent re-review also cleared its two Important coverage findings and Minor author-classification issue. Local verification passed 265 tests and all required checks. Whole-milestone review is still pending; no live LinkedIn availability is inferred.
