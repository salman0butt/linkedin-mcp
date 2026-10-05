# Known Issues

## Current unresolved issues

### Bootstrap lockfile CI
Run on `72473e639f807a6f117c53e1fccb6f5196aecae1` failed because `actions/setup-node` pnpm caching required `pnpm-lock.yaml` before the workflow could generate it. Minimal fix committed at `9fb9f6212d3bf8d447b0ee481d0a91e410583eb6`; awaiting exact-head workflow evidence.

### Interactive container network isolation
The current interactive container cannot resolve GitHub/package registries. This is not a repository/product defect. GitHub Actions is the authoritative remote execution environment for dependency resolution/CI in this session. Do not hand-write or claim a lockfile without generated evidence.

## Review state

No known Critical or Important product finding yet. M00 implementation review has not reached closeout.
