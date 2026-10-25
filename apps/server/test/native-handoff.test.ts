import { describe, expect, it, vi } from 'vitest';

import { prepareNativeArticleHandoff } from '../src/articles/native-handoff.js';

function draft() {
  return {
    title: 'Safe native article handoff',
    topic: 'Software engineering',
    audience: 'Engineers',
    goal: 'Explain a review-first workflow.',
    research: {
      brief: 'Notes written by the author, not independently checked.',
      sources: [{ id: 'src1', title: 'Author notes', url: 'https://example.org/research?topic=safety' }],
    },
    outline: [{ id: 'out1', heading: 'Main idea' }],
    blocks: [
      { id: 'h1', kind: 'heading', text: 'First heading' },
      { id: 'p1', kind: 'paragraph', text: 'First paragraph', sourceIds: ['src1'] },
      { id: 'list1', kind: 'bullets', text: 'One\nTwo' },
      { id: 'quote1', kind: 'quote', text: 'Author quote' },
      { id: 'code1', kind: 'code', text: 'const x = 1;' },
      { id: 'image1', kind: 'image_placeholder', text: 'Draw a diagram by hand' },
    ],
    seo: { slug: 'safe-native-article', description: 'Manual native editor preparation.' },
    media: { coverDescription: 'A line diagram', altText: 'Simple sequence' },
    companionPost: 'Suggested copy, not a published post.',
    review: { state: 'reviewed' },
  };
}

describe('M09 pure manual native article editor handoff', () => {
  it('labels local handoff, availability and provenance without any publication or approval claim', () => {
    const result = prepareNativeArticleHandoff(draft());
    expect(result).toMatchObject({
      schemaVersion: 1,
      kind: 'manual_editor_handoff',
      manualOnly: true,
      publicationStatus: 'not_published',
      nativePublishAvailability: 'UNAVAILABLE',
      provider: 'LOCAL_ONLY',
      requiresHumanReview: true,
      title: 'Safe native article handoff',
      seo: {
        suggestedTitle: 'Safe native article handoff',
        slug: 'safe-native-article',
        description: 'Manual native editor preparation.',
        keywords: [],
      },
      cover: { description: 'A line diagram', altText: 'Simple sequence', manualUploadRequired: true },
    });
    expect(result.sources).toEqual([
      {
        id: 'src1',
        title: 'Author notes',
        url: 'https://example.org/research?topic=safety',
        provenance: 'user_supplied_unverified',
      },
    ]);
    expect(result.review.readyForReview).toBe(true);
    expect(result.review.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'sources_unverified' })]),
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.orderedBlocks)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/"(?:publishedAt|approved|providerAccess|publisherToken)"/u);
  });

  it('preserves authored order, exact plain text, source-note IDs and manual formatting restrictions', () => {
    const result = prepareNativeArticleHandoff(draft());
    expect(
      result.orderedBlocks.map((block) => [
        block.order,
        block.id,
        block.kind,
        block.plainText,
        block.editorMapping,
      ]),
    ).toEqual([
      [0, 'h1', 'heading', 'First heading', 'heading'],
      [1, 'p1', 'paragraph', 'First paragraph', 'paragraph'],
      [2, 'list1', 'bullets', 'One\nTwo', 'unordered_list'],
      [3, 'quote1', 'quote', 'Author quote', 'blockquote'],
      [4, 'code1', 'code', 'const x = 1;', 'code_manual'],
      [5, 'image1', 'image_placeholder', 'Draw a diagram by hand', 'image_manual_placeholder'],
    ]);
    expect(result.orderedBlocks[1]?.sourceIds).toEqual(['src1']);
    expect(result.orderedBlocks[5]?.requiresHumanFormatting).toBe(true);
    expect(result.orderedBlocks[5]?.lossWarnings).toContain('image_placeholder_manual_upload');
    for (const block of result.orderedBlocks) {
      expect(typeof block.editorMapping).toBe('string');
      expect(Array.isArray(block.lossWarnings)).toBe(true);
      expect(Array.isArray(block.sourceIds)).toBe(true);
    }
  });

  it('keeps adversarial prose literal and inert, without building HTML, links or remote embeds', () => {
    const input = draft();
    input.blocks[1]!.text = '<script>alert(1)</script> ![tracking](https://attacker.invalid/x)';
    const result = prepareNativeArticleHandoff(input);
    expect(result.orderedBlocks[1]?.plainText).toBe(input.blocks[1]?.text);
    expect(Object.keys(result)).not.toContain('html');
    expect(JSON.stringify(result)).not.toMatch(/"(?:script|embedUrl|renderedHtml|executed)"/u);
  });

  it('handles incomplete article work without filling unprovided SEO or source verification data', () => {
    const input = draft();
    input.research.sources = [];
    input.blocks = [];
    delete (input as Record<string, unknown>).seo;
    delete (input as Record<string, unknown>).media;
    delete (input as Record<string, unknown>).companionPost;
    const result = prepareNativeArticleHandoff(input);
    expect(result.orderedBlocks).toEqual([]);
    expect(result.review.readyForReview).toBe(false);
    expect(result.review.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'empty_body' })]),
    );
    expect(result.seo.description).toBeNull();
    expect(result.seo.slug).toBeNull();
    expect(result.cover.description).toBeNull();
    expect(result.warnings).toEqual(
      expect.arrayContaining(['missing_slug', 'missing_seo_description', 'missing_cover']),
    );
    expect(result.manualOnly).toBe(true);
  });

  it('preserves Unicode, code indentation, repeated blocks and deterministic output', () => {
    const input = draft();
    input.blocks[4]!.text = '  if (true) {\n    console.log("سلام 世界 🧑‍💻");\n  }';
    input.blocks.push({ id: 'code2', kind: 'code', text: input.blocks[4]!.text });
    const first = prepareNativeArticleHandoff(input);
    expect(first.orderedBlocks.at(-1)?.plainText).toBe(input.blocks[4]!.text);
    expect(prepareNativeArticleHandoff(input)).toEqual(first);
    expect(JSON.stringify(first)).not.toContain('https://linkedin.com/rest/posts');
  });

  it('deep-freezes its output without changing caller-owned nested input values', () => {
    const input = draft();
    const before = JSON.stringify(input);
    const result = prepareNativeArticleHandoff(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(result.seo)).toBe(true);
    expect(Object.isFrozen(result.cover)).toBe(true);
    expect(Object.isFrozen(result.sources[0])).toBe(true);
    expect(Object.isFrozen(result.review)).toBe(true);
    expect(Object.isFrozen(result.review.warnings)).toBe(true);
    expect(Object.isFrozen(result.review.warnings[0])).toBe(true);
    expect(Object.isFrozen(result.orderedBlocks[1])).toBe(true);
    expect(Object.isFrozen(result.orderedBlocks[1]?.sourceIds)).toBe(true);
    expect(Object.isFrozen(result.orderedBlocks[1]?.lossWarnings)).toBe(true);
    expect(Object.isFrozen(result.warnings)).toBe(true);
    input.blocks[1]!.text = 'Changed after handoff';
    expect(result.orderedBlocks[1]?.plainText).toBe('First paragraph');
  });

  it('preserves every block and reference in a near-limit valid local handoff', () => {
    const input = draft();
    const sourceIds = Array.from({ length: 30 }, (_, i) => `src_${i}_${'x'.repeat(50)}`);
    input.research.sources = sourceIds.map((id) => ({
      id,
      title: id,
      url: `https://example.org/research/${id}`,
    }));
    input.blocks = Array.from({ length: 80 }, (_, i) => ({
      id: `block_${i}`,
      kind: 'paragraph',
      text: 'Z'.repeat(500),
      sourceIds,
    }));
    const result = prepareNativeArticleHandoff(input);
    expect(result.orderedBlocks).toHaveLength(80);
    expect(result.sources).toHaveLength(30);
    expect(result.orderedBlocks[79]?.plainText).toBe('Z'.repeat(500));
    expect(result.orderedBlocks[79]?.sourceIds).toEqual(sourceIds);
    expect(result.sources.every((item) => item.provenance === 'user_supplied_unverified')).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(224 * 1024);
  });

  it('rejects hostile nested accessors and proxy inputs without invoking them', () => {
    const getter = vi.fn(() => 'hidden');
    const input = draft();
    Object.defineProperty(input.blocks[0], 'text', { get: getter, enumerable: true });
    expect(() => prepareNativeArticleHandoff(input)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    const proxied = draft();
    proxied.research.sources[0] = new Proxy(proxied.research.sources[0]!, {
      get() {
        throw new Error('sensitive proxy message');
      },
    });
    expect(() => prepareNativeArticleHandoff(proxied)).toThrow();
  });

  it('refuses malformed surrogate text rather than silently changing it during UTF-8 handoff', () => {
    const input = draft();
    input.blocks[1]!.text = 'Before\ud800after';
    expect(() => prepareNativeArticleHandoff(input)).toThrow();
  });

  it('rejects malformed surrogate in a source URL before URL canonicalization can replace it', () => {
    const input = draft();
    input.research.sources[0]!.url = 'https://example.org/path-\ud800-segment';
    expect(() => prepareNativeArticleHandoff(input)).toThrow();
  });

  it('rejects forged trusted source, approvals, publishing status and local path input', () => {
    for (const extra of [
      { published: true },
      { approved: true },
      { provider: 'OFFICIAL_API' },
      { filePath: '/tmp/leak.json' },
    ]) {
      expect(() => prepareNativeArticleHandoff({ ...draft(), ...extra })).toThrow();
    }
    expect(() =>
      prepareNativeArticleHandoff({
        ...draft(),
        research: {
          brief: 'x',
          sources: [{ id: 'src1', title: 'Fake', url: 'https://user:pw@example.org/' }],
        },
      }),
    ).toThrow();
  });
});
