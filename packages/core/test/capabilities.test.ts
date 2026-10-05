import { describe, expect, it } from 'vitest';

import {
  capabilityIds,
  createCapabilityRegistry,
  foundationCapabilityRegistry,
} from '../src/capabilities.js';

describe('capability registry', () => {
  it('contains the required future capability identifiers without claiming availability', () => {
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
    expect(
      foundationCapabilityRegistry.every((descriptor) => descriptor.availability === 'UNAVAILABLE'),
    ).toBe(true);
    expect(foundationCapabilityRegistry.every((descriptor) => descriptor.status !== 'VERIFIED')).toBe(true);
  });

  it('rejects duplicate capability identifiers', () => {
    const descriptor = foundationCapabilityRegistry[0];
    expect(() => createCapabilityRegistry([descriptor, descriptor])).toThrow(/duplicate capability/i);
  });

  it('rejects VERIFIED or AVAILABLE capabilities without evidence', () => {
    const descriptor = foundationCapabilityRegistry[0];
    expect(() =>
      createCapabilityRegistry([{ ...descriptor, status: 'VERIFIED', evidence: undefined }]),
    ).toThrow(/evidence/i);
    expect(() =>
      createCapabilityRegistry([{ ...descriptor, availability: 'AVAILABLE', evidence: 'Pending' }]),
    ).toThrow(/evidence/i);
  });
});
