import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createImagePostPreviewFromDescriptors,
  createMultiImagePostPreviewFromDescriptors,
  foundationCapabilityRegistry,
  type CanonicalImageDescriptor,
} from '../src/index.js';

function descriptor(
  name: string,
  overrides: Partial<CanonicalImageDescriptor> = {},
): CanonicalImageDescriptor {
  return {
    sourceName: name,
    sha256: createHash('sha256').update(name).digest('hex'),
    mimeType: 'image/png',
    byteLength: 128,
    width: 16,
    height: 8,
    altText: `Alt for ${name}`,
    ...overrides,
  };
}

describe('M03 canonical media-post preview', () => {
  it('builds an exact deterministic single-image payload without caller author or source path', () => {
    const image = descriptor('hero.png');
    const preview = createImagePostPreviewFromDescriptors({
      text: 'Hello with image',
      image,
    });
    const payload = {
      contentKind: 'image',
      commentary: 'Hello with image',
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabled: false,
      media: image,
    };
    const canonicalJson = JSON.stringify(payload);

    expect(preview).toEqual({
      payload,
      canonicalJson,
      payloadHash: createHash('sha256').update(canonicalJson).digest('hex'),
      provider: 'OFFICIAL_API',
      requiredScope: 'w_member_social',
      warnings: [],
    });
    expect(preview.payload).not.toHaveProperty('author');
    expect(JSON.stringify(preview)).not.toContain('sourcePath');
  });

  it('preserves ordered multi-image identity and changes the hash when image order changes', () => {
    const first = descriptor('first.png');
    const second = descriptor('second.png');
    const preview = createMultiImagePostPreviewFromDescriptors({
      text: 'Carousel',
      images: [first, second],
      visibility: 'CONNECTIONS',
      disableReshare: true,
    });
    const reversed = createMultiImagePostPreviewFromDescriptors({
      text: 'Carousel',
      images: [second, first],
      visibility: 'CONNECTIONS',
      disableReshare: true,
    });

    expect(preview.payload).toEqual({
      contentKind: 'multi_image',
      commentary: 'Carousel',
      visibility: 'CONNECTIONS',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabled: true,
      media: [first, second],
    });
    expect(preview.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(reversed.payloadHash).not.toBe(preview.payloadHash);
  });

  it('accepts exactly 2 through 20 multi-image descriptors and rejects counts outside that range', () => {
    const two = [descriptor('1.png'), descriptor('2.png')];
    const twenty = Array.from({ length: 20 }, (_, index) => descriptor(`${index + 1}.png`));

    expect(
      createMultiImagePostPreviewFromDescriptors({ text: 'Two', images: two }).payload.media,
    ).toHaveLength(2);
    expect(
      createMultiImagePostPreviewFromDescriptors({ text: 'Twenty', images: twenty }).payload.media,
    ).toHaveLength(20);
    expect(() =>
      createMultiImagePostPreviewFromDescriptors({ text: 'One', images: [descriptor('only.png')] }),
    ).toThrow(/2|two|image count/i);
    expect(() =>
      createMultiImagePostPreviewFromDescriptors({
        text: 'Twenty one',
        images: Array.from({ length: 21 }, (_, index) => descriptor(`${index + 1}.png`)),
      }),
    ).toThrow(/20|image count/i);
  });

  it('requires bounded alt text and warns, rather than rejects, beyond the 120-character recommendation', () => {
    expect(() =>
      createImagePostPreviewFromDescriptors({
        text: 'Blank alt',
        image: descriptor('blank.png', { altText: '   ' }),
      }),
    ).toThrow(/alt/i);
    expect(() =>
      createImagePostPreviewFromDescriptors({
        text: 'Too long alt',
        image: descriptor('long.png', { altText: 'a'.repeat(4087) }),
      }),
    ).toThrow(/4086|alt/i);

    const recommended = createImagePostPreviewFromDescriptors({
      text: 'Accessible',
      image: descriptor('accessible.png', { altText: 'a'.repeat(120) }),
    });
    const warning = createImagePostPreviewFromDescriptors({
      text: 'Accessible',
      image: descriptor('warning.png', { altText: 'a'.repeat(121) }),
    });
    const multiWarning = createMultiImagePostPreviewFromDescriptors({
      text: 'Accessible carousel',
      images: [
        descriptor('good.png', { altText: 'Short alt' }),
        descriptor('warning.png', { altText: 'a'.repeat(121) }),
      ],
    });

    expect(recommended.warnings).toEqual([]);
    expect(warning.warnings).toEqual(["Image alt text exceeds LinkedIn's recommended 120 characters."]);
    expect(multiWarning.warnings).toEqual([
      "Image 2 alt text exceeds LinkedIn's recommended 120 characters.",
    ]);
  });

  it('rejects unsupported caller-controlled post or descriptor fields', () => {
    expect(() =>
      createImagePostPreviewFromDescriptors({
        text: 'No author',
        image: descriptor('hero.png'),
        author: 'urn:li:person:someone-else',
      } as never),
    ).toThrow(/author|unsupported|unknown/i);

    expect(() =>
      createImagePostPreviewFromDescriptors({
        text: 'No path',
        image: { ...descriptor('hero.png'), sourcePath: '/private/secret.png' } as never,
      }),
    ).toThrow(/sourcePath|unsupported|unknown/i);
  });

  it('keeps commentary validation and stable hashes consistent with text publishing', () => {
    expect(() =>
      createImagePostPreviewFromDescriptors({ text: '   ', image: descriptor('blank.png') }),
    ).toThrow(/text|commentary/i);
    expect(() =>
      createImagePostPreviewFromDescriptors({
        text: 'a'.repeat(3001),
        image: descriptor('long.png'),
      }),
    ).toThrow(/3000|length/i);

    const first = createImagePostPreviewFromDescriptors({
      text: 'Stable',
      image: descriptor('stable.png'),
      visibility: 'CONNECTIONS',
      disableReshare: true,
    });
    const reordered = createImagePostPreviewFromDescriptors({
      disableReshare: true,
      visibility: 'CONNECTIONS',
      image: descriptor('stable.png'),
      text: 'Stable',
    });
    expect(reordered).toEqual(first);
  });

  it('activates deterministic M03 image capabilities without claiming live availability', () => {
    const image = foundationCapabilityRegistry.find((item) => item.id === 'post.create.image');
    const multi = foundationCapabilityRegistry.find((item) => item.id === 'post.create.multi_image');

    for (const capability of [image, multi]) {
      expect(capability).toMatchObject({
        provider: 'OFFICIAL_API',
        availability: 'UNAVAILABLE',
        milestone: 'M03',
        status: 'ACTIVE',
        approvalRequired: true,
      });
      expect(capability?.evidence).toMatch(/deterministic|contract|M03/i);
    }
  });
});
