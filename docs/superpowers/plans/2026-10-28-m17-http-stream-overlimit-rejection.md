# M17.2 early oversized HTTP upload response implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement task by task.

**Goal:** Reject over-limit HTTP request streams before EOF while delivering a complete 413 response and closing the socket safely.

**Architecture:** Retain `readBody` and `createHttpServer` transport structure; use non-destroying Node24 Readable iterator with immediate threshold throw. In request error handling set HTTP `Connection: close` and `shouldKeepAlive=false` before bounded drain and `end()` only on 413. Serialize per-socket request dispatch to prevent an already-parsed pipelined MCP request from silently executing after an earlier rejected oversized upload; leave healthy pipelined requests in order.

**Stack:** Node24, TypeScript, Vitest, MCP SDK, raw HTTP/1.1 TCP sockets.

**Spec:** `docs/superpowers/specs/2026-10-28-m17-http-stream-overlimit-rejection-design.md`

## Acceptance

- [ ] Genuine RED: held chunked 257-byte HTTP upload at limit256 returns no response on baseline before terminal zero chunk; test requires prompt 413 and full socket close without any EOF.
- [ ] Genuine RED: held Content-Length=1000 upload with only 257 bytes sent at limit256 similarly lacks prompt 413 on baseline.
- [ ] GREEN: both streams receive 413 with `Connection: close` and a completed response before client sends EOF, with socket teardown and no keepalive reuse.
- [ ] Independent security RED: oversized first POST and valid pipelined second `tools/call` run together, producing provider side effect without a second response; GREEN forbids later provider execution while retaining two normal pipelined HTTP200 tool responses.
- [ ] Also cover split chunks at exact limit, legal completed requests, and existing completed 413.
- [ ] Use `request.iterator({destroyOnReturn:false})`, reject once the received byte count exceeds the validated configured limit, and avoid destroying sockets before response flush.
- [ ] Keep 1MiB default and 16MiB valid limit; 67 tools, 96KiB list pages, 256KiB response ceiling and STDIO-only stores unchanged.
- [ ] Node24 full format, lint, typecheck, build, 1,280+ tests, framework, compiled STDIO/HTTP, and independent Critical 0/Important 0.
- [ ] Durable milestone/traceability/project-state status accurate, connector-first GitHub PR exact final head CI success, guarded squash and distinct merged-main push CI success.
