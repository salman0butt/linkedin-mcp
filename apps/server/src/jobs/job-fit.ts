import type { CandidateProfile } from '../../../../packages/core/dist/index.js';

export interface FitRequirement {
  readonly id: string;
  readonly category: string;
  readonly priority: string;
  readonly value: string;
  readonly quote: string;
  readonly sourceSpan: Readonly<{
    field: string;
    start: number;
    end: number;
    offsetUnit: 'utf16';
  }>;
}

export interface JobRequirementExtraction {
  readonly requirements: readonly FitRequirement[];
  readonly truncated: boolean;
  readonly evidenceStatus: 'explicit' | 'incomplete';
}

export interface JobFit {
  readonly status: 'evaluated' | 'insufficient_evidence';
  readonly scoreScope: 'explicit_skills_only';
  readonly score?: number;
  readonly matched: readonly Readonly<FitRequirement>[];
  readonly missing: readonly Readonly<FitRequirement>[];
  readonly unknown: readonly Readonly<FitRequirement>[];
  readonly scoreCoverage: Readonly<{
    evaluatedSkillCount: number;
    unassessedRequiredCount: number;
    extractionTruncated: boolean;
    extractionIncomplete: boolean;
  }>;
}

/** No substring guessing, proficiency inference or undocumented aliases. */
const aliases: Readonly<Record<string, string>> = Object.freeze({
  ts: 'typescript',
  js: 'javascript',
  nodejs: 'node.js',
  'react.js': 'react',
  postgres: 'postgresql',
});

function normalizedSkill(value: string): string {
  const normalized = value.toLocaleLowerCase('en-US').trim();
  return aliases[normalized] ?? normalized;
}

function copied(item: FitRequirement): Readonly<FitRequirement> {
  return Object.freeze({
    id: item.id,
    category: item.category,
    priority: item.priority,
    value: item.value,
    quote: item.quote,
    sourceSpan: Object.freeze({ ...item.sourceSpan }),
  });
}

/** An advisory skill-evidence score; never a general suitability or immigration determination. */
export function analyzeJobFit(
  extraction: Readonly<JobRequirementExtraction>,
  profile?: Readonly<CandidateProfile>,
): Readonly<JobFit> {
  if (extraction.requirements.length > 50) {
    throw new Error('Invalid job requirement coverage');
  }
  const matched: FitRequirement[] = [];
  const missing: FitRequirement[] = [];
  const unknown: FitRequirement[] = [];
  const skills = new Set(profile?.skills.map(normalizedSkill) ?? []);
  const seen = new Set<string>();
  let scoredWeight = 0;
  let matchedWeight = 0;
  let evaluatedSkillCount = 0;
  let unassessedRequiredCount = 0;

  for (const requirement of extraction.requirements) {
    if (requirement.priority !== 'required' && requirement.priority !== 'preferred') {
      unknown.push(copied(requirement));
      continue;
    }
    if (requirement.category !== 'skill' || !requirement.value.trim()) {
      unknown.push(copied(requirement));
      if (requirement.priority === 'required') unassessedRequiredCount++;
      continue;
    }
    const normalized = normalizedSkill(requirement.value);
    const key = JSON.stringify([requirement.priority, normalized]);
    if (seen.has(key)) continue;
    seen.add(key);
    evaluatedSkillCount++;
    const weight = requirement.priority === 'required' ? 3 : 1;
    scoredWeight += weight;
    if (skills.has(normalized)) {
      matchedWeight += weight;
      matched.push(copied(requirement));
    } else {
      missing.push(copied(requirement));
    }
  }
  const eligible =
    profile !== undefined &&
    skills.size > 0 &&
    !extraction.truncated &&
    extraction.evidenceStatus === 'explicit' &&
    scoredWeight > 0 &&
    unknown.every((req) => req.priority === 'unspecified');

  const output: {
    status: 'evaluated' | 'insufficient_evidence';
    scoreScope: 'explicit_skills_only';
    score?: number;
    matched: readonly FitRequirement[];
    missing: readonly FitRequirement[];
    unknown: readonly FitRequirement[];
    scoreCoverage: JobFit['scoreCoverage'];
  } = {
    status: eligible ? 'evaluated' : 'insufficient_evidence',
    scoreScope: 'explicit_skills_only',
    matched: Object.freeze(matched),
    missing: Object.freeze(missing),
    unknown: Object.freeze(unknown),
    scoreCoverage: Object.freeze({
      evaluatedSkillCount,
      unassessedRequiredCount,
      extractionTruncated: extraction.truncated,
      extractionIncomplete: extraction.evidenceStatus === 'incomplete',
    }),
  };
  if (eligible) output.score = Math.round((matchedWeight / scoredWeight) * 100);
  return Object.freeze(output);
}
