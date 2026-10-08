import {
  foundationCapabilityRegistry,
  type CapabilityDescriptor,
  type ToolResult,
  type ToolResultStatus,
} from '../../../packages/core/dist/index.js';

interface FoundationDeps {
  requestId: string;
  now: () => Date;
}

export interface LocalAuditResultOptions<T> extends FoundationDeps {
  status: ToolResultStatus;
  operation: 'post.preview.text' | 'post.approve.text' | 'post.create.text';
  provider?: 'LOCAL_ONLY' | 'OFFICIAL_API';
  data?: T;
  payloadHash?: string;
  replay?: boolean;
  warnings?: string[];
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

interface VersionDeps extends FoundationDeps {
  version: string;
}

interface CapabilitiesDeps extends FoundationDeps {
  profileAvailable?: boolean;
}

interface HealthData {
  ok: true;
  service: 'linkedin-mcp';
  linkedinConnected: false;
}

interface VersionData {
  name: 'linkedin-mcp';
  version: string;
}

interface CapabilitiesData {
  capabilities: readonly Readonly<CapabilityDescriptor>[];
}

interface OfficialResultOptions<T> extends FoundationDeps {
  status: ToolResultStatus;
  data?: T;
  warnings?: string[];
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

type SuccessfulResult<T> = ToolResult<T> & {
  status: 'succeeded';
  data: T;
};

const provider = { type: 'LOCAL_ONLY' as const, name: 'linkedin-mcp' };
const linkedInProvider = { type: 'OFFICIAL_API' as const, name: 'LinkedIn' };

function metadata(deps: FoundationDeps): ToolResult<unknown>['metadata'] {
  return {
    requestId: deps.requestId,
    timestamp: deps.now().toISOString(),
  };
}

function projectCapabilities(profileAvailable: boolean): readonly Readonly<CapabilityDescriptor>[] {
  return foundationCapabilityRegistry.map((descriptor) => {
    if (descriptor.id !== 'profile.me') return descriptor;

    return Object.freeze({
      ...descriptor,
      status: 'ACTIVE' as const,
      availability: profileAvailable ? ('AVAILABLE' as const) : ('UNAVAILABLE' as const),
    });
  });
}

export function createHealthResult(deps: FoundationDeps): SuccessfulResult<HealthData> {
  return {
    status: 'succeeded',
    data: {
      ok: true,
      service: 'linkedin-mcp',
      linkedinConnected: false,
    },
    provider,
    metadata: metadata(deps),
  };
}

export function createVersionResult(deps: VersionDeps): SuccessfulResult<VersionData> {
  return {
    status: 'succeeded',
    data: {
      name: 'linkedin-mcp',
      version: deps.version,
    },
    provider,
    metadata: metadata(deps),
  };
}

export function createCapabilitiesResult(deps: CapabilitiesDeps): SuccessfulResult<CapabilitiesData> {
  return {
    status: 'succeeded',
    data: {
      capabilities: projectCapabilities(deps.profileAvailable ?? false),
    },
    provider,
    metadata: metadata(deps),
  };
}

export function createLinkedInResult<T>(options: OfficialResultOptions<T>): ToolResult<T> {
  return {
    status: options.status,
    ...(options.data === undefined ? {} : { data: options.data }),
    provider: linkedInProvider,
    ...(options.warnings === undefined ? {} : { warnings: [...options.warnings] }),
    ...(options.error === undefined ? {} : { error: { ...options.error } }),
    metadata: metadata(options),
  };
}

export function createLocalAuditResult<T>(options: LocalAuditResultOptions<T>) {
  const isLocal = options.provider !== 'OFFICIAL_API';
  return {
    status: options.status,
    ...(options.data === undefined ? {} : { data: options.data }),
    provider: isLocal ? provider : linkedInProvider,
    ...(options.warnings === undefined ? {} : { warnings: [...options.warnings] }),
    ...(options.error === undefined ? {} : { error: { ...options.error } }),
    metadata: {
      requestId: options.requestId,
      timestamp: options.now().toISOString(),
      audit: {
        operation: options.operation,
        ...(options.payloadHash === undefined ? {} : { payloadHash: options.payloadHash }),
        ...(options.replay === undefined ? {} : { replay: options.replay }),
      },
    },
  };
}
