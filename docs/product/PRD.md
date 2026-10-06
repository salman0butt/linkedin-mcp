# LinkedIn MCP — Product Requirements

## Vision

Provide MCP-compatible AI clients a secure, auditable and extensible way to research, plan, create, publish and manage professional LinkedIn workflows without misrepresenting what LinkedIn actually exposes through public or partner APIs.

## Principles

1. Official API first.
2. Stable MCP contract, replaceable provider adapters.
3. Explicit capability provenance.
4. Draft/preview/approval before consequential writes by default.
5. Idempotent and verifiable mutations.
6. No fake success or fake availability.
7. Model-independent MCP tools/resources/prompts.
8. Security, privacy and account safety over feature completion.
9. Git/CI-backed autonomous engineering continuity.

## Primary capability families

### Identity and authentication

OAuth-based identity, scopes, health, logout/revocation and account capability detection.

### Post publishing

Text, image, multi-image and later supported video/document/poll/link content. Draft-first preview, approval, publish and verification.

### Engagement

Comments, replies, reactions, unanswered-comment inbox and contextual reply workflows, subject to actual permissions.

### Post/content discovery

Search by topic/author/company/hashtag/date/engagement through explicitly identified providers; broad search must not be represented as ordinary official API when it is not.

### Job discovery and intelligence

Structured job search, freshness/provenance, saved jobs/searches, requirement extraction, fit analysis, relocation/visa signals and comparison. Partner-only Talent capabilities remain access-dependent.

### Long-form articles

Research, source collection, brief, outline, structured draft, technical review, media/SEO preparation, preview and companion post. Native article publishing uses an official provider only if one exists for the configured application; otherwise optional interactive UI provider with human verification boundaries.

### Research and content intelligence

Topic research, content-gap analysis, competitor/theme clustering, references and repurposing.

### Scheduling and analytics

Content calendar, scheduling/retry, post/article analytics and later experiment tracking where data access supports it.

### Organization/company support

Organization identity, publishing, engagement and analytics subject to approved organization/community-management access.

### Future networking/messaging

People/network/invitation/messaging capabilities are later milestones and remain high-risk/access-dependent. No bulk spam workflows.

## Provider model

- `OFFICIAL_API`
- `PARTNER_API`
- `EXTERNAL_DISCOVERY`
- `BROWSER_INTERACTIVE`
- `LOCAL_ONLY`
- capability state may be `UNAVAILABLE`

Every result identifies the provider and never launders provenance.

## Standard write expectations

Consequential writes should support preview/approval, idempotency key, payload identity/hash where practical, downstream verification, structured error taxonomy, audit event and explicit status such as `succeeded`, `requires_approval`, `human_action_required`, `permission_required`, `partner_access_required`, `restricted`, `rate_limited`, `duplicate`, `partial` or `failed`.

## Security boundaries

No CAPTCHA/security-challenge bypass, fingerprint evasion, rate-limit circumvention, stealth automation, secret leakage or arbitrary bulk outreach. Browser automation is optional/isolated/serialized per account when introduced.

## Milestone program

| Milestone | Goal                                  |
| --------- | ------------------------------------- |
| M00       | Foundation + autonomous control plane |
| M01       | Authentication & identity             |
| M02       | Text publishing                       |
| M03       | Media publishing                      |
| M04       | Comments & engagement                 |
| M05       | Post search                           |
| M06       | Job search                            |
| M07       | Job intelligence                      |
| M08       | Article authoring engine              |
| M09       | Native article publishing             |
| M10       | Research & content intelligence       |
| M11       | Scheduling & automation               |
| M12       | Analytics                             |
| M13       | Company pages                         |
| M14       | Networking                            |
| M15       | Messaging                             |
| M16       | Hosted multi-account                  |
| M17       | Production hardening                  |

Required functionality may be VERIFIED, ACTIVE, PLANNED, BLOCKED, DEFERRED or REJECTED with documented reason; difficult features may not silently disappear.
