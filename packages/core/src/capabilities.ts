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
    status: 'PLANNED',
    accessNote: 'Requires authenticated media and publishing permission.',
    approvalRequired: true,
  },
  {
    id: 'post.create.multi_image',
    desiredBehavior: 'Publish an approved multi-image post.',
    provider: 'OFFICIAL_API',
    availability: 'UNAVAILABLE',
    milestone: 'M03',
    status: 'PLANNED',
    accessNote: 'Requires authenticated media and publishing permission.',
    approvalRequired: true,
  },
  {
    id: 'comments.list',
    desiredBehavior: 'Read comments when configured access permits it.',
    provider: 'OFFICIAL_API',
    availability: 'UNAVAILABLE',
    milestone: 'M04',
    status: 'PLANNED',
    accessNote: 'Permission and entity ownership requirements are access-dependent.',
    approvalRequired: false,
  },
  {
    id: 'comments.reply',
    desiredBehavior: 'Publish an approved contextual comment reply.',
    provider: 'OFFICIAL_API',
    availability: 'UNAVAILABLE',
    milestone: 'M04',
    status: 'PLANNED',
    accessNote: 'Permission and entity ownership requirements are access-dependent.',
    approvalRequired: true,
  },
  {
    id: 'reactions.add',
    desiredBehavior: 'Add an approved reaction when legitimate access permits it.',
    provider: 'OFFICIAL_API',
    availability: 'UNAVAILABLE',
    milestone: 'M04',
    status: 'PLANNED',
    accessNote: 'Permission requirements are access-dependent.',
    approvalRequired: true,
  },
  {
    id: 'posts.search',
    desiredBehavior: 'Discover LinkedIn-oriented public post content with explicit source provenance.',
    provider: 'EXTERNAL_DISCOVERY',
    availability: 'UNAVAILABLE',
    milestone: 'M05',
    status: 'PLANNED',
    accessNote: 'Broad search is not represented as ordinary LinkedIn official API access.',
    approvalRequired: false,
  },
  {
    id: 'jobs.search',
    desiredBehavior: 'Discover jobs with freshness and provider provenance.',
    provider: 'EXTERNAL_DISCOVERY',
    availability: 'UNAVAILABLE',
    milestone: 'M06',
    status: 'PLANNED',
    accessNote: 'Partner-only Talent access remains separate and access-dependent.',
    approvalRequired: false,
  },
  {
    id: 'article.draft',
    desiredBehavior: 'Create and manage a local long-form article draft package.',
    provider: 'LOCAL_ONLY',
    availability: 'UNAVAILABLE',
    milestone: 'M08',
    status: 'PLANNED',
    accessNote: 'Local authoring does not imply native LinkedIn publication.',
    approvalRequired: false,
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
