import type { JobWorkplace, NormalizedJob } from '../../../../packages/core/dist/index.js';

/** These describe what an unverified listing *says*, never real-world eligibility. */
export type JobSignalStatus = 'explicit_yes' | 'explicit_no' | 'unknown' | 'conflicting';
export type JobSignalField = 'title' | 'description' | 'location';

export interface JobSignalEvidence {
  readonly field: JobSignalField;
  readonly start: number;
  readonly end: number;
  readonly endExclusive: true;
  readonly offsetUnit: 'utf16';
  readonly quote: string;
}

export interface JobSignal {
  readonly status: JobSignalStatus;
  readonly evidence: readonly Readonly<JobSignalEvidence>[];
  /** Jurisdiction strings come only from matched listing text, not geography inference. */
  readonly jurisdictions: readonly string[];
}

export interface JobSignals {
  /** The supplied workplace is not a declaration of worldwide permission. */
  readonly workplace?: JobWorkplace;
  /** Whether the listing explicitly permits remote work from *any country*. */
  readonly remoteEligibility: Readonly<JobSignal>;
  /** Whether the listing explicitly offers or refuses work-visa sponsorship. */
  readonly sponsorship: Readonly<JobSignal>;
  readonly relocationAssistance: Readonly<JobSignal>;
  /** `explicit_yes` means the listing requires EXISTING authorization; not candidate eligibility. */
  readonly workAuthorization: Readonly<JobSignal>;
  readonly company: Readonly<{ name: string; sourceTrust: 'caller_supplied' }>;
}

type Polarity = 'yes' | 'no';
type Extracted = Readonly<{
  polarity: Polarity;
  span: Readonly<JobSignalEvidence>;
  jurisdictions: readonly string[];
}>;
type Collected = Readonly<{
  matches: readonly Extracted[];
  /** Original-source excerpts from clauses we deliberately did not parse. */
  incompleteEvidence: readonly Readonly<JobSignalEvidence>[];
}>;

const MAX_SPANS = 8;
const MAX_JURISDICTIONS = 8;
const MAX_QUOTE = 240;

// Preserve spelling in the original text: job adverts often write country and
// nationality names in lowercase. A single lowercase word is allowed only in
// an applicant-specific geographic/citizenship qualifier, and is screened for
// common generic objects. Capitalized multiword places (e.g. New York) remain.
const explicitScope = String.raw`(?:U\.S\.|[\p{Lu}][\p{L}\p{M}'-]{0,39}(?:\s+[\p{Lu}][\p{L}\p{M}'-]{0,39}){0,2}|[\p{Ll}][\p{Ll}\p{M}'-]{2,39})`;
const genericObjects = new Set([
  'a',
  'an',
  'any',
  'the',
  'your',
  'our',
  'their',
  'this',
  'that',
  'some',
  'such',
  'assigned',
  'designated',
  'local',
  'current',
  'preferred',
  'own',
  'same',
  'workspace',
  'workplace',
  'office',
  'home',
  'desk',
  'room',
  'building',
  'facility',
  'site',
  'address',
  'campus',
  'team',
  'company',
  'employer',
  // These describe the person being considered, not a jurisdiction or
  // nationality. Without this guard, "only for applicants resident in France"
  // was incorrectly assigning the jurisdiction "applicants".
  'applicant',
  'applicants',
  'candidate',
  'candidates',
  'individual',
  'individuals',
  'people',
  'customer',
  'customers',
  'client',
  'clients',
  'remote',
  'hybrid',
  'online',
  'virtual',
]);
function geographicScope(raw: string): boolean {
  // Reject unlocated possessions and workplace objects rather than lending
  // fake jurisdiction evidence to a vague mention of residence or citizenship.
  return !raw.split(/\s+/u).some((word) => genericObjects.has(word.toLowerCase()));
}
const remoteApplicantScope = [
  new RegExp(
    String.raw`\b(?:[Ww]e|[Oo]ur\s+company|[Tt]he\s+employer)\s+only\s+(?:hire|recruit|accept)\s+(?:applicants?|candidates?)\s+(?:(?:who\s+are)\s+)?(?:based|located|resident|residing|living)\s+in\s+(?:the\s+)?(?<scope>${explicitScope})(?=\s|[.,;!?]|$)`,
    'gu',
  ),
  new RegExp(
    String.raw`\b(?:[Oo]nly\s+if|[Pp]rovided(?:\s+that)?|[Aa]s\s+long\s+as)\s+(?:[Yy]ou|[Aa]pplicants?|[Cc]andidates?|[Ee]mployees?)\s+(?:(?:are|must\s+be)\s+)?(?:resident|residents|residing|reside|live|living|based|located)\s+in\s+(?:the\s+)?(?<scope>${explicitScope})(?=\s|[.,;!?]|$)`,
    'gu',
  ),
  new RegExp(
    String.raw`\b(?:[Yy]ou|[Aa]pplicants?|[Cc]andidates?|[Ee]mployees?)\s+(?:must|need\s+to)\s+(?:be\s+)?(?:resident|residents|residing|reside|live|living|based|located)\s+in\s+(?:the\s+)?(?<scope>${explicitScope})(?=\s|[.,;!?]|$)`,
    'gu',
  ),
];
const sponsorApplicantScope = [
  // A condition on who can obtain sponsorship is not unqualified support.
  // Capture the place AFTER the explicit applicant residence/origin wording,
  // not the words "applicants" or "candidates" as a supposed nationality.
  new RegExp(
    String.raw`\b(?:[Bb]ut\s+)?[Oo]nly\s+(?:for|to)\s+(?:applicants?|candidates?)\s+(?:(?:who\s+are\s+)?(?:resident|residing|living|based|located)\s+in|from|in)\s+(?:the\s+)?(?<scope>${explicitScope})(?=\s|[.,;!?]|$)`,
    'gu',
  ),
  new RegExp(
    String.raw`\b(?:[Bb]ut\s+)?not\s+for\s+(?:[Aa]pplicants?|[Cc]andidates?|[Ii]ndividuals?|[Pp]eople)\s+(?:from|in|based\s+in|resident\s+in|living\s+in)\s+(?<scope>${explicitScope})(?=\s|[.,;!?]|$)`,
    'gu',
  ),
  new RegExp(
    String.raw`\b(?:[Oo]nly|[Ee]xclusively)\s+(?:available\s+)?for\s+(?:(?:applicants?|candidates?)\s+(?:who\s+are\s+)?)?(?<scope>${explicitScope})\s+(?:citizens?|nationals?|residents?)\b`,
    'gu',
  ),
];

// Narrow recognizers deliberately prefer unknown to a guessed employer commitment.
const worldwideYes = [
  /\bwork\s+from\s+anywhere(?:\s+in\s+the\s+world)?\b/gi,
  /\bwork\s+remotely\s+from\s+(?:anywhere|any\s+country)\b/gi,
  /\b(?:worldwide\s+remote|remote\s+worldwide|globally\s+remote|remote\s+from\s+any\s+country)\b/gi,
  /\bremote\s+across\s+the\s+world\b/gi,
];
const worldwideNo = [
  /\b(?:worldwide\s+remote|remote\s+worldwide|work\s+from\s+anywhere)\s+(?:is\s+)?(?:not\s+available|not\s+allowed|not\s+permitted|unavailable)\b/gi,
  /\b(?:remote\s+)?(?:within|based\s+in)\s+(?:the\s+)?(?:US|U\.S\.|USA|United\s+States|UK|Germany|Canada|Australia|EU|Europe)\s+only\b/gi,
  /\bremote\s+(?:within|from|in)\s+(?:the\s+)?(?:US|U\.S\.|USA|United\s+States|UK|Germany|Canada|Australia|EU|Europe)\b/gi,
  /\b(?:US|U\.S\.|USA|United\s+States|UK|Germany|Canada|Australia|EU|Europe)\s+only\b/gi,
  /\b(?:must|need\s+to)\s+(?:be\s+)?(?:based|located|resident|residing|living)\s+in\s+(?:the\s+)?(?:US|U\.S\.|USA|United\s+States|UK|Germany|Canada|Australia|EU|Europe)\b/gi,
  // A worldwide-remote slogan followed by a residence condition is not
  // permission to work from any country. Keep the limiting clause as evidence.
  /\b(?:only\s+if|provided(?:\s+that)?|as\s+long\s+as)\s+(?:you|applicants?|candidates?|employees?)\s+(?:(?:are|must\s+be)\s+)?(?:resident|residents|residing|reside|live|living|based|located)\s+in\s+(?:the\s+)?(?:US|U\.S\.|USA|United\s+States|UK|Germany|Canada|Australia|EU|Europe)(?=\s|[.,;!?]|$)/gi,
  /\b(?:you|applicants?|candidates?|employees?)\s+(?:must|need\s+to)\s+(?:be\s+)?(?:resident|residents|residing|reside|live|living|based|located)\s+in\s+(?:the\s+)?(?:US|U\.S\.|USA|United\s+States|UK|Germany|Canada|Australia|EU|Europe)(?=\s|[.,;!?]|$)/gi,
  /\b(?:no|not)\s+(?:international|worldwide|global)\s+remote\b/gi,
  /\b(?:cannot|can't|may\s+not)\s+work\s+remotely\s+outside\s+(?:the\s+)?(?:US|UK|Germany|Canada|EU|Europe)\b/gi,
  ...remoteApplicantScope,
];

const sponsorYes = [
  /\b(?:work\s+)?visas?\s+(?:are\s+)?sponsored\b/gi,
  /\b(?:work\s+)?visa\s+sponsorship\s+(?:is\s+)?(?:available|offered|provided|included)\b/gi,
  /\bvisa\s+support\s+(?:is\s+)?(?:available|offered|provided)\b/gi,
  /\b(?:we|our\s+company|the\s+employer)\s+(?:(?:can|will|do)\s+)?(?:offer|provide|arrange|support)\s+(?:a\s+)?(?:work\s+)?visa\s+sponsorship\b/gi,
  /\b(?:we|our\s+company|the\s+employer)\s+(?:can\s+|will\s+)?sponsor\s+(?:your\s+)?(?:work\s+)?visas?\b/gi,
  /\b(?:can|will)\s+sponsor\s+(?:your\s+)?(?:work\s+)?visas?\b/gi,
];
const sponsorNo = [
  /\bno\s+(?:work\s+)?visa\s+(?:sponsorship|support)\b/gi,
  /\b(?:work\s+)?visa\s+(?:sponsorship|support)\s+(?:is\s+)?(?:unavailable|not\s+available|not\s+offered|not\s+provided)\b/gi,
  /\b(?:do\s+not|does\s+not|don't|doesn't|cannot|can't|will\s+not|won't|unable\s+to)\s+(?:offer|provide|arrange|support|sponsor)\s+(?:work\s+)?(?:visa\s+sponsorship|work\s+visas?|visas?)\b/gi,
  /\b(?:will\s+not|cannot|can't|won't)\s+sponsor\s+(?:your\s+)?(?:work\s+)?visas?\b/gi,
  // Only a *nearby explicit sponsorship claim* may supply the subject of
  // this abbreviated denial; never read an arbitrary "not for this role"
  // sentence as employer visa policy.
  /\b(?:but\s+)?not\s+for\s+(?:this|the)\s+(?:specific\s+)?(?:role|position|job|opening)\b/gi,
  ...sponsorApplicantScope,
];
const sponsorContextualDenials = new Set(sponsorNo.slice(-1 - sponsorApplicantScope.length));

const relocationYes = [
  /\brelocation\s+(?:assistance|support|package)\s+(?:is\s+)?(?:available|offered|provided|included)\b/gi,
  /\b(?:we|the\s+employer|our\s+company)\s+(?:will\s+|can\s+)?(?:offer|provide|cover)\s+relocation\s+(?:assistance|support|package)\b/gi,
];
const relocationNo = [
  /\bno\s+relocation\s+(?:assistance|support|package)\b/gi,
  /\brelocation\s+(?:assistance|support|package)\s+(?:is\s+)?(?:not\s+available|unavailable|not\s+offered|not\s+provided)\b/gi,
  /\b(?:do\s+not|does\s+not|cannot|can't|will\s+not)\s+(?:offer|provide|cover)\s+relocation\s+(?:assistance|support|package)\b/gi,
];

const authorizationYes = [
  /\b(?:must|need\s+to)\s+(?:already\s+)?(?:have|hold)\s+(?:(?:valid|existing|current|US|U\.S\.|UK|German|EU)\s+){0,3}(?:work\s+authorization|right\s+to\s+work)\b/gi,
  /\b(?:must|need\s+to)\s+(?:already\s+)?be\s+(?:legally\s+)?authorized\s+to\s+work\s+in\s+(?:the\s+)?(?:US|U\.S\.|USA|United\s+States|UK|Germany|Canada|Australia|EU|Europe)\b/gi,
  /\b(?:(?:US|U\.S\.|USA|United\s+States|UK|Germany|Canada|Australia|EU|Europe)\s+)?(?:work\s+authorization|right\s+to\s+work)\s+(?:is\s+)?required\b/gi,
  /\b(?:must\s+already\s+have|need\s+existing)\s+authorization\s+to\s+work\s+in\s+(?:the\s+)?(?:US|U\.S\.|USA|United\s+States|UK|Germany|Canada|Australia|EU|Europe)\b/gi,
];
const authorizationNo = [
  /\bno\s+(?:prior\s+|existing\s+|current\s+)?work\s+authorization\s+(?:is\s+)?required\b/gi,
  /\bwork\s+authorization\s+(?:is\s+)?not\s+required\b/gi,
];

// Only explicit country names/abbreviations found in the quote are returned.
const jurisdictionRe =
  /\b(?:United\s+States|USA|US|Germany|UK|Canada|Australia|Europe|EU)\b|\bU\.S\.(?!\w)/gi;
const jurisdictionNames: Readonly<Record<string, string>> = Object.freeze({
  us: 'US',
  'u.s.': 'US',
  usa: 'US',
  'united states': 'US',
  germany: 'Germany',
  uk: 'UK',
  canada: 'Canada',
  australia: 'Australia',
  europe: 'Europe',
  eu: 'EU',
});

function jurisdictions(quote: string): readonly string[] {
  const result = new Set<string>();
  for (const match of quote.matchAll(jurisdictionRe)) {
    const jurisdiction = jurisdictionNames[match[0].toLowerCase()];
    if (jurisdiction !== undefined && result.size < MAX_JURISDICTIONS) result.add(jurisdiction);
  }
  return [...result];
}

function ignoredClause(text: string): boolean {
  return /\b(?:other\s+(?:companies|employers|roles)|others\s+say|some\s+companies|hypothetical|for\s+example|as\s+an\s+example|e\.g\.|not\s+our\s+policy|slogan|allegedly|rumor|rumour|may\s+be|might\s+be|could\s+be|possibly|potentially|perhaps|under\s+consideration|considered\s+on\s+a\s+case)\b/i.test(
    text,
  );
}

// Third-party examples are not employer policy, but an employer's own
// contrast after "but we ..." or ", we ..." must not be silently discarded.
// We fail closed rather than assigning an invented positive/negative polarity.
const firstPartyContrast =
  /(?:\b(?:but|however|yet|whereas)\b\s*,?|,)\s*(?:we|our\s+(?:company|team)|the\s+employer)\s+(?:only|do\s+not|don't|does\s+not|cannot|can't|will\s+not|won't|never|require|hire|offer|provide|sponsor)\b/i;

// Recognizers intentionally cover *possible missing restrictions*, not
// polarity. The specific yes/no rules remain authoritative when they actually
// match. A separate applicant-bound geography clause can otherwise turn a
// global-remote or unrestricted-sponsorship "yes" into a misleading claim.
const applicantScopeCue = new RegExp(
  String.raw`\b(?:(?:applicants?|candidates?)\s+(?:(?:(?:who\s+)?(?:are\s+)?)?(?:living|residing|based|located)\s+in|from|in)|(?:residents?|citizens?)\s+of|(?:must|need\s+to)\s+(?:be\s+)?(?:living|residing|based|located|live|reside)\s+in)\s+(?:the\s+)?(?<scope>${explicitScope})(?=\s|[.,;!?]|$)`,
  'giu',
);
const restrictiveApplicantCue =
  /\b(?:only|exclusively|restricted?|limited?|qualif(?:y|ies)|must|need\s+to|may\s+apply|accept\s+applications?|except(?:\s+for)?|exclud(?:e|ed|ing)|ineligible|not\s+eligible)\b/i;
const unrelatedBenefit =
  /\b(?:customers?|clients?|vendors?|training|courses?|discounts?|offices?|facilit(?:y|ies)|scholarships?)\b/i;
const geographicalExceptionCue = new RegExp(
  String.raw`\b(?:except(?:\s+for)?|excluding|other\s+than)\s+(?:the\s+)?(?<scope>${explicitScope})(?=\s|[.,;!?]|$)`,
  'giu',
);
// The location is a separate source field. Explicit regional-only or remote
// from/within-region labels contradict an unconditional worldwide claim even
// when the region was not in a fixed list of country names.
const unparsedLocationScopes = [
  new RegExp(String.raw`^\s*(?<scope>${explicitScope})\s+only\s*[.!]?\s*$`, 'iu'),
  new RegExp(
    String.raw`^\s*remote\s+(?:within|from|in)\s+(?:the\s+)?(?<scope>${explicitScope})(?:\s+only)?\s*[.!]?\s*$`,
    'iu',
  ),
];

function possibleUnparsedLocationLimit(body: string): boolean {
  return unparsedLocationScopes.some((pattern) => {
    const match = pattern.exec(body);
    return match?.groups?.scope !== undefined && geographicScope(match.groups.scope);
  });
}

function qualifierConjunct(body: string, offset: number): string {
  let start = 0;
  let end = body.length;
  for (const conjunction of body.matchAll(/\b(?:and|but|however|whereas)\b/gi)) {
    if (conjunction.index + conjunction[0].length <= offset) {
      start = conjunction.index + conjunction[0].length;
    } else if (conjunction.index >= offset) {
      end = conjunction.index;
      break;
    }
  }
  return body.slice(start, end);
}

function possibleUnparsedApplicantLimit(
  body: string,
  noPatterns: readonly RegExp[],
  source: string,
  clauseStart: number,
): boolean {
  if (noPatterns !== worldwideNo && noPatterns !== sponsorNo) return false;
  // Only suppress the qualifier when the *same conjunct* concerns a benefit
  // like customer training, not when an earlier conjunct mentions customers
  // and an independent "and only hire applicants ..." follows it.
  for (const matched of body.matchAll(applicantScopeCue)) {
    // Unclassified cues need the same source-wide quote provenance gate as
    // recognized yes/no matches: a quoted competitor requirement is not ours.
    if (quoted(source, clauseStart + matched.index)) continue;
    if (!matched.groups?.scope || !geographicScope(matched.groups.scope)) continue;
    const qualifier = qualifierConjunct(body, matched.index);
    if (unrelatedBenefit.test(qualifier)) continue;
    // Visa sponsorship restrictions do not independently establish physical
    // remote eligibility, even if both happen to be mentioned in one sentence.
    if (noPatterns === worldwideNo && /\b(?:visa|sponsorship)\b/i.test(qualifier)) continue;
    if (restrictiveApplicantCue.test(qualifier)) return true;
  }
  if (noPatterns === worldwideNo) {
    // "Worldwide, except Pakistan" has no explicit applicant noun but still
    // negates any claim of permission from *every* country. Preserve the
    // source clause as incomplete rather than inventing a formal denial.
    for (const matched of body.matchAll(geographicalExceptionCue)) {
      if (quoted(source, clauseStart + matched.index)) continue;
      if (!matched.groups?.scope || !geographicScope(matched.groups.scope)) continue;
      const qualifier = qualifierConjunct(body, matched.index);
      if (!unrelatedBenefit.test(qualifier) && !/\b(?:visa|sponsorship)\b/i.test(qualifier)) {
        return true;
      }
    }
  }
  return false;
}

/** Check whether matching a positive phrase would reverse a nearby negation. */
function negatedPrefix(text: string, start: number): boolean {
  const prefix = text.slice(Math.max(0, start - 55), start);
  return /\b(?:no|not|never|without|cannot|can't|do\s+not|does\s+not|don't|doesn't|won't|will\s+not|unable\s+to)\b(?:[\s\w-]{0,40})$/i.test(
    prefix,
  );
}

/**
 * Quote state uses the entire original source field and a UTF-16 absolute
 * offset, never an individual sentence. A third-party quotation may span
 * multiple sourceClauses, and resetting the state would endorse its claims.
 * The closing quote resets the state so a later first-party claim still counts.
 */
function quoted(source: string, absoluteStart: number): boolean {
  let asciiDouble = false;
  let asciiSingle = false;
  let smartDouble = false;
  let smartSingle = false;
  for (let index = 0; index < absoluteStart; index++) {
    const char = source[index];
    if (char === '"') asciiDouble = !asciiDouble;
    else if (char === '“') smartDouble = true;
    else if (char === '”') smartDouble = false;
    else if (char === "'" || char === '‘' || char === '’') {
      const before = source[index - 1] ?? '';
      const after = source[index + 1] ?? '';
      // An apostrophe within a contraction/possessive is not a quote mark.
      if (/[\p{L}\p{N}]/u.test(before) && /[\p{L}\p{N}]/u.test(after)) continue;
      if (char === "'") {
        // Don't let a standalone plural possessive ("Candidates' skills")
        // turn the following employer statement into a fabricated quotation.
        if (!asciiSingle && /s/i.test(before) && /\s/u.test(after)) continue;
        asciiSingle = !asciiSingle;
      } else if (char === '‘') smartSingle = true;
      else smartSingle = false;
    }
  }
  return asciiDouble || asciiSingle || smartDouble || smartSingle;
}

/** A period in `U.S.` / `U.K.` belongs to the country name, not a sentence break. */
function* sourceClauses(text: string): Generator<{ body: string; start: number }> {
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const countryPeriod =
      char === '.' &&
      ((index > 0 &&
        index + 1 < text.length &&
        /[A-Za-z]/.test(text[index - 1]!) &&
        /[A-Za-z]/.test(text[index + 1]!)) ||
        /\b(?:U\.S|U\.K)$/i.test(text.slice(Math.max(0, index - 4), index)));
    if (char !== '.' && char !== '!' && char !== '?' && char !== ';' && char !== '\r' && char !== '\n')
      continue;
    if (countryPeriod) continue;
    // Keep a closing quote with the preceding sentence so it cannot make
    // the next, independent employer clause look like quoted third-party text.
    let end = index + 1;
    while (end < text.length && /["'”’]/.test(text[end]!)) end++;
    if (index > start) yield { body: text.slice(start, end), start };
    start = end;
    index = end - 1;
  }
  if (start < text.length) yield { body: text.slice(start), start };
}

/** Sentence segmentation retains original UTF-16 offsets, CRLF, emoji, and quote positions. */
function collect(
  job: Readonly<NormalizedJob>,
  yesPatterns: readonly RegExp[],
  noPatterns: readonly RegExp[],
): Collected {
  const results: Extracted[] = [];
  const incompleteEvidence: JobSignalEvidence[] = [];
  const potentialUnparsedEvidence: JobSignalEvidence[] = [];
  const seen = new Set<string>();
  const fields: readonly JobSignalField[] = ['title', 'description', 'location'];
  for (const field of fields) {
    const text = job[field];
    if (typeof text !== 'string') continue;
    const limit = field === 'description' ? 20_000 : 300;
    if (text.length > limit) throw new Error('Invalid job signal source field length');
    for (const clause of sourceClauses(text)) {
      const body = clause.body;
      if (body.length > 800 || (ignoredClause(body) && firstPartyContrast.test(body))) {
        // Never silently discard coverage: omitted prose can reverse any
        // apparent positive OR negative claim in another source clause/field.
        // This includes third-party comparisons containing a first-party
        // counterstatement. Preserve exact bounded source evidence without
        // inventing a polarity for the omitted clause.
        const end = clause.start + body.length;
        const start = Math.max(clause.start, end - MAX_QUOTE);
        const excerpt = Object.freeze({
          field,
          start,
          end,
          endExclusive: true as const,
          offsetUnit: 'utf16' as const,
          quote: text.slice(start, end),
        });
        if (incompleteEvidence.length < 2) incompleteEvidence.push(excerpt);
        else incompleteEvidence[1] = excerpt;
        continue;
      }
      if (ignoredClause(body)) continue;
      const firstClauseMatch = results.length;
      for (const [polarity, patterns] of [
        ['no', noPatterns],
        ['yes', yesPatterns],
      ] as const) {
        for (const pattern of patterns) {
          // MatchAll makes this call independent of shared RegExp.lastIndex state.
          for (const match of body.matchAll(pattern)) {
            const offset = match.index ?? -1;
            if (offset < 0 || match[0].length > MAX_QUOTE || quoted(text, clause.start + offset)) continue;
            if (match.groups?.scope && !geographicScope(match.groups.scope)) continue;
            if (patterns === sponsorNo && sponsorContextualDenials.has(pattern)) {
              // Abbreviated role exclusion must refer back to a real, explicit
              // sponsorship offer in this or the immediately preceding clause.
              const start = clause.start + offset;
              const relevantClaim = results.some(
                (earlier) =>
                  earlier.polarity === 'yes' &&
                  earlier.span.field === field &&
                  earlier.span.end <= start &&
                  start - earlier.span.end <= 180,
              );
              // "No" patterns run before "yes" patterns in one clause,
              // so inspect only the preceding part of the same clause here.
              const sameClauseClaim = sponsorYes.some((positive) =>
                [...body.matchAll(positive)].some((prior) => {
                  if (prior.index < 0 || prior.index + prior[0].length > offset) return false;
                  // The restriction must qualify sponsorship itself, not
                  // an intervening unrelated benefit such as training.
                  const bridge = body.slice(prior.index + prior[0].length, offset);
                  return /^[\s,;:—–-]*(?:for\s+(?:this|the)\s+(?:specific\s+)?(?:role|position|job|opening))?[\s,;:—–-]*(?:but\s*)?$/i.test(
                    bridge,
                  );
                }),
              );
              // A distant offer never lends sponsorship meaning to "training
              // only for citizens" or another unrelated in-sentence subject.
              const standaloneClause = body.slice(0, offset).trim().length === 0;
              if (!sameClauseClaim && !(relevantClaim && standaloneClause)) continue;
            }
            // A bare "US only" in a *location* is a candidate restriction;
            // the same words in prose may qualify customers, not applicants.
            if (polarity === 'no' && pattern === worldwideNo[3] && field !== 'location') continue;
            if (polarity === 'yes' && negatedPrefix(body, offset)) continue;
            if (
              polarity === 'yes' &&
              patterns === worldwideYes &&
              /\b(?:is\s+)?(?:not\s+available|not\s+allowed|not\s+permitted|unavailable)\b/i.test(
                body.slice(offset + match[0].length, offset + match[0].length + 35),
              )
            )
              continue;
            const start = clause.start + offset;
            const end = start + match[0].length;
            const key = `${field}:${start}:${end}:${polarity}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push({
              polarity,
              span: Object.freeze({
                field,
                start,
                end,
                endExclusive: true,
                offsetUnit: 'utf16',
                quote: text.slice(start, end),
              }),
              jurisdictions: match.groups?.scope ? [match.groups.scope] : jurisdictions(match[0]),
            });
          }
        }
      }
      const foundExplicitNegative = results.slice(firstClauseMatch).some((item) => item.polarity === 'no');
      if (
        !foundExplicitNegative &&
        (possibleUnparsedApplicantLimit(body, noPatterns, text, clause.start) ||
          (field === 'location' && noPatterns === worldwideNo && possibleUnparsedLocationLimit(body)))
      ) {
        // A short, applicable but unclassified qualifier is missing coverage.
        // Preserve text but never invent a "no" counterclaim from this cue.
        const end = clause.start + body.length;
        const start = Math.max(clause.start, end - MAX_QUOTE);
        const excerpt = Object.freeze({
          field,
          start,
          end,
          endExclusive: true as const,
          offsetUnit: 'utf16' as const,
          quote: text.slice(start, end),
        });
        if (potentialUnparsedEvidence.length < 2) potentialUnparsedEvidence.push(excerpt);
        else potentialUnparsedEvidence[1] = excerpt;
      }
    }
  }
  // An unparsed qualifier only changes a signal whose source made at least
  // one concrete polarity claim; otherwise the ordinary unknown stays empty.
  if (results.length && potentialUnparsedEvidence.length) {
    for (const excerpt of potentialUnparsedEvidence) {
      if (incompleteEvidence.length < 2) incompleteEvidence.push(excerpt);
      else incompleteEvidence[1] = excerpt;
    }
  }
  return { matches: results, incompleteEvidence };
}

function signal(collected: Collected, overrideMatches?: readonly Extracted[]): Readonly<JobSignal> {
  const matches = overrideMatches ?? collected.matches;
  if (collected.incompleteEvidence.length) {
    // No confidence from partial parsing, even if every recognized clause
    // agrees. This does NOT imply a contradictory employer statement.
    const excerpts = collected.incompleteEvidence;
    return Object.freeze({
      status: 'unknown',
      evidence: Object.freeze([
        ...matches.slice(0, MAX_SPANS - excerpts.length).map((match) => match.span),
        ...excerpts,
      ]),
      jurisdictions: Object.freeze([]),
    });
  }
  const yes = matches.filter((match) => match.polarity === 'yes');
  const no = matches.filter((match) => match.polarity === 'no');
  const status: JobSignalStatus =
    yes.length && no.length
      ? 'conflicting'
      : yes.length
        ? 'explicit_yes'
        : no.length
          ? 'explicit_no'
          : 'unknown';
  const selected =
    status === 'conflicting'
      ? [yes[0]!, no[0]!, ...matches.filter((match) => match !== yes[0] && match !== no[0])].slice(
          0,
          MAX_SPANS,
        )
      : matches.slice(0, MAX_SPANS);
  const scopes = new Set<string>();
  for (const match of matches) {
    for (const jurisdiction of match.jurisdictions) {
      if (scopes.size < MAX_JURISDICTIONS) scopes.add(jurisdiction);
    }
  }
  return Object.freeze({
    status,
    evidence: Object.freeze(selected.map((match) => match.span)),
    jurisdictions: Object.freeze([...scopes]),
  });
}

export function extractJobSignals(job: Readonly<NormalizedJob>): Readonly<JobSignals> {
  const authorizationMatches = collect(job, authorizationYes, authorizationNo);
  const remoteMatches = collect(job, worldwideYes, worldwideNo);
  const sponsorMatches = collect(job, sponsorYes, sponsorNo);
  const relocationMatches = collect(job, relocationYes, relocationNo);
  const authRequirement = authorizationMatches.matches.filter((match) => match.polarity === 'yes');
  const hasExplicitSponsorship = sponsorMatches.matches.some((match) => match.polarity === 'yes');
  // A claim that sponsorship is offered, and an independently explicit
  // prerequisite to already possess authorization, cannot both be endorsed.
  const sponsorship = signal(
    sponsorMatches,
    hasExplicitSponsorship && authRequirement.length
      ? [
          ...sponsorMatches.matches,
          ...authRequirement.map((match) => ({ ...match, polarity: 'no' as const })),
        ]
      : sponsorMatches.matches,
  );
  return Object.freeze({
    ...(job.workplace === undefined ? {} : { workplace: job.workplace }),
    remoteEligibility: signal(remoteMatches),
    sponsorship,
    relocationAssistance: signal(relocationMatches),
    workAuthorization: signal(authorizationMatches),
    company: Object.freeze({ name: job.companyName, sourceTrust: 'caller_supplied' as const }),
  });
}
