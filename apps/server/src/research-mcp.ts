import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { analyzeResearchCorpus, ResearchOutputTooLargeError } from './research/content-analysis.js';
import { groupResearchThemes } from './research/theme-grouping.js';

interface ResearchDeps {
  createRequestId: () => string;
  now: () => Date;
}

const source = z.strictObject(
  {
    id: z.string().min(1).max(80),
    title: z.string().min(1).max(240),
    url: z.string().min(1).max(2048),
    body: z.string().min(1).max(50_000),
    publishedAt: z.string().max(30).optional(),
  },
  { error: () => 'Invalid research source fields.' },
);
const researchInput = z.strictObject(
  {
    topic: z.string().min(1).max(200),
    focusTerms: z.array(z.string().min(1).max(80)).max(12).optional(),
    sources: z.array(source).min(1).max(20),
  },
  { error: () => 'Invalid research request fields.' },
);
const callerThemeInput = z.strictObject(
  {
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(80),
    phrases: z.array(z.string().min(1).max(80)).min(1).max(3),
  },
  { error: () => 'Invalid caller-defined theme fields.' },
);
const themeGroupingInput = z.strictObject(
  {
    topic: z.string().min(1).max(200),
    themes: z.array(callerThemeInput).min(1).max(4),
    sources: z.array(source).min(1).max(20),
  },
  { error: () => 'Invalid theme grouping request fields.' },
);
const evidence = z
  .object({
    sourceId: z.string().max(80),
    field: z.literal('body'),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    offsetUnit: z.literal('utf16'),
    endExclusive: z.literal(true),
    quote: z.string().max(160),
  })
  .strict();
const termCoverage = z
  .object({
    term: z.string().max(200),
    state: z.enum(['observed_in_supplied_corpus', 'not_observed_in_supplied_corpus']),
    evidence: z.array(evidence).max(20),
  })
  .strict();
const publicationDate = z.discriminatedUnion('state', [
  z.object({ state: z.literal('unknown') }).strict(),
  z
    .object({
      state: z.literal('reported'),
      publishedAt: z.string().max(30),
      sourceClaim: z.literal('caller_reported'),
    })
    .strict(),
]);
const output = z
  .object({
    status: z.enum(['succeeded', 'failed']),
    data: z
      .object({
        kind: z.literal('local_corpus_analysis'),
        status: z.enum(['available', 'insufficient_evidence']),
        sourceTrust: z.literal('caller_supplied_unverified'),
        verification: z.literal('not_performed'),
        topic: z.string().max(200),
        sourceSummaries: z
          .array(
            z
              .object({
                id: z.string().max(80),
                title: z.string().max(240),
                url: z.string().max(2048),
                publicationDate,
                sourceTrust: z.literal('caller_supplied_unverified'),
              })
              .strict(),
          )
          .max(20),
        termCoverage: z.array(termCoverage).max(13),
        duplicateGroups: z
          .array(
            z
              .object({
                sourceIds: z.array(z.string().max(80)).min(2).max(20),
              })
              .strict(),
          )
          .max(10),
        warnings: z
          .array(
            z.enum([
              'caller_sources_unverified',
              'coverage_is_corpus_only',
              'insufficient_sources',
              'dates_caller_reported_only',
            ]),
          )
          .max(4),
      })
      .strict()
      .optional(),
    provider: z.object({ type: z.literal('LOCAL_ONLY'), name: z.literal('linkedin-mcp') }).strict(),
    error: z
      .object({
        code: z.enum(['invalid_input', 'analysis_too_large', 'output_too_large', 'invalid_output']),
        message: z.string().max(120),
        retryable: z.literal(false),
      })
      .strict()
      .optional(),
    metadata: z.object({ requestId: z.string(), timestamp: z.string() }).strict(),
  })
  .strict();
const themeGroupingData = z
  .object({
    kind: z.literal('local_caller_defined_theme_grouping'),
    status: z.enum(['available', 'insufficient_evidence']),
    themeOrigin: z.literal('caller_defined'),
    sourceTrust: z.literal('caller_supplied_unverified'),
    verification: z.literal('not_performed'),
    topic: z.string().max(200),
    sourceSummaries: output.shape.data.unwrap().shape.sourceSummaries,
    themeGroups: z
      .array(
        z
          .object({
            id: z.string().max(80),
            label: z.string().max(80),
            sourceIds: z.array(z.string().max(80)).max(20),
            phrases: z.array(termCoverage).min(1).max(3),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    unmatchedSourceIds: z.array(z.string().max(80)).max(20),
    warnings: z
      .array(
        z.enum([
          'caller_sources_unverified',
          'coverage_is_corpus_only',
          'insufficient_sources',
          'dates_caller_reported_only',
          'themes_caller_defined_only',
        ]),
      )
      .max(5),
  })
  .strict();
const themeGroupingOutput = z
  .object({
    status: output.shape.status,
    data: themeGroupingData.optional(),
    provider: output.shape.provider,
    error: output.shape.error,
    metadata: output.shape.metadata,
  })
  .strict();

const MAX_RESULT_BYTES = 262_144;
const WIRE_ALLOWANCE_BYTES = 2_048;

function reply(
  deps: ResearchDeps,
  status: 'succeeded' | 'failed',
  data?: unknown,
  code?: 'invalid_input' | 'analysis_too_large' | 'output_too_large' | 'invalid_output',
) {
  const hostRequestId = deps.createRequestId();
  // The host normally supplies a UUID, but injected hosts must not be able to
  // defeat the complete dual-copy reply budget (including the error fallback).
  const requestId = /^[A-Za-z0-9_-]{1,128}$/u.test(hostRequestId) ? hostRequestId : 'invalid-request-id';
  const metadata = { requestId, timestamp: deps.now().toISOString() };
  const base = {
    status,
    ...(data === undefined ? {} : { data }),
    provider: { type: 'LOCAL_ONLY' as const, name: 'linkedin-mcp' as const },
    ...(code === undefined
      ? {}
      : {
          error: {
            code,
            message: 'Research content could not be safely analyzed.',
            retryable: false as const,
          },
        }),
    metadata,
  };
  let value = base;
  let json = JSON.stringify(value);
  const resultBytes =
    Buffer.byteLength(
      JSON.stringify({
        content: [{ type: 'text', text: json }],
        structuredContent: value,
      }),
      'utf8',
    ) + WIRE_ALLOWANCE_BYTES;
  if (resultBytes > MAX_RESULT_BYTES) {
    value = {
      status: 'failed' as const,
      provider: base.provider,
      error: {
        code: 'output_too_large' as const,
        message: 'Research content could not be safely analyzed.',
        retryable: false as const,
      },
      metadata,
    };
    json = JSON.stringify(value);
  }
  return {
    content: [{ type: 'text' as const, text: json }],
    structuredContent: value,
    ...(value.status === 'succeeded' ? {} : { isError: true as const }),
  };
}

/** Stateless deterministic local analysis: no LinkedIn API or external research provider. */
export function registerResearchTools(server: McpServer, deps: ResearchDeps): void {
  server.registerTool(
    'linkedin.research.analyze',
    {
      description:
        'Read-only literal evidence analysis of 1–20 unverified caller-supplied research references; not verified trends, web search or market research.',
      inputSchema: researchInput,
      outputSchema: output,
    },
    (input) => {
      try {
        const result = reply(deps, 'succeeded', analyzeResearchCorpus(input));
        if (!output.safeParse(result.structuredContent).success)
          return reply(deps, 'failed', undefined, 'invalid_output');
        return result;
      } catch (error) {
        return reply(
          deps,
          'failed',
          undefined,
          error instanceof ResearchOutputTooLargeError ? 'analysis_too_large' : 'invalid_input',
        );
      }
    },
  );
  server.registerTool(
    'linkedin.research.group_themes',
    {
      description:
        'Read-only grouping of literal evidence under caller-defined themes in unverified supplied excerpts; never external research, inferred trends or market gaps.',
      inputSchema: themeGroupingInput,
      outputSchema: themeGroupingOutput,
    },
    (input) => {
      try {
        const result = reply(deps, 'succeeded', groupResearchThemes(input));
        if (!themeGroupingOutput.safeParse(result.structuredContent).success)
          return reply(deps, 'failed', undefined, 'invalid_output');
        return result;
      } catch (error) {
        return reply(
          deps,
          'failed',
          undefined,
          error instanceof ResearchOutputTooLargeError ? 'analysis_too_large' : 'invalid_input',
        );
      }
    },
  );
}
