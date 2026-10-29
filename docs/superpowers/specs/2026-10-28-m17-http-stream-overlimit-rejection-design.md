# M17.2 — Early 413 for unfinished oversized HTTP uploads

## Observed failure

Verified main `801df4aeced49d05a558acd225eca903be36e3fb` inherits an actual Node24 HTTP reliability defect: `readBody` marks an over-limit chunk but keeps draining a request until EOF, and `createHttpServer` emits 413 only after the client terminates the upload. An independent real raw TCP probe against `createHttpServer({requestBodyLimitBytes:256})` sent a chunked POST with 257 bytes while keeping the connection alive, observed no response after 371ms, and received HTTP413 only after sending the final zero chunk. It advertised keep-alive even for a rejected oversize stream.

## Scoped fix

- Detect and reject immediately when **actual bytes received** exceed the configured finite limit, even when `Transfer-Encoding: chunked` or `Content-Length` remains unfinished.
- Use Node24 `request.iterator({destroyOnReturn:false})` so early loop exit does not automatically destroy the incoming socket before an HTTP response can flush.
- For a payload-too-large error, return HTTP413 with `Connection: close` and a completed bounded response; close keep-alive after response flush, without attempting to reuse unread upload bytes or pre-destroy the request socket.
- Serialize MCP dispatch per HTTP/1.1 socket: Node can parse the next pipelined request before the first body reader detects an over-limit payload. Once a request exceeds the cap, mark its socket rejected before responding, and suppress any already-parsed subsequent request on that socket. Healthy pipelined requests keep their ordered responses.
- Preserve normal request completion, exact-limit acceptance, Content-Length-less requests, host/origin checks, JSON-RPC ID caps, the 256KiB outgoing response ceiling, 96KiB list pages and 67-tool inventory, STDIO-private stores, and all provider provenance boundaries.
- Do not modify M17.1 numeric configured limits or the distinct JSON-RPC batched tool-list intermediate response buffering issue.

## Tests and release gates

Genuine RED on unmodified code with raw keepalive net sockets that send 257 actual bytes against limit256, leave upload unfinished and require a fully delivered HTTP413 and socket closure before client EOF. Cover both chunked and Content-Length uploads; split-boundary streaming, legal exact-limit completion and existing 413 behavior must remain correct. Independent adversarial RED subsequently confirmed an oversized first request and valid second pipelined MCP tool can execute the second with no receipt; require zero subsequent provider calls after 413 and continued correct order for two valid pipelined requests. GREEN after scoped production fixes, Node24 full tests/framework/compiled STDIO+HTTP, independent security adversarial review Critical0 Important0, exact GitHub feature-head CI SUCCESS, guarded squash merge, distinct merged-main push CI SUCCESS, truthful durable handoff. M17 overall PLANNED; M13.1 provider permissions BLOCKED.
