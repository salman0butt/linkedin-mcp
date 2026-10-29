# Known Issues

## Current unresolved issues

**M17.2 early HTTP 413 on unfinished oversized uploads LOCAL GREEN, release PENDING:** Genuine held upload RED->GREEN plus independent Important pipelined MCP side-effect-without-receipt RED->GREEN via sequential per-socket dispatch and rejected-socket latch. Node24 HTTP **32/32**, full **1,288/1,288** across 124 suites, framework **14/14**, compiled STDIO/HTTP and format/lint/typecheck/build GREEN. Independent final security review and remote PR/CI pending. Intentionally bounded discarded-upload draining (up to 16 MiB or 250ms) cannot guarantee receipt of 413 for arbitrarily fast huge uploads: 32/64 MiB completed clients were independently observed to encounter EPIPE; this bounded reliability tradeoff remains documented for future separate handling. Batched `tools/list` intermediate buffering is a separate OPEN risk.

**M17.1 finite request-body limit validation VERIFIED/MERGED:** [PR #34](https://github.com/salman0butt/linkedin-mcp/pull/34) final `bd395174d86cabd10f315549322b45f4d63addd3` feature CI `40745315254` SUCCESS, guarded squash main `8139cff30d33a57f7eca9e40b11125459b05fb69` identical tree `5df33aed2c5c63e75bab61295aa5b0f6e735ce0b`, distinct push CI `40745757021` SUCCESS. Node24 1,280/1,280, focused 83/83, genuine original validation RED 10 failures and independent ignored-env-limit RED (HTTP 200 vs required 413), final independent Critical0 Important0. Direct/environment values strictly positive safe <=16 MiB; actual HTTP honors env limits and explicit valid overrides; default 1 MiB unchanged. Slow unfinished-body rejection and batched intermediate buffering remain independent OPEN risks.

**M17.0 OAuth callback lifecycle VERIFIED/MERGED:** [PR #31](https://github.com/salman0butt/linkedin-mcp/pull/31) feature `c8b42f6fe895d246d4ad81e44cd6adf161c6cc26` CI `40687205091` SUCCESS; main `7ad4f38f0280cfa99b7f2d1ef3cd5eeb99c2f031` separate push CI `40687526120` SUCCESS, same reviewed tree. Genuine Node24 TCP RED→GREEN, local 1,264/1,264 in 124 suites and independent scoped Critical0 Important0. Local OAuth callback previously waited for a half-open unrelated socket after consuming a valid code; fix closes remaining HTTP connections after response flush.

**Additional M17 HTTP transport risks outside M17.0/M17.1:** (1) nonfinite `requestBodyLimitBytes` bypass **FIXED/VERIFIED** by M17.1; (2) oversized partial/chunked requests delaying HTTP413 until client EOF **locally fixed by M17.2, release PENDING**; (3) JSON-RPC batches bypassing `tools/list` pagination and allocating excessive intermediate `arrayBuffer()` before the 256KiB response ceiling stays **OPEN** for later independent hardening. Preserve 67 tools, 96KiB list pages, 256KiB final output limit, host/origin checks and no provider mutation. Overall M17 is NOT complete.

**M13.0 VERIFIED/MERGED:** [PR #29](https://github.com/salman0butt/linkedin-mcp/pull/29) feature `07599e1d151c3737f2c4cf995c408a88eca54a7f` CI `40679056408` SUCCESS; guarded squash main `e93d3c300b8e77317d93076d96c4eff392ded1de` tree `2f4cb2862470f3cdc539736c25f65e494b0d1c90` separate push CI `40679432769` SUCCESS; Node24 1,260/1,260 in 124 suites and independent pure/MCP Critical0 Important0. M13.1 remains BLOCKED: LinkedIn Community Management entitlement and credential-bound verified organization administrator/content role resolver are unavailable; never treat a caller-asserted org URN, roles or scopes as proof. Organization write/engagement/analytics remain OFFICIAL_API UNAVAILABLE.

**M12.3 VERIFIED/MERGED** PR #28 feature CI `40673718696` main `ebee040d809c61bf57534d0c3cb81bd382107dc9` separate push CI `40674038860` SUCCESS, 1,237/1,237 Node24 tests, independent Critical0 Important0. **M13.0 VERIFIED/MERGED LOCAL_ONLY company page editorial handoff**, not authorized identity, organization role, publishing, engagement or analytics. Community Management product access, credential-bound org role resolver and `w_organization_social` are absent and remain hard provider blockers.

**M12.2 VERIFIED/MERGED** via PR #27 feature CI `40668979524`, squash main `8d3019a872a34b3990567f193d58d5f7bdb11d42` distinct push CI `40669592590` SUCCESS, Node24 1,231/1,231 and independent Critical0 Important0. M12.3 HTTP tool inventory pagination subsequently VERIFIED/MERGED via PR #28 to prevent 256KiB list overflow with escaped 128-byte IDs; do not weaken tool strictness or claim provider capabilities. Historical M12.1 status: **M12.1 VERIFIED/MERGED** via PR #26 feature CI `40664805538`, squash main `40c714df69039ab65e648ae78d58a30496698c1e` tree `2820ce11430aea3f0e91d7098cd716cc5295bad0` separate push CI `40665262565` SUCCESS, Node24 1,213/1,213 and independent Critical0 Important0. M12.2 strictly LOCAL_ONLY caller-supplied chronological observations VERIFIED/MERGED via PR #27; neither observation intervals nor signed differences verify LinkedIn provider windows, performance, engagement rates or actual scheduled/published posts.

### M10.0–M10.4, M11.0–M11.3 and M12.0–M12.3 LOCAL_ONLY verified/merged; actual provider analytics and scheduled publishing unavailable

M10.0–M10.4 caller-only research utilities are VERIFIED/MERGED through PRs #16–#20. M11.0 stateless `linkedin.calendar.preview` VERIFIED/MERGED via PR #21; M11.1 host-opted-in STDIO-private durable plans VERIFIED/MERGED via PR #22 corrected feature CI `40493902705`, squash main `4dbecdebb2b94ee26d646b3933f268e4796251fa` push CI `40494259585` SUCCESS (Node24 1,156/1,156, independent Critical0 Important0). M11.2 revision-gated read-only inspection VERIFIED/MERGED via PR #23 feature CI `40497799619`, squash main `39d843dda4a5ffc00b9c74aaf1c5f320af967e93` push CI `40498119965` SUCCESS (Node24 1,173/1,173, independent Critical0 Important0). M11.3 two-plan slot comparison VERIFIED/MERGED via PR #24 feature CI 40654948672 SUCCESS and squash main d7d46ab4b117109b2aad6e266fb78ecd453b10b2 push CI 40655163394 SUCCESS; M12.0 local unverified caller snapshot arithmetic VERIFIED/MERGED via PR #25; provider analytics.post UNAVAILABLE; multiple independent store.get reads are NOT atomic, cannot promise coherent future slots or scheduling. Private pathname hardening does not claim atomic openat protection from malicious same-UID processes. Preview, storage, inspection and comparison never queue, approve or publish. Future execution requires durable claims, fresh trusted approval at execution, rechecked live account/scopes and fail-closed unknown outcomes. Inherited reference URLs can contain token-like values under benign query keys (`?ref=`); callers must supply public noncredential URLs. Provider-backed topic research remains EXTERNAL_DISCOVERY/UNAVAILABLE; M09.P native publishing remains BLOCKED.

### M09 native long-form publication — external provider/authorization blocker

M09 **manual editor handoff is VERIFIED and MERGED** via [PR #14](https://github.com/salman0butt/linkedin-mcp/pull/14): final feature head `c6ef52f5` CI `40218390770` **SUCCESS**, squash-merged `main` `073bf180823292dccf5719a0d55be03983705168` exact push CI `40218532046` **SUCCESS**. Pure 11/11, typed MCP 4/4, built STDIO/HTTP 15/15 and whole local Node24 **1,023/1,023 tests across 90 suites** passed; complementary independent security audits report **Critical=0, Important=0**. These verify only human-owned `LOCAL_ONLY` draft transfer; actual native long-form article creation **remains BLOCKED/UNAVAILABLE** without an authorized provider. Subsequent M09 documentation PR #15 merged to main `2a71c5ef402a19cdf6a7f340e5e28134c9980793`, CI `40220317041` SUCCESS; M10.0 then merged via PR #16 at `865fd9fb4cd5ccd8438ef7a89f9bc08f3fb600df`, exact main CI `40293411451` SUCCESS. M10.1 theme grouping was subsequently VERIFIED/MERGED via PR #17 (historical checkpoint).

### Resolved locally — two independently re-reviewed M09 security findings

1. **HTTP caller JSON-RPC ID exceeds reply size bound — RESOLVED.** Original auditor RED **267,238 response bytes vs 262,144 permitted** when an oversized caller-controlled ID was reflected in the HTTP response. HTTP fix rejects IDs over **128 UTF-8 bytes** with **400/-32600 before handler dispatch**; oversized full SSE results yield bounded **502/-32000 `outcome unknown`** rather than deceptive success or automatic replay. Independent worker-4 actual-server HTTP audit and integration **23/23 GREEN**, scoped **Critical=0 Important=0** (reviewer excluded his own URL patch).
2. **Article source URL leaks credential query aliases into manual handoff — RESOLVED.** Auditor demonstrated `code`, `accessCode`, `ticket` and case/percent-encoded spellings accepted by `normalizeArticleDraft`, subsequently preserved by M09 handoff. Scoped URL owner reproduced RED and implemented fail-closed key checks (**69/69 strict and 99/99 broad local tests GREEN**). Independent worker-5 non-HTTP review **101/101 focused GREEN**, **26 unsafe URLs rejected** and **11 benign queries accepted**, MCP secrecy and provenance passed; scoped **Critical=0 Important=0** (reviewer excluded his own HTTP patch). Key-based filtering does not prove that all conceivable unlabelled secrets are detectable; source provenance stays unverified.

Actual native LinkedIn article publishing is **BLOCKED/UNAVAILABLE**. Microsoft Learn Posts API `content.article` represents an external-link article preview, not native long-form editor publishing; the LinkedIn Help **Write article** editor does not establish an ordinary authorized automation API. No confirmed legitimate native creation provider, scoped app/account entitlement or approved browser automation is configured. Third-party browser automation, anti-bot evasion and CAPTCHA/security-challenge bypass must not be substituted for authorization. Local manual handoff is `LOCAL_ONLY`, human copy, unverified sources and `not_published`; no native publisher, remote verification or claimed publication URL is allowed by this checkpoint.

### Resolved and merged — M08.6 independent article authoring audit

M08 is **COMPLETE**, merged via PR #12 at `4b56a8411eed258ad2e2832b1796031288498a0e`. Independent M08.6 whole-branch review **SIGNED OFF with unresolved Critical=0 and Important=0**. All **three Important findings** were reproduced RED and repaired GREEN: (1) credential-bearing source URL query aliases/fragments, (2) sensitive article-store configuration-path parent/child overlap, and (3) revision-2 persisted article data accepting invalid UTF-8. Final feature-head `b2c1ad9abec69ec05f1a18024f7abebffb9d007a` CI `40120392598` and post-merge main `4b56a8411eed258ad2e2832b1796031288498a0e` CI `40120555718` both succeeded.

The initial whole-repository run passed 969 and failed four stale capability expectations (973 total); the failures were repaired with observed RED→GREEN focused **12/12**. **Fresh full Node24 `pnpm test` 988/988 PASS across 88 suites**, including real built STDIO/HTTP; format, lint, typecheck, build and diff check GREEN locally, and exact post-merge main CI confirmed frozen install, 988/988, format/lint/typecheck/build. The local private article store retains the documented **non-atomic pathname/same-UID hardening limitation** of M06; do not imply protection against an adversarial same-UID process, and do not expose private projects through unauthenticated HTTP. Source attribution is author-controlled and unverified; no native LinkedIn article publish/research is claimed.

**Verified M08 documentation closeout:** PR #13 merged to main `9f10bc4488918ada401e7a25736f7945c8d80c23`, post-merge CI `40121709957` SUCCESS. M08 PR #12 history remains valid. M09 local manual handoff is VERIFIED/MERGED through PR #14, final feature CI `40218390770` SUCCESS and exact merged-main CI `40218532046` SUCCESS at `073bf180823292dccf5719a0d55be03983705168`; documentation closeout PR #15 subsequently merged to verified main `2a71c5ef402a19cdf6a7f340e5e28134c9980793`, CI `40220317041` SUCCESS. Actual M09.P native publishing remains BLOCKED/UNAVAILABLE. M10.0 implementation, review and feature PR verification are now the active work.

### Resolved — M07 Job Intelligence review and source-grounded claims

M07.7 independent whole-branch review verified **0 unresolved Critical/Important findings** after all reproduced issues were fixed with genuine RED→GREEN regressions: unsupported mandatory title/description clauses must not produce false 100% scores; required work authorization/residence in `location` suppresses numeric fit; employer-versus-competitor quotation state spans sentence boundaries; long, non-whitelisted, conditional, applicant-specific and exclusionary remote/visa claims fail closed rather than advertise unrestricted eligibility; unrelated customer/training conditions do not become applicant restrictions. Original UTF-16 source quotes, sanitized bounded MCP response contracts, strict caller-supplied provenance and private saved-job HTTP isolation are covered. PR #10 feature CI `40089032116` on `7f874292d10e3a649fc2e7b218a9261982b0b2ff` and post-merge main CI `40089200098` on `80b563293e48afd878158bcd2ee40553997ecb42` succeeded with **902/902 tests across 83 files** and all quality gates. No authorized live LinkedIn jobs provider/Talent entitlement or application submission capability is configured.

### Resolved — M06.6 saved snapshot provenance (merged and verified)

Independent review reproduced caller-supplied PARTNER_API metadata, source evidence URL and confidence being passed as trusted context into a saved snapshot with no source authentication. Focused RED tests confirmed the defect. The local store now rejects these elevated claims and canonicalizes saved source names to `Unverified user-supplied snapshot`, while keeping opaque source-scoped IDs, reported/unknown posting dates and safe URLs. Source IDs and retrieval timestamps in locally saved snapshots remain caller-supplied and must not be treated as verified provider facts. Independent review PASS, exact final PR head `dc7b07d` CI `40077649195` and merged `main` `0ff384a` CI `40077809706` GREEN with 713 tests across 77 files. The separate low-impact same-UID pathname hardening limitation remains documented below.

### M06.5 private saved-state pathname race hardening limitation

The opt-in local saved-job store is available only to the host's **single trusted OS user over STDIO**; its final private directory must be `0700`, file `0600`, correct user ownership, one hardlink and no symlink. HTTP access is always unavailable. Independent audit reproduced a deterministic parent-directory symlink swap immediately after validation that formerly redirected a read to a different same-user private store. The regression was repaired RED→GREEN by pinning every ancestor's device/inode and checking ownership, permissions and identity around locks, reads, writes, rename and persisted readback. The audited swap now fails closed. Node's pathname-based filesystem calls are **not an atomic openat guarantee**: a process that already has this same OS UID or root privileges could repeatedly swap directories between checks. That process already has equivalent local read/write access to this OS user's private files. Scoped independent reviewer classified this as a non-blocking hardening limitation under the documented single-trusted-OS-user threat model; never advertise immunity to concurrent same-UID filesystem modification. If ownership requirements change to multi-user/hostile same-UID, require dirfd/openat or an equivalent OS-level authenticated workspace primitive before enabling saved-state access.

### M06.1 URL and verified posting-date source integrity — regression-fixed locally

Independent source review found three Important issues in the new canonical job contract. Common credential parameter aliases (`apiKey`, `auth_token`) were accepted in returned URLs; verified posting dates could omit canonical-link binding for jobs with a canonical URL; and known dynamic IP wildcard domains could encode private destinations. Targeted regression tests failed before code changes and pass after correction. M06.1 exact-head CI `39923182814` passed. The core validator performs no network/DNS lookups; every future HTTP-capable adapter must separately validate resolved public A/AAAA addresses at each hop, including redirects and DNS rebinding.

### M06 job discovery and Talent access boundary

M05 was repository-verified at final PR head `6a40bed`/CI `39920032492` and post-merge main `01fb37d`/CI `39920255603`. M06 begins without a legitimate configured jobs search source or verified LinkedIn Talent partner entitlement. Never present job-search functionality as live/official on the basis of deterministic tests, standard LinkedIn OAuth, or generated postings. Missing providers must return unavailable with explicit provenance and freshness uncertainty; no automated applications are in scope.

### Resolved locally — M05.6 eligibility dedupe and canonical post permalink provenance

Independent M05.6 whole-branch audit found two Important defects: ineligible same-source duplicates could suppress later eligible records; LinkedIn-owned login/help/redirect links could masquerade as canonical post permalinks or conflict with a post URN. Both were reproduced RED and repaired GREEN, with post-fix **647/647 local tests across 71 files**, real stdio/HTTP, lint, typecheck, format and build passing. The reviewer found no additional confirmed Critical/Important issues. Exact-final-head CI and post-merge main gates still require verification. Strict permalink validation excludes tracking query parameters; trusted providers should supply the clean permalink.

### M05.4 restricted official author finder — CI GREEN / live access unavailable

The optional single-author Posts API adapter has 23 focused GREEN tests and exact-head CI `39915436774` on `e517d57` passing 631 tests across 70 files, including independently reviewed fail-closed default access and pagination-integrity regressions. No credential-bound member ID or APPROVED organization-role access resolver or live restricted Community Management entitlement is configured. The finder is disabled by default and must not be advertised as available without that verified host integration. M05.5 MCP exact-head CI `39918895858` is GREEN (645 tests in 71 files); M05.6 whole-branch review is pending.

### Resolved — M05.3 official provider mode provenance

The M05.3 router at `6c7e1cc` permitted a trusted `OFFICIAL_API` adapter to declare `topic`, `hashtag` or `recent` global search despite the documented author-scoped-only official API. A concrete read-only probe returned `available` with `OFFICIAL_API` source for a topic query. Regression verified RED (11 passed, 1 failed); commit `35ff359dffecc179aa82f0e41d7c563b559825d7` rejects unsupported modes. Exact-head CI `39758769454` succeeded (608/608 tests, 69 files and quality gates). No live entitlement is claimed.

### M05 external discovery integration boundary

No legitimate external/partner global post discovery provider has been configured or live-verified. An explicit `unavailable` result is required until a provider with lawful access, provenance and terms exists. LinkedIn's official Posts API finder is author-scoped and permission-dependent, not general keyword search. Do not claim live search availability from deterministic tests.

### Minor — private package boundary is repository-relative

`@linkedin-mcp/server` remains private and imports built private core through a repository-relative path while its build script builds core first. Current monorepo tests/build/transports verify this arrangement. Replace it with an explicit workspace dependency when package-consumer boundaries expand.

### External verification gate — live LinkedIn capability availability

Deterministic implementation does not prove provider entitlement. M01–M03 repository behavior is verified, but live profile/post/media availability still depends on legitimate app/account access.

M04 adds another explicit access boundary: current Community Management APIs are vetted. Member comment/reaction writes require `w_member_social_feed`; member comment/reaction reads require restricted `r_member_social_feed`. Development tier also restricts API volume and disallows BATCH_GET. CI has no legitimate provider credentials/product entitlement, so M04 live read/write capability must remain unverified until real evidence exists.

### Interactive connector/container limitations

GitHub Actions remains authoritative exact-SHA execution evidence when an interactive local environment cannot reproduce the repository's Node/pnpm/network setup. This does not relax exact-head, review, concurrency or security gates. On 2026-10-16 the local Chat On Steroids tunnel became unavailable after dispatching independent M04.3 reviewers; no independent review result is claimed from that unavailable channel.

## Resolved during M04

### Resolved M04.7 — trusted human approval security boundary

The original Important MCP caller self-approval defect is regression-fixed in commit `5c2efcebd1cf3f7bac1a76d3a619cb771da4bfc7`: shared receipt issuance requires a trusted host-issued, unpredictable 256-bit, single-use `trustedGrantId` bound to authenticated subject, purpose and canonical payload hash. The model cannot mint a grant; the ID is never forwarded to injected receipt stores, and the six text/media/reply/reaction approvals return `human_action_required` without a matching grant. GitHub CI `39589866610` passed 579/579 tests across 64 files. A fresh 2026-10-22 independent reviewer traced all six paths, the grant issuer/consumer, purpose isolation, and idempotency; 33 focused tests passed and **zero new Critical/Important defects were verified**. No hosted human approval UI or live LinkedIn entitlement is claimed; defaults remain fail-closed.

### Resolved M04.7 — nested reply-root integrity on create/identity

RED commit `2d90e3fba449e1baed28dc47d120f0bcd6d983e7` / CI `39655379215`: 580 tests passed, two new core regression tests failed as intended for unrelated same-family reply roots. A third provider-adapter regression was independently confirmed RED locally. Commit `75205ae47a29d98e60a9087a9f5703d40dd8d36e` rejects mismatched same-family parent/root pairs during canonical preview and provider request validation, preserving legitimate cross-family aliases. Exact-head CI `39739059007` passed **583/583 tests across 66 files** and format, lint, typecheck, build and smoke tests. An independent read-integrity reviewer found no remaining verified Critical/Important issues in this fix.

### Resolved M04.7 — Comments response-to-request thread and page integrity

Six local behavioral tests on the previous PR head `dd8f1b802d4cc3104b4969049838252fcdb31adf` failed because same-family mismatched activity roots and provider pagination window/count violations were accepted. The adapter now rejects them with sanitized `malformed_response` while preserving cross-family URN representations. Existing test fixture for a nested thread was corrected to use its actual parent. Exact-head CI `39575410269` at `e33ba384df4ae0a5492f20d85e98458e91142011` passed 555/555 tests in 62 files and all required quality gates. Full independent M04.7 review remains pending.

Independent M04.7 review additionally found an Important nested-parent integrity gap: a reply's `parentComment` composite root could belong to a different same-family activity than its own comment/object root. Two behavioral tests were verified RED before the fix; after adding the fail-closed parent-root checks and two compatibility tests for same-root/different-comment IDs and cross-family aliases, exact-head `107ededf02ab147cd5bd3189d537cae552728fe4` / CI `39577246941` passed **559/559 tests across 62 files** and all quality gates. This nested-parent finding and the separately reviewed approval-boundary finding are resolved.

### Resolved M04.7 — Comments read response identity consistency

GET response IDs are now checked against the requested comment ID; GET/list composite comment URN numeric IDs are validated against the returned comment ID. Three automated regressions were proven RED at `d906d730617e8931945478d187bc784c200a622a` / CI `39392445179`, then all 542 tests and quality gates passed at `92a8ca816ca4c300c624360acde0afd6599512bf` / CI `39392843550`. Invalid successful provider responses fail with sanitized `malformed_response`. No live Community Management entitlement was tested.

### M04.4 approval-purpose isolation

A fresh security review after the initial reaction GREEN checkpoint found one Important shared approval-boundary defect: approval receipts were bound to subject and payload hash but not to the mutation purpose. A caller able to deliberately reuse the same canonical hash across named approval methods could therefore cross an approval boundary.

The defect was reproduced before production changes. The shared approval service now derives a purpose-scoped internal SHA-256 hash while preserving the public receipt payload hash. Runtime/service wiring uses stable scopes for text posts, media posts, comment replies, reaction add and reaction remove. Focused regressions prove add approval cannot authorize remove and reply approval cannot authorize reaction add, with zero provider mutations on rejection. The repair is included in exact-head GREEN `788a252f6ec9e285df0420869af6e39ca728975b`, CI `39037380577`, which passed **524/524 tests across 57 files** plus frozen install, format, lint, typecheck and build.

### M04.3 nested reply review findings

Four Important findings are resolved with genuine RED→GREEN evidence and exact-head CI:

1. **Reply target/parent approval mismatch** — RED `d716140fa42d5e4c294146936e4d9616be161a8b`; fixed by rejecting mismatched nested targets before approval at `386dbf96235fadf88ea16a9411cd3a24dfc3a38b`.
2. **Malformed provider success left a nonterminal reservation** — RED `3adcee4d80fcfdad44f8374b0f97af28c590f215`, CI `38901369613`; fixed at `9699773fb323ab027ebdc2837c5e5a8a591e0c9b`, CI `38901575437`, by terminally recording `outcome_unknown` without retrying the remote mutation.
3. **Successful composite reply identity could disagree with ID/root, including legacy replay** — RED `5dce3ac361f87abadd61c91283e8ebcc41b702d4`, CI `38902334994`; fixed at `4c9a5bd418b33d588d0b61b09ce3003532e8dcf9` with shared identity validation in adapter, service and replay paths.
4. **Documented create response could omit `likesSummary`** — the same RED `5dce3ac361f87abadd61c91283e8ebcc41b702d4` proved the create-only compatibility gap while strict read parsing stayed green; fixed at `4c9a5bd418b33d588d0b61b09ce3003532e8dcf9` without fabricating a zero count.

Exact-head CI `38902517595` on `4c9a5bd418b33d588d0b61b09ce3003532e8dcf9` passed **483/483 tests across 53 files** plus frozen install, format, lint, typecheck and build. Scoped correctness/security review found 0 unresolved Critical findings and 0 unresolved Important findings.

### M04 completion-lock handoff regression

The regression first observed at `733e37cb549b75701953c21f5a51d5fa4bd0569b` / CI `38162905039` was repaired by completion-only bounded `EEXIST` lock retries and additional fail-closed tests. Verified at `cbcc2c72124299a548f0caf5d7ba41a445c8288d` / CI `38312220154`: **474/474 tests across 52 files**, frozen install, format, lint, typecheck and build green. Reservations/media checkpoints still fail closed immediately; no remote LinkedIn mutation retry was added.

## Resolved during M03

M03 merged through PR #4 at `6713bfe79c261021ac39b75599509cd843e95f6d`; the later cross-runtime final-media ownership defect was repaired on main through hotfix PR #7 at `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`. Post-hotfix CI `38153987423` passed 427/427 tests across 46 files plus format/lint/typecheck/build. Whole-milestone review resolved all Critical/Important findings.

## Review state

M03 whole-milestone review completed with **0 unresolved Critical findings and 0 unresolved Important findings** before merge, with the later ownership defect separately regression-fixed and verified on main.

M04.1 scoped contract/config review completed with **0 unresolved Critical findings and 0 unresolved Important findings**.

M04.2 scoped Comments read-adapter review completed after exact-head GREEN `26ecce969e4d4935ddcd7babd93c6b46085a03b1` / CI `38160896542` with **0 unresolved Critical findings and 0 unresolved Important findings**.

M04.3 scoped nested-reply correctness/security review completed after exact-head GREEN `4c9a5bd418b33d588d0b61b09ce3003532e8dcf9` / CI `38902517595` with **0 unresolved Critical findings and 0 unresolved Important findings**. A separately dispatched independent review could not be retrieved after the local tunnel disconnected and is not represented as completed.

M04.4 scoped reaction review had one later fresh security Important finding for approval-purpose isolation; that finding is resolved and verified in `788a252f6ec9e285df0420869af6e39ca728975b` / CI `39037380577`. M04.4 now has **0 unresolved Critical findings and 0 unresolved Important findings**.

M04.5 scoped inbox correctness/security review after exact-head GREEN `788a252f6ec9e285df0420869af6e39ca728975b` / CI `39037380577` found **0 Critical findings and 0 Important findings**.

M04.6 strict MCP/stdio/HTTP integration GREEN at `79bd4bf19d06e3cc41ccc9c6fd15c00b6d173148` / CI `39058125153`: 539/539 tests across 59 files plus frozen install, format, lint, typecheck and build. Twelve engagement tools are registered; real stdio and HTTP smoke tests pass. M04.7 whole-branch correctness/security/provenance review remains required before merge.
