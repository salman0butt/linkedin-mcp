import type { ProviderType } from './result.js';

export type CapabilityAvailability = 'AVAILABLE' | 'UNAVAILABLE';
export type CapabilityStatus = 'PLANNED' | 'ACTIVE' | 'BLOCKED' | 'VERIFIED' | 'DEFERRED' | 'REJECTED';

export interface CapabilityDescriptor {
  id: string;
  desiredBehavior: string;
  provider: ProviderType | null;
  availability: CapabilityAvailability;
  milestone: string;
  status: CapabilityStatus;
  accessNote: string;
  approvalRequired: boolean;
  evidence?: string;
}

const emptyEvidence = new Set(['', 'none', 'pending', '-']);

function hasVerificationEvidence(value: string | undefined): boolean {
  return value !== undefined && !emptyEvidence.has(value.trim().toLowerCase());
}

export function createCapabilityRegistry(
  descriptors: readonly CapabilityDescriptor[],
): readonly Readonly<CapabilityDescriptor>[] {
  const ids = new Set<string>();

  for (const descriptor of descriptors) {
    if (ids.has(descriptor.id)) throw new Error(`Duplicate capability identifier: ${descriptor.id}`);
    ids.add(descriptor.id);

    if (
      (descriptor.status === 'VERIFIED' || descriptor.availability === 'AVAILABLE') &&
      !hasVerificationEvidence(descriptor.evidence)
    ) {
      throw new Error(
        `Capability ${descriptor.id} requires verification evidence before it can be VERIFIED or AVAILABLE`,
      );
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

const descriptors: CapabilityDescriptor[] = [
  {
    id: 'linkedin.health',
    desiredBehavior: 'Report local server health without contacting LinkedIn.',
    provider: 'LOCAL_ONLY',
    availability: 'AVAILABLE',
    milestone: 'M00',
    status: 'VERIFIED',
    accessNote: 'No LinkedIn access required.',
    approvalRequired: false,
    evidence: 'Real stdio and loopback HTTP client smoke tests call linkedin.health successfully.',
  },
  {
    id: 'linkedin.version',
    desiredBehavior: 'Report local server and protocol version metadata.',
    provider: 'LOCAL_ONLY',
    availability: 'AVAILABLE',
    milestone: 'M00',
    status: 'VERIFIED',
    accessNote: 'No LinkedIn access required.',
    approvalRequired: false,
    evidence: 'Real MCP client contract test verifies linkedin.version structured output.',
  },
  {
    id: 'linkedin.capabilities',
    desiredBehavior: 'Report truthful capability and provider provenance.',
    provider: 'LOCAL_ONLY',
    availability: 'AVAILABLE',
    milestone: 'M00',
    status: 'VERIFIED',
    accessNote: 'No LinkedIn access required.',
    approvalRequired: false,
    evidence: 'Real MCP client contract test verifies linkedin.capabilities structured output.',
  },
  {
    id: 'profile.me',
    desiredBehavior: 'Read the authenticated member identity when official access exists.',
    provider: 'OFFICIAL_API',
    availability: 'UNAVAILABLE',
    milestone: 'M01',
    status: 'ACTIVE',
    accessNote: 'Requires LinkedIn OAuth scopes and configured application access.',
    approvalRequired: false,
    evidence:
      'Deterministic M01 OAuth/OIDC implementation is CI-verified; live configured-account availability remains unverified.',
  },
  {
    id: 'post.create.text',
    desiredBehavior: 'Publish an approved text post through legitimate LinkedIn access.',
    provider: 'OFFICIAL_API',
    availability: 'UNAVAILABLE',
    milestone: 'M02',
    status: 'ACTIVE',
    accessNote: 'Requires authenticated publishing permission.',
    approvalRequired: true,
    evidence:
      'M02.1 canonical preview and payload identity are CI-verified; live Posts API publication remains unverified.',
  },
  {
    id: 'post.create.image',
    desiredBehavior: 'Publish an approved single-image post.',
    provider: 'OFFICIAL_API',
    availability: 'UNAVAILABLE',
    milestone: 'M03',
    status: 'ACTIVE',
    accessNote: 'Requires authenticated media and publishing permission.',
    approvalRequired: true,
    evidence:
      'M03 canonical single-image contract is under deterministic CI verification; live media publication remains unverified.',
  },
  {
    id: 'post.create.multi_image',
    desiredBehavior: 'Publish an approved multi-image post.',
    provider: 'OFFICIAL_API',
    availability: 'UNAVAILABLE',
    milestone: 'M03',
    status: 'ACTIVE',
    accessNote: 'Requires authenticated media and publishing permission.',
    approvalRequired: true,
    evidence:
      'M03 canonical multi-image contract is under deterministic CI verification; live media publication remains unverified.',
  },
  {
    id: 'comments.get',
    desiredBehavior: 'Read one explicit member comment when configured access permits it.',
    provider: 'OFFICIAL_API',
    availability: 'UNAVAILABLE',
    milestone: 'M04',
    status: 'ACTIVE',
    accessNote: 'Requires restricted r_member_social_feed access and the explicit trusted read gate.',
    approvalRequired: false,
    evidence:
      'M04.1 deterministic contracts are CI-verifiable; live Community Management access remains unverified.',
  },
  {
    id: 'comments.list',
    desiredBehavior: 'Read comments and replies for an explicit thread when configured access permits it.',
    provider: 'OFFICIAL_API',
    availability: 'UNAVAILABLE',
    milestone: 'M04',
    status: 'ACTIVE',
    accessNote: 'Requires restricted r_member_social_feed access and the explicit trusted read gate.',
    approvalRequired: false,
    evidence:
      'M04.1 deterministic contracts are CI-verifiable; live Community Management access remains unverified.',
  },
  {
    id: 'comments.inbox',
    desiredBehavior: 'Derive an unanswered-comment inbox from explicit bounded thread roots.',
    provider: 'OFFICIAL_API',
    availability: 'UNAVAILABLE',
    milestone: 'M04',
    status: 'ACTIVE',
    accessNote: 'Requires restricted r_member_social_feed access and the explicit trusted read gate.',
    approvalRequired: false,
    evidence:
      'M04.1 deterministic contracts are CI-verifiable; live Community Management access remains unverified.',
  },
  {
    id: 'comments.reply',
    desiredBehavior: 'Publish an approved contextual member comment reply.',
    provider: 'OFFICIAL_API',
    availability: 'UNAVAILABLE',
    milestone: 'M04',
    status: 'ACTIVE',
    accessNote: 'Requires vetted Community Management access with w_member_social_feed.',
    approvalRequired: true,
    evidence:
      'M04.1 deterministic contracts are CI-verifiable; live Community Management write access remains unverified.',
  },
  {
    id: 'reactions.add',
    desiredBehavior: 'Add an approved member reaction to an explicit post or comment.',
    provider: 'OFFICIAL_API',
    availability: 'UNAVAILABLE',
    milestone: 'M04',
    status: 'ACTIVE',
    accessNote: 'Requires vetted Community Management access with w_member_social_feed.',
    approvalRequired: true,
    evidence:
      'M04.1 deterministic contracts are CI-verifiable; live Community Management write access remains unverified.',
  },
  {
    id: 'reactions.remove',
    desiredBehavior: 'Remove the authenticated member reaction from an explicit post or comment.',
    provider: 'OFFICIAL_API',
    availability: 'UNAVAILABLE',
    milestone: 'M04',
    status: 'ACTIVE',
    accessNote: 'Requires vetted Community Management access with w_member_social_feed.',
    approvalRequired: true,
    evidence:
      'M04.1 deterministic contracts are CI-verifiable; live Community Management write access remains unverified.',
  },
  {
    id: 'posts.search',
    desiredBehavior: 'Discover LinkedIn-oriented public post content with explicit source provenance.',
    provider: 'EXTERNAL_DISCOVERY',
    availability: 'UNAVAILABLE',
    milestone: 'M05',
    status: 'ACTIVE',
    accessNote:
      'Read-only MCP contract is implemented. Broad search requires a legitimate configured external/partner provider; restricted official author retrieval needs separately verified identity and scopes.',
    approvalRequired: false,
  },
  {
    id: 'jobs.search',
    desiredBehavior: 'Discover jobs with freshness and provider provenance.',
    provider: 'EXTERNAL_DISCOVERY',
    availability: 'UNAVAILABLE',
    milestone: 'M06',
    status: 'ACTIVE',
    accessNote:
      'Read-only MCP discovery contract exists; live search requires a legitimately configured external/partner provider. Standard OAuth does not grant Talent API access.',
    approvalRequired: false,
  },
  {
    id: 'jobs.saved',
    desiredBehavior: 'Keep private local job snapshots and job-search criteria across STDIO sessions.',
    provider: 'LOCAL_ONLY',
    availability: 'UNAVAILABLE',
    milestone: 'M06',
    status: 'ACTIVE',
    accessNote:
      'Disabled by default; explicitly opt in with a host-owned private STDIO path. HTTP callers never have access. Local saves are not LinkedIn bookmarks or applications.',
    approvalRequired: false,
  },
  {
    id: 'jobs.analyze',
    desiredBehavior:
      'Analyze explicit caller job requirements and advisory skill evidence with no provider lookup.',
    provider: 'LOCAL_ONLY',
    availability: 'AVAILABLE',
    milestone: 'M07',
    status: 'VERIFIED',
    accessNote:
      'Local only, unverified caller snapshots; no job search account, employer verification or application submission.',
    approvalRequired: false,
    evidence: 'M07.6 exact-source job-intelligence contract and real STDIO/HTTP analysis smoke tests.',
  },
  {
    id: 'jobs.compare',
    desiredBehavior:
      'Compare 2–10 source-scoped unverified job snapshots with explicit missing-evidence flags.',
    provider: 'LOCAL_ONLY',
    availability: 'AVAILABLE',
    milestone: 'M07',
    status: 'VERIFIED',
    accessNote:
      'Local only; qualitative evidence and advisory skill-only scores, never a hiring or visa eligibility decision.',
    approvalRequired: false,
    evidence: 'M07.6 exact-source job-intelligence contract and real STDIO/HTTP comparison smoke tests.',
  },
  {
    id: 'research.analyze',
    desiredBehavior:
      'Summarize literal focus-term evidence in explicitly caller-supplied research source text.',
    provider: 'LOCAL_ONLY',
    availability: 'AVAILABLE',
    milestone: 'M10',
    status: 'ACTIVE',
    accessNote:
      'Only caller-supplied unverified sources; no online research, market trends, fact verification or publication.',
    approvalRequired: false,
    evidence: 'M10 deterministic bounded local parser, analyzer and MCP client contracts.',
  },
  {
    id: 'research.group_themes',
    desiredBehavior:
      'Group unverified caller-provided research excerpts under explicit caller-authored theme labels and literal phrases.',
    provider: 'LOCAL_ONLY',
    availability: 'AVAILABLE',
    milestone: 'M10',
    status: 'ACTIVE',
    accessNote:
      'Caller-defined labels only; local exact source-body evidence, no semantic clustering, verified trends, market gaps or provider access.',
    approvalRequired: false,
    evidence: 'M10.1 deterministic bounded pure theme grouping and typed MCP/transport contracts.',
  },
  {
    id: 'research.topic',
    desiredBehavior: 'Discover current sourced research through a legitimate configured external provider.',
    provider: 'EXTERNAL_DISCOVERY',
    availability: 'UNAVAILABLE',
    milestone: 'M10',
    status: 'PLANNED',
    accessNote:
      'No authorized external research provider is configured; do not claim live research or trend freshness.',
    approvalRequired: false,
  },
  {
    id: 'article.draft',
    desiredBehavior: 'Create and manage a local long-form article draft package.',
    provider: 'LOCAL_ONLY',
    availability: 'AVAILABLE',
    milestone: 'M08',
    status: 'VERIFIED',
    accessNote:
      'Local validated drafts, review and prompts are available; private projects require opt-in host-configured STDIO store. No native LinkedIn publication.',
    approvalRequired: false,
    evidence: 'M08 local article tools, unverified source notes, and STDIO/HTTP isolation contract tests.',
  },
  {
    id: 'article.native.publish',
    desiredBehavior: 'Publish an approved native article through a legitimate configured provider.',
    provider: 'BROWSER_INTERACTIVE',
    availability: 'UNAVAILABLE',
    milestone: 'M09',
    status: 'PLANNED',
    accessNote: 'Interactive provider is optional and must stop at CAPTCHA or security challenges.',
    approvalRequired: true,
  },
  {
    id: 'messages.send',
    desiredBehavior: 'Send an approved message only if legitimate provider access is established.',
    provider: null,
    availability: 'UNAVAILABLE',
    milestone: 'M15',
    status: 'PLANNED',
    accessNote: 'No legitimate provider has been established; bulk messaging is prohibited.',
    approvalRequired: true,
  },
];

export const foundationCapabilityRegistry = createCapabilityRegistry(descriptors);
export const capabilityIds = Object.freeze(foundationCapabilityRegistry.map((descriptor) => descriptor.id));
