import { describe, expect, it, vi } from 'vitest';

import { createPostSearchQuery } from '../../../packages/core/dist/index.js';
import { createLinkedInAuthorPostsProvider } from '../src/discovery/linkedin-author-posts.js';

describe('M05.4 restricted official author finder', () => {
  it('defaults OFF without consulting identity or making a provider request', async () => {
    const resolveAccess = vi.fn(() => Promise.resolve(null));
    const fetch = vi.fn<typeof globalThis.fetch>();
    const provider = createLinkedInAuthorPostsProvider(
      { apiVersion: '202610', resolveAccess },
      { fetch },
    );
    const query = createPostSearchQuery({ kind: 'author', authorUrn: 'urn:li:person:member_1' });
    await expect(provider.search(query, new AbortController().signal)).rejects.toMatchObject({
      kind: 'unavailable',
    });
    expect(resolveAccess).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
