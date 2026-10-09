# M03 Media Publishing Design

## Intent

Extend the existing approval-gated member publishing architecture with safe single-image and multi-image posts while preserving capability provenance, idempotency, restart safety, accessibility metadata and the distinction between deterministic implementation evidence and legitimate live LinkedIn access.

M03 serves local MCP clients first. It does not add hosted file ingestion, browser fallback, organization publishing, video/document media, scheduling or bulk publishing.

## External provider facts

The design is based on the current LinkedIn versioned REST documentation reviewed on 2026-10-09:

- Images API: `POST /rest/images?action=initializeUpload` returns an upload URL and `urn:li:image:*`; the Images API does not support synchronous upload.
- Image status can be `WAITING_UPLOAD`, `PROCESSING`, `PROCESSING_FAILED` or `AVAILABLE`.
- LinkedIn documents JPEG, PNG and GIF support, fewer than 36,152,320 pixels, and at most 250 GIF frames.
- Single-image posts use Posts API `content.media` with an image URN and optional alt text.
- Multi-image posts use Posts API `content.multiImage.images`, contain 2 through 20 images, and are organic/non-sponsored.
- `w_member_social` supports member writes. LinkedIn documentation warns that a token with only `w_member_social` may be unable to `GET /rest/images`; therefore image processing reads are access-dependent.
- Versioned API calls continue to require explicit `Linkedin-Version: YYYYMM` and Rest.li protocol headers.

References:

- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/multiimage-post-api
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api

These references establish adapter behavior, not live availability for the configured application.

## Chosen architecture

Use one approval-gated media publishing transaction per requested post. Do not expose raw upload initialization as a general MCP mutation and do not accept large base64 image bodies through the MCP request envelope.

The flow is:

```text
relative local file(s)
  -> safe media-root reader + byte validation
  -> canonical media-post preview + payload hash
  -> existing subject/hash-bound approval receipt
  -> durable media transaction reservation
  -> initialize/upload each required image
  -> optional/access-aware image-status confirmation
  -> durably checkpoint image URN(s)
  -> one Posts API creation request
  -> durable post result
  -> optional/access-aware post verification
```

This extends the M02 safety model rather than creating a second approval mechanism.

## Public MCP surface

M03 introduces six tools:

- `linkedin.post.preview.image`
- `linkedin.post.approve.image`
- `linkedin.post.create.image`
- `linkedin.post.preview.multi_image`
- `linkedin.post.approve.multi_image`
- `linkedin.post.create.multi_image`

Preview is `LOCAL_ONLY`. Approval is `LOCAL_ONLY`. Creation targets `OFFICIAL_API`. Tool discovery does not imply live provider availability.

### Preview input

Single image:

```ts
interface ImagePostPreviewInput {
  text: string;
  image: {
    sourcePath: string;
    altText: string;
  };
  visibility?: 'PUBLIC' | 'CONNECTIONS';
  disableReshare?: boolean;
}
```

Multi-image:

```ts
interface MultiImagePostPreviewInput {
  text: string;
  images: Array<{
    sourcePath: string;
    altText: string;
  }>;
  visibility?: 'PUBLIC' | 'CONNECTIONS';
  disableReshare?: boolean;
}
```

Multi-image requires 2 through 20 ordered images. Ordering is part of payload identity.

`sourcePath` is a relative path under an explicitly configured media root. Absolute paths, traversal, NUL bytes, files outside the resolved root and symlink escapes are rejected. Absolute server paths are never returned in structured output or audit metadata.

Every image requires alt text. Alt text is 1 through 4,086 characters; previews add a warning when it exceeds LinkedIn's recommended 120 characters without rejecting it.

### Preview output

The preview exposes safe media descriptors, not raw bytes or absolute paths:

```ts
interface CanonicalImageDescriptor {
  sourceName: string;
  sha256: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/gif';
  byteLength: number;
  width: number;
  height: number;
  frameCount?: number;
  altText: string;
}
```

The canonical post payload includes commentary, visibility, distribution, lifecycle state, reshare setting, media descriptors and content kind. `payloadHash` is SHA-256 of canonical JSON. File path itself is not part of provider payload identity; byte digest, ordered metadata and alt text are.

Before approval or creation, the server re-reads the file and recomputes the canonical preview. If bytes, type, dimensions, ordering, alt text or post fields changed, the approval hash no longer matches and mutation is rejected.

## Local media safety

### Configuration

Add `LINKEDIN_MCP_MEDIA_ROOT` for M03 local media tools. It must resolve to an existing directory. Media publishing remains structured `publishing_not_configured` when the root is absent; M00/M01/M02 tools remain usable.

The root should be a dedicated user-controlled staging directory. Configuration validation rejects the credential-store file or idempotency-ledger file if either resolves inside the media root.

A local safety limit `LINKEDIN_MCP_MEDIA_MAX_BYTES` is optional, defaults to 20 MiB per image and may be configured only between 1 MiB and 50 MiB. This is an MCP server safety limit, not a claim about LinkedIn's provider maximum.

### File handling

`media-file.ts` owns filesystem access. It:

1. rejects absolute, empty, dot-segment and NUL-containing paths;
2. resolves the configured root and candidate with `realpath`;
3. requires the resolved candidate to remain beneath the resolved root;
4. requires a regular file;
5. reads at most the configured byte limit plus one byte so oversized inputs fail without unbounded allocation;
6. identifies format from file signatures rather than extension;
7. parses image dimensions and GIF frame count without executing image content;
8. rejects zero dimensions, pixel count greater than or equal to 36,152,320, malformed structures and GIFs above 250 frames;
9. computes SHA-256 from the exact validated bytes.

No image decoder, EXIF parser or transformation is required in M03. Orientation/transcoding is out of scope. JPEG/PNG/GIF header parsing stays bounded and deterministic.

## Provider adapters

### `LinkedInImagesClient`

A focused adapter owns the Images API and upload URL interaction.

```ts
interface LinkedInImagesClient {
  initializeUpload(input: {
    accessToken: string;
    ownerUrn: string;
  }): Promise<{ imageUrn: string; uploadUrl: string; uploadUrlExpiresAt: number }>;

  upload(input: {
    accessToken: string;
    uploadUrl: string;
    bytes: Uint8Array;
    mimeType: SupportedImageMime;
  }): Promise<void>;

  getStatus(input: {
    accessToken: string;
    imageUrn: string;
  }): Promise<'WAITING_UPLOAD' | 'PROCESSING' | 'PROCESSING_FAILED' | 'AVAILABLE'>;
}
```

The upload URL is treated as sensitive/ephemeral: never persisted, logged, returned through MCP or placed in audit metadata. The adapter accepts only HTTPS upload URLs whose host is a LinkedIn-controlled upload host returned by initializeUpload. Redirects are not followed to arbitrary hosts. OAuth credentials remain in request headers only.

Provider bodies are not returned raw. Errors use the existing sanitized taxonomy with explicit transport uncertainty.

### Posts integration

Extend the existing Posts adapter rather than creating a parallel post client.

Single image maps to:

```json
{ "content": { "media": { "id": "urn:li:image:...", "altText": "..." } } }
```

Multi-image maps to ordered `content.multiImage.images`, each carrying `id` and `altText`.

Author remains derived from authenticated subject; callers never supply it. A valid provider-returned `x-restli-id` remains the authoritative creation identifier. No post URL is constructed.

## Durable transaction model

M02's terminal-only `MutationResult` is insufficient for a multi-stage upload transaction. M03 upgrades the persisted ledger schema in a backward-compatible versioned migration.

Each media mutation record persists only safe recovery data:

```ts
interface MediaCheckpoint {
  sha256: string;
  imageUrn?: string;
  uploadState: 'pending' | 'uploaded' | 'available' | 'verification_unavailable';
}
```

It does not persist source paths, bytes, alt text, access tokens or upload URLs.

Rules:

- The reservation fingerprint binds authenticated author + canonical payload hash.
- Existing M02 records remain readable and replay exactly as before.
- After each successful image upload, the image URN is checkpointed before the next remote step.
- Restart with the same idempotency key and unchanged payload reuses checkpointed image URNs rather than initializing duplicate images.
- If an upload request may have been accepted but the response outcome is unknowable before an image URN can be durably associated, the mutation becomes terminal `outcome_unknown`; automatic retry is forbidden.
- If an image URN is known and the byte upload has a transport-uncertain outcome, the record preserves that URN and returns `partial/outcome_unknown`; the system does not blindly PUT again.
- Provider-declared terminal upload/processing failure is safe to return as terminal failure; callers need a new idempotency key only after deliberately changing/retrying the operation.
- Post creation retains M02's one-POST rule and terminal uncertainty semantics.

The existing exclusive sibling lock and atomic replacement remain the cross-process serialization boundary.

## Processing verification policy

Because LinkedIn documents that `w_member_social` can be write-only for versioned image GETs, M03 separates upload completion from read verification.

- If trusted configuration enables image-status reads and the connected account has legitimate read access, poll with a bounded policy: maximum 6 attempts, maximum 10 seconds total, no faster than 1 second between attempts.
- `AVAILABLE` permits post creation.
- `PROCESSING_FAILED` blocks post creation with structured terminal failure.
- `WAITING_UPLOAD` or `PROCESSING` after the bounded window returns `partial/media_processing_pending`; no post is created automatically after the tool returns.
- A legitimate 403/restricted read does not claim processing failure. It records `verification_unavailable` and may continue to post creation only when the upload request itself completed successfully.
- Transport/provider failure during optional status reads is reported as verification unavailable or partial according to whether creation safety is known; it never fabricates `AVAILABLE`.

This policy is configurable separately from post-read verification and defaults disabled.

## Approval and idempotency

Reuse `ApprovalService`; receipts remain in memory, short-lived, subject-bound and payload-hash-bound. Media approval tools require connected identity and `w_member_social`, exactly as text publishing.

Creation inputs carry canonical preview data, approval receipt and caller idempotency key. Creation re-validates local bytes before consuming approval/reserving mutation. This makes file replacement between preview and create fail closed.

Single- and multi-image operations use distinct operation kinds so an idempotency key cannot be replayed across incompatible content shapes.

## Result and audit behavior

Creation results may include:

- final `postUrn` when known;
- ordered image URNs after successful upload;
- per-image processing verification state;
- post verification state;
- replay flag;
- conservative structured status.

Results never include source paths, upload URLs, file bytes, bearer tokens, approval receipt IDs or raw idempotency keys. Audit metadata may include payload hash, operation kind, safe counts and provider classification only.

## Capability provenance

`post.create.image` and `post.create.multi_image` are implemented against `OFFICIAL_API`, but remain live `UNAVAILABLE`/not verified until legitimate configured provider evidence proves the capability for the user's LinkedIn application/account. Deterministic adapters and injected-provider CI do not upgrade live availability.

Multi-image remains member-organic only in M03. Sponsored and organization variants are out of scope.

## Error model

M03 adds structured local/provider codes including:

- `media_not_configured`
- `media_path_invalid`
- `media_outside_root`
- `media_not_regular_file`
- `media_too_large`
- `media_type_unsupported`
- `media_malformed`
- `media_dimensions_invalid`
- `media_frame_limit_exceeded`
- `media_changed`
- `media_upload_failed`
- `media_processing_failed`
- `media_processing_pending`
- `media_verification_unavailable`

None expose filesystem paths or provider raw bodies.

## Testing strategy

Every meaningful behavior follows RED -> GREEN -> REFACTOR with exact-SHA GitHub Actions as the authoritative execution environment when the interactive runtime cannot provide Node 24/pnpm.

Coverage includes:

1. canonical single/multi-image contracts and ordering;
2. path containment, symlink escape and bounded reads;
3. JPEG/PNG/GIF signature/dimension/frame parsing and malformed inputs;
4. Images API initialize/upload/status adapters with secret-safe errors and URL-host checks;
5. backward-compatible ledger migration and checkpoint/restart/concurrency behavior;
6. approval/file-change/idempotency orchestration;
7. single/multi Posts payload mapping and one-POST replay;
8. restricted image-read behavior and bounded processing polling;
9. real MCP stdio/HTTP tool discovery, strict input schemas and shared runtime state;
10. skeptical/security closeout plus exact-final-head and post-merge main CI.

Ordinary tests use synthetic tiny image fixtures and injected fetch/providers. CI must never upload a real LinkedIn image or create a real post.

## Non-goals

M03 does not add:

- arbitrary URL fetching or SSRF-capable remote media ingestion;
- base64 media in MCP tool inputs;
- image transformation, resizing, EXIF rewriting or transcoding;
- video, document, poll, article thumbnail, organization or sponsored publishing;
- browser automation;
- live-capability claims based only on deterministic tests.

## Completion gates

M03 may merge only when its milestone acceptance criteria, required framework sections, traceability and capability matrix are current; exact-final-head CI is green; whole-milestone skeptical/security review has zero unresolved Critical/Important findings; review threads are clear; the PR is mergeable; remote heads are stable; and post-merge `main` CI is verified before M04 activation.
