import { foundationCapabilityRegistry, type ToolResult } from '../../../packages/core/dist/index.js';

interface FoundationDeps {
  requestId: string;
  now: () => Date;
}

interface VersionDeps extends FoundationDeps {
  version: string;
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
  capabilities: typeof foundationCapabilityRegistry;
}

type SuccessfulResult<T> = ToolResult<T> & {
  status: 'succeeded';
  data: T;
};

const provider = { type: 'LOCAL_ONLY' as const, name: 'linkedin-mcp' };

function metadata(deps: FoundationDeps): ToolResult<unknown>['metadata'] {
  return {
    requestId: deps.requestId,
    timestamp: deps.now().toISOString(),
  };
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

export function createCapabilitiesResult(deps: FoundationDeps): SuccessfulResult<CapabilitiesData> {
  return {
    status: 'succeeded',
    data: {
      capabilities: foundationCapabilityRegistry,
    },
    provider,
    metadata: metadata(deps),
  };
}
