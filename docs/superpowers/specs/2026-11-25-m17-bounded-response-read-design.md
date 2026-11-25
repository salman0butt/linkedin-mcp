# M17.4 — Bound the HTTP adapter's response accumulation

## Evidence and objective

On PR #38 source, a Node 24 loopback request containing 2,000 `linkedin.health` calls (200,891 input bytes) produced a 1,306,890-byte `Response.arrayBuffer()` before the adapter returned its 114-byte HTTP 502. The 256 KiB limit currently applies only after complete materialization. SDK dispatch can itself allocate or enqueue output before the adapter obtains a stream; this change does not claim to bound SDK memory or prevent side effects.

## Approaches

Rejecting all batches would change supported behavior and does not address a large single response. Cancelling at the threshold could terminate work whose outcome is already unknown. Read chunks and retain at most 256 KiB of response bytes, then discard further chunks while draining to completion; preserve HTTP 502 with its outcome-unknown error, normal response bytes and headers, and no automatic retry. Buffer growth temporarily retains old and new allocations together (less than 512 KiB excluding the incoming chunk). This limits only the final response writer's accumulation: standalone tool-list pagination separately calls `response.text()` and SDK output may already be queued. SDK pre-dispatch batch limits, pagination and upstream allocation remain separate open risks.

## Boundary and verification

Support empty bodies, arbitrary byte chunks, exact 262,144 bytes, limit plus one, and stream read failures. Drain after overflow and do not emit partial content or a premature success. Test real stream behavior and HTTP oversized batches, legal small batches, pagination and existing security constraints. Perform genuine RED→GREEN, full Node24 gates and review; do not claim milestone completion or provider availability.
