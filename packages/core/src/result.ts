export const providerTypes = [
  'OFFICIAL_API',
  'PARTNER_API',
  'EXTERNAL_DISCOVERY',
  'BROWSER_INTERACTIVE',
  'LOCAL_ONLY',
] as const;

export type ProviderType = (typeof providerTypes)[number];

export const toolResultStatuses = [
  'succeeded',
  'requires_approval',
  'human_action_required',
  'unsupported',
  'permission_required',
  'partner_access_required',
  'restricted',
  'rate_limited',
  'duplicate',
  'partial',
  'failed',
] as const;

export type ToolResultStatus = (typeof toolResultStatuses)[number];

export interface ToolResult<T> {
  status: ToolResultStatus;
  data?: T;
  provider: {
    type: ProviderType;
    name: string;
  };
  warnings?: string[];
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  metadata: {
    requestId: string;
    timestamp: string;
  };
}

export function isProviderType(value: unknown): value is ProviderType {
  return typeof value === 'string' && providerTypes.includes(value as ProviderType);
}

export function isToolResultStatus(value: unknown): value is ToolResultStatus {
  return typeof value === 'string' && toolResultStatuses.includes(value as ToolResultStatus);
}
