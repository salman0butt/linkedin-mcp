# M01 — Authentication & Identity

Status: **ACTIVE — M01.8 closeout pending exact-final-head CI**

## Goal

Implement LinkedIn OAuth identity, scope/capability inspection, encrypted credential persistence, auth health and logout semantics without overstating provider access.

## Acceptance Criteria

- Authenticated identity flow is implemented with minimal configured OIDC scopes.
- OAuth state is mandatory/single-use; native PKCE uses S256 and loopback-only callbacks.
- Credentials are encrypted/authenticated at rest and secrets remain outside MCP/log/error output.
- Expiry, 401/reauth and conditional refresh behavior are explicit.
- Auth start/status/profile/logout are exposed through real stdio/HTTP runtime wiring.
- Capability state is truthful and never upgrades live LinkedIn availability from mocked CI alone.

## Design / Plan

Design: `docs/superpowers/specs/2026-10-06-m01-auth-identity-design.md`.
Plan: `docs/superpowers/plans/2026-10-06-m01-auth-identity.md`.
Branch: `feat/m01-auth-identity`.
PR: #2 — `Build M01 authentication and identity`.
Closeout: `docs/superpowers/evidence/2026-10-06-m01-auth-identity-closeout.md`.

## Tasks / Iterations

1. **COMPLETE** — M01.1 activation, design and implementation plan.
2. **COMPLETE** — M01.2 auth configuration + provider-neutral contracts.
3. **COMPLETE** — M01.3 OAuth session, CSRF state, PKCE and loopback callback listener.
4. **COMPLETE** — M01.4 encrypted credential store.
5. **COMPLETE** — M01.5 official code exchange + conditional refresh adapter.
6. **COMPLETE** — M01.6 official OIDC userinfo identity client.
7. **COMPLETE** — M01.7 auth lifecycle/callback + MCP tools + real transport wiring + dynamic capability projection.
8. **ACTIVE** — M01.8 skeptical/security review, live-access assessment, exact-final-head CI and closeout.

## Rulings

- Support explicit `confidential` and access-dependent `native_pkce` modes; do not silently fall back between them.
- Mocked/deterministic CI verifies implementation behavior only. It does not make `profile.me` live AVAILABLE/VERIFIED.
- OAuth `state` necessarily remains inside the opaque provider authorization URL. It is never returned as a separate MCP field, persisted, logged or echoed in errors. Stripping it would break the required CSRF protection.
- Local logout clears local state only and never claims remote provider revocation.

## TDD Evidence

| Unit                          | RED / review RED                                                 | GREEN                                                                        |
| ----------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| M01.2 config/contracts        | `a696c104`, CI `37482043713`                                     | `30ec5b4a`, CI `37482919464`                                                 |
| M01.3 session/callback        | `b0a08d7a`, CI `37584050659`                                     | reviewed `9035cebc`, CI `37585523117`                                        |
| M01.4 credential store        | `6a5c7a12`, CI `37586614199`                                     | reviewed `9fcb2c8c`, CI `37588029054`                                        |
| M01.5 OAuth adapter           | `2b6646cd`, CI `37592679866`                                     | `faedaf2f`, CI `37593107489`                                                 |
| M01.6 OIDC identity           | `d2b03afb`, CI `37593529777`                                     | `e9f138d4`, CI `37612551536`                                                 |
| M01.7 lifecycle               | lifecycle TDD + callback review RED `8a044af9`, CI `37615537027` | `aa6e09b1`, CI `37615170527`; callback reviewed `bc880dc9`, CI `37616331784` |
| M01.7 MCP integration         | `e0309110`, CI `37623309357`                                     | `5d2aea64`, CI `37656151910`                                                 |
| M01.8 structured auth results | `01ff034b`, CI `37657296785`                                     | `40f770e8`, CI `37657621857`                                                 |
| M01.8 built transport wiring  | `2bf25ed0`, CI `37657889533`                                     | `80f5d33e`, CI `37658194001`                                                 |
| M01.8 logout cleanup error    | `4a978e6f`, CI `37658686972`                                     | `917e07a9`, CI `37658914319`                                                 |

Formatting-only or fixture-only failed runs are not counted as RED evidence.

## Security / Skeptical Review

Final review: **self-review (no subagent tool available)**.

Review focus checked:

- wrong/missing/replayed/expired OAuth state fails without secret echo;
- callbacks bind loopback only, require exact path, close on terminal result/timeout;
- native PKCE uses S256 and confidential exchange does not send verifier material;
- credential storage uses AES-256-GCM, fresh IVs, canonical 32-byte key validation, restrictive/atomic file replacement, tamper/wrong-key failure and field allowlisting;
- OIDC userinfo maps documented claims and treats email fields as optional;
- downstream 401 clears usable credentials, transitions to reauth and does not retry identity in a loop;
- refresh occurs only with an actual eligible confidential refresh token;
- auth/provider failures are mapped into sanitized ToolResult states;
- built stdio/HTTP runtimes inject one AuthService and expose M01 tools;
- logout cleanup failure is structured and secret-safe;
- capability provenance remains OFFICIAL_API while live availability remains conservative.

Resolved during M01.8: three Important findings. Unresolved Critical: **0**. Unresolved Important: **0**.

## Live-Access Assessment

No live LinkedIn credentials or developer-product access are configured in ordinary CI. Therefore live `profile.me` availability, native-PKCE enablement and partner-gated programmatic refresh were not verified. This is an external verification gate, not an implementation failure. Static `profile.me` remains `ACTIVE/UNAVAILABLE` and must not become VERIFIED until a real configured account call succeeds.

## Fresh Verification

Latest pre-closeout-doc verification: `917e07a950f7732a4315daebd8d7d9e7af266a12`, CI `37658914319` — frozen install, format, 105/105 tests across 23 files, lint, typecheck and build GREEN; real built stdio/HTTP auth smokes GREEN.

## Completion Checklist

- [x] M00 dependency gate verified.
- [x] M01 design/plan committed.
- [x] M01.2–M01.7 implemented through genuine TDD/review cycles.
- [x] Acceptance criteria deterministically verified.
- [x] Skeptical/security review performed.
- [x] All Critical/Important findings resolved.
- [x] Live-access gate assessed without false capability claims.
- [ ] Exact-final-head CI on closeout documentation commit GREEN.
- [ ] PR #2 merged and post-merge `main` CI GREEN.

## Exact Next Work

Verify exact-final-head CI on the M01 closeout documentation commit, then merge PR #2 if all merge gates remain satisfied.
