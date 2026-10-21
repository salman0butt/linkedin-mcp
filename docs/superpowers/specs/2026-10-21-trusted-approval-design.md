# Trusted Approval Design

The M04.7 security finding requires independent host approval before any consequential write receipt is issued.

The MCP caller cannot grant its own approval. A trusted embedding host provides short-lived, single-use approval grants bound to member identity, operation and payload hash. Without a host grant, approval fails closed.

## Scope and trust model

This remediation covers text posts, image and multi-image posts, comment replies, and reaction add/remove. An MCP client controls its tool arguments, including the existing `approved: true` intent field; none of those arguments proves human consent. The trusted host must authenticate the human, show the exact canonical preview, and record the decision outside the MCP surface. The host's grant issuer must never be exposed as a tool, HTTP route, or environment toggle.

## Architecture

Keep existing tool names; add an optional `trustedGrantId` capability to approval tool inputs without changing preview or publication schemas. A host-only issuer creates an unpredictable 256-bit one-time ID for a grant bound to the exact subject, operation purpose, and canonical SHA-256 payload hash. The trusted host must provide that ID to the intended approved request through a protected channel; merely knowing the subject, purpose and hash must never authorize consumption by another MCP client. A consumer-only interface is injected into the runtime. The guard derives the same purpose-scoped digest as the existing approval service, verifies and consumes the matching ID, and only then issues the existing short-lived subject-bound receipt. Missing IDs, expired, mismatched or consumed grants produce a sanitized `human_action_required` result. The default stdio and HTTP entrypoints have no host grant source and therefore cannot self-approve.

Grants are in-memory and expire within ten minutes (five minutes by default). They are not shared across processes. Receipts and idempotency semantics remain unchanged. A trusted embedding host can provide a human approval UI and inject the consumer; this repository does not claim to include such a UI or to have verified live LinkedIn entitlements.

## Acceptance criteria

- No production runtime receipt without a matching trusted grant, including when an approval store is injected.
- A grant cannot cross subject, purpose, or payload boundaries, and cannot be reused or consumed after expiry.
- A matching request without the exact unpredictable grant ID cannot steal a host authorization intended for another client.
- Text, media, replies and reactions share the same fail-closed issuance guard.
- Denials are sanitized and do not issue receipts or mutate LinkedIn.
- Existing preview, access, idempotency and provenance protections are preserved.
