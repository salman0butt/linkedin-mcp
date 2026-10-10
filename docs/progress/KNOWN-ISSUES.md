# Known Issues

## Current unresolved issues

### Minor — private package boundary is repository-relative

`@linkedin-mcp/server` is private and currently imports the built private core package through `../../../packages/core/dist/index.js`, while its build script explicitly builds core first. Monorepo tests/build/real transport smokes verify this arrangement. When package-consumer boundaries expand, replace it with an explicit `@linkedin-mcp/core` workspace dependency and regenerate the lockfile under the repository supply-chain policy.

### External verification gate — live LinkedIn capability availability

M01/M02 deterministic implementation and M03.1–M03.5 deterministic/local behavior are verified through recorded checkpoints, but ordinary CI has no configured LinkedIn developer application/member credentials/product access. Live `profile.me`, `post.create.text`, image upload and media-post availability therefore remain unverified. Native PKCE enablement, programmatic refresh and member/media read verification are access-dependent and must not be converted into VERIFIED live-capability claims without legitimate provider evidence.

### Interactive connector/container limitations

GitHub Actions is the authoritative exact-head execution environment when interactive package/network execution is unavailable. Repository writes may use supported GitHub write mechanisms with exact-head checks when a primary connector path is transiently unavailable; this does not relax concurrency or security policy.

During the 2026-10-09 M02 closeout review, the interactive runtime exposed Node 22 rather than required Node 24, had no pnpm and could not resolve github.com. A later M03.2 local clone attempt also could not resolve github.com, so no local rerun is claimed; exact-head Actions evidence is used instead.

## Resolved during M03

### M03.2 — implementation write block resolved

Earlier connector safety checks rejected M03.2 implementation writes, but repository writes later became available. The secure media-root configuration and bounded JPEG/PNG/GIF reader reached verified GREEN at `16d6fa2ffd6088d8973001fece18c2d5ab331ebd`, CI `37964060504`: 346 tests passed, format/lint/typecheck/build passed. The transient write/skill availability issue is not an active blocker.

### M03.3 — successful provider responses are bounded

The first complete Images adapter GREEN at `4b4ca8a8618709034132ba36bc41d14ddd92a740` / CI `37966349832` exposed one Important scoped-review issue: successful provider JSON was parsed without a byte limit. Regression RED `982628adaaaa1cc61ad5e717654ca563bcb2c616` / CI `37966563223` proved the gap while preserving 361 existing passing tests. Final GREEN `f5f4a7d99fdbca41cfdfa9d73838ecd00f9d7f5f` / CI `37966842680` streams successful provider JSON with a hard 64 KiB local bound; 363 tests plus format/lint/typecheck/build pass. This finding is resolved.

## Review state

M01.8 skeptical/security review resolved its three Important integration findings before merge.

M02.5 scoped review found two Important findings and one Minor storage-sanitization finding; all were fixed and re-reviewed before exact checkpoint `84b36492da74961965ba3ae2cfb6e9c8a4c239e6` / CI `37793478842`.

M02.6 scoped review cleared its coverage/author-normalization findings before `1a2cef29d88f7032d5befe18efb627736e49da16` / CI `37832719872`.

Task 7 scoped review cleared MCP safety/envelope findings before `1986831bf58fdd48ea5b0da64109898a768bd937` / CI `37838015911`.

M02 whole-milestone skeptical/security review completed on 2026-10-09 with **0 unresolved Critical findings and 0 unresolved Important findings** before merge.

M03.2 scoped correctness/security review completed after exact-head GREEN with **0 unresolved Critical findings and 0 unresolved Important findings**.

M03.3 scoped correctness/security re-review completed after bounded-response GREEN with **0 unresolved Critical findings and 0 unresolved Important findings**.

M03.4 scoped checkpoint/migration review completed after `f71e9295e1e1d710b232859ab57e8e5264eaa0e4` / CI `38051403134` with **0 unresolved Critical findings and 0 unresolved Important findings**.

M03.5 scoped processing-verification review completed after `0eaa01e31f605a576b2b4456a23605c379f7d3eb` / CI `38057237124` with **0 unresolved Critical findings and 0 unresolved Important findings**. Restricted or unavailable image-status reads never fabricate AVAILABLE/FAILED state, 401 remains reauthentication, and polling is bounded with no background continuation.

Full M03 whole-milestone review remains pending orchestration and MCP integration.
