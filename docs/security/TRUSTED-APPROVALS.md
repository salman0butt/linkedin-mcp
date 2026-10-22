# Trusted Human Approval Grants

Consequential MCP write tools do not accept a caller's `approved: true` assertion as human consent. The flag is an intent marker only. Production `createLinkedInRuntime()` refuses to issue any approval receipt unless a separate trusted host has already granted the exact authenticated subject, mutation purpose, and canonical payload hash.

## Embedding host contract

The example below is illustrative: the embedding host supplies `config`, `verifiedLinkedInSubject`, and `reviewedPreview` after its own checks.

The host must authenticate the human, independently display the exact canonical preview, and receive an explicit decision before issuing a grant. The host retains the `issuer` interface privately; only the `consumer` is passed to the runtime. Do not register the issuer as an MCP tool or expose it through an HTTP route, prompt, environment flag, or model-callable function.

```ts
import { createLinkedInRuntime } from './apps/server/dist/runtime.js';
import { createTrustedApprovalGrantStore } from './apps/server/dist/publishing/trusted-approval-grants.js';

const grants = createTrustedApprovalGrantStore();
const runtime = createLinkedInRuntime(config, { trustedApprovalGrants: grants.consumer });

// In trusted host code ONLY, after independent human review of the canonical preview:
const trustedGrantId = grants.issuer.grant({
  subject: verifiedLinkedInSubject,
  purpose: 'posts.text',
  payloadHash: reviewedPreview.payloadHash,
});

// The trusted host must deliver this unpredictable single-use capability only
// to the intended approved tool request (not to a public prompt or log):
// await client.callTool({
//   name: 'linkedin.post.approve.text',
//   arguments: { payload: reviewedPreview.payload, payloadHash: reviewedPreview.payloadHash,
//                approved: true, trustedGrantId },
// });
```

Only the next MCP approval request presenting the exact host-issued `trustedGrantId` along with its matching authenticated member and preview can consume that grant and issue the existing short-lived receipt. A request without the ID cannot steal the grant, even with an identical subject/purpose/hash. A reused ID, different subject/purpose/hash, or expired grant fails closed with `human_action_required`. Treat the ID as a temporary bearer capability: do not include it in model prompts, logs, public URLs or untrusted messages. Supported purposes are `posts.text`, `posts.media`, `comments.reply`, `reactions.add`, and `reactions.remove`.

The bundled stdio and loopback HTTP entrypoints have no trusted approval UI and intentionally cannot mint receipts by themselves. The example is an integration contract, not a shipped UI or proof of LinkedIn API entitlement. Grants and receipts are in-process; restarts require fresh approval. A future hosted or cross-process grant channel requires its own security design and review.
