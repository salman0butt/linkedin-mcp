import type { ArticleDraft } from './article-project.js';

export interface ArticleReviewWarning {
  readonly code: string;
  readonly message: string;
}

export interface ArticleReview {
  readonly readyForReview: boolean;
  readonly warnings: readonly ArticleReviewWarning[];
}

function warning(code: string, message: string): ArticleReviewWarning {
  return { code, message };
}

/** Editorial completeness, not fact-checking or permission to publish. */
export function validateArticleDraft(draft: Readonly<ArticleDraft>): ArticleReview {
  const warnings: ArticleReviewWarning[] = [];
  if (!draft.research.brief.trim()) warnings.push(warning('missing_brief', 'Add a research brief.'));
  if (draft.research.sources.length === 0) warnings.push(warning('missing_sources', 'Add source notes.'));
  if (draft.outline.length === 0) warnings.push(warning('empty_outline', 'Add an outline.'));
  if (draft.blocks.length === 0) warnings.push(warning('empty_body', 'Add article blocks.'));
  if (!draft.seo?.description?.trim()) warnings.push(warning('missing_seo', 'Add an SEO description.'));
  if (!draft.companionPost?.trim())
    warnings.push(warning('missing_companion', 'Add a companion post draft.'));

  if (draft.research.sources.length > 0) {
    warnings.push(warning('sources_unverified', 'All source notes are user-supplied and unverified.'));
    const attributed = new Set(draft.blocks.flatMap((block) => block.sourceIds ?? []));
    if (draft.blocks.some((block) => block.kind === 'paragraph' && !block.sourceIds?.length)) {
      warnings.push(warning('unattributed_block', 'One or more prose blocks have no associated sources.'));
    }
    if (draft.research.sources.some((source) => !attributed.has(source.id))) {
      warnings.push(
        warning('unused_sources', 'Some source notes are not associated with any article block.'),
      );
    }
  }

  const blocking = new Set([
    'missing_brief',
    'missing_sources',
    'empty_outline',
    'empty_body',
    'missing_seo',
    'missing_companion',
  ]);
  return { readyForReview: !warnings.some(({ code }) => blocking.has(code)), warnings };
}

// Escape markup and Markdown delimiter characters. The resulting preview
// never embeds active HTML, remote images, or untrusted Markdown links.
function escapeMarkdown(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\`*_{}[\]()#+.!|~-])/g, '\\$1')
    .replace(/:/g, '\\:');
}

export function previewArticleDraft(draft: Readonly<ArticleDraft>): {
  format: 'markdown';
  publicationStatus: 'not_published';
  sourceVerification: 'user_supplied_unverified';
  markdown: string;
  review: ArticleReview;
} {
  const lines: string[] = [
    `# ${escapeMarkdown(draft.title)}`,
    '',
    'Editorial draft only — not published. Source associations are user-supplied, unverified notes.',
    '',
  ];
  for (const block of draft.blocks) {
    const text = escapeMarkdown(block.text);
    switch (block.kind) {
      case 'heading':
        lines.push(`## ${text}`);
        break;
      case 'quote':
        lines.push(...text.split('\n').map((line) => `> ${line}`));
        break;
      case 'bullets':
        lines.push(
          ...text
            .split('\n')
            .filter(Boolean)
            .map((line) => `- ${line}`),
        );
        break;
      case 'code':
        lines.push('Code excerpt (escaped):', text);
        break;
      case 'image_placeholder':
        lines.push(`Image placeholder (not fetched): ${text}`);
        break;
      case 'paragraph':
        lines.push(text);
        break;
    }
    if (block.sourceIds?.length) {
      lines.push(`Source note IDs (unverified): ${block.sourceIds.map(escapeMarkdown).join(', ')}`);
    }
    lines.push('');
  }
  lines.push('## User-supplied, unverified sources', '');
  for (const source of draft.research.sources) {
    lines.push(
      `- ${escapeMarkdown(source.id)}: ${escapeMarkdown(source.title)} — ${escapeMarkdown(source.url)} (not checked)`,
    );
  }
  return {
    format: 'markdown',
    publicationStatus: 'not_published',
    sourceVerification: 'user_supplied_unverified',
    markdown: lines.join('\n'),
    review: validateArticleDraft(draft),
  };
}

export function createCompanionPostDraft(draft: Readonly<ArticleDraft>): {
  status: 'draft_only';
  text: string;
} {
  const title = draft.title.trim();
  const goal = draft.goal.trim();
  const text = [
    `Article idea: ${title}`,
    '',
    `Why I'm exploring this: ${goal}`,
    '',
    'Draft for discussion — feedback welcome.',
  ]
    .join('\n')
    .slice(0, 3_000);
  return { status: 'draft_only', text };
}
