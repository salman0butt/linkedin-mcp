# M17.4 bounded HTTP response accumulation plan

Spec: `docs/superpowers/specs/2026-11-25-m17-bounded-response-read-design.md`. Base: PR #38 head `c61733c367c9714796c56761d7f6f7f6b5f4e7f8`.

1. Extract the existing HTTP response writing behavior without changing it; run focused transport tests.
2. Add RED tests using real `ReadableStream` chunks: exact 262,144 bytes succeeds; 262,145 bytes returns HTTP 502 only after the remaining chunks are drained; no full-body `arrayBuffer` is called. Test empty bodies, stream failures and ordinary headers. Confirm failure on the old implementation for the missing bounded reader.
3. Read response chunks, keep at most 262,144 bytes, discard retained data on overflow and drain remaining chunks without cancellation. Preserve empty-body, headers, status and unknown-outcome behavior. Confirm focused GREEN.
4. Exercise an oversized real HTTP health-call batch and the existing standalone pagination and ordinary batches; run Node24 full suite, build, format, lint, typecheck and framework verification. Investigate failures before changing assertions.
5. Review correctness, stream errors, overflow allocation and writes with unknown outcome. Record remaining SDK-side memory/dispatch limitations, exact evidence, active branch and one next action; persist through connector with head-safe checks and exact-head CI.

## Review focus

- Response chunks larger than the limit and after the first overflow.
- `null` and empty bodies, exact byte boundaries, split multibyte text.
- Header and status preservation on successful reads and errors.
- Stream exceptions before and after overflow; no accidental partial success.
- Handler operations continue and the SDK may buffer before the adapter reads.
