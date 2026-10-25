import { normalizeArticleDraft, type ArticleBlock, type ArticleBlockKind } from './article-project.js';
import { validateArticleDraft, type ArticleReview } from './article-render.js';

const MAX_HANDOFF_BYTES = 224 * 1024;

export type NativeBlockMapping =
  | 'heading'
  | 'paragraph'
  | 'unordered_list'
  | 'blockquote'
  | 'code_manual'
  | 'image_manual_placeholder';

export class NativeHandoffError extends Error {
  constructor(readonly kind: 'invalid_input' | 'handoff_too_large') {
    super(
      kind === 'invalid_input'
        ? 'Invalid manual article handoff input.'
        : 'Manual article handoff exceeds its size limit.',
    );
    this.name = 'NativeHandoffError';
  }
}

export interface NativeEditorBlock {
  readonly order: number;
  readonly id: string;
  readonly kind: ArticleBlock['kind'];
  readonly plainText: string;
  readonly sourceIds: readonly string[];
  readonly editorMapping: NativeBlockMapping;
  readonly requiresHumanFormatting: boolean;
  readonly lossWarnings: readonly string[];
}

/** A copyable local package for a human using LinkedIn's native article editor. Never a publication claim. */
export interface NativeArticleHandoff {
  readonly schemaVersion: 1;
  readonly kind: 'manual_editor_handoff';
  readonly manualOnly: true;
  readonly publicationStatus: 'not_published';
  readonly nativePublishAvailability: 'UNAVAILABLE';
  readonly provider: 'LOCAL_ONLY';
  readonly title: string;
  readonly seo: Readonly<{
    suggestedTitle: string;
    slug: string | null;
    description: string | null;
    keywords: readonly string[];
  }>;
  readonly cover: Readonly<{
    description: string | null;
    altText: string | null;
    manualUploadRequired: true;
  }>;
  readonly orderedBlocks: readonly NativeEditorBlock[];
  readonly sources: readonly Readonly<{
    id: string;
    title: string;
    url: string;
    notes?: string;
    provenance: 'user_supplied_unverified';
  }>[];
  readonly review: ArticleReview;
  readonly warnings: readonly string[];
  readonly requiresHumanReview: true;
}

const mappings: Readonly<
  Record<ArticleBlockKind, { mapping: NativeBlockMapping; manual: boolean; warning?: string }>
> = {
  heading: { mapping: 'heading', manual: true, warning: 'heading_level_manual' },
  paragraph: { mapping: 'paragraph', manual: false },
  bullets: { mapping: 'unordered_list', manual: true, warning: 'list_formatting_manual' },
  quote: { mapping: 'blockquote', manual: true, warning: 'quote_attribution_manual' },
  code: { mapping: 'code_manual', manual: true, warning: 'code_formatting_manual' },
  image_placeholder: {
    mapping: 'image_manual_placeholder',
    manual: true,
    warning: 'image_placeholder_manual_upload',
  },
};

function hasMalformedSurrogate(value: unknown): boolean {
  if (typeof value === 'string') {
    for (let i = 0; i < value.length; i += 1) {
      const current = value.charCodeAt(i);
      if (current >= 0xd800 && current <= 0xdbff) {
        if (i + 1 >= value.length || value.charCodeAt(i + 1) < 0xdc00 || value.charCodeAt(i + 1) > 0xdfff)
          return true;
        i += 1;
      } else if (current >= 0xdc00 && current <= 0xdfff) return true;
    }
    return false;
  }
  if (Array.isArray(value)) return value.some(hasMalformedSurrogate);
  if (value !== null && typeof value === 'object') return Object.values(value).some(hasMalformedSurrogate);
  return false;
}

/** No browser, network, file I/O, credentials, host approval or publication side effects. */
export function prepareNativeArticleHandoff(input: unknown): NativeArticleHandoff {
  let draft;
  try {
    draft = normalizeArticleDraft(input);
  } catch {
    throw new NativeHandoffError('invalid_input');
  }
  // The URL constructor can silently replace a lone surrogate before the
  // normalized value reaches us. Inspect the original input only after M08's
  // strict shape/accessor/proxy validation has completed successfully.
  if (hasMalformedSurrogate(input) || hasMalformedSurrogate(draft)) {
    throw new NativeHandoffError('invalid_input');
  }
  const review = validateArticleDraft(draft);
  const orderedBlocks = Object.freeze(
    draft.blocks.map((block, index) => {
      const mapping = mappings[block.kind];
      return Object.freeze({
        order: index,
        id: block.id,
        kind: block.kind,
        plainText: block.text,
        sourceIds: Object.freeze([...(block.sourceIds ?? [])]),
        editorMapping: mapping.mapping,
        requiresHumanFormatting: mapping.manual,
        lossWarnings: Object.freeze(mapping.warning === undefined ? [] : [mapping.warning]),
      });
    }),
  );
  const sources = Object.freeze(draft.research.sources.map((source) => Object.freeze({ ...source })));
  const warnings = Object.freeze([
    'manual_copy_required',
    'publication_unavailable',
    'sources_unverified',
    ...(draft.seo?.slug === undefined ? ['missing_slug'] : []),
    ...(draft.seo?.description === undefined ? ['missing_seo_description'] : []),
    ...(draft.media?.coverDescription === undefined ? ['missing_cover'] : []),
    ...(draft.blocks.some((block) => block.kind !== 'paragraph') ? ['formatting_review_required'] : []),
    ...(draft.blocks.some((block) => block.kind === 'image_placeholder')
      ? ['image_placeholder_manual_upload']
      : []),
    ...(draft.outline.length || draft.research.brief || draft.review.notes || draft.companionPost
      ? ['editorial_context_not_automatically_transferred']
      : []),
  ]);
  const result: NativeArticleHandoff = Object.freeze({
    schemaVersion: 1,
    kind: 'manual_editor_handoff',
    manualOnly: true,
    publicationStatus: 'not_published',
    nativePublishAvailability: 'UNAVAILABLE',
    provider: 'LOCAL_ONLY',
    title: draft.title,
    seo: Object.freeze({
      suggestedTitle: draft.title,
      slug: draft.seo?.slug ?? null,
      description: draft.seo?.description ?? null,
      keywords: Object.freeze([...(draft.seo?.keywords ?? [])]),
    }),
    cover: Object.freeze({
      description: draft.media?.coverDescription ?? null,
      altText: draft.media?.altText ?? null,
      manualUploadRequired: true,
    }),
    orderedBlocks,
    sources,
    review: Object.freeze({
      readyForReview: review.readyForReview,
      warnings: Object.freeze(review.warnings.map((item) => Object.freeze({ ...item }))),
    }),
    warnings,
    requiresHumanReview: true,
  });
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_HANDOFF_BYTES) {
    throw new NativeHandoffError('handoff_too_large');
  }
  return result;
}
