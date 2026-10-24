import { types } from 'node:util';

import {
  validatePublicJobUrl,
  type JobEmploymentType,
  type JobWorkplace,
  type NormalizedJob,
} from './job-discovery.js';

/** The public M07 boundary never accepts a claimed host/provider attestation. */
export type JobSourceTrust = 'caller_supplied';

export interface CandidateProfile {
  readonly skills: readonly string[];
  readonly yearsOfExperience?: number;
  readonly preferredWorkplace?: JobWorkplace;
  readonly preferredLocations?: readonly string[];
}

export interface JobIntelligenceInput {
  readonly job: Readonly<NormalizedJob>;
  readonly sourceTrust: JobSourceTrust;
  readonly candidate?: Readonly<CandidateProfile>;
}

const utcPattern = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/;
const sourceIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const workplaces = new Set<JobWorkplace>(['remote', 'hybrid', 'on_site']);
const employmentTypes = new Set<JobEmploymentType>([
  'full_time',
  'part_time',
  'contract',
  'temporary',
  'internship',
]);

function invalid(label: string): never {
  throw new Error(`Invalid or untrusted job intelligence ${label}`);
}

/** Access descriptor values only; never evaluate caller-controlled getter properties. */
function object(
  input: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (input === null || typeof input !== 'object') invalid('object');
  if (types.isProxy(input)) invalid('proxy object');
  if (Array.isArray(input)) invalid('object');
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) invalid('object prototype');
  const keys = Reflect.ownKeys(input);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  for (const key of keys) {
    const descriptor = typeof key === 'string' ? descriptors[key] : undefined;
    if (
      typeof key !== 'string' ||
      (!required.includes(key) && !optional.includes(key)) ||
      !descriptor ||
      !Object.hasOwn(descriptor, 'value')
    ) {
      invalid('object fields');
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(descriptors, key)) invalid('missing field');
  }
  const plain: Record<string, unknown> = {};
  for (const key of keys) {
    if (typeof key !== 'string') invalid('object symbol');
    plain[key] = descriptors[key]!.value;
  }
  return plain;
}

function array(input: unknown, maxLength: number): readonly unknown[] {
  if (types.isProxy(input)) invalid('proxy array');
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length > maxLength) {
    invalid('array');
  }
  const output: unknown[] = [];
  const all = Reflect.ownKeys(input);
  if (all.length !== input.length + 1) invalid('array fields');
  for (let index = 0; index < input.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid('array element');
    output.push(descriptor.value);
  }
  return output;
}

function bounded(input: unknown, maxLength: number, label: string, canonical = false): string {
  if (typeof input !== 'string') invalid(label);
  // Check the original supplied field before trimming. Trimming must never
  // allow a huge payload or silently shift source quote offsets.
  if (input.length > maxLength) invalid(label);
  const trimmed = input.trim();
  if (trimmed.length < 1 || (canonical && trimmed !== input)) invalid(label);
  return trimmed;
}

function date(input: unknown): string {
  if (typeof input !== 'string' || !utcPattern.test(input)) invalid('UTC timestamp');
  const parsed = new Date(input);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== input.slice(0, 10)) {
    invalid('UTC timestamp');
  }
  return parsed.toISOString();
}

function uniqueStrings(input: unknown, maxLength: number, itemMaxLength: number, lower: boolean) {
  const values = array(input, maxLength);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const str = bounded(value, itemMaxLength, 'candidate string');
    const folded = str.toLocaleLowerCase('en-US');
    if (folded.length > itemMaxLength) invalid('normalized candidate string');
    if (seen.has(folded)) continue;
    seen.add(folded);
    result.push(lower ? folded : str);
  }
  return Object.freeze(result);
}

export function parseCandidateProfile(input: unknown): Readonly<CandidateProfile> {
  const obj = object(input, ['skills'], ['yearsOfExperience', 'preferredWorkplace', 'preferredLocations']);
  const skills = uniqueStrings(obj.skills, 80, 80, true);
  const candidate: {
    skills: readonly string[];
    yearsOfExperience?: number;
    preferredWorkplace?: JobWorkplace;
    preferredLocations?: readonly string[];
  } = { skills };
  if (Object.hasOwn(obj, 'yearsOfExperience')) {
    if (
      typeof obj.yearsOfExperience !== 'number' ||
      !Number.isSafeInteger(obj.yearsOfExperience) ||
      obj.yearsOfExperience < 0 ||
      obj.yearsOfExperience > 80
    ) {
      invalid('experience');
    }
    candidate.yearsOfExperience = obj.yearsOfExperience;
  }
  if (Object.hasOwn(obj, 'preferredWorkplace')) {
    if (!workplaces.has(obj.preferredWorkplace as JobWorkplace)) invalid('preferred workplace');
    candidate.preferredWorkplace = obj.preferredWorkplace as JobWorkplace;
  }
  if (Object.hasOwn(obj, 'preferredLocations')) {
    candidate.preferredLocations = uniqueStrings(obj.preferredLocations, 20, 120, false);
  }
  return Object.freeze(candidate);
}

function parseSnapshot(input: unknown): Readonly<NormalizedJob> {
  const obj = object(
    input,
    ['id', 'title', 'companyName', 'source', 'postingDate'],
    ['description', 'location', 'workplace', 'employmentType', 'canonicalUrl', 'salary'],
  );
  const source = object(obj.source, ['provider', 'id', 'name', 'retrievedAt']);
  if (source.provider !== 'EXTERNAL_DISCOVERY') invalid('source provider');
  const sourceId = bounded(source.id, 100, 'source identity', true);
  if (!sourceIdPattern.test(sourceId)) invalid('source identity');
  bounded(source.name, 100, 'source label');
  const retrievedAt = date(source.retrievedAt);
  const posting = object(obj.postingDate, ['state'], ['postedAt', 'sourceClaim']);
  let postingDate: NormalizedJob['postingDate'];
  if (posting.state === 'unknown') {
    if (Object.keys(posting).length !== 1) invalid('unknown posting date');
    postingDate = Object.freeze({ state: 'unknown' });
  } else if (posting.state === 'reported') {
    if (Object.keys(posting).length !== 3 || posting.sourceClaim !== 'provider_reported') {
      invalid('reported posting date');
    }
    postingDate = Object.freeze({
      state: 'reported',
      postedAt: date(posting.postedAt),
      sourceClaim: 'provider_reported',
    });
  } else {
    invalid('untrusted verified posting date');
  }
  const result: NormalizedJob = {
    id: bounded(obj.id, 256, 'job ID', true),
    title: bounded(obj.title, 300, 'job title', true),
    companyName: bounded(obj.companyName, 300, 'company name', true),
    source: Object.freeze({
      provider: 'EXTERNAL_DISCOVERY',
      id: sourceId,
      name: 'Unverified user-supplied snapshot',
      retrievedAt,
    }),
    postingDate,
  };
  if (Object.hasOwn(obj, 'description')) {
    if (typeof obj.description !== 'string' || obj.description.length > 20_000) invalid('description');
    result.description = obj.description;
  }
  if (Object.hasOwn(obj, 'location')) result.location = bounded(obj.location, 300, 'location', true);
  if (Object.hasOwn(obj, 'workplace')) {
    if (!workplaces.has(obj.workplace as JobWorkplace)) invalid('workplace');
    result.workplace = obj.workplace as JobWorkplace;
  }
  if (Object.hasOwn(obj, 'employmentType')) {
    if (!employmentTypes.has(obj.employmentType as JobEmploymentType)) invalid('employment type');
    result.employmentType = obj.employmentType as JobEmploymentType;
  }
  if (Object.hasOwn(obj, 'canonicalUrl')) {
    if (
      typeof obj.canonicalUrl !== 'string' ||
      obj.canonicalUrl.length > 2048 ||
      obj.canonicalUrl.trim() !== obj.canonicalUrl
    ) {
      invalid('canonical URL');
    }
    result.canonicalUrl = validatePublicJobUrl(obj.canonicalUrl);
  }
  if (Object.hasOwn(obj, 'salary')) {
    const rawSalary = object(obj.salary, ['min', 'max', 'currency', 'period']);
    const { min, max, currency, period } = rawSalary;
    if (
      typeof min !== 'number' ||
      typeof max !== 'number' ||
      !Number.isSafeInteger(min) ||
      !Number.isSafeInteger(max) ||
      min < 0 ||
      max < min ||
      typeof currency !== 'string' ||
      !/^[A-Z]{3}$/.test(currency) ||
      (period !== 'hour' && period !== 'month' && period !== 'year')
    ) {
      invalid('salary');
    }
    result.salary = Object.freeze({ min, max, currency, period });
  }
  return Object.freeze(result);
}

export function parseJobIntelligenceInput(input: unknown): Readonly<JobIntelligenceInput> {
  const obj = object(input, ['job'], ['candidate']);
  const job = parseSnapshot(obj.job);
  const result: {
    job: Readonly<NormalizedJob>;
    sourceTrust: 'caller_supplied';
    candidate?: Readonly<CandidateProfile>;
  } = { job, sourceTrust: 'caller_supplied' };
  if (Object.hasOwn(obj, 'candidate')) result.candidate = parseCandidateProfile(obj.candidate);
  return Object.freeze(result);
}
