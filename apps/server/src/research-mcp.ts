import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { analyzeResearchCorpus, ResearchOutputTooLargeError } from './research/content-analysis.js';
import { compareResearchCohorts } from './research/corpus-comparison.js';
import { prepareResearchRepurposingEvidence } from './research/repurposing-evidence.js';
import { groupResearchThemes } from './research/theme-grouping.js';
import { indexResearchReferences } from './research/reference-register.js';

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
const referenceIndexInput = z.strictObject(
  {
    sources: z.array(source).min(1).max(20),
  },
  { error: () => 'Invalid local reference index request fields.' },
);
const comparisonCohortInput = z.strictObject(
  {
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(80),
    sourceIds: z.array(z.string().min(1).max(80)).min(1).max(20),
  },
  { error: () => 'Invalid caller-defined cohort fields.' },
);
const cohortComparisonInput = z.strictObject(
  {
    topic: z.string().min(1).max(200),
    focusTerms: z.array(z.string().min(1).max(80)).min(1).max(12),
    sources: z.array(source).min(2).max(20),
    cohorts: z.array(comparisonCohortInput).length(2),
    unmatchedSourceIds: z.array(z.string().min(1).max(80)).max(20),
  },
  { error: () => 'Invalid corpus comparison request fields.' },
);
const repurposingSelectionInput = z.strictObject(
  {
    sourceId: z.string().min(1).max(80),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  },
  { error: () => 'Invalid caller-selected evidence fields.' },
);
const repurposingTargetInput = z.strictObject(
  {
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(80),
    format: z.enum(['post', 'article', 'carousel']),
    selections: z.array(repurposingSelectionInput).min(1).max(12),
  },
  { error: () => 'Invalid caller-selected target fields.' },
);
const repurposingInput = z.strictObject(
  {
    topic: z.string().min(1).max(200),
    sources: z.array(source).min(1).max(20),
    targets: z.array(repurposingTargetInput).min(1).max(3),
  },
  { error: () => 'Invalid local repurposing request fields.' },
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
const referenceIndexData = z
  .object({
    kind: z.literal('local_reference_register'),
    status: z.literal('available'),
    referenceOrigin: z.literal('caller_supplied'),
    sourceTrust: z.literal('caller_supplied_unverified'),
    verification: z.literal('not_performed'),
    sourceSummaries: output.shape.data.unwrap().shape.sourceSummaries,
    repeatedUrlGroups: z
      .array(
        z
          .object({
            url: z.string().max(2048),
            sourceIds: z.array(z.string().max(80)).min(2).max(20),
          })
          .strict(),
      )
      .max(10),
    singleUrlSourceIds: z.array(z.string().max(80)).max(20),
    warnings: z
      .array(
        z.enum([
          'caller_sources_unverified',
          'same_url_not_independent_confirmation',
          'dates_caller_reported_only',
        ]),
      )
      .min(2)
      .max(3),
  })
  .strict();
const referenceIndexOutput = z
  .object({
    status: output.shape.status,
    data: referenceIndexData.optional(),
    provider: output.shape.provider,
    error: output.shape.error,
    metadata: output.shape.metadata,
  })
  .strict();
const cohortTermObservation = z
  .object({
    term: z.string().min(1).max(80),
    state: z.enum(['observed_in_supplied_cohort', 'not_observed_in_supplied_cohort']),
    evidence: z.array(evidence).max(20),
  })
  .strict();
const cohortComparisonData = z
  .object({
    kind: z.literal('local_caller_defined_corpus_comparison'),
    status: z.literal('available'),
    comparisonOrigin: z.literal('caller_defined_cohorts'),
    sourceTrust: z.literal('caller_supplied_unverified'),
    verification: z.literal('not_performed'),
    topic: z.string().max(200),
    focusTerms: z.array(z.string().min(1).max(80)).min(1).max(12),
    sourceSummaries: output.shape.data.unwrap().shape.sourceSummaries,
    cohorts: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            label: z.string().min(1).max(80),
            sourceIds: z.array(z.string().min(1).max(80)).min(1).max(20),
            termObservations: z.array(cohortTermObservation).min(1).max(12),
          })
          .strict(),
      )
      .length(2),
    unmatchedSourceIds: z.array(z.string().min(1).max(80)).max(20),
    warnings: z
      .array(
        z.enum([
          'caller_sources_unverified',
          'comparison_is_corpus_only',
          'cohorts_caller_defined_only',
          'single_source_cohort',
          'unmatched_sources_excluded',
          'dates_caller_reported_only',
        ]),
      )
      .min(3)
      .max(6),
  })
  .strict();
const cohortComparisonOutput = z
  .object({
    status: output.shape.status,
    data: cohortComparisonData.optional(),
    provider: output.shape.provider,
    error: output.shape.error,
    metadata: output.shape.metadata,
  })
  .strict();
const repurposingEvidenceData = z
  .object({
    kind: z.literal('local_caller_curated_repurposing_evidence'),
    status: z.literal('available'),
    selectionOrigin: z.literal('caller_defined_utf16_offsets'),
    sourceTrust: z.literal('caller_supplied_unverified'),
    verification: z.literal('not_performed'),
    topic: z.string().max(200),
    sourceSummaries: output.shape.data.unwrap().shape.sourceSummaries,
    targets: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            label: z.string().min(1).max(80),
            format: z.enum(['post', 'article', 'carousel']),
            excerpts: z.array(evidence).min(1).max(12),
          })
          .strict(),
      )
      .min(1)
      .max(3),
    warnings: z
      .array(
        z.enum([
          'caller_sources_unverified',
          'selections_caller_defined_only',
          'evidence_is_excerpt_only',
          'human_review_required',
          'dates_caller_reported_only',
        ]),
      )
      .min(4)
      .max(5),
  })
  .strict();
const repurposingEvidenceOutput = z
  .object({
    status: output.shape.status,
    data: repurposingEvidenceData.optional(),
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
  server.registerTool(
    'linkedin.research.index_references',
    {
      description:
        'Read-only stateless catalog of 1–20 caller-supplied unverified references grouped by exact canonical display URL; no storage, URL fetching, verification or independent corroboration.',
      inputSchema: referenceIndexInput,
      outputSchema: referenceIndexOutput,
    },
    (input) => {
      try {
        const result = reply(deps, 'succeeded', indexResearchReferences(input));
        if (!referenceIndexOutput.safeParse(result.structuredContent).success)
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
    'linkedin.research.compare_cohorts',
    {
      description:
        'Read-only comparison of literal focus-term observations inside two disjoint caller-defined source cohorts; supplied excerpts are unverified, with no inferred trends, market or competitor gaps.',
      inputSchema: cohortComparisonInput,
      outputSchema: cohortComparisonOutput,
    },
    (input) => {
      try {
        const result = reply(deps, 'succeeded', compareResearchCohorts(input));
        if (!cohortComparisonOutput.safeParse(result.structuredContent).success)
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
    'linkedin.research.prepare_repurposing',
    {
      description:
        'Read-only caller-curated exact UTF-16 evidence excerpts for human-selected post, article or carousel targets. Sources and dates are unverified; does not generate drafts, fetch sources or publish.',
      inputSchema: repurposingInput,
      outputSchema: repurposingEvidenceOutput,
    },
    (input) => {
      try {
        const result = reply(deps, 'succeeded', prepareResearchRepurposingEvidence(input));
        if (!repurposingEvidenceOutput.safeParse(result.structuredContent).success)
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
