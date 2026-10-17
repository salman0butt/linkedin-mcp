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
        'comments.get',
        'comments.list',
        'comments.inbox',
        'comments.reply',
        'reactions.add',
        'reactions.remove',
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

  it('keeps all M04 engagement capabilities official, active and live-unverified', () => {
    const m04 = foundationCapabilityRegistry.filter((descriptor) => descriptor.milestone === 'M04');
    expect(m04.map((descriptor) => descriptor.id)).toEqual([
      'comments.get',
      'comments.list',
      'comments.inbox',
      'comments.reply',
      'reactions.add',
      'reactions.remove',
    ]);
    expect(
      m04.every(
        (descriptor) =>
          descriptor.provider === 'OFFICIAL_API' &&
          descriptor.status === 'ACTIVE' &&
          descriptor.availability === 'UNAVAILABLE' &&
          /live.*unverified/i.test(descriptor.evidence ?? ''),
      ),
    ).toBe(true);

    for (const id of ['comments.get', 'comments.list', 'comments.inbox']) {
      const descriptor = m04.find((candidate) => candidate.id === id);
      expect(descriptor?.approvalRequired).toBe(false);
      expect(descriptor?.accessNote).toMatch(/r_member_social_feed/i);
      expect(descriptor?.accessNote).toMatch(/trusted.*read/i);
    }

    for (const id of ['comments.reply', 'reactions.add', 'reactions.remove']) {
      const descriptor = m04.find((candidate) => candidate.id === id);
      expect(descriptor?.approvalRequired).toBe(true);
      expect(descriptor?.accessNote).toMatch(/w_member_social_feed/i);
    }
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
