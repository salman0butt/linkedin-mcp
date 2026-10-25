import { isIP } from 'node:net';
import { types as utilTypes } from 'node:util';

/** Author-authored source links are associations, not independently checked evidence. */
export interface ArticleSource {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly notes?: string;
  readonly provenance: 'user_supplied_unverified';
}

export interface ArticleOutlineItem {
  readonly id: string;
  readonly heading: string;
  readonly notes?: string;
}

export type ArticleBlockKind = 'heading' | 'paragraph' | 'bullets' | 'quote' | 'code' | 'image_placeholder';

export interface ArticleBlock {
  readonly id: string;
  readonly kind: ArticleBlockKind;
  readonly text: string;
  readonly sourceIds?: readonly string[];
}

/** A local, inert author document. It carries no verified, approved or publication status. */
export interface ArticleDraft {
  readonly title: string;
  readonly topic: string;
  readonly audience: string;
  readonly goal: string;
  readonly research: Readonly<{ brief: string; sources: readonly ArticleSource[] }>;
  readonly outline: readonly ArticleOutlineItem[];
  readonly blocks: readonly ArticleBlock[];
  readonly seo?: Readonly<{
    slug?: string;
    description?: string;
    keywords?: readonly string[];
  }>;
  readonly media?: Readonly<{ coverDescription?: string; altText?: string }>;
  readonly companionPost?: string;
  /** Author-selected editorial state; never treated as fact verification or publication approval. */
  readonly review: Readonly<{ state: 'draft' | 'needs_review' | 'reviewed'; notes?: string }>;
}

const MAX_SOURCES = 30;
const MAX_OUTLINE = 25;
const MAX_BLOCKS = 80;
const MAX_WORDS = 12_000;
const MAX_JSON_BYTES = 200 * 1024;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BLOCK_KINDS: readonly ArticleBlockKind[] = [
  'heading',
  'paragraph',
  'bullets',
  'quote',
  'code',
  'image_placeholder',
];

function invalid(location: string): never {
  // Never place untrusted author prose, IDs or URLs into errors.
  throw new Error('Invalid article draft: ' + location);
}

function plainRecord(value: unknown, label: string, allowed: readonly string[]): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    utilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Array.isArray(value)
  ) {
    return invalid(label);
  }
  const object = value as Record<string, unknown>;
  for (const key of Reflect.ownKeys(object)) {
    if (typeof key !== 'string' || !allowed.includes(key)) invalid(label);
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) invalid(label);
  }
  return object;
}

function ownField(object: Record<string, unknown>, key: string): unknown {
  // plainRecord already checked all own descriptors are data descriptors.
  // Missing keys must not resolve through Object.prototype getters.
  return Object.getOwnPropertyDescriptor(object, key)?.value;
}

function denseArray(value: unknown, label: string, max: number): readonly unknown[] {
  if (
    utilTypes.isProxy(value) ||
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > max
  )
    invalid(label);
  const values = value as unknown[];
  // Prevent sparse arrays, custom fields, symbol keys and accessor-backed slots.
  if (Reflect.ownKeys(values).length !== values.length + 1) invalid(label);
  for (let index = 0; index < values.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) invalid(label);
  }
  return values;
}

function textField(
  value: unknown,
  label: string,
  max: number,
  options: Readonly<{ allowEmpty?: boolean; preserve?: boolean; singleLine?: boolean }> = {},
): string {
  if (typeof value !== 'string' || value.length > max) invalid(label);
  const trimmed = value.trim();
  if (!options.allowEmpty && !trimmed) invalid(label);
  // Keep paragraph and code text verbatim. Ban non-text control characters.
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) invalid(label);
  }
  if (options.singleLine && /[\r\n]/u.test(value)) invalid(label);
  return options.preserve ? value : trimmed;
}

function optionalText(
  object: Record<string, unknown>,
  key: string,
  label: string,
  max: number,
  options: Readonly<{ preserve?: boolean; singleLine?: boolean }> = {},
): string | undefined {
  return Object.hasOwn(object, key) ? textField(ownField(object, key), label, max, options) : undefined;
}

function identifier(value: unknown, label: string, seen: Set<string>): string {
  const result = textField(value, label, 80, { singleLine: true });
  if (!ID_PATTERN.test(result) || seen.has(result)) invalid(label);
  seen.add(result);
  return result;
}

function sourceUrl(value: unknown): string {
  const source = textField(value, 'source.url', 2048, { singleLine: true });
  if (/\s|\\|%(?:0[0-9a-f]|1[0-9a-f]|7f)/iu.test(source)) invalid('source.url');
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    return invalid('source.url');
  }
  // Links are local display references only. Keep out host credentials, local
  // addresses and other schemes so later renderers/research tools cannot silently
  // upgrade an unsafe input into trusted network access.
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    // URL fragments may contain bearer tokens or signed access material.
    // They are not required for inert source-reference links.
    parsed.hash ||
    parsed.port ||
    !host.includes('.') ||
    isIP(host) !== 0 ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.home.arpa') ||
    host.split('.').some((part) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(part))
  ) {
    invalid('source.url');
  }
  for (const key of parsed.searchParams.keys()) {
    // URLSearchParams decodes keys once; some consumers may decode again.
    // Inspect bounded nested encodings and compare separator-insensitively.
    // Bare authorization codes, access codes and login tickets are also
    // credential-bearing, unlike ordinary query keys such as languageCode.
    let decodedKey = key;
    for (let depth = 0; depth < 4; depth += 1) {
      const normalizedKey = decodedKey.toLowerCase().replace(/[^a-z0-9]/gu, '');
      if (
        /token|secret|credential|signature|auth|password|passwd|jwt|session|sas|(?:^|.+)key$|^sig$|^pwd$|^xamz|^xgoog|^xms|^(?:code|accesscode|ticket)$/u.test(
          normalizedKey,
        )
      ) {
        invalid('source.url');
      }
      if (!/%[0-9a-f]{2}/iu.test(decodedKey)) break;
      if (depth === 3) invalid('source.url');
      try {
        decodedKey = decodeURIComponent(decodedKey);
      } catch {
        invalid('source.url');
      }
    }
  }
  return parsed.href;
}

function optionalNotes(object: Record<string, unknown>, label: string): { notes?: string } {
  const notes = optionalText(object, 'notes', label, 2_000, { preserve: true });
  return notes === undefined ? {} : { notes };
}

function countWords(parts: readonly string[]): number {
  let total = 0;
  for (const part of parts) {
    total += part.match(/\S+/gu)?.length ?? 0;
    if (total > MAX_WORDS) return total;
  }
  return total;
}

/**
 * Parse unknown caller input as a canonical, inert local author document.
 * No external URLs are visited and caller-provided trust/publication claims
 * never become part of the returned object.
 */
export function normalizeArticleDraft(input: unknown): ArticleDraft {
  const root = plainRecord(input, 'root', [
    'title',
    'topic',
    'audience',
    'goal',
    'research',
    'outline',
    'blocks',
    'seo',
    'media',
    'companionPost',
    'review',
  ]);
  const title = textField(ownField(root, 'title'), 'title', 200, { singleLine: true });
  const topic = textField(ownField(root, 'topic'), 'topic', 200, { singleLine: true });
  const audience = textField(ownField(root, 'audience'), 'audience', 240, { singleLine: true });
  const goal = textField(ownField(root, 'goal'), 'goal', 500);
  const words: string[] = [title, topic, audience, goal];
  const seenIds = new Set<string>();

  const researchInput = plainRecord(ownField(root, 'research'), 'research', ['brief', 'sources']);
  const brief = textField(ownField(researchInput, 'brief'), 'research.brief', 16_000, {
    allowEmpty: true,
    preserve: true,
  });
  words.push(brief);
  const sources = denseArray(ownField(researchInput, 'sources'), 'research.sources', MAX_SOURCES).map(
    (item) => {
      const source = plainRecord(item, 'source', ['id', 'title', 'url', 'notes', 'provenance']);
      // Revalidating a previously normalized draft is allowed; provenance is never
      // accepted at any stronger value, and is always derived anew.
      if (
        Object.hasOwn(source, 'provenance') &&
        ownField(source, 'provenance') !== 'user_supplied_unverified'
      ) {
        invalid('source.provenance');
      }
      const id = identifier(ownField(source, 'id'), 'source.id', seenIds);
      const sourceTitle = textField(ownField(source, 'title'), 'source.title', 240, {
        singleLine: true,
      });
      const url = sourceUrl(ownField(source, 'url'));
      const notes = optionalNotes(source, 'source.notes');
      words.push(sourceTitle);
      if (notes.notes) words.push(notes.notes);
      return Object.freeze({
        id,
        title: sourceTitle,
        url,
        ...notes,
        provenance: 'user_supplied_unverified' as const,
      });
    },
  );
  const sourceIds = new Set(sources.map((source) => source.id));
  const research = Object.freeze({ brief, sources: Object.freeze(sources) });

  const outline = denseArray(ownField(root, 'outline'), 'outline', MAX_OUTLINE).map((item) => {
    const entry = plainRecord(item, 'outline.item', ['id', 'heading', 'notes']);
    const id = identifier(ownField(entry, 'id'), 'outline.id', seenIds);
    const heading = textField(ownField(entry, 'heading'), 'outline.heading', 240, {
      singleLine: true,
    });
    const notes = optionalNotes(entry, 'outline.notes');
    words.push(heading);
    if (notes.notes) words.push(notes.notes);
    return Object.freeze({ id, heading, ...notes });
  });

  const blocks = denseArray(ownField(root, 'blocks'), 'blocks', MAX_BLOCKS).map((item) => {
    const entry = plainRecord(item, 'block', ['id', 'kind', 'text', 'sourceIds']);
    const rawKind = ownField(entry, 'kind');
    const id = identifier(ownField(entry, 'id'), 'block.id', seenIds);
    if (typeof rawKind !== 'string' || !BLOCK_KINDS.includes(rawKind as ArticleBlockKind)) {
      invalid('block.kind');
    }
    const kind = rawKind as ArticleBlockKind;
    const content = textField(ownField(entry, 'text'), 'block.text', 12_000, { preserve: true });
    if (kind === 'heading' && /[\r\n]/u.test(content)) invalid('block.text');
    words.push(content);
    let refs: readonly string[] | undefined;
    if (Object.hasOwn(entry, 'sourceIds')) {
      const checked = denseArray(ownField(entry, 'sourceIds'), 'block.sourceIds', MAX_SOURCES).map((ref) => {
        if (typeof ref !== 'string' || !sourceIds.has(ref)) invalid('block.sourceIds');
        return ref;
      });
      if (new Set(checked).size !== checked.length) invalid('block.sourceIds');
      refs = Object.freeze(checked);
    }
    return Object.freeze({ id, kind, text: content, ...(refs === undefined ? {} : { sourceIds: refs }) });
  });

  let seo: ArticleDraft['seo'];
  if (Object.hasOwn(root, 'seo')) {
    const entry = plainRecord(ownField(root, 'seo'), 'seo', ['slug', 'description', 'keywords']);
    const slug = optionalText(entry, 'slug', 'seo.slug', 120, { singleLine: true });
    if (slug !== undefined && !SLUG_PATTERN.test(slug)) invalid('seo.slug');
    const description = optionalText(entry, 'description', 'seo.description', 320);
    let keywords: readonly string[] | undefined;
    if (Object.hasOwn(entry, 'keywords')) {
      const normalized = denseArray(ownField(entry, 'keywords'), 'seo.keywords', 12).map((keyword) =>
        textField(keyword, 'seo.keyword', 80, { singleLine: true }),
      );
      if (new Set(normalized.map((keyword) => keyword.toLowerCase())).size !== normalized.length) {
        invalid('seo.keywords');
      }
      keywords = Object.freeze(normalized);
      words.push(...normalized);
    }
    if (description) words.push(description);
    seo = Object.freeze({
      ...(slug === undefined ? {} : { slug }),
      ...(description === undefined ? {} : { description }),
      ...(keywords === undefined ? {} : { keywords }),
    });
  }

  let media: ArticleDraft['media'];
  if (Object.hasOwn(root, 'media')) {
    const entry = plainRecord(ownField(root, 'media'), 'media', ['coverDescription', 'altText']);
    const coverDescription = optionalText(entry, 'coverDescription', 'media.coverDescription', 800, {
      preserve: true,
    });
    const altText = optionalText(entry, 'altText', 'media.altText', 320, { preserve: true });
    if (coverDescription) words.push(coverDescription);
    if (altText) words.push(altText);
    media = Object.freeze({
      ...(coverDescription === undefined ? {} : { coverDescription }),
      ...(altText === undefined ? {} : { altText }),
    });
  }

  const companionPost = optionalText(root, 'companionPost', 'companionPost', 3_000, {
    preserve: true,
  });
  if (companionPost) words.push(companionPost);

  const reviewInput = plainRecord(ownField(root, 'review'), 'review', ['state', 'notes']);
  const state = ownField(reviewInput, 'state');
  if (!['draft', 'needs_review', 'reviewed'].includes(state as string)) {
    invalid('review.state');
  }
  const reviewNotes = optionalNotes(reviewInput, 'review.notes');
  if (reviewNotes.notes) words.push(reviewNotes.notes);
  const review: ArticleDraft['review'] = Object.freeze({
    state: state as ArticleDraft['review']['state'],
    ...reviewNotes,
  });

  const normalized = Object.freeze({
    title,
    topic,
    audience,
    goal,
    research,
    outline: Object.freeze(outline),
    blocks: Object.freeze(blocks),
    ...(seo === undefined ? {} : { seo }),
    ...(media === undefined ? {} : { media }),
    ...(companionPost === undefined ? {} : { companionPost }),
    review,
  });
  if (
    countWords(words) > MAX_WORDS ||
    Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_JSON_BYTES
  ) {
    invalid('size');
  }
  return normalized;
}
