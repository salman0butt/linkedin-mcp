import { describe, expect, it } from 'vitest';

import {
  createPostSearchQuery,
  normalizeDiscoveredPost,
  type TrustedDiscoveryContext,
} from '../src/post-discovery.js';

const clock = '2026-10-22T07:30:00.000Z';
const source = {
  providerId: 'approved-discovery',
  providerType: 'EXTERNAL_DISCOVERY',
  name: 'Configured discovery provider',
  retrievedAt: clock,
} as const;

describe('M05 canonical post-discovery contracts', () => {
  it('normalizes mode-specific strict query shapes and clamps default results without source access', () => {
    const topic = createPostSearchQuery({ kind: 'topic', term: '  TypeScript agents  ' });
    expect(topic).toEqual({ kind: 'topic', term: 'TypeScript agents', limit: 10 });
    expect(Object.isFrozen(topic)).toBe(true);
    expect(createPostSearchQuery({ kind: 'hashtag', term: '#typescript', limit: 50 })).toEqual({
      kind: 'hashtag',
      term: 'typescript',
      limit: 50,
    });
    expect(createPostSearchQuery({ kind: 'author', authorUrn: 'urn:li:person:abc_123' })).toEqual({
      kind: 'author',
      authorUrn: 'urn:li:person:abc_123',
      limit: 10,
    });
    expect(createPostSearchQuery({ kind: 'company', organizationUrn: 'urn:li:organization:42' })).toEqual({
      kind: 'company',
      organizationUrn: 'urn:li:organization:42',
      limit: 10,
    });
    expect(createPostSearchQuery({ kind: 'recent' })).toEqual({ kind: 'recent', limit: 10 });
  });

  it('rejects unsupported, combined or empty query modes and excessive limits', () => {
    const invalid = [
      null,
      {},
      [],
      { kind: 'general', term: 'ai' },
      { kind: 'topic', term: '' },
      { kind: 'topic', term: ' '.repeat(5) },
      { kind: 'topic', term: 'x'.repeat(101) },
      { kind: 'topic', term: 'ok', authorUrn: 'urn:li:person:123' },
      { kind: 'recent', term: 'ai' },
      { kind: 'hashtag', term: '#', limit: 1 },
      { kind: 'author', authorUrn: 'urn:li:person:' },
      { kind: 'company', organizationUrn: 'urn:li:organization:bad' },
      { kind: 'topic', term: 'ai', limit: 0 },
      { kind: 'topic', term: 'ai', limit: 51 },
      { kind: 'topic', term: 'ai', limit: 1.1 },
      { kind: 'topic', term: 'ai', unexpected: 'provider URL' },
    ];
    for (const input of invalid) expect(() => createPostSearchQuery(input)).toThrow();
  });

  it('preserves only real ordered ISO instants and bounded engagement thresholds', () => {
    expect(
      createPostSearchQuery({
        kind: 'topic',
        term: 'ai',
        since: '2026-10-01T00:00:00Z',
        until: '2026-10-21T23:59:59Z',
        minimumEngagement: 7,
      }),
    ).toEqual({
      kind: 'topic',
      term: 'ai',
      limit: 10,
      since: '2026-10-01T00:00:00.000Z',
      until: '2026-10-21T23:59:59.000Z',
      minimumEngagement: 7,
    });
    for (const input of [
      { since: 'tomorrow' },
      { since: '2026-10-21' },
      { since: '2026-02-30T01:00:00Z' },
      { since: '2026-10-22T00:00:00Z', until: '2026-10-20T00:00:00Z' },
      { minimumEngagement: -1 },
      { minimumEngagement: Number.POSITIVE_INFINITY },
      { minimumEngagement: 1.5 },
    ])
      expect(() => createPostSearchQuery({ kind: 'recent', ...input })).toThrow();
  });

  it('derives provenance exclusively from trusted adapter context and does not fabricate fields', () => {
    const result = normalizeDiscoveredPost(
      {
        id: 'post-1',
        text: '<script>alert(1)</script> first post',
        source: { provider: 'OFFICIAL_API', id: 'spoofed', retrievedAt: '2001-01-01T00:00:00Z' },
      },
      source,
    );
    expect(result).toEqual({
      id: 'post-1',
      text: '<script>alert(1)</script> first post',
      source: {
        provider: 'EXTERNAL_DISCOVERY',
        id: 'approved-discovery',
        name: 'Configured discovery provider',
        retrievedAt: clock,
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.source)).toBe(true);
    expect(result).not.toHaveProperty('publishedAt');
    expect(result).not.toHaveProperty('likes');
    expect(result).not.toHaveProperty('canonicalUrl');
  });

  it('accepts only validated optional URLs, UTC publication time and evidenced engagement', () => {
    expect(
      normalizeDiscoveredPost(
        {
          id: 'post-2',
          text: 'Hello',
          canonicalUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:123/',
          postUrn: 'urn:li:activity:123',
          publishedAt: '2026-10-21T11:00:00Z',
          likes: 24,
          comments: 0,
          confidence: 0.3,
        },
        { ...source, confidence: 0.85 },
      ),
    ).toMatchObject({
      canonicalUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:123/',
      postUrn: 'urn:li:activity:123',
      publishedAt: '2026-10-21T11:00:00.000Z',
      likes: 24,
      comments: 0,
      confidence: 0.85,
    });
    for (const value of [
      { id: 'x', text: 'hi', canonicalUrl: 'http://localhost/admin' },
      { id: 'x', text: 'hi', canonicalUrl: 'https://linkedin.com.evil.example/post' },
      { id: 'x', text: 'hi', canonicalUrl: 'javascript:alert(1)' },
      { id: 'x', text: 'hi', postUrn: 'urn:li:comment:(urn:li:activity:4,5)' },
      { id: 'x', text: 'hi', publishedAt: '2026-02-30T12:00:00Z' },
      { id: 'x', text: 'hi', likes: -1 },
      { id: 'x', text: 'hi', comments: Number.NaN },
      { id: '', text: 'hi' },
      { id: 'x' },
    ])
      expect(() => normalizeDiscoveredPost(value, source)).toThrow();
  });

  it('rejects invalid or untrusted adapter identities and refuses spoofed provider metadata', () => {
    for (const context of [
      { ...source, providerId: '' },
      { ...source, retrievedAt: 'unknown' },
      { ...source, providerType: 'BROWSER_INTERACTIVE' },
      { ...source, name: '   ' },
    ])
      expect(() =>
        normalizeDiscoveredPost({ id: 'x', text: 'hi' }, context as TrustedDiscoveryContext),
      ).toThrow();
  });
});
