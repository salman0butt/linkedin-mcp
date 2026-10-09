import { createHash } from 'node:crypto';

export const textPostVisibilities = ['PUBLIC', 'CONNECTIONS'] as const;

export type TextPostVisibility = (typeof textPostVisibilities)[number];

export interface TextPostPreviewInput {
  text: string;
  visibility?: TextPostVisibility;
  disableReshare?: boolean;
}

export interface TextPostPayload {
  commentary: string;
  visibility: TextPostVisibility;
  distribution: {
    feedDistribution: 'MAIN_FEED';
    targetEntities: readonly [];
    thirdPartyDistributionChannels: readonly [];
  };
  lifecycleState: 'PUBLISHED';
  isReshareDisabled: boolean;
}

export interface TextPostPreview {
  payload: TextPostPayload;
  canonicalJson: string;
  payloadHash: string;
  provider: 'OFFICIAL_API';
  requiredScope: 'w_member_social';
}

const allowedInputKeys = new Set(['text', 'visibility', 'disableReshare']);

function validateInput(input: TextPostPreviewInput): void {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Text post input must be an object');
  }

  const record = input as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowedInputKeys.has(key)) throw new Error(`Unsupported text post field: ${key}`);
  }

  if (typeof record.text !== 'string' || record.text.trim().length === 0) {
    throw new Error('Text post text must be a non-empty string');
  }
  if (record.text.length > 3000) throw new Error('Text post text length must not exceed 3000 characters');

  if (
    record.visibility !== undefined &&
    !textPostVisibilities.includes(record.visibility as TextPostVisibility)
  ) {
    throw new Error('Unsupported text post visibility');
  }

  if (record.disableReshare !== undefined && typeof record.disableReshare !== 'boolean') {
    throw new Error('Text post reshare setting must be a boolean');
  }
}

export function createTextPostPreview(input: TextPostPreviewInput): TextPostPreview {
  validateInput(input);

  const payload: TextPostPayload = {
    commentary: input.text,
    visibility: input.visibility ?? 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabled: input.disableReshare ?? false,
  };
  const canonicalJson = JSON.stringify(payload);

  return {
    payload,
    canonicalJson,
    payloadHash: createHash('sha256').update(canonicalJson).digest('hex'),
    provider: 'OFFICIAL_API',
    requiredScope: 'w_member_social',
  };
}
