# Known Issues

## Current unresolved issues

### Interactive container network isolation

The current interactive container cannot resolve GitHub/package registries. This is not a repository/product defect. GitHub Actions is the authoritative remote execution environment for dependency resolution and CI in this session.

## Resolved during M00

- Bootstrap lockfile cache ordering failure was fixed; the real registry-generated `pnpm-lock.yaml` is committed.
- pnpm 12 lifecycle approval now explicitly permits the required `esbuild` build.
- Repository formatting drift was normalized.
- Typed ESLint was pointed at `tsconfig.base.json` and lint now targets TypeScript sources.
- M00.2 autonomous/state verifier RED/GREEN cycles are complete with exact-SHA CI evidence.

## Review state

No known Critical or Important product finding yet. M00 implementation review has not reached closeout.
