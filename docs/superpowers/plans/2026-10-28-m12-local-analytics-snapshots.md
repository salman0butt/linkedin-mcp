# M12.0 Local Analytics Snapshot Comparison Implementation Plan

Base exact verified M11.3 main `d7d46ab4b117109b2aad6e266fb78ecd453b10b2` and isolated branch `feat/m12-local-analytics-snapshots`.
Spec `docs/superpowers/specs/2026-10-28-m12-local-analytics-snapshots-design.md`.

1. **Pure TDD** — new `apps/server/src/analytics/snapshot-comparison.ts`, `apps/server/test/analytics-snapshot-comparison.test.ts`. Genuine missing-module RED; implement strict own-data input with two captured dates/four possibly-null counters, arithmetic with no rates, explicit unavailability and independent caller provenance. Test proxy/accessor/holes/extra secret fields, dates, limit and deep immutability. Focus Node24 tests/lint/typecheck.
2. **MCP TDD** — new `apps/server/src/analytics-mcp.ts`, `apps/server/test/mcp-analytics-snapshot-comparison-contract.test.ts`. Genuine real MCP SDK missing-tool RED; typed strict Zod schema, sanitized small dual-copy response, host ID bounded, 270k ID and raw SSE safety, no provider/approval. Real success/failure tests and forged metadata rejection.
3. **Integration and documentation** — register in `create-server.ts`, capability `analytics.snapshots.compare` in core and truthful foundation tests, update built inventory 63→64 and in-memory 59→60, real STDIO/HTTP smoke, update M12 milestone, CURRENT, capability matrix, progress, traceability, index. Preserve existing `analytics.post` provider UNAVAILABLE.
4. **Review and release** — independently audit pure and MCP/transport scopes, fix reproducible Important/Critical via RED→GREEN, full Node24 gates, exact local staged tree/GitHub blobs and commit parent, single focused PR, exact feature quality CI, guarded squash and exact main push quality CI. Do not mark M12 complete or claim real provider metrics.
