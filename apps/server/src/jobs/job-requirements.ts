import type { NormalizedJob } from '../../../../packages/core/dist/index.js';

export type JobRequirementCategory =
  | 'skill'
  | 'experience'
  | 'education'
  | 'language'
  | 'location'
  | 'work_authorization'
  | 'other';
export type JobRequirementPriority = 'required' | 'preferred' | 'unspecified';

export interface JobRequirement {
  readonly id: string;
  readonly category: JobRequirementCategory;
  readonly priority: JobRequirementPriority;
  /** Lowercase explicit skill term, or the bounded original requirement subject. */
  readonly value: string;
  readonly quote: string;
  readonly sourceSpan: Readonly<{
    field: 'title' | 'description';
    start: number;
    end: number;
    offsetUnit: 'utf16';
  }>;
  readonly minimumYears?: number;
}

export interface JobRequirementExtraction {
  readonly requirements: readonly Readonly<JobRequirement>[];
  readonly truncated: boolean;
  readonly evidenceStatus: 'explicit' | 'incomplete';
  /** Static diagnostic, never copied from an untrusted job listing. */
  readonly explanation?: string;
}

const maxRequirements = 50;
const maxQuoteLength = 400;

/**
 * Only recognize vocabulary we can identify without semantic guessing.
 * Unsupported mandatory clauses mark extraction incomplete rather than
 * fabricating a skill (and thus a misleading numeric fit later).
 */
const knownSkills = new Set([
  'typescript',
  'ts',
  'javascript',
  'js',
  'node.js',
  'nodejs',
  'react',
  'react.js',
  'react native',
  'aws',
  'vue',
  'vue.js',
  'postgresql',
  'postgres',
  'sql',
  'docker',
  'kubernetes',
  'python',
  'java',
  'go',
  'golang',
  'c#',
  'c++',
  '.net',
  'nestjs',
  'next.js',
  'nextjs',
  'redis',
  'graphql',
  'mongodb',
  'mysql',
  'html',
  'css',
  'tailwind css',
  'angular',
  'rust',
  'php',
  'ruby',
  'swift',
  'kotlin',
  'azure',
  'gcp',
  'linux',
  'git',
  'terraform',
  'rabbitmq',
  'mqtt',
  'fastapi',
  'django',
  'express',
  'express.js',
  'jest',
  'vitest',
  'cypress',
  'playwright',
  'kafka',
  'spring boot',
  'spring',
  'flutter',
  'firebase',
  'prisma',
  'rest',
  'rest api',
]);

const disqualifyingContext =
  /["“”‘’]|\b(?:other\s+(?:employers?|companies)|others?\s+say|competitors?|for\s+example|e\.g\.|hypothetical(?:ly)?|imagine|sample\s+(?:requirement|listing)|according\s+to|quoted\s+from)\b/i;
const negation =
  /\b(?:do\s+not|don't|does\s+not|doesn't|must\s+not|need\s+not|never|no\s+need\s+to)\b|\b(?:not\s+(?:required|mandatory|necessary|needed)|without\s+(?:requiring|needing)|no\s+(?:requirement|need)\s+for)\b/i;
const requiredPrefix =
  /^(?:(?:required(?:\s+(?:skills?|qualifications?))?|requirements?|mandatory|essential|minimum\s+qualifications?)\s*:\s*|must\s+(?:have|know|use|be\s+proficient\s+in|be\s+fluent\s+in|be\s+experienced\s+with|be\s+based\s+in|be\s+located\s+in)\s+|(?:this|the)\s+(?:role|position|job|opening)\s+(?:requires?|needs?)\s+|(?:applicants?|candidates?)\s+must\s+(?:have|know|use)\s+|we\s+(?:require|need)\s+|you\s+(?:must|need\s+to)\s+(?:have|know|be\s+proficient\s+in)\s+|needs?\s+to\s+have\s+)/i;
const preferredPrefix =
  /^(?:(?:nice|good)\s+to\s+have|preferred(?:\s+skills?)?|bonus|desirable|a\s+plus|optional)\s*:?\s*/i;
const neutralPrefix = /^(?:experience\s+with|knowledge\s+of|familiarity\s+with|proficiency\s+in)\s+/i;
const mandatoryTail =
  /\s+(?:(?:is|are)\s+)?(?:required|mandatory|essential)(?:\s+for\s+(?:this|the)\s+(?:role|position|job|opening))?\.?$/i;
const preferredTail = /\s+(?:(?:is|are)\s+)?(?:preferred|a\s+plus|desirable)\.?$/i;
const startsWithDemand =
  /^(?:must\b|required\b|requirements?\b|mandatory\b|essential\b|minimum\b|need\b|needs\b|(?:applicants?|candidates?|you)\s+(?:must|need|are\s+required)\b|we\s+(?:require|need)\b|at\s+least\b|(?:\d{1,3})\s*\+?\s*(?:years?|yrs?)\b)/i;
// Unknown explicitly modal/mandatory wording is coverage uncertainty, not a
// reason to silently return a complete scored skill profile.
const possibleRequirementCue = /\b(?:requires?|required|mandatory|must|preferred)\b/i;
// Unlike full descriptions, ordinary role titles may be neutral (e.g. "Senior
// Python Engineer"). However a title that *states* a mandate in unsupported
// vocabulary cannot be ignored while another field receives a 100% fit score.
const unsupportedTitleMandate =
  /\b(?:necessary|necessity|demands?|calls?\s+for|essential\s+to|obligatory|compulsory)\b/i;
// Job-description prose may hide requirements phrased with vocabulary we do
// not support yet. Never claim complete numeric coverage from a partial parse.
// Exclude standalone punctuation/emoji, but not ordinary descriptive sentences.
const nontrivialDescriptionClause = /[\p{L}\p{N}]{2,}/u;

const yearsPattern =
  /^(?:(?:at\s+least|minimum\s+of)\s+)?(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience\s*(?:with|in|using|of)?\s*)?(.*)$/i;
const requiredAuthorization =
  /\b(?:must|are\s+required\s+to)\s+(?:already\s+)?(?:have|hold|possess)\s+(?:valid\s+)?(?:authori[sz]ation|permission|right)\s+to\s+work\b|\b(?:must|are\s+required\s+to)\s+(?:already\s+)?(?:have|hold)\s+(?:a\s+valid\s+)?work\s+permit\b|\b(?:applicants?|candidates?)\s+must\s+(?:already\s+)?be\s+(?:legally\s+)?authorized\s+to\s+work\b/i;

function skillTerm(value: string): string | null {
  const normalized = value
    .replace(
      /^(?:(?:hands[- ]on|strong)\s+)?(?:experience\s+with|knowledge\s+of|proficiency\s+in|skills?\s+in|familiarity\s+with)\s+/i,
      '',
    )
    .replace(/^(?:a|an)\s+/i, '')
    .replace(/[.!?]+$/g, '')
    .trim()
    .toLocaleLowerCase('en-US');
  return knownSkills.has(normalized) ? normalized : null;
}

function explicitlyDeniedSkill(value: string): string | null {
  const sentence = value.replace(/[.!?]+$/g, '').trim();
  const match =
    /^(?:we\s+)?(?:do|does)\s+not\s+(?:require|need)\s+(.+)$|^(.+?)\s+(?:is|are)\s+not\s+(?:required|necessary|needed)$|^no\s+(?:requirement|need)\s+for\s+(.+)$/i.exec(
      sentence,
    );
  return skillTerm(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
}

function classifyBody(
  body: string,
  priority: JobRequirementPriority,
  original: string,
):
  | Readonly<{
      category: JobRequirementCategory;
      priority: JobRequirementPriority;
      value: string;
      minimumYears?: number;
    }>[]
  | null {
  const cleaned = body.replace(/[.!?]+$/g, '').trim();
  if (!cleaned || cleaned.length > maxQuoteLength) return null;

  if (requiredAuthorization.test(original)) {
    return [
      { category: 'work_authorization', priority: 'required', value: cleaned.toLocaleLowerCase('en-US') },
    ];
  }
  // The syntax prefix itself can carry the only location/language qualifier.
  if (/^must\s+be\s+(?:located|based)\s+in\b/i.test(original)) {
    return [{ category: 'location', priority, value: cleaned.toLocaleLowerCase('en-US') }];
  }
  if (/^must\s+be\s+fluent\s+in\b/i.test(original)) {
    return [{ category: 'language', priority, value: cleaned.toLocaleLowerCase('en-US') }];
  }

  const years = yearsPattern.exec(cleaned);
  if (years) {
    const minimumYears = Number(years[1]);
    if (!Number.isSafeInteger(minimumYears) || minimumYears < 1 || minimumYears > 80) return null;
    const subject = years[2]?.trim() || 'general';
    const value = skillTerm(subject) ?? subject.toLocaleLowerCase('en-US');
    if (value.length > 120) return null;
    return [
      {
        category: 'experience',
        priority: priority === 'unspecified' ? 'required' : priority,
        value,
        minimumYears,
      },
    ];
  }

  if (/\b(?:bachelor'?s?|master'?s?|doctorate|phd|degree|diploma)\b/i.test(cleaned)) {
    return [{ category: 'education', priority, value: cleaned.toLocaleLowerCase('en-US') }];
  }
  if (
    /\b(?:work\s+authori[sz]ation|authori[sz]ation\s+to\s+work|authorized\s+to\s+work|work\s+permit|visa\s+sponsorship)\b/i.test(
      cleaned,
    )
  ) {
    return [{ category: 'work_authorization', priority, value: cleaned.toLocaleLowerCase('en-US') }];
  }
  if (/\b(?:based\s+in|located\s+in|reside\s+in)\b/i.test(cleaned)) {
    return [{ category: 'location', priority, value: cleaned.toLocaleLowerCase('en-US') }];
  }
  if (
    /\b(?:fluency|fluent|speaking|written)\s+(?:in\s+)?(?:english|german|french|spanish|arabic|urdu)\b/i.test(
      cleaned,
    )
  ) {
    return [{ category: 'language', priority, value: cleaned.toLocaleLowerCase('en-US') }];
  }

  // A short, explicit list can contain several skills, sharing one exact
  // evidence quote but retaining separate stable local requirement IDs.
  const parts = cleaned.split(/\s*(?:,\s*(?:and\s+)?|\s+and\s+)\s*/i);
  if (parts.length > 12) return null;
  const terms = parts.map(skillTerm);
  if (terms.some((term) => term === null)) return null;
  return terms.map((term) => ({ category: 'skill', priority, value: term! }));
}

/** Segments by simple sentence/line boundaries; retains original UTF-16 indices. */
function* sourceClauses(text: string): Generator<Readonly<{ start: number; end: number; quote: string }>> {
  // A closing quotation mark also ends its source clause when followed by
  // another independent sentence. Otherwise the first-party requirement after
  // the quote would be discarded together with the attributed example.
  const delimiter = /\r\n|[\r\n;]|(?<=['"”’])\s+(?=\S)|(?<=[.!?])\s+(?=\S)/g;
  let cursor = 0;
  for (const separator of text.matchAll(delimiter)) {
    const index = separator.index;
    const piece = text.slice(cursor, index);
    const leading = piece.length - piece.trimStart().length;
    const trimmed = piece.trim();
    if (trimmed) yield { start: cursor + leading, end: cursor + leading + trimmed.length, quote: trimmed };
    cursor = index + separator[0].length;
  }
  const last = text.slice(cursor);
  const leading = last.length - last.trimStart().length;
  const trimmed = last.trim();
  if (trimmed) yield { start: cursor + leading, end: cursor + leading + trimmed.length, quote: trimmed };
}

/** Source-scoped quote ranges, including across sentence and newline boundaries. */
function quotedSpans(text: string): readonly Readonly<{ start: number; end: number }>[] {
  const spans: { start: number; end: number }[] = [];
  for (const [opening, closing] of [
    ['"', '"'],
    ['“', '”'],
    ['‘', '’'],
    ["'", "'"],
  ] as const) {
    let cursor = 0;
    while (cursor < text.length) {
      const start = text.indexOf(opening, cursor);
      if (start < 0) break;
      // An apostrophe between word characters is not a quotation boundary.
      // In particular, "don't" must not make all subsequent job clauses look
      // like quoted third-party text.
      if (
        opening === "'" &&
        /[\p{L}\p{N}]/u.test(text[start - 1] ?? '') &&
        /[\p{L}\p{N}]/u.test(text[start + 1] ?? '')
      ) {
        cursor = start + 1;
        continue;
      }
      let close = text.indexOf(closing, start + opening.length);
      while (
        opening === "'" &&
        close >= 0 &&
        /[\p{L}\p{N}]/u.test(text[close - 1] ?? '') &&
        /[\p{L}\p{N}]/u.test(text[close + 1] ?? '')
      ) {
        close = text.indexOf(closing, close + closing.length);
      }
      const end = close < 0 ? text.length : close + closing.length;
      spans.push({ start, end });
      cursor = end;
    }
  }
  return spans;
}

/**
 * Conservative, deterministic extraction over trusted-validated normalized
 * text. It does no network, model, tool, process, or filesystem work.
 */
export function extractJobRequirements(job: Readonly<NormalizedJob>): Readonly<JobRequirementExtraction> {
  if (
    typeof job.title !== 'string' ||
    job.title.length > 300 ||
    (job.description !== undefined &&
      (typeof job.description !== 'string' || job.description.length > 20_000))
  ) {
    throw new Error('Invalid normalized job text');
  }
  const requirements: JobRequirement[] = [];
  let uncertain = false;
  let truncated = false;
  const explicitlyNotRequired = new Set<string>();

  for (const field of ['title', 'description'] as const) {
    const source = job[field];
    if (source === undefined) continue;
    const quoted = quotedSpans(source);
    for (const clause of sourceClauses(source)) {
      // A quoted competitor/example statement may span several sourceClauses.
      // Checking each clause's own punctuation alone can falsely promote a
      // middle sentence (with neither opening nor closing quote) to employer
      // requirements. Any overlapping clause is unsafe to score as factual.
      if (quoted.some((range) => range.start < clause.end && range.end > clause.start)) {
        uncertain = true;
        continue;
      }
      const text = clause.quote.replace(/^[•*-]\s*/, '');
      if (disqualifyingContext.test(text) || negation.test(text)) {
        // Negative/quoted requirements cannot establish positive requirements.
        if (/(?:require|must|need|preferred|nice\s+to\s+have)/i.test(text)) uncertain = true;
        if (!disqualifyingContext.test(text)) {
          const denied = explicitlyDeniedSkill(text);
          if (denied) explicitlyNotRequired.add(denied);
        }
        continue;
      }
      let priority: JobRequirementPriority = 'unspecified';
      let body = text;
      const required = requiredPrefix.exec(text);
      const preferred = preferredPrefix.exec(text);
      const requiredSuffix = mandatoryTail.exec(text);
      const preferredSuffix = preferredTail.exec(text);
      if (required) {
        priority = 'required';
        body = text.slice(required[0].length);
      } else if (preferred) {
        priority = 'preferred';
        body = text.slice(preferred[0].length);
      } else if (requiredSuffix) {
        priority = 'required';
        body = text.slice(0, requiredSuffix.index);
      } else if (preferredSuffix) {
        priority = 'preferred';
        body = text.slice(0, preferredSuffix.index);
      } else if (neutralPrefix.test(text)) {
        priority = 'unspecified';
      } else if (requiredAuthorization.test(text)) {
        priority = 'required';
      } else if (!yearsPattern.test(text)) {
        if (
          startsWithDemand.test(text) ||
          possibleRequirementCue.test(text) ||
          (field === 'title' && unsupportedTitleMandate.test(text)) ||
          (field === 'description' && nontrivialDescriptionClause.test(text))
        ) {
          uncertain = true;
        }
        continue;
      }
      if (clause.quote.length > maxQuoteLength) {
        uncertain = true;
        continue;
      }
      const parsed = classifyBody(body, priority, text);
      if (!parsed) {
        uncertain = true;
        continue;
      }
      for (const candidate of parsed) {
        if (requirements.length >= maxRequirements) {
          truncated = true;
          break;
        }
        const sourceSpan = Object.freeze({
          field,
          start: clause.start,
          end: clause.end,
          offsetUnit: 'utf16' as const,
        });
        requirements.push(
          Object.freeze({
            ...candidate,
            id: `${field}:${clause.start}:${clause.end}:${requirements.length}`,
            quote: source.slice(clause.start, clause.end),
            sourceSpan,
          }),
        );
      }
    }
  }

  // A contradictory explicit negation invalidates a confident priority even
  // when its positive claim appeared in the title or an earlier sentence.
  for (let index = 0; index < requirements.length; index++) {
    const requirement = requirements[index]!;
    if (requirement.category === 'skill' && explicitlyNotRequired.has(requirement.value)) {
      requirements[index] = Object.freeze({ ...requirement, priority: 'unspecified' });
      uncertain = true;
    }
  }

  const evidenceStatus = truncated || uncertain || requirements.length === 0 ? 'incomplete' : 'explicit';
  return Object.freeze({
    requirements: Object.freeze(requirements),
    truncated,
    evidenceStatus,
    ...(truncated
      ? { explanation: 'More than 50 explicit requirements were present; extraction was truncated.' }
      : uncertain
        ? { explanation: 'Some potential requirements were ambiguous, negated, or unsupported.' }
        : requirements.length === 0
          ? { explanation: 'No explicit supported job requirements were found.' }
          : {}),
  });
}
