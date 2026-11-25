# M17.3 HTTP tools/list batch preflight implementation plan

**Goal:** Prevent unpaginated MCP tool inventory response amplification and silent side effects in JSON-RPC batches that contain `tools/list`.

**Architecture:** Reuse byte-bounded `readBody` inside `toRequest` and existing `jsonRpcError`. Detect only top-level arrays containing a `method: 'tools/list'` entry; check before `handler.fetch` (and before any unrelated tool executes). Ordinary batches and standalone pagination stay unchanged.

**Spec:** `docs/superpowers/specs/2026-10-29-m17-http-tool-list-batch-preflight-design.md`.

## Steps

1. Add real HTTP test for 2/8+ tool-list batches requiring HTTP400 `-32600` and bounded, no-inventory echo; verify baseline RED (currently 502 after intermediate SDK materialization).
2. Add trusted injected discovery provider to real HTTP transport and a mixed `[tools/list, tools/call]` batch in both orders. Require HTTP400 and zero provider execution; verify genuine baseline RED.
3. Implement minimal preflight detection after byte-bounded request-body parsing; reject before SDK handler. Preserve individual tools/list, legal batches, malformed JSON, existing ID, host/origin, headers and response bounds.
4. Run focused HTTP/pagination tests, Node24 all test suites, framework, compiled STDIO/HTTP, format/lint/typecheck/build, diff check. Obtain independent read-only security and correctness reviews; fix every Critical/Important with RED→GREEN.
5. Reconcile durable M17 milestone/traceability/project-state to truthful local status and single next action; connector-first GitHub commit/branch/PR, exact feature CI, guarded squash, distinct main push CI; then record final release checkpoint and select next legitimate unfinished work.
