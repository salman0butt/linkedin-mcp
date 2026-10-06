# Known Issues

## Current unresolved issues

### Minor — private package boundary is repository-relative

`@linkedin-mcp/server` is private and currently imports the built private core package through `../../../packages/core/dist/index.js`, while its build script explicitly builds core first. The monorepo test/build/real transport smokes verify this arrangement, so it is not an M00 release blocker. When package-consumer boundaries expand, replace it with an explicit `@linkedin-mcp/core` workspace dependency and regenerate the lockfile under the repository supply-chain policy.

### Interactive container network isolation

The current interactive container cannot reliably resolve GitHub/package registries. This is not a repository/product defect. GitHub Actions is the authoritative remote execution environment for dependency resolution and CI in this session.

## Resolved during M00

- Bootstrap lockfile cache ordering failure was fixed; the real registry-generated `pnpm-lock.yaml` is committed.
- pnpm 12 lifecycle approval explicitly permits the required `esbuild` build.
- Repository formatting drift was normalized and strict type/lint/build gates are green.
- M00 autonomous/state/capability/requirements verifier RED→GREEN cycles are complete.
- The stdio built process is verified through a real MCP client and stdout remains protocol-clean.
- Streamable HTTP is loopback-only, rejects unapproved Host values and cross-origin browser requests, preserves origin-less MCP clients, bounds request bodies and shuts down cleanly.
- The M00 capability registry truthfully marks only the three implemented local tools `AVAILABLE`/`VERIFIED` with evidence; future LinkedIn capabilities remain unavailable.

## Review state

Skeptical M00.9 security/protocol/packaging review is complete. Unresolved Critical findings: 0. Unresolved Important findings: 0. The private package-boundary item above is Minor and explicitly deferred.
