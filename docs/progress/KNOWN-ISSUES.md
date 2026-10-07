# Known Issues

## Current unresolved issues

### Minor — private package boundary is repository-relative

`@linkedin-mcp/server` is private and currently imports the built private core package through `../../../packages/core/dist/index.js`, while its build script explicitly builds core first. Monorepo tests/build/real transport smokes verify this arrangement. When package-consumer boundaries expand, replace it with an explicit `@linkedin-mcp/core` workspace dependency and regenerate the lockfile under the repository supply-chain policy.

### External verification gate — live LinkedIn capability availability

M01 deterministic implementation is verified, but ordinary CI has no configured LinkedIn developer application/member credentials/product access. Therefore live `profile.me` availability has not been verified; native PKCE enablement and programmatic refresh are also access-dependent. This is not an implementation defect and must not be converted into a VERIFIED capability claim.

### Interactive connector/container limitations

GitHub Actions is the authoritative exact-head execution environment when interactive package/network execution is unavailable. Repository writes may use the Git data API with an exact-head lease when the Contents API is transiently unavailable; this does not relax concurrency or security policy.

## Review state

M01.8 skeptical/security self-review completed because no subagent reviewer tool was exposed in this session. Three Important integration findings were resolved through regression RED→GREEN cycles: structured auth result mapping, real transport AuthService wiring, and structured logout cleanup failure. Unresolved Critical findings: 0. Unresolved Important findings: 0.
