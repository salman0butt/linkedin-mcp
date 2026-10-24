import { types } from 'node:util';

import {
  parseCandidateProfile,
  parseJobIntelligenceInput,
  type CandidateProfile,
  type NormalizedJob,
} from '../../../../packages/core/dist/index.js';
import { analyzeJobFit, type JobFit } from './job-fit.js';
import { extractJobRequirements, type JobRequirementExtraction } from './job-requirements.js';
import { extractJobSignals, type JobSignals } from './job-signals.js';

export interface JobAnalysis {
  readonly ref: Readonly<{ sourceId: string; jobId: string }>;
  readonly sourceTrust: 'caller_supplied';
  readonly source: NormalizedJob['source'];
  readonly title: string;
  readonly companyName: string;
  readonly canonicalUrl?: string;
  readonly postingDate: NormalizedJob['postingDate'];
  readonly extraction: JobRequirementExtraction;
  readonly signals: JobSignals;
  readonly fit: JobFit;
}

export type JobAnalysisResult = Readonly<{
  status: 'available';
  analysis: Readonly<JobAnalysis>;
}>;
export type JobCompareResult = Readonly<{
  status: 'available';
  analyses: readonly Readonly<JobAnalysis>[];
  comparisonScope: 'source_evidence_only';
}>;

export interface JobIntelligenceService {
  analyze(input: unknown): Promise<JobAnalysisResult>;
  compare(input: unknown): Promise<JobCompareResult>;
}

const MAX_SERIALIZED_BYTES = 262_144;

// Requirement extraction deliberately quotes only title/description. A
// caller-supplied location field may nonetheless impose eligibility or legal
// authorization requirements. If one is apparent but cannot be assessed, a
// skill-only numeric score would misleadingly imply complete coverage.
// Neutral city/country labels alone must not be treated as mandates.
const locationMandatoryCue =
  /\b(?:must|mandatory|required|requires?|need(?:s)?\s+to|only|restricted|restriction|limited|eligib(?:le|ility)|qualif(?:y|ies)|work\s+(?:permit|authori[sz]ation)|right\s+to\s+work|legally\s+authori[sz]ed)\b/i;

/** Inspect descriptors, without invoking untrusted getters, proxies or custom iterator methods. */
function fields(input: unknown, required: readonly string[], optional: readonly string[] = []) {
  if (input === null || typeof input !== 'object' || types.isProxy(input) || Array.isArray(input)) {
    throw new Error('Invalid job intelligence input');
  }
  const proto: unknown = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) throw new Error('Invalid object prototype');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const values: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = typeof key === 'string' ? descriptors[key] : undefined;
    if (
      typeof key !== 'string' ||
      (!required.includes(key) && !optional.includes(key)) ||
      !descriptor ||
      !Object.hasOwn(descriptor, 'value')
    )
      throw new Error('Invalid job intelligence input field');
    values[key] = descriptors[key]!.value;
  }
  for (const key of required) if (!Object.hasOwn(descriptors, key)) throw new Error('Missing input field');
  return values;
}

function jobsArray(input: unknown): readonly unknown[] {
  if (
    types.isProxy(input) ||
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    input.length < 2 ||
    input.length > 10
  )
    throw new Error('Invalid job comparison size');
  const ownKeys = Reflect.ownKeys(input);
  if (ownKeys.length !== input.length + 1) throw new Error('Invalid comparison array');
  const result: unknown[] = [];
  for (let index = 0; index < input.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
      throw new Error('Invalid comparison array element');
    }
    result.push(descriptor.value);
  }
  return result;
}

function bounded<T>(value: T): T {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_SERIALIZED_BYTES) {
    throw new Error('Job intelligence output exceeds safe bound');
  }
  return value;
}

function buildAnalysis(job: Readonly<NormalizedJob>, candidate?: Readonly<CandidateProfile>): JobAnalysis {
  const extraction = extractJobRequirements(job);
  const signals = extractJobSignals(job);
  const skillFit = analyzeJobFit(extraction, candidate);
  const unassessedLocationMandate =
    typeof job.location === 'string' && locationMandatoryCue.test(job.location);
  // A location preference and a skill match do not establish legal work eligibility.
  // Independent source-signal detection is a second guard when a mandate's
  // wording falls outside deterministic requirement-extraction patterns.
  const fit: Readonly<JobFit> =
    (signals.workAuthorization.status !== 'unknown' || unassessedLocationMandate) &&
    skillFit.status === 'evaluated'
      ? Object.freeze({
          status: 'insufficient_evidence' as const,
          scoreScope: skillFit.scoreScope,
          matched: skillFit.matched,
          missing: skillFit.missing,
          unknown: skillFit.unknown,
          scoreCoverage: Object.freeze({
            ...skillFit.scoreCoverage,
            unassessedRequiredCount: skillFit.scoreCoverage.unassessedRequiredCount + 1,
          }),
        })
      : skillFit;
  return Object.freeze({
    ref: Object.freeze({ sourceId: job.source.id, jobId: job.id }),
    sourceTrust: 'caller_supplied',
    source: job.source,
    title: job.title,
    companyName: job.companyName,
    ...(job.canonicalUrl === undefined ? {} : { canonicalUrl: job.canonicalUrl }),
    postingDate: job.postingDate,
    extraction,
    signals,
    fit,
  });
}

/** Pure analysis of caller-supplied unverified records. Does not access providers, saved state or networks. */
export function createJobIntelligenceService(): Readonly<JobIntelligenceService> {
  return Object.freeze({
    analyze(input: unknown) {
      return Promise.resolve().then(() => {
        const parsed = parseJobIntelligenceInput(input);
        const analysis = buildAnalysis(parsed.job, parsed.candidate);
        return bounded(Object.freeze({ status: 'available' as const, analysis }));
      });
    },
    compare(input: unknown) {
      return Promise.resolve().then(() => {
        const provided = fields(input, ['jobs'], ['candidate']);
        const snapshots = jobsArray(provided.jobs);
        const candidate = Object.hasOwn(provided, 'candidate')
          ? parseCandidateProfile(provided.candidate)
          : undefined;
        const seen = new Set<string>();
        const analyses = snapshots.map((raw) => {
          const parsed = parseJobIntelligenceInput({ job: raw });
          const key = JSON.stringify([parsed.job.source.id, parsed.job.id]);
          if (seen.has(key)) throw new Error('Duplicate source-scoped job identity');
          seen.add(key);
          return buildAnalysis(parsed.job, candidate);
        });
        return bounded(
          Object.freeze({
            status: 'available' as const,
            analyses: Object.freeze(analyses),
            comparisonScope: 'source_evidence_only' as const,
          }),
        );
      });
    },
  });
}
