# M17.0 — Local OAuth callback listener lifecycle hardening

## Problem and reproduced failure

On verified main `cef8e9791c6fad6fdb56c2242340e7e437f3f88f`, an unrelated loopback TCP client can hold an incomplete HTTP request open. When a legitimate callback subsequently consumes a valid OAuth code (or a terminal callback error), the listener clears its timeout and waits for `server.close()` to finish before settling `listener.result`. Node's graceful close waits for the half-open connection, so token exchange never begins despite the successful HTTP callback response. The issue is an availability/cleanup defect, not evidence of token disclosure.

## Scope and constraints

- Keep the existing callback bind restriction (HTTP loopback only), callback path and GET validation, state/PKCE checks, one-time coordinator consumption, provider-error sanitization and 200/400 response bodies.
- Finish the callback HTTP response before forcibly closing established HTTP connections. A separate incomplete request must not indefinitely block terminal callback result settlement or listener cleanup.
- Ensure explicit `close()` and callback timeout also close a held connection; do not leave timers or unhandled promise rejections.
- Preserve the `OAuthCallbackListener` public API and do not add unsupported LinkedIn provider abilities.
- Cover actual TCP sockets, not mock `server.close`, and demonstrate an authentic failing test on unmodified code before the fix.

## Acceptance evidence

Real Node.js 24 loopback socket regression: a valid callback completes with the held incomplete request still open; terminal wrong-state/provider-error responses settle; explicit close and timeout do not strand pending network sockets. Existing auth and compiled MCP STDIO/HTTP tests, full quality gates and independent read-only review must remain green. M17 overall stays incomplete pending its broader roadmap and provider prerequisites.
