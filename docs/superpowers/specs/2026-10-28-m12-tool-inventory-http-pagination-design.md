# M12.3 — Safe HTTP MCP tool-inventory pagination

## Verified baseline and problem

M12.2 PR #27 VERIFIED/MERGED: exact main `8d3019a872a34b3990567f193d58d5f7bdb11d42`, tree `b2e9f4482ab5a370d203ba92f54762f78c0e2fcf`, feature CI `40668979524` and separate main-push CI `40669592590` SUCCESS. Node24 1,231/1,231 in 119 suites; independent Critical0/Important0. M12 remains IMPLEMENTING; LinkedIn provider analytics remains OFFICIAL_API/UNAVAILABLE.

The complete 66-tool raw HTTP `tools/list` SSE is approximately 262 KiB and has less than one KiB of headroom under the invariant **262,144-byte HTTP response ceiling**. Adding a new tool will make ordinary SDK discovery fail as an HTTP 502 despite otherwise-working tools. Do not increase the ceiling, drop tools, weaken input/output Zod schemas, rely on compression of an oversized decompressed SSE, or claim a provider capability.

## Contract and shape

Use standard MCP `tools/list` pagination: response `{tools:[...],nextCursor?:string}`; request `{method:'tools/list',params:{cursor?:string}}`. The installed `@modelcontextprotocol/client` v2 auto-aggregates `client.listTools()` over `nextCursor`, and explicit `client.listTools({cursor})` returns exactly one page. The high-level server v2 currently registers a single built-in unpaginated tool list handler (cannot overwrite it via public `server.setRequestHandler`). Implement a **narrow HTTP response adapter** after the existing SDK handler, and only for a single unbatched JSON-RPC `tools/list` request; leave other methods, STDIO and notifications untouched. Mixed batches that cannot be safely paginated retain existing bounded handling, and must never be silently truncated or falsely report completeness.

The adapter processes only a successful, single JSON-RPC MCP SSE event from trusted local SDK output; it must never interpret arbitrary transport bytes as instructions. Reject malformed/unexpected output safely rather than dropping tools. Split entries into stable, complete, nonempty, original-order pages targeting at most 96 KiB per complete serialized SSE event with worst-case allowable **128 UTF-8 byte request ID**, including cursor. Never truncate tool definitions; if one definition is individually impossible under the invariant, fail closed with a bounded error rather than omitting it. Cap tool count/total source bytes defensively.

Opaque, short, deterministic, fixed-version pagination cursors bind **the exact ordered schema inventory** (SHA-256 fingerprint) and a valid next-page boundary. Reject malformed, oversized, secret-bearing, stale, skipped, overflow and inconsistent cursors with a generic sanitized protocol error and no echoed cursor/key/value. Cursor must not expose credentials or provide access to private STDIO-only stores. Invalid cursors must not yield partial data or a fake success. Repeated page requests and concurrent clients must produce stable pages for unchanged inventory; a changed inventory invalidates prior cursors safely.

Do not allow host clock or injected host request IDs to alter pagination data. Preserve JSON-RPC client request IDs, SSE framing, and SDK error handling where possible. Leave `MAX_HTTP_RESPONSE_BYTES` at 256 KiB as final mandatory catch-all. Requests with >128-byte JSON-RPC IDs remain rejected before SDK dispatch. Keep `Content-Type` and relevant security headers; no response caching of credential-bearing data.

## Tests and acceptance

- Genuine real HTTP `tools/list` RED on existing main before implementation: no cursor and 66 tools in one page, violates the expected paging contract.
- GREEN real v2 MCP SDK: explicit first/next pages and auto-aggregated no-cursor `client.listTools()` contain **all 66 names exactly once**, in unchanged SDK order; no advertised tool is lost, none gained. Call at least one tool on a later page.
- Real loopback raw HTTP SSE: **every page** including a 128-byte UTF-8 ID is <=262,144 bytes (prefer <=96 KiB); page contract has `nextCursor` exactly when more remain. Validate malformed/tampered/stale/long Unicode/secret-bearing cursors do not echo secrets or produce success; duplicate/replay requests are deterministic.
- Confirm existing ordinary/batched tools/call, notifications, HTTP origin/host security, 270k ID rejection, STDIO inventory, all old smoke tests, and LOCAL_ONLY/UNAVAILABLE capability gates unchanged.
- Additional synthetic large-inventory tests verify complete coverage, immutable stable ordering, budget enforcement, individual oversized entry rejection and stale-fingerprint rejection.
- Full Node24 format/lint/typecheck/build, 1,231+ tests, built STDIO and HTTP, independent read-only adversarial reviews Critical0/Important0, exact feature-head CI, guarded squash, **separate main push CI on exact merged SHA**.
