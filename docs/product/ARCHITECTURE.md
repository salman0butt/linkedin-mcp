# Architecture

## Stable boundary

```text
MCP client
  -> tool/resource/prompt contract
  -> domain service
  -> capability router
  -> provider interface
  -> official API | partner API | external discovery | optional browser provider
```

Public MCP contracts are stable; LinkedIn access mechanisms are replaceable adapters.

## M00 runtime

M00 provides only `linkedin.health`, `linkedin.version`, and `linkedin.capabilities`, plus stdio and Streamable HTTP transports. No LinkedIn credentials or remote account access are required.

## Package direction

Create packages only when concrete boundaries require them. M00 starts with a core domain package and server application; future provider packages are introduced by their milestones rather than pre-scaffolded empty architecture.

## Security

HTTP binds to loopback by default and requires Host/Origin validation. Request bodies are bounded. Logs redact secret-like fields. stdout is reserved for stdio protocol traffic. OAuth/token persistence starts in M01.
