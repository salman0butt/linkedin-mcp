# M17.3 — Reject unpaginated HTTP tool-list batches before SDK dispatch

## Reproduced reliability defect

Main `73c4db0c4d103361d8e3576d1fdd80454cb6286e` already paginates standalone HTTP `tools/list`, but `getToolListRequest` recognizes only a top-level JSON-RPC object. A JSON-RPC array with two or more `tools/list` entries bypasses pagination: the SDK eagerly creates unpaginated SSE frames and `writeResponse` buffers all bytes before enforcing the 256 KiB outgoing ceiling. Independent Node24 in-process measurement of actual loopback HTTP shows a 1,528-byte 32-item batch generates ~8.49 MiB of intermediate bytes before a 114-byte HTTP502. A mixed `tools/list` and caller-driven provider call can execute the latter even though its response is discarded, creating unknown outcomes.

## Scoped behavior

- On POST, inspect the already byte-limited request body for a **JSON-RPC batch array containing any entry whose `method` is `tools/list`**. Reject the whole batch early with a bounded HTTP400 JSON-RPC Invalid Request (`-32600`, `id:null`) **before** the MCP handler sees the batch, regardless of array position or other entries. This blocks unpaginated allocation and silent mixed-batch side effects.
- Preserve legal non-tool-list JSON-RPC batches, notifications, JSON-RPC ID caps, malformed JSON SDK behavior, host/origin checks, no secret echo, and individual `tools/list` pagination (67 tools, pages <=96 KiB) without truncation.
- Keep existing 256 KiB outgoing cap and safe unknown-outcome semantics for unrelated responses. Do not introduce provider capabilities or change STDIO registration. Further bounding of generic `writeResponse` streaming is a separate hardening candidate.

## Verification

Meaningful real Node24 RED: a 2+ `tools/list` HTTP batch currently yields HTTP502 after SDK response generation, but must return bounded HTTP400 and no SDK tool-list operation; a mixed batch must produce **zero** trusted injected provider calls in either order. GREEN after minimum pre-dispatch guard. Existing standalone full-inventory paginated HTTP/SDK aggregation and two legal health calls must remain GREEN. Require full format/lint/typecheck/build/tests/framework and compiled STDIO+HTTP, independent Critical0 Important0, connector-first feature PR with exact SHA CI, guarded squash merge and distinct successful main push CI. M17 overall remains PLANNED, M13.1 provider authorization BLOCKED.
