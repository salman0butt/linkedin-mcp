import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { normalizedJobSchema } from './jobs-mcp.js';
import { createJobIntelligenceService } from './jobs/job-intelligence-service.js';

interface JobIntelligenceDeps {
  createRequestId: () => string;
  now: () => Date;
}

const candidate = z
  .object({
    skills: z.array(z.string().min(1).max(80)).max(80),
    yearsOfExperience: z.number().int().min(0).max(80).optional(),
    preferredWorkplace: z.enum(['remote', 'hybrid', 'on_site']).optional(),
    preferredLocations: z.array(z.string().min(1).max(120)).max(20).optional(),
  })
  .strict();

const analyzeInput = z.object({ job: normalizedJobSchema, candidate: candidate.optional() }).strict();
const compareInput = z
  .object({ jobs: z.array(normalizedJobSchema).min(2).max(10), candidate: candidate.optional() })
  .strict();
const envelope = z
  .object({
    status: z.enum(['succeeded', 'failed']),
    data: z.unknown().optional(),
    provider: z.object({ type: z.literal('LOCAL_ONLY'), name: z.literal('linkedin-mcp') }).strict(),
    error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).strict().optional(),
    metadata: z.object({ requestId: z.string(), timestamp: z.string() }).strict(),
  })
  .strict();

const sourceSpan = z
  .object({
    field: z.enum(['title', 'description']),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    offsetUnit: z.literal('utf16'),
  })
  .strict();
const signalSpan = z
  .object({
    field: z.enum(['title', 'description', 'location']),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    offsetUnit: z.literal('utf16'),
    endExclusive: z.literal(true),
    quote: z.string().max(240),
  })
  .strict();
const requirement = z
  .object({
    id: z.string().min(1).max(200),
    category: z.enum([
      'skill',
      'experience',
      'education',
      'language',
      'location',
      'work_authorization',
      'other',
    ]),
    priority: z.enum(['required', 'preferred', 'unspecified']),
    value: z.string().max(400),
    quote: z.string().max(400),
    sourceSpan,
    minimumYears: z.number().int().min(0).max(80).optional(),
  })
  .strict();
const extraction = z
  .object({
    requirements: z.array(requirement).max(50),
    truncated: z.boolean(),
    evidenceStatus: z.enum(['explicit', 'incomplete']),
    explanation: z.string().max(500).optional(),
  })
  .strict();
const signal = z
  .object({
    status: z.enum(['explicit_yes', 'explicit_no', 'unknown', 'conflicting']),
    evidence: z.array(signalSpan).max(8),
    jurisdictions: z.array(z.string().max(120)).max(8),
  })
  .strict();
const signals = z
  .object({
    workplace: z.enum(['remote', 'hybrid', 'on_site']).optional(),
    remoteEligibility: signal,
    sponsorship: signal,
    relocationAssistance: signal,
    workAuthorization: signal,
    company: z.object({ name: z.string().max(300), sourceTrust: z.literal('caller_supplied') }).strict(),
  })
  .strict();
const fitCommon = {
  scoreScope: z.literal('explicit_skills_only'),
  matched: z.array(requirement).max(50),
  missing: z.array(requirement).max(50),
  unknown: z.array(requirement).max(50),
  scoreCoverage: z
    .object({
      evaluatedSkillCount: z.number().int().min(0).max(50),
      unassessedRequiredCount: z.number().int().min(0).max(51),
      extractionTruncated: z.boolean(),
      extractionIncomplete: z.boolean(),
    })
    .strict(),
};
const fit = z.discriminatedUnion('status', [
  z
    .object({ status: z.literal('evaluated'), score: z.number().int().min(0).max(100), ...fitCommon })
    .strict(),
  z.object({ status: z.literal('insufficient_evidence'), ...fitCommon }).strict(),
]);
const postingDate = z.discriminatedUnion('state', [
  z.object({ state: z.literal('unknown') }).strict(),
  z
    .object({
      state: z.literal('reported'),
      postedAt: z.string().max(30),
      sourceClaim: z.literal('provider_reported'),
    })
    .strict(),
]);
const analysis = z
  .object({
    ref: z.object({ sourceId: z.string().min(1).max(100), jobId: z.string().min(1).max(256) }).strict(),
    sourceTrust: z.literal('caller_supplied'),
    source: z
      .object({
        provider: z.literal('EXTERNAL_DISCOVERY'),
        id: z.string().min(1).max(100),
        name: z.literal('Unverified user-supplied snapshot'),
        retrievedAt: z.string().max(30),
      })
      .strict(),
    title: z.string().min(1).max(300),
    companyName: z.string().min(1).max(300),
    canonicalUrl: z.string().max(2048).optional(),
    postingDate,
    extraction,
    signals,
    fit,
  })
  .strict();

const analyzeOutput = envelope.safeExtend({
  data: z
    .object({ status: z.literal('available'), analysis })
    .strict()
    .optional(),
});
const compareOutput = envelope.safeExtend({
  data: z
    .object({
      status: z.literal('available'),
      analyses: z.array(analysis).min(2).max(10),
      comparisonScope: z.literal('source_evidence_only'),
    })
    .strict()
    .optional(),
});

function reply(deps: JobIntelligenceDeps, status: 'succeeded' | 'failed', data?: unknown, code?: string) {
  let value: Record<string, unknown> = {
    status,
    ...(data === undefined ? {} : { data }),
    provider: { type: 'LOCAL_ONLY' as const, name: 'linkedin-mcp' as const },
    ...(code === undefined
      ? {}
      : {
          error: {
            code,
            message: 'Invalid job intelligence input or insufficient safe evidence.',
            retryable: false,
          },
        }),
    metadata: { requestId: deps.createRequestId(), timestamp: deps.now().toISOString() },
  };
  let json = JSON.stringify(value);
  // Bound the complete MCP envelope, not just the domain data (the protocol
  // serializes content.text and structuredContent independently).
  if (Buffer.byteLength(json, 'utf8') > 262_144) {
    value = {
      status: 'failed',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      error: {
        code: 'output_too_large',
        message: 'Job intelligence response exceeded safe size.',
        retryable: false,
      },
      metadata: value.metadata,
    };
    json = JSON.stringify(value);
  }
  return {
    content: [{ type: 'text' as const, text: json }],
    structuredContent: value,
    ...(value.status === 'succeeded' ? {} : { isError: true as const }),
  };
}

/** Local pure analysis: no LinkedIn token, network adapter, saved store or client-selected URI. */
export function registerJobIntelligenceTools(server: McpServer, deps: JobIntelligenceDeps): void {
  const service = createJobIntelligenceService();
  server.registerTool(
    'linkedin.jobs.analyze',
    {
      description:
        'Read-only deterministic job requirement, visa/remote evidence and advisory skill analysis of an explicitly unverified caller-provided job. Never submits an application.',
      inputSchema: analyzeInput,
      outputSchema: analyzeOutput,
    },
    async (input) => {
      try {
        const result = reply(deps, 'succeeded', await service.analyze(input));
        if (!analyzeOutput.safeParse(result.structuredContent).success) {
          return reply(deps, 'failed', undefined, 'invalid_output');
        }
        return result;
      } catch {
        return reply(deps, 'failed', undefined, 'invalid_input');
      }
    },
  );

  server.registerTool(
    'linkedin.jobs.compare',
    {
      description:
        'Read-only comparison of 2–10 unverified caller job snapshots using exact source evidence; no hiring or immigration eligibility claims.',
      inputSchema: compareInput,
      outputSchema: compareOutput,
    },
    async (input) => {
      try {
        const result = reply(deps, 'succeeded', await service.compare(input));
        if (!compareOutput.safeParse(result.structuredContent).success) {
          return reply(deps, 'failed', undefined, 'invalid_output');
        }
        return result;
      } catch {
        return reply(deps, 'failed', undefined, 'invalid_input');
      }
    },
  );
}
