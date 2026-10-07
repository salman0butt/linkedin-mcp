# M01 Authentication & Identity — Closeout Evidence

Date reconciled: 2026-10-07
Milestone: M01 — Authentication & Identity
PR: #2 (`feat/m01-auth-identity`)
Review mode: self-review (no subagent reviewer tool available)

## Deterministic Implementation Evidence

M01 provides two explicit official OAuth modes (`confidential`, access-dependent `native_pkce`), mandatory single-use OAuth state, S256 PKCE for native mode, loopback callback handling, AES-256-GCM credential storage, official OAuth token exchange, conditional refresh-token behavior, official OIDC `userinfo` identity, auth lifecycle state, secret-safe MCP auth/profile tools, dynamic capability projection and local-only logout semantics.

Latest pre-closeout-doc verified SHA: `917e07a950f7732a4315daebd8d7d9e7af266a12`.
CI: `37658914319` — frozen install, format, 105/105 tests across 23 files, lint, typecheck and build GREEN. Built stdio and HTTP MCP auth-status smokes are GREEN.

## Key RED→GREEN Evidence

- M01.2: RED `a696c104` / CI `37482043713`; GREEN `30ec5b4a` / CI `37482919464`.
- M01.3: RED `b0a08d7a` / CI `37584050659`; reviewed GREEN `9035cebc` / CI `37585523117`.
- M01.4: RED `6a5c7a12` / CI `37586614199`; reviewed GREEN `9fcb2c8c` / CI `37588029054`.
- M01.5: RED `2b6646cd` / CI `37592679866`; GREEN `faedaf2f` / CI `37593107489`.
- M01.6: RED `d2b03afb` / CI `37593529777`; GREEN `e9f138d4` / CI `37612551536`.
- M01.7 lifecycle: GREEN `aa6e09b1` / CI `37615170527`; callback review RED `8a044af9` / CI `37615537027`; reviewed GREEN `bc880dc9` / CI `37616331784`.
- M01.7 MCP surface: RED `e0309110` / CI `37623309357`; GREEN `5d2aea64` / CI `37656151910`.

## M01.8 Review Findings

Three Important findings were found and fixed with genuine regression cycles:

1. Structured auth results — RED `01ff034b` / CI `37657296785`; GREEN `40f770e8` / CI `37657621857`.
2. Built runtime AuthService wiring — RED `2bf25ed0` / CI `37657889533`; GREEN `80f5d33e` / CI `37658194001`.
3. Logout cleanup failure mapping — RED `4a978e6f` / CI `37658686972`; GREEN `917e07a9` / CI `37658914319`.

Unresolved Critical: 0.
Unresolved Important: 0.

## Review Focus Results

- OAuth state: unpredictable, mandatory, single-use, wrong/missing/replayed/expired cases tested and sanitized.
- Callback surface: loopback-only binding, exact configured path, terminal success/error/timeout close behavior tested.
- PKCE: native mode uses S256; confidential mode omits verifier/challenge material.
- Credential storage: AES-256-GCM, fresh IV, canonical 32-byte external key, authenticated tamper/wrong-key failure, restrictive atomic replacement and field allowlisting.
- Token lifecycle: valid/expired state explicit; refresh attempted only with an actual eligible confidential refresh token.
- 401 lifecycle: usable credential cleared, state transitions to `reauth_required`, identity is not retried in a loop.
- Identity: official `https://api.linkedin.com/v2/userinfo`, documented claims only, optional email fields, secret-safe errors.
- MCP boundary: auth states/errors use explicit ToolResult status; provider/error details are sanitized.
- Real transports: built stdio and loopback HTTP inject AuthService and expose `linkedin.auth.status` even when auth is unconfigured.
- Logout: local state/credentials cleared; remote revocation explicitly not claimed; cleanup failures return structured secret-safe failures.
- Capability provenance: `profile.me` remains OFFICIAL_API but deterministic CI never upgrades live availability to VERIFIED.

## Ruling — OAuth State in Authorization URL

OAuth `state` is required inside the provider authorization URL for CSRF protection. The URL returned by `linkedin.auth.start` is treated as an opaque user/browser handoff artifact. State is not returned as a separate MCP field, persisted, logged or echoed in errors. Stripping state from the URL would make the OAuth flow incorrect and unsafe.

## Live-Access Assessment

Ordinary CI has no real LinkedIn developer application/member credentials/product access. Consequently:

- live `profile.me` availability is unverified;
- native-PKCE enablement is unverified and remains access-dependent;
- programmatic refresh remains partner/access-dependent;
- no remote revocation capability is claimed.

Static `profile.me` remains `ACTIVE/UNAVAILABLE`. The implementation requirement can be VERIFIED independently of live provider availability because the spec explicitly separates deterministic implementation verification from configured-account availability.

## Final Gate

This evidence file is part of the closeout documentation commit. That new commit still requires exact-final-head CI before PR #2 may be merged. Post-merge `main` CI must then pass before M02 activation.
