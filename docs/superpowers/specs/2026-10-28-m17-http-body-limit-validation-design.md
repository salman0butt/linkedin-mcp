# M17.1 — Finite bounded HTTP request body limits

## Problem and observed failure

On verified main `53e9a885788a2b2066a1d3c7b2d645fb20a6f88a`, `createHttpServer({ requestBodyLimitBytes: NaN })` and `Infinity` accept over-limit POST bodies. The direct option is not validated before `readBody` compares `totalBytes > requestBodyLimitBytes`, so the comparison is always false for `NaN` or `Infinity`. Independent Node24 actual HTTP probes accepted a 1,049,110-byte body with HTTP 200 for either invalid limit, while 1024 correctly yielded 413. The environment config parser also accepts an unsafe magnitude like `100000000000000000000`.

## Scope

- Fail closed before binding a socket when the direct `requestBodyLimitBytes` option is not a positive safe integer in `[1, 16_777_216]`. Allow the documented 1 MiB default and legitimate positive limits within the cap.
- Apply the same 16 MiB ceiling when parsing `LINKEDIN_MCP_BODY_LIMIT_BYTES` from environment configuration; reject unsafe, negative, zero, fractional and oversize settings.
- When no direct request-body limit is supplied, enforce the parsed environment setting; an explicitly supplied valid option takes precedence. The default remains 1 MiB when neither is set.
- Use one shared bound for programmatic options and environment parsing, without changing other configuration integer semantics.
- Preserve the existing HTTP transport, 413 behavior on completed over-limit requests, 256 KiB outbound response maximum, 96 KiB tool list pages, 67 tool inventory, host/origin checks, and private STDIO-only stores.
- Do not implement the distinct known delayed-rejection-on-partial-stream or batched intermediate response-buffering fixes in this increment.
- Do not add or claim LinkedIn provider permissions, account access or publication.

## Acceptance

Genuine RED test on unmodified code proves invalid programmatic limits are accepted and an oversized env value is accepted. GREEN: all invalid direct limits fail before server creation, valid edge limits bind/close cleanly, invalid environment limits reject, completed over-limit requests retain HTTP 413; Node24 focused and full quality, framework/compiled STDIO+HTTP, independent security review Critical 0 / Important 0, exact GitHub feature CI and distinct squash-main push CI succeed. Overall M17 remains PLANNED.
