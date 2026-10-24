import { describe, expect, it } from 'vitest';

import { normalizeArticleDraft } from '../src/articles/article-project.js';
import {
  createCompanionPostDraft,
  previewArticleDraft,
  validateArticleDraft,
} from '../src/articles/article-render.js';

const fixture = () =>
  normalizeArticleDraft({
    title: 'Safer TypeScript systems',
    topic: 'TypeScript',
    audience: 'Developers',
    goal: 'Explain evidence-driven engineering',
    research: {
      brief: 'Explore tradeoffs and validate claims before publication.',
      sources: [{ id: 'src-1', title: 'Example research', url: 'https://example.org/article' }],
    },
    outline: [{ id: 'part-1', heading: 'Introduction' }],
    blocks: [
      { id: 'section-1', kind: 'heading', text: 'Why type safety matters' },
      { id: 'body-1', kind: 'paragraph', text: 'Author statement under review.', sourceIds: ['src-1'] },
    ],
    seo: { slug: 'safer-typescript', description: 'How to build safer TypeScript systems' },
    companionPost: 'New article draft about safer TypeScript systems.',
    review: { state: 'draft' },
  });

describe('M08.2 deterministic article package review', () => {
  it('identifies incomplete works in progress without pretending references have been verified', () => {
    const empty = normalizeArticleDraft({
      title: 'Draft',
      topic: 'Types',
      audience: 'Developers',
      goal: 'Teach',
      research: { brief: '', sources: [] },
      outline: [],
      blocks: [],
      review: { state: 'draft' },
    });
    const validation = validateArticleDraft(empty);
    expect(validation.readyForReview).toBe(false);
    expect(validation.warnings.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'missing_brief',
        'missing_sources',
        'empty_outline',
        'empty_body',
        'missing_seo',
        'missing_companion',
      ]),
    );
    const complete = validateArticleDraft(fixture());
    expect(complete.readyForReview).toBe(true);
    expect(complete.warnings.map((item) => item.code)).toContain('sources_unverified');
  });

  it('renders ordered blocks and user source notes without scripting or silent publication', () => {
    const draft = normalizeArticleDraft({
      ...fixture(),
      blocks: [
        {
          id: 'p-1',
          kind: 'paragraph',
          text: '<script>alert(1)</script> and [evil](javascript:alert(1))',
          sourceIds: ['src-1'],
        },
        { id: 'q-1', kind: 'quote', text: 'Never accept fabricated evidence' },
        {
          id: 'image-1',
          kind: 'image_placeholder',
          text: '<img src=x onerror=alert(1)> ![pixel](https://attacker.invalid/pixel)',
        },
      ],
    });
    const preview = previewArticleDraft(draft);
    expect(preview.format).toBe('markdown');
    expect(preview.publicationStatus).toBe('not_published');
    expect(preview.markdown).not.toContain('<script>');
    expect(preview.markdown).not.toContain('<img');
    expect(preview.markdown).not.toContain('](javascript:');
    expect(preview.markdown).not.toContain('![pixel](');
    expect(preview.markdown).not.toContain('https://attacker.invalid/pixel');
    expect(preview.markdown).toContain('User-supplied, unverified sources');
    expect(preview.markdown).toContain('Example research');
    expect(preview.markdown.indexOf('Never accept')).toBeGreaterThan(preview.markdown.indexOf('alert'));
  });

  it('makes a bounded companion suggestion from authored fields, not a claim of fact or publication', () => {
    const draft = normalizeArticleDraft({
      ...fixture(),
      goal: 'x'.repeat(300),
      research: { ...fixture().research, brief: 'y'.repeat(1_000) },
    });
    const result = createCompanionPostDraft(draft);
    expect(result.status).toBe('draft_only');
    expect(result.text).toContain('Safer TypeScript systems');
    expect(result.text.length).toBeLessThanOrEqual(3_000);
    expect(result.text.toLowerCase()).not.toMatch(/published|verified source/);
  });
});
