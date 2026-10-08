import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createTextPostPreview, textPostVisibilities } from '../src/index.js';

describe('M02 canonical text-post preview', () => {
  it('builds the exact deterministic member text payload with safe defaults', () => {
    expect(textPostVisibilities).toEqual(['PUBLIC', 'CONNECTIONS']);

    const preview = createTextPostPreview({ text: 'Hello LinkedIn' });
    const payload = {
      commentary: 'Hello LinkedIn',
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabled: false,
    };
    const canonicalJson = JSON.stringify(payload);

    expect(preview).toEqual({
      payload,
      canonicalJson,
      payloadHash: createHash('sha256').update(canonicalJson).digest('hex'),
      provider: 'OFFICIAL_API',
      requiredScope: 'w_member_social',
    });
    expect(preview.payload).not.toHaveProperty('author');
  });

  it('preserves approved text exactly while rejecting blank and oversized commentary', () => {
    expect(createTextPostPreview({ text: '  hello\n' }).payload.commentary).toBe('  hello\n');
    expect(() => createTextPostPreview({ text: '  \n\t ' })).toThrow(/text/i);
    expect(() => createTextPostPreview({ text: '' })).toThrow(/text/i);
    expect(() => createTextPostPreview({ text: 'a'.repeat(3001) })).toThrow(/3000|length/i);
    expect(createTextPostPreview({ text: 'a'.repeat(3000) }).payload.commentary).toHaveLength(3000);
  });

  it('rejects unsupported visibility and invalid reshare flags instead of coercing them', () => {
    expect(() => createTextPostPreview({ text: 'hello', visibility: 'PRIVATE' as never })).toThrow(
      /visibility/i,
    );
    expect(() => createTextPostPreview({ text: 'hello', disableReshare: 'false' as never })).toThrow(
      /reshare/i,
    );
  });

  it('produces stable hashes independent of input key order and changes hashes for mutations', () => {
    const first = createTextPostPreview({
      text: 'Same text',
      visibility: 'CONNECTIONS',
      disableReshare: true,
    });
    const reordered = createTextPostPreview({
      disableReshare: true,
      visibility: 'CONNECTIONS',
      text: 'Same text',
    });
    const changedText = createTextPostPreview({
      text: 'Different text',
      visibility: 'CONNECTIONS',
      disableReshare: true,
    });
    const changedVisibility = createTextPostPreview({
      text: 'Same text',
      visibility: 'PUBLIC',
      disableReshare: true,
    });
    const changedReshare = createTextPostPreview({
      text: 'Same text',
      visibility: 'CONNECTIONS',
      disableReshare: false,
    });

    expect(reordered).toEqual(first);
    expect(first.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(changedText.payloadHash).not.toBe(first.payloadHash);
    expect(changedVisibility.payloadHash).not.toBe(first.payloadHash);
    expect(changedReshare.payloadHash).not.toBe(first.payloadHash);
  });

  it('rejects caller-controlled author and unknown payload fields', () => {
    expect(() =>
      createTextPostPreview({ text: 'hello', author: 'urn:li:person:someone-else' } as never),
    ).toThrow(/author|unknown|unsupported/i);
    expect(() => createTextPostPreview({ text: 'hello', lifecycleState: 'DRAFT' } as never)).toThrow(
      /unknown|unsupported|lifecycle/i,
    );
  });

  it('does not mutate the input object', () => {
    const input = Object.freeze({ text: 'Immutable', visibility: 'PUBLIC' as const });
    expect(createTextPostPreview(input).payload.commentary).toBe('Immutable');
    expect(input).toEqual({ text: 'Immutable', visibility: 'PUBLIC' });
  });
});
