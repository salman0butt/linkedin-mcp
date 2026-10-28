# M12.3 HTTP tool-inventory pagination plan

1. Validate SDK v2 `client.listTools()` auto aggregation, exact ordinary `tools/list` SSE schema and 128-byte JSON-RPC ID gate; establish genuine RED real HTTP contract test.
2. Implement a small pure bounded page builder with deterministic schema-fingerprint cursors and explicit invalid-cursor error. Keep all tool descriptor fields; no schema compression or capability changes.
3. Integrate only in `apps/server/src/http.ts` after SDK `handler.fetch`, retain non-tool-list paths and 256KiB last-resort wire cap; test raw real HTTP and real SDK auto pagination, malformed cursors, batch safety, STDIO unaffected.
4. Run full Node24 quality and compiled STDIO/HTTP smokes. Independently audit wire/privacy and pagination/compatibility with hostile cases and large synthetic inventory; resolve all Critical/Important findings with RED→GREEN.
5. Verify GitHub blob/tree equality, exact feature head CI, guarded squash merge and **distinct main push CI success**. Leave M12 official provider analytics unavailable and preserve all unrelated worktrees.
