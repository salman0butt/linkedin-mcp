# Known Issues

## Current unresolved issues

### Minor — private package boundary is repository-relative

`@linkedin-mcp/server` is private and currently imports the built private core package through `../../../packages/core/dist/index.js`, while its build script explicitly builds core first. Monorepo tests/build/real transport smokes verify this arrangement. When package-consumer boundaries expand, replace it with an explicit `@linkedin-mcp/core` workspace dependency and regenerate the lockfile under the repository supply-chain policy.

### External verification gate — live LinkedIn capability availability

M01/M02 deterministic implementation and M03 deterministic/local behavior are verified through recorded checkpoints, but ordinary CI has no configured LinkedIn developer application/member credentials/product access. Live `profile.me`, `post.create.text`, image upload, image-status reads and media-post availability therefore remain unverified. Native PKCE enablement, programmatic refresh and member/media read verification are access-dependent and must not be converted into VERIFIED live-capability claims without legitimate provider evidence.

### Interactive connector/container limitations

GitHub Actions is the authoritative exact-head execution environment when interactive package/network execution is unavailable. Repository writes may use supported GitHub write mechanisms with exact-head checks when a primary connector path is transiently unavailable; this does not relax concurrency or security policy.

## Resolved during M03

### M03.2 — implementation write block resolved

Earlier connector safety checks rejected M03.2 writes, but supported repository writes later became available. Final GREEN: `16d6fa2ffd6088d8973001fece18c2d5ab331ebd`, CI `37964060504`.

### M03.3 — successful provider responses are bounded

The first Images adapter GREEN exposed one Important unbounded-success-response issue. Regression RED `982628adaaaa1cc61ad5e717654ca563bcb2c616` / CI `37966563223`; final GREEN `f5f4a7d99fdbca41cfdfa9d73838ecd00f9d7f5f` / CI `37966842680` streams successful provider JSON with a hard 64 KiB local bound.

### M03.6 — stalled status reads are bounded and cancelled

Scoped review found that a provider status request that never settled could exceed the verifier's ten-second budget. Behavioral RED `4b92d8d8ea2c44f94c39d0e1483ab01bf2390e36` / CI `38127429915` proved the hang. Follow-up RED `3c6ee6476bce750377a9b371698c2431985ebf0d` / CI `38127891256` proved the real Images adapter was not forwarding the abort signal. Final GREEN `e21bf679846564eacdc025de2fa7657e4dc25018` / CI `38127969036` passes 411 tests and all quality gates with real fetch cancellation forwarding.

### M03.8 — truncated PNG/JPEG media failed to prove terminal structure

Whole-milestone review found that valid dimension headers were sufficient for PNG/JPEG acceptance even when terminal data was missing. Behavioral RED `77cc6c5706dee48777773b247946459fed35d4c2` / CI `38133439691`; final GREEN `06505689a070f02a3d86a6c550a922b5028e45de` / CI `38135585804` requires terminal PNG `IEND` and JPEG EOI while retaining existing local size/dimension/frame safety bounds.

### M03.8 — cross-runtime duplicate media initialization

Whole-milestone review found that two independent runtimes sharing one file-backed ledger could both observe the same newly reserved mutation before a media checkpoint and both call remote `initializeUpload`. Behavioral RED `0394ae1ffcf725076a0674583c6464c0b7b7f9fa` / CI `38135863252` proved duplicate initialization while all pre-existing tests stayed green. The replay guard introduced at `0150f157c1af71387bd40f28f28941a41a19a8b5` rejects an in-flight reserved replay with no durable media checkpoint before remote mutation. A second uploaded-before-post concurrency probe passed and confirmed no additional ownership mechanism was required. Final exact-head GREEN `7c4adf9da2fa33d2d597fcf9034d36fd5076a7a8` / CI `38136409125` passes 426 tests and all quality gates.

## Review state

M01/M02 whole-milestone reviews were clear before their merges.

M03.2–M03.6 scoped reviews completed with 0 unresolved Critical and 0 unresolved Important findings after their recorded fixes.

M03.7 strict MCP/transport integration reached GREEN at `5851b9dc1c5b97094ec22cf2e40da71ba6f99118` / CI `38129813482`.

M03.8 whole-milestone skeptical correctness/security/provenance review completed after resolving the truncated-file and cross-runtime duplicate-initialization findings. At verified implementation head `7c4adf9da2fa33d2d597fcf9034d36fd5076a7a8` / CI `38136409125`, **0 unresolved Critical findings and 0 unresolved Important findings** remain. Final closeout-documentation CI and merge/post-merge verification are still required before M03 is marked merged.
