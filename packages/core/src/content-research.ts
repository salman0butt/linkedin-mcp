import { isIP } from 'node:net';
import { types } from 'node:util';

/** Local analysis observes only what the caller provided. No source is verified or fetched. */
export interface ResearchSource {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly body: string;
  readonly publishedAt?: string;
  readonly sourceTrust: 'caller_supplied_unverified';
}

export interface ResearchCorpus {
  readonly topic: string;
  readonly focusTerms: readonly string[];
  readonly sources: readonly Readonly<ResearchSource>[];
  readonly sourceTrust: 'caller_supplied_unverified';
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u;
const isoUtc = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/u;
const MAX_INPUT_BYTES = 200 * 1024;

function invalid(label: string): never {
  // Never echo caller-authored content, links or alleged source/provider metadata.
  throw new Error('Invalid research corpus: ' + label);
}

function record(
  input: unknown,
  label: string,
  required: readonly string[],
  optional: readonly string[] = [],
) {
  if (input === null || typeof input !== 'object' || types.isProxy(input) || Array.isArray(input))
    invalid(label);
  if (Object.getPrototypeOf(input) !== Object.prototype) invalid(label);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const output: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || (!required.includes(key) && !optional.includes(key))) invalid(label);
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) invalid(label);
    output[key] = descriptor.value;
  }
  for (const key of required) if (!Object.hasOwn(descriptors, key)) invalid(label);
  return output;
}

function dense(input: unknown, label: string, max: number): readonly unknown[] {
  if (
    types.isProxy(input) ||
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    input.length > max
  ) {
    invalid(label);
  }
  if (Reflect.ownKeys(input).length !== input.length + 1) invalid(label);
  const out: unknown[] = [];
  for (let i = 0; i < input.length; i++) {
    const item = Object.getOwnPropertyDescriptor(input, String(i));
    if (!item || !item.enumerable || !('value' in item)) invalid(label);
    out.push(item.value);
  }
  return out;
}

function text(input: unknown, label: string, max: number, multiline = false): string {
  if (typeof input !== 'string' || input.length > max || !input.trim()) invalid(label);
  // Iteration by Unicode scalar distinguishes legitimate surrogate pairs from lone code units.
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    if (
      (cp >= 0xd800 && cp <= 0xdfff) ||
      (cp >= 127 && cp <= 159) ||
      (cp < 32 && (!multiline || (cp !== 9 && cp !== 10 && cp !== 13)))
    )
      invalid(label);
  }
  return multiline ? input : input.trim();
}

function publicSourceUrl(value: unknown): string {
  const raw = text(value, 'source.url', 2048);
  if (/\s|\\|%(?:0[0-9a-f]|1[0-9a-f]|7f)|%(?![0-9a-f]{2})/iu.test(raw)) invalid('source.url');
  // A control escape can be hidden behind nested percent encoding, even when
  // the original URL has no literal controls. This URL is display-only.
  let decodedUrl = raw;
  for (let depth = 0; depth < 4; depth++) {
    if (/%(?:0[0-9a-f]|1[0-9a-f]|7f)/iu.test(decodedUrl)) invalid('source.url');
    if (/\p{Cc}/u.test(decodedUrl)) invalid('source.url');
    if (!/%[0-9a-f]{2}/iu.test(decodedUrl)) break;
    if (depth === 3) invalid('source.url');
    try {
      decodedUrl = decodeURIComponent(decodedUrl);
    } catch {
      invalid('source.url');
    }
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return invalid('source.url');
  }
  const host = url.hostname.toLowerCase();
  const labels = host.split('.');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !host.includes('.') ||
    isIP(host) !== 0 ||
    labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label)) ||
    /(?:^|\.)(?:localhost|local|internal|private|corp|lan|home\.arpa|test|invalid|nip\.io|sslip\.io|localtest\.me)$/u.test(
      host,
    )
  )
    invalid('source.url');
  for (const key of url.searchParams.keys()) {
    let decoded = key;
    for (let depth = 0; depth < 4; depth++) {
      const normalized = decoded.toLowerCase().replace(/[^a-z0-9]/gu, '');
      if (
        /token|secret|credential|signature|auth|password|passwd|jwt|session|sas|(?:^|.+)key$|(?:accesskeyid|accessid|keyid)$|^sig$|^pwd$|^xamz|^xgoog|^xms|^(?:code|accesscode|ticket)$/u.test(
          normalized,
        )
      )
        invalid('source.url');
      if (!/%[0-9a-f]{2}/iu.test(decoded)) break;
      if (depth === 3) invalid('source.url');
      try {
        decoded = decodeURIComponent(decoded);
      } catch {
        invalid('source.url');
      }
    }
  }
  if (url.href.length > 2048) invalid('source.url');
  return url.href;
}

function reportedDate(input: unknown): string {
  if (typeof input !== 'string' || !isoUtc.test(input)) invalid('source.publishedAt');
  const date = new Date(input);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== input.slice(0, 10))
    invalid('source.publishedAt');
  return input;
}

/**
 * Normalize a small deterministic local corpus without querying external services.
 * Caller-supplied publication dates, citations and text never become verified facts.
 */
export function normalizeResearchCorpus(input: unknown): Readonly<ResearchCorpus> {
  const value = record(input, 'input', ['topic', 'sources'], ['focusTerms']);
  const topic = text(value.topic, 'topic', 200);
  const terms = value.focusTerms === undefined ? [] : dense(value.focusTerms, 'focusTerms', 12);
  const focusTerms: string[] = [];
  const seenTerms = new Set<string>();
  for (const term of terms) {
    const normalized = text(term, 'focusTerm', 80);
    const key = normalized.toLowerCase();
    if (seenTerms.has(key)) invalid('duplicate focusTerm');
    focusTerms.push(normalized);
    seenTerms.add(key);
  }
  const rawSources = dense(value.sources, 'sources', 20);
  if (rawSources.length < 1) invalid('sources');
  const sources: Readonly<ResearchSource>[] = [];
  const ids = new Set<string>();
  for (const raw of rawSources) {
    const src = record(raw, 'source', ['id', 'title', 'url', 'body'], ['publishedAt']);
    const id = text(src.id, 'source.id', 80);
    if (!idPattern.test(id) || ids.has(id)) invalid('source.id');
    ids.add(id);
    const title = text(src.title, 'source.title', 240);
    const url = publicSourceUrl(src.url);
    const body = text(src.body, 'source.body', 50_000, true);
    const publishedAt = Object.hasOwn(src, 'publishedAt') ? reportedDate(src.publishedAt) : undefined;
    sources.push(
      Object.freeze({
        id,
        title,
        url,
        body,
        ...(publishedAt === undefined ? {} : { publishedAt }),
        sourceTrust: 'caller_supplied_unverified' as const,
      }),
    );
  }
  const normalized = {
    topic,
    focusTerms: Object.freeze(focusTerms),
    sources: Object.freeze(sources),
    sourceTrust: 'caller_supplied_unverified' as const,
  };
  // JSON backslash/quote escaping grows the serialized size, so measuring
  // raw string byte sums would permit substantially oversized wire payloads.
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_INPUT_BYTES) invalid('input bytes');
  return Object.freeze(normalized);
}
