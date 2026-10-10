# Capability Matrix

State values: `PLANNED`, `ACTIVE`, `BLOCKED`, `VERIFIED`, `DEFERRED`, `REJECTED`, `UNAVAILABLE`.

| Capability                 | Desired behavior                  | Provider classification | Access / permission dependency     | Milestone | State    | Verification evidence                                     | Approval / safety                           |
| -------------------------- | --------------------------------- | ----------------------- | ---------------------------------- | --------- | -------- | --------------------------------------------------------- | ------------------------------------------- |
| `linkedin.health`          | Local server health               | LOCAL_ONLY              | None                               | M00       | VERIFIED | real stdio + HTTP smoke                                   | Read-only                                   |
| `linkedin.version`         | Local version/protocol metadata   | LOCAL_ONLY              | None                               | M00       | VERIFIED | real MCP client contract                                  | Read-only                                   |
| `linkedin.capabilities`    | Truthful capability registry      | LOCAL_ONLY              | None                               | M00       | VERIFIED | real MCP client contract                                  | Read-only                                   |
| `profile.me`               | Authenticated identity            | OFFICIAL_API            | OAuth/scopes                       | M01       | ACTIVE   | M01 closeout evidence; live availability pending          | Read-only; live availability needs evidence |
| `post.create.text`         | Publish text post                 | OFFICIAL_API            | `w_member_social` + write access   | M02       | ACTIVE   | merged PR #3 + post-merge CI; live availability pending   | Preview/approval/idempotency                |
| `post.create.image`        | Publish image post                | OFFICIAL_API            | Media + `w_member_social` access   | M03       | ACTIVE   | M03.1–M03.4 deterministic evidence through CI 38051403134 | Preview/approval/idempotency                |
| `post.create.multi_image`  | Publish multi-image post          | OFFICIAL_API            | Media + `w_member_social` access   | M03       | ACTIVE   | M03.1–M03.4 deterministic evidence through CI 38051403134 | Preview/approval/idempotency                |
| `comments.list`            | Read comments                     | OFFICIAL_API            | Read permissions may be restricted | M04       | PLANNED  | None                                                      | Capability-aware                            |
| `comments.reply`           | Reply to comment                  | OFFICIAL_API            | Write/read context permissions     | M04       | PLANNED  | None                                                      | Approval by default                         |
| `reactions.add`            | Add reaction                      | OFFICIAL_API            | Eligible access                    | M04       | PLANNED  | None                                                      | Bounded writes                              |
| `posts.search`             | Discover LinkedIn posts           | EXTERNAL_DISCOVERY      | Broad official search not assumed  | M05       | PLANNED  | None                                                      | Provenance required                         |
| `jobs.search`              | Discover jobs                     | EXTERNAL_DISCOVERY      | Talent partner API optional later  | M06       | PLANNED  | None                                                      | Freshness + provenance                      |
| `jobs.score`               | Analyze job fit                   | LOCAL_ONLY              | Host/user context                  | M07       | PLANNED  | None                                                      | No false factual claims                     |
| `article.draft`            | Create structured article project | LOCAL_ONLY              | None                               | M08       | PLANNED  | None                                                      | Draft only                                  |
| `article.native.publish`   | Publish native long-form article  | BROWSER_INTERACTIVE     | No ordinary public API assumed     | M09       | PLANNED  | None                                                      | Final approval; stop on security challenge  |
| `research.topic`           | Research content topic            | EXTERNAL_DISCOVERY      | External sources/provider          | M10       | PLANNED  | None                                                      | Source provenance                           |
| `schedule.create`          | Schedule approved content         | LOCAL_ONLY              | Runtime persistence                | M11       | PLANNED  | None                                                      | Approval policy                             |
| `analytics.post`           | Read post analytics               | OFFICIAL_API            | Permission/account dependent       | M12       | PLANNED  | None                                                      | Capability-aware                            |
| `organization.post.create` | Publish as organization           | OFFICIAL_API            | Organization/community approval    | M13       | PLANNED  | None                                                      | Approval/idempotency                        |
| `network.connect`          | Connection workflow               | UNAVAILABLE             | Provider/access to be established  | M14       | PLANNED  | None                                                      | High-risk, no bulk spam                     |
| `messages.send`            | Send LinkedIn message             | UNAVAILABLE             | Provider/access to be established  | M15       | PLANNED  | None                                                      | Explicit approval, no bulk outreach         |

M01 deterministic implementation verification does not upgrade `profile.me` to live VERIFIED availability. A real
configured LinkedIn application/member request with the required product/scopes is still required for live evidence.

M02 repository implementation is merged and deterministic verification is complete, but `post.create.text` remains
live-unverified. Legitimate configured `w_member_social` access plus real provider evidence are required before live
publication can be represented as available or verified.

M03 is actively implementing image and multi-image publishing on PR #4. M03.1–M03.4 are deterministically verified
through `f71e9295e1e1d710b232859ab57e8e5264eaa0e4` / CI `38051403134`, including canonical contracts, safe
local media reads, the official Images adapter and durable media checkpoints. Processing verification, orchestration,
MCP integration and closeout remain unfinished. No live LinkedIn image upload, image-status read or media post has
been verified, so these ACTIVE entries must not be presented as live-available capabilities.
