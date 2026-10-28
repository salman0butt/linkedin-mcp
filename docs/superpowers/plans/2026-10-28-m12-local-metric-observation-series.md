# M12.2 Caller-Only Metric Observation Series — Implementation Plan

Exact parent verified main `40c714df69039ab65e648ae78d58a30496698c1e`, isolated branch `feat/m12-local-observation-series`.

1. **Pure RED→GREEN:** Write genuine missing-module test for `compareLocalAnalyticsObservationSeries` then strict 3–10 caller capture series, reusing validated M12.0 adjacent-pair comparisons. Verify UTC chronology, null/zero distinction, signed deltas, hostile own descriptors/accessors/proxies/array holes, no secret echoes, output freeze and ≤32KiB.
2. **MCP RED→GREEN:** Write real SDK missing-tool test for `linkedin.analytics.compare_snapshot_series` and register strictly typed sanitized local-only tool with bounded full dual response, hostile 270k host IDs/timestamps and raw SSE ≤256KiB.
3. **Integration:** Register through create-server, declare LOCAL_ONLY capability, adjust all inventory and compiled STDIO/HTTP smoke assertions (61→62 in-memory; 65→66 compiled), retain unavailable LinkedIn analytics and scheduling, update project progress/traceability and record M12.1 verified evidence.
4. **Release:** Independent complementary strictly read-only pure and MCP/transport audits Critical0 Important0; full Node24 format/lint/typecheck/build and tests; GitHub exact tree and blobs; feature PR CI; expected-head guarded squash; exact merged main push CI before declaration.
