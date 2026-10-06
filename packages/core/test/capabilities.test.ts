import { describe, expect, it } from 'vitest';

import {
  capabilityIds,
  createCapabilityRegistry,
  foundationCapabilityRegistry,
} from '../src/capabilities.js';

function firstDescriptor() {
  const descriptor = foundationCapabilityRegistry.at(0);
  if (!descriptor) throw new Error('Expected foundation capability fixture');
  return descriptor;
}

describe('capability registry', () => {
  it('marks verified M00 local tools available without upgrading future LinkedIn capabilities', () => {
    expect(capabilityIds).toEqual(
      expect.arrayContaining([
        'profile.me',
        'post.create.text',
        'post.create.image',
        'post.create.multi_image',
        'comments.list',
        'comments.reply',
        'reactions.add',
        'posts.search',
        'jobs.search',
        'article.draft',
        'article.native.publish',
        'messages.send',
      ]),
    );

    const m00Capabilities = foundationCapabilityRegistry.filter(
      (descriptor) => descriptor.milestone === 'M00',
    );
    expect(m00Capabilities).toHaveLength(3);
    expect(
      m00Capabilities.every(
        (descriptor) =>
          descriptor.provider === 'LOCAL_ONLY' &&
          descriptor.availability === 'AVAILABLE' &&
          descriptor.status === 'VERIFIED' &&
          Boolean(descriptor.evidence?.trim()),
      ),
    ).toBe(true);

    const futureCapabilities = foundationCapabilityRegistry.filter(
      (descriptor) => descriptor.milestone !== 'M00',
    );
    expect(futureCapabilities.every((descriptor) => descriptor.availability === 'UNAVAILABLE')).toBe(true);
    expect(futureCapabilities.every((descriptor) => descriptor.status !== 'VERIFIED')).toBe(true);
  });

  it('rejects duplicate capability identifiers', () => {
    const descriptor = firstDescriptor();
    expect(() => createCapabilityRegistry([descriptor, descriptor])).toThrow(/duplicate capability/i);
  });

  it('rejects VERIFIED or AVAILABLE capabilities without evidence', () => {
    const descriptor = firstDescriptor();
    expect(() => createCapabilityRegistry([{ ...descriptor, status: 'VERIFIED', evidence: '' }])).toThrow(
      /evidence/i,
    );
    expect(() =>
      createCapabilityRegistry([{ ...descriptor, availability: 'AVAILABLE', evidence: 'Pending' }]),
    ).toThrow(/evidence/i);
  });
});
