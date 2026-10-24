import { describe, expect, it } from 'vitest';

import type { NormalizedJob } from '../../../packages/core/src/job-discovery.js';
import { extractJobSignals } from '../src/jobs/job-signals.js';

const baseline: Readonly<NormalizedJob> = {
  id: 'listing-9',
  title: 'Senior Software Engineer',
  companyName: 'Unverified Example Employer',
  source: {
    provider: 'EXTERNAL_DISCOVERY',
    id: 'source-1',
    name: 'Unverified user-supplied snapshot',
    retrievedAt: '2026-10-24T08:00:00.000Z',
  },
  postingDate: { state: 'unknown' },
};

function job(fields: Partial<NormalizedJob> = {}): Readonly<NormalizedJob> {
  return { ...baseline, ...fields };
}

function assertExactSpans(
  input: Readonly<NormalizedJob>,
  result: ReturnType<typeof extractJobSignals>,
  allowIncompleteEvidence = false,
) {
  for (const signal of [
    result.remoteEligibility,
    result.sponsorship,
    result.relocationAssistance,
    result.workAuthorization,
  ]) {
    expect(Object.isFrozen(signal)).toBe(true);
    expect(Object.isFrozen(signal.evidence)).toBe(true);
    expect(signal.evidence.length).toBeLessThanOrEqual(8);
    if (signal.status === 'unknown') {
      if (!allowIncompleteEvidence) expect(signal.evidence).toEqual([]);
    } else expect(signal.evidence.length).toBeGreaterThan(0);
    for (const span of signal.evidence) {
      const source = input[span.field];
      expect(typeof source).toBe('string');
      expect(span.offsetUnit).toBe('utf16');
      expect(span.endExclusive).toBe(true);
      expect(span.start).toBeGreaterThanOrEqual(0);
      expect(span.end).toBeGreaterThan(span.start);
      expect(span.quote).toBe((source as string).slice(span.start, span.end));
      expect(span.quote.length).toBeLessThanOrEqual(240);
      expect(Object.isFrozen(span)).toBe(true);
    }
  }
}

describe('M07.3 conservative source-anchored job signals', () => {
  it('returns unknown worldwide permission for a plain remote workplace, without fabrication', () => {
    const input = job({
      workplace: 'remote',
      location: 'Remote',
      description: 'Remote position. Visa and relocation information to follow.',
    });
    const result = extractJobSignals(input);
    expect(result.workplace).toBe('remote');
    expect(result.remoteEligibility.status).toBe('unknown');
    expect(result.sponsorship.status).toBe('unknown');
    expect(result.relocationAssistance.status).toBe('unknown');
    expect(result.workAuthorization.status).toBe('unknown');
    expect(result.company).toEqual({ name: input.companyName, sourceTrust: 'caller_supplied' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.company)).toBe(true);
    assertExactSpans(input, result);
  });

  it('extracts explicit worldwide remote eligibility from a description without relying on workplace', () => {
    const input = job({ description: 'Enjoy flexible hours. Work from anywhere in the world!' });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('explicit_yes');
    expect(result.sponsorship.status).toBe('unknown');
    assertExactSpans(input, result);
  });

  it('records a jurisdiction restriction as no worldwide eligibility, not as employer sponsorship', () => {
    const input = job({ location: 'Remote within US only', workplace: 'remote' });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('explicit_no');
    expect(result.remoteEligibility.evidence[0]?.field).toBe('location');
    expect(result.remoteEligibility.jurisdictions).toContain('US');
    expect(result.sponsorship.status).toBe('unknown');
    assertExactSpans(input, result);
  });

  it('does not endorse global remote when a different field restricts candidates to the US', () => {
    const input = job({
      title: '🌍 Remote Engineer',
      description: 'Work from anywhere in the world.',
      location: 'US only',
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('conflicting');
    expect(result.remoteEligibility.evidence.map((span) => span.field)).toEqual(
      expect.arrayContaining(['description', 'location']),
    );
    assertExactSpans(input, result);
  });

  it('detects positive sponsorship contradicted by required existing authorization across fields', () => {
    const input = job({
      description: 'We offer visa sponsorship for this position.',
      location: 'US work authorization required',
    });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('conflicting');
    expect(result.sponsorship.evidence.map((span) => span.field)).toEqual(
      expect.arrayContaining(['description', 'location']),
    );
    expect(result.workAuthorization.status).toBe('explicit_yes');
    expect(result.workAuthorization.jurisdictions).toContain('US');
    assertExactSpans(input, result);
  });

  it('does not treat a pre-existing authorization requirement alone as proof of no sponsorship', () => {
    const input = job({ description: 'Applicants must already be authorized to work in Germany.' });
    const result = extractJobSignals(input);
    expect(result.workAuthorization.status).toBe('explicit_yes');
    expect(result.sponsorship.status).toBe('unknown');
    assertExactSpans(input, result);
  });

  it('handles explicit visa refusals and does not reverse their polarity', () => {
    const input = job({
      description: 'We do not provide visa sponsorship. Must have existing US work authorization.',
    });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('explicit_no');
    expect(result.workAuthorization.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it('marks positive and negative visa commitments in one description conflicting', () => {
    const input = job({ description: 'Visa sponsorship available. No visa sponsorship for this role.' });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('conflicting');
    expect(result.sponsorship.evidence.length).toBeGreaterThanOrEqual(2);
    assertExactSpans(input, result);
  });

  it('treats relocation assistance as independent of visa sponsorship', () => {
    const input = job({ description: 'Relocation assistance provided. We do not sponsor work visas.' });
    const result = extractJobSignals(input);
    expect(result.relocationAssistance.status).toBe('explicit_yes');
    expect(result.sponsorship.status).toBe('explicit_no');
    assertExactSpans(input, result);
  });

  it('distinguishes no relocation assistance from mere relocation mentions', () => {
    const denied = job({ description: 'No relocation assistance is provided for this position.' });
    expect(extractJobSignals(denied).relocationAssistance.status).toBe('explicit_no');
    const ambiguous = job({
      description: 'We may require relocation. Visa information is discussed at interview.',
    });
    const result = extractJobSignals(ambiguous);
    expect(result.relocationAssistance.status).toBe('unknown');
    expect(result.sponsorship.status).toBe('unknown');
    assertExactSpans(ambiguous, result);
  });

  it('ignores attributed quotes, examples and speculative signals', () => {
    const input = job({
      description:
        'Other companies say "Visa sponsorship available"; that is not our policy. For example, "Work from anywhere" is a slogan. Sponsorship may be considered.',
    });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('unknown');
    expect(result.remoteEligibility.status).toBe('unknown');
    assertExactSpans(input, result);
  });

  it('preserves emoji and CRLF UTF-16 spans for text that appears in the title', () => {
    const input = job({
      title: '🌍 Visa sponsorship available',
      description: 'Intro\r\nWork from anywhere in the world.',
    });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('explicit_yes');
    expect(result.sponsorship.evidence.some((span) => span.field === 'title' && span.start === 3)).toBe(true);
    expect(result.remoteEligibility.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it('keeps a stable output bound even when the description repeats positive claims', () => {
    const input = job({ description: 'We provide visa sponsorship. '.repeat(200) });
    const first = extractJobSignals(input);
    expect(first.sponsorship.status).toBe('explicit_yes');
    expect(first.sponsorship.evidence.length).toBeLessThanOrEqual(8);
    expect(first).toEqual(extractJobSignals(input));
    expect(JSON.stringify(first)).not.toContain('200');
    assertExactSpans(input, first);
  });

  it('does not infer employer legitimacy or geography from company name', () => {
    const input = job({
      companyName: 'Official US Global Visa Sponsorship Recruitment Agency',
      description: '',
    });
    const result = extractJobSignals(input);
    expect(result.company).toEqual({ name: input.companyName, sourceTrust: 'caller_supplied' });
    expect(result.remoteEligibility.status).toBe('unknown');
    expect(result.sponsorship.status).toBe('unknown');
    assertExactSpans(input, result);
  });

  it('handles dotted U.S. restrictions as one intact exact quoted source', () => {
    const input = job({
      description: 'Work from anywhere in the world.',
      location: 'Remote within U.S. only',
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('conflicting');
    expect(result.remoteEligibility.jurisdictions).toContain('US');
    expect(
      result.remoteEligibility.evidence.some((e) => e.field === 'location' && e.quote.includes('U.S.')),
    ).toBe(true);
    assertExactSpans(input, result);
  });

  it('recognizes explicit visas-sponsored offers but preserves authorization contradiction', () => {
    const input = job({
      description: 'Visas sponsored for this role.',
      location: 'U.S. work authorization required',
    });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('conflicting');
    expect(result.workAuthorization.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it('does not turn worldwide remote expressly not available into a worldwide yes', () => {
    const input = job({ description: 'Worldwide remote is not available for this position.' });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('explicit_no');
    assertExactSpans(input, result);
  });

  it('does not treat US-only customers as restricting the applicant geography', () => {
    const input = job({ description: 'Support US only customers. Work from anywhere in the world.' });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it('does not let an attributed example in one sentence suppress a real commitment in the next', () => {
    const input = job({
      description: 'Other companies say "visa sponsorship available." We offer visa sponsorship.',
    });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it.each([
    ['Work from anywhere in the world, but only if you live in Germany.', 'Germany'],
    ['Work from anywhere in the world, provided you are resident in the US.', 'US'],
    ['Work from anywhere in the world. You must reside in Canada.', 'Canada'],
    ['Work from anywhere in the world. Applicants must be based in the UK.', 'UK'],
  ])('does not promote conditional international remote permission: %s', (description, country) => {
    const input = job({ description });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('conflicting');
    expect(result.remoteEligibility.evidence.length).toBeGreaterThanOrEqual(2);
    expect(result.remoteEligibility.jurisdictions).toContain(country);
    expect(
      result.remoteEligibility.evidence.some((e) => e.quote.toLowerCase().includes('work from anywhere')),
    ).toBe(true);
    assertExactSpans(input, result);
  });

  it('does not endorse sponsorship explicitly excluded for this specific role', () => {
    const input = job({ description: 'Visa sponsorship available, but not for this specific role.' });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('conflicting');
    expect(result.sponsorship.evidence.some((e) => e.quote.includes('Visa sponsorship available'))).toBe(
      true,
    );
    expect(result.sponsorship.evidence.some((e) => e.quote.includes('not for this specific role'))).toBe(
      true,
    );
    assertExactSpans(input, result);
  });

  it('never construes an unanchored not-for-this-role claim as a visa denial', () => {
    const input = job({ description: 'Training is available, but not for this role.' });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('unknown');
    assertExactSpans(input, result);
  });

  it('does not restrict world-wide remote eligibility merely because it serves residents of Canada', () => {
    const input = job({
      description: 'We serve customers resident in Canada. Work from anywhere in the world.',
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it('reconciles a remote promise in title against a residence constraint in location', () => {
    const input = job({ title: 'Work from anywhere in the world', location: 'You must reside in Canada' });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('conflicting');
    expect(result.remoteEligibility.evidence.map((span) => span.field)).toEqual(
      expect.arrayContaining(['title', 'location']),
    );
    assertExactSpans(input, result);
  });

  it('understands a dotted U.S. country in a qualification clause', () => {
    const input = job({
      description: 'Work from anywhere in the world, provided you are resident in the U.S.',
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('conflicting');
    expect(result.remoteEligibility.jurisdictions).toContain('US');
    assertExactSpans(input, result);
  });

  it('handles a short denial of the sponsorship offer in the next sentence', () => {
    const input = job({ description: 'Visa sponsorship available. But not for this role.' });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('conflicting');
    expect(result.sponsorship.evidence.some((span) => span.quote === 'But not for this role')).toBe(true);
    assertExactSpans(input, result);
  });

  it.each([
    ['Work from anywhere in the world, but only if you live in Pakistan.', 'Pakistan'],
    ['Work from anywhere in the world. You must reside in France.', 'France'],
    ['Work from anywhere in the world. Applicants must be based in Poland.', 'Poland'],
    ['Work from anywhere in the world. You must reside in New York.', 'New York'],
    ['Work from anywhere in the world, provided you are resident in Pakistan.', 'Pakistan'],
  ])(
    'does not advertise unrestricted global remote when applicant residence is limited: %s',
    (description, scope) => {
      const input = job({ description });
      const result = extractJobSignals(input);
      expect(result.remoteEligibility.status).toBe('conflicting');
      expect(result.remoteEligibility.jurisdictions).toContain(scope);
      expect(
        result.remoteEligibility.evidence.some((span) => span.quote.includes('Work from anywhere')),
      ).toBe(true);
      expect(result.remoteEligibility.evidence.some((span) => span.quote.includes(scope))).toBe(true);
      assertExactSpans(input, result);
    },
  );

  it.each([
    ['Visa sponsorship available, but not for applicants from Pakistan.', 'Pakistan'],
    ['Visa sponsorship available only for US citizens.', 'US'],
    ['Visa sponsorship available. Only for French citizens.', 'French'],
  ])(
    'does not claim unconditional visa sponsorship when eligibility is restricted: %s',
    (description, scope) => {
      const input = job({ description });
      const result = extractJobSignals(input);
      expect(result.sponsorship.status).toBe('conflicting');
      expect(result.sponsorship.jurisdictions).toContain(scope);
      expect(
        result.sponsorship.evidence.some((span) =>
          span.quote.toLowerCase().includes('sponsorship available'),
        ),
      ).toBe(true);
      expect(result.sponsorship.evidence.some((span) => span.quote.includes(scope))).toBe(true);
      assertExactSpans(input, result);
    },
  );

  it('recognizes a location restriction across fields without assuming a finite country list', () => {
    const input = job({
      title: 'Work from anywhere in the world',
      location: 'Applicants must be based in Poland',
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('conflicting');
    expect(result.remoteEligibility.jurisdictions).toContain('Poland');
    expect(result.remoteEligibility.evidence.map((span) => span.field)).toEqual(
      expect.arrayContaining(['title', 'location']),
    );
    assertExactSpans(input, result);
  });

  it('does not convert a restriction on customers into an applicant-residency restriction', () => {
    const input = job({
      description: 'Our customers must reside in France. Work from anywhere in the world.',
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it('does not treat unrelated citizenship and visa text as sponsored visa eligibility', () => {
    const input = job({
      description: 'Training is available only for US citizens. We discuss visa rules during interviews.',
    });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('unknown');
    assertExactSpans(input, result);
  });

  it('does not attribute unrelated citizen-only training benefits to sponsorship in the same clause', () => {
    const input = job({ description: 'Visa sponsorship available, but training only for US citizens.' });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it('does not attribute a citizen-only benefit in a later sentence to sponsorship', () => {
    const input = job({ description: 'Visa sponsorship available. Training is only for US citizens.' });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it('does not count a non-geographic residence condition as an explicit jurisdiction', () => {
    const input = job({
      description: 'Work from anywhere in the world. You must reside in your assigned workspace.',
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it.each([
    ['Work from anywhere in the world, but only if you live in pakistan.', 'pakistan'],
    ['Work from anywhere in the world. Applicants must reside in france.', 'france'],
    ['Work from anywhere in the world. You must reside in poland.', 'poland'],
    ['Work from anywhere in the world, provided you are resident in canada.', 'canada'],
  ])(
    'does not grant worldwide eligibility for lowercase explicit applicant residence: %s',
    (description, scope) => {
      const input = job({ description });
      const result = extractJobSignals(input);
      expect(result.remoteEligibility.status).toBe('conflicting');
      expect(result.remoteEligibility.jurisdictions.some((value) => value.toLowerCase() === scope)).toBe(
        true,
      );
      expect(result.remoteEligibility.evidence.some((span) => span.quote.includes(scope))).toBe(true);
      assertExactSpans(input, result);
    },
  );

  it.each([
    ['Visa sponsorship available, but not for applicants from pakistan.', 'pakistan'],
    ['Visa sponsorship available only for french citizens.', 'french'],
    ['Visa sponsorship available. Only for pakistani citizens.', 'pakistani'],
  ])(
    'does not grant unqualified sponsorship for lowercase citizenship and origin exclusions: %s',
    (description, scope) => {
      const input = job({ description });
      const result = extractJobSignals(input);
      expect(result.sponsorship.status).toBe('conflicting');
      expect(result.sponsorship.jurisdictions).toContain(scope);
      expect(result.sponsorship.evidence.some((span) => span.quote.includes(scope))).toBe(true);
      assertExactSpans(input, result);
    },
  );

  it.each([
    'Work from anywhere in the world. You must reside in your assigned workspace.',
    'Work from anywhere in the world. Applicants must reside in workspace.',
    'Work from anywhere in the world. You must reside in the office.',
    'Work from anywhere in the world. You must reside in our local facility.',
  ])('does not classify generic lowercase workspace objects as jurisdiction: %s', (description) => {
    const result = extractJobSignals(job({ description }));
    expect(result.remoteEligibility.status).toBe('explicit_yes');
  });

  it('does not confuse lowercase customers residency with job applicant restrictions', () => {
    const input = job({
      description: 'Our customers must reside in pakistan. Work from anywhere in the world.',
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it('does not confuse lowercase training benefits with visa eligibility', () => {
    const input = job({ description: 'Visa sponsorship available, but training only for french citizens.' });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it('does not call worldwide remote unconditional when the employer only hires France-based applicants', () => {
    const input = job({
      description: 'Work from anywhere in the world. We only hire candidates based in France.',
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('conflicting');
    expect(result.remoteEligibility.jurisdictions).toContain('France');
    expect(
      result.remoteEligibility.evidence.some((span) =>
        span.quote.includes('only hire candidates based in France'),
      ),
    ).toBe(true);
    assertExactSpans(input, result);
  });

  it.each([
    'Visa sponsorship available, but only for candidates living in Pakistan.',
    'Visa sponsorship available, but only to applicants from France.',
  ])(
    'does not claim unconditional visa sponsorship with an explicit applicant origin restriction: %s',
    (description) => {
      const input = job({ description });
      const result = extractJobSignals(input);
      const scope = description.includes('Pakistan') ? 'Pakistan' : 'France';
      expect(result.sponsorship.status).toBe('conflicting');
      expect(result.sponsorship.jurisdictions).toContain(scope);
      expect(
        result.sponsorship.evidence.some((span) => span.quote.includes('Visa sponsorship available')),
      ).toBe(true);
      expect(result.sponsorship.evidence.some((span) => span.quote.includes(scope))).toBe(true);
      assertExactSpans(input, result);
    },
  );

  it('attributes resident-in-France sponsorship limits to France, never applicants, with a complete exact source quote', () => {
    const input = job({ description: 'Visa sponsorship available only for applicants resident in France.' });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('conflicting');
    expect(result.sponsorship.jurisdictions).toContain('France');
    expect(result.sponsorship.jurisdictions).not.toContain('applicants');
    expect(result.sponsorship.evidence.some((span) => span.quote.includes('resident in France'))).toBe(true);
    assertExactSpans(input, result);
  });

  it('does not confuse France-only customers or training with applicant eligibility', () => {
    const input = job({
      description:
        'Work from anywhere in the world. We only hire vendors serving customers based in France. Visa sponsorship available, but training is only for candidates living in Pakistan.',
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('explicit_yes');
    expect(result.sponsorship.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it('withholds worldwide-remote yes if an overlength later clause might contain a France-only hiring restriction', () => {
    const description =
      'Work from anywhere in the world. ' +
      'This is further background information '.repeat(28) +
      ' We only hire candidates based in France';
    const input = job({ description });
    const result = extractJobSignals(input);
    expect(description.length).toBeLessThan(20_000);
    expect(result.remoteEligibility.status).toBe('unknown');
    expect(result.remoteEligibility.evidence.some((span) => span.quote.includes('Work from anywhere'))).toBe(
      true,
    );
    expect(result.remoteEligibility.evidence.some((span) => span.quote.includes('France'))).toBe(true);
    expect(result.remoteEligibility.jurisdictions).toEqual([]);
    assertExactSpans(input, result, true);
  });

  it('withholds unconditional visa yes if an overlength later clause might deny sponsorship', () => {
    const description =
      'Visa sponsorship available. ' +
      'Some information about our role '.repeat(31) +
      ' Visa sponsorship is not available';
    const input = job({ description });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('unknown');
    expect(
      result.sponsorship.evidence.some((span) => span.quote.includes('Visa sponsorship available')),
    ).toBe(true);
    expect(result.sponsorship.evidence.some((span) => span.quote.includes('not available'))).toBe(true);
    assertExactSpans(input, result, true);
  });

  it.each([
    [
      'remoteEligibility',
      'Work from anywhere in the world. ' + 'x'.repeat(830) + 'You must reside in Pakistan',
      'Pakistan',
    ],
    [
      'sponsorship',
      'Visa sponsorship available. ' + 'x'.repeat(830) + 'but only for candidates living in France',
      'France',
    ],
  ] as const)(
    'does not silently skip a tail restriction inside a single overlong clause: %s',
    (kind, description, marker) => {
      const input = job({ description });
      const result = extractJobSignals(input);
      expect(result[kind].status).toBe('unknown');
      expect(result[kind].evidence.some((span) => span.quote.includes(marker))).toBe(true);
      expect(result[kind].evidence.length).toBeLessThanOrEqual(8);
      assertExactSpans(input, result, true);
    },
  );

  it('withholds explicit_no if a later oversized source clause was not interpreted', () => {
    const input = job({
      description: 'No visa sponsorship. ' + 'x'.repeat(830) + ' Visa sponsorship available',
    });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('unknown');
    expect(result.sponsorship.evidence.some((span) => span.quote.includes('No visa sponsorship'))).toBe(true);
    assertExactSpans(input, result, true);
  });

  it('uses uncertainty rather than invented negative polarity for an overlong customer-only clause', () => {
    const input = job({
      description:
        'Work from anywhere in the world. ' + 'x'.repeat(830) + 'Our customers must reside in France',
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('unknown');
    expect(result.remoteEligibility.evidence.some((span) => span.quote.includes('France'))).toBe(true);
    assertExactSpans(input, result, true);
  });

  it('does not trust worldwide remote when a third-party comparison embeds a first-party France restriction', () => {
    const input = job({
      description:
        'Work from anywhere in the world. Other companies may hire globally, but we only hire candidates based in France.',
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('unknown');
    expect(
      result.remoteEligibility.evidence.some((span) =>
        span.quote.includes('but we only hire candidates based in France'),
      ),
    ).toBe(true);
    assertExactSpans(input, result, true);
  });

  it('does not trust visa sponsorship when third-party attribution embeds a first-party denial', () => {
    const input = job({
      description:
        'Visa sponsorship available. Some companies may sponsor applicants, but we do not offer visa sponsorship for this role.',
    });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('unknown');
    expect(
      result.sponsorship.evidence.some((span) => span.quote.includes('but we do not offer visa sponsorship')),
    ).toBe(true);
    assertExactSpans(input, result, true);
  });

  it('continues to ignore unrelated third-party examples without manufacturing conflicting evidence', () => {
    const input = job({
      description:
        'Other companies may hire globally, and some companies may sponsor visas. Our team values craftsmanship.',
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('unknown');
    expect(result.sponsorship.status).toBe('unknown');
    expect(result.remoteEligibility.evidence).toEqual([]);
    expect(result.sponsorship.evidence).toEqual([]);
    assertExactSpans(input, result);
  });

  it.each([
    ['Work from anywhere in the world. Only applicants from France may apply.', 'France'],
    ['Work from anywhere in the world. Eligibility limited to residents of Pakistan.', 'Pakistan'],
    ['Work from anywhere in the world. We accept applications only from candidates in France.', 'France'],
  ])(
    'withholds worldwide eligibility for otherwise unrecognized applicant limits: %s',
    (description, country) => {
      const input = job({ description });
      const result = extractJobSignals(input);
      expect(result.remoteEligibility.status).toBe('unknown');
      expect(result.remoteEligibility.evidence.some((span) => span.quote.includes(country))).toBe(true);
      assertExactSpans(input, result, true);
    },
  );

  it.each([
    ['Visa sponsorship available. Only applicants living in Pakistan qualify.', 'Pakistan'],
    ['Visa sponsorship available. Sponsorship restricted to citizens of France.', 'France'],
    ['Visa sponsorship available. Applicants must live in Pakistan to qualify for visa support.', 'Pakistan'],
  ])(
    'withholds sponsorship certainty for unrecognized origin, residence or qualification limits: %s',
    (description, country) => {
      const input = job({ description });
      const result = extractJobSignals(input);
      expect(result.sponsorship.status).toBe('unknown');
      expect(result.sponsorship.evidence.some((span) => span.quote.includes(country))).toBe(true);
      assertExactSpans(input, result, true);
    },
  );

  it('does not mistake customers qualifying for training for applicant restrictions on either signal', () => {
    const input = job({
      description:
        'Work from anywhere in the world. Visa sponsorship available. Only customers living in France qualify for training. Training restricted to candidates from Pakistan.',
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('explicit_yes');
    expect(result.sponsorship.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it('does not let earlier customer context hide a later applicant-only remote restriction in the same clause', () => {
    const input = job({
      description:
        'Work from anywhere in the world. We work with customers in France and only hire applicants based in Pakistan',
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('unknown');
    expect(
      result.remoteEligibility.evidence.some((span) =>
        span.quote.includes('only hire applicants based in Pakistan'),
      ),
    ).toBe(true);
    assertExactSpans(input, result, true);
  });

  it('does not let earlier customer training context hide a later sponsorship applicant restriction', () => {
    const input = job({
      description:
        'Visa sponsorship available. We provide training for customers and only applicants living in Pakistan qualify',
    });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('unknown');
    expect(
      result.sponsorship.evidence.some((span) =>
        span.quote.includes('only applicants living in Pakistan qualify'),
      ),
    ).toBe(true);
    assertExactSpans(input, result, true);
  });

  it('does not let earlier customers context hide later France-citizen sponsorship restrictions', () => {
    const input = job({
      description:
        'Visa sponsorship available. We support customers and sponsorship restricted to citizens of France',
    });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('unknown');
    expect(
      result.sponsorship.evidence.some((span) =>
        span.quote.includes('sponsorship restricted to citizens of France'),
      ),
    ).toBe(true);
    assertExactSpans(input, result, true);
  });

  it('keeps training-only eligibility from qualifying as a job visa restriction despite a previous sponsorship offer', () => {
    const input = job({
      description: 'Visa sponsorship available. Only applicants living in Pakistan qualify for training.',
    });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it.each([
    ['Work from anywhere in the world, except Pakistan.', 'Pakistan'],
    ['Work from anywhere in the world, except for candidates based in Pakistan.', 'Pakistan'],
    ['Work from anywhere in the world. Applicants in France are ineligible.', 'France'],
  ])(
    'does not assert unconditional worldwide eligibility after a geographical exclusion: %s',
    (description, place) => {
      const input = job({ description });
      const result = extractJobSignals(input);
      expect(result.remoteEligibility.status).toBe('unknown');
      expect(result.remoteEligibility.evidence.some((span) => span.quote.includes(place))).toBe(true);
      assertExactSpans(input, result, true);
    },
  );

  it.each([
    ['Visa sponsorship available, except for applicants from Pakistan.', 'Pakistan'],
    ['Visa sponsorship available. Applicants from Pakistan are not eligible.', 'Pakistan'],
  ])('does not assert unconditional sponsorship after an applicant exclusion: %s', (description, place) => {
    const input = job({ description });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('unknown');
    expect(result.sponsorship.evidence.some((span) => span.quote.includes(place))).toBe(true);
    assertExactSpans(input, result, true);
  });

  it('does not hide employer restriction in a comma-led third-party comparison', () => {
    const input = job({
      description:
        'Work from anywhere in the world. Other companies hire everywhere, we only hire applicants based in France.',
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('unknown');
    expect(
      result.remoteEligibility.evidence.some((span) =>
        span.quote.includes('we only hire applicants based in France'),
      ),
    ).toBe(true);
    assertExactSpans(input, result, true);
  });

  it('does not treat a customer exclusion as an exception to global remote permission', () => {
    const input = job({ description: 'Work from anywhere in the world, except for customers in Pakistan.' });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it.each(['Remote within Pakistan only', 'Remote within France only', 'France only', 'Remote from Poland'])(
    'does not grant unconditional worldwide remote against an unrecognized geographical location constraint: %s',
    (location) => {
      const input = job({ description: 'Work from anywhere in the world.', location });
      const result = extractJobSignals(input);
      expect(result.remoteEligibility.status).toBe('unknown');
      expect(
        result.remoteEligibility.evidence.some(
          (span) => span.field === 'location' && span.quote.includes(location),
        ),
      ).toBe(true);
      assertExactSpans(input, result, true);
    },
  );

  it('keeps an existing explicitly recognized US-only location conflict instead of reclassifying it as unknown', () => {
    const input = job({ description: 'Work from anywhere in the world.', location: 'Remote within US only' });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('conflicting');
    expect(result.remoteEligibility.jurisdictions).toContain('US');
    assertExactSpans(input, result);
  });

  it('does not mistake a customer service location for a geographic remote-work restriction', () => {
    const input = job({
      description: 'Work from anywhere in the world.',
      location: 'Remote customer service',
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it.each([
    ['Other companies say "Jobs are flexible. Visa sponsorship available."', 'sponsorship'],
    ['Other employers claim "We hire worldwide. Work from anywhere in the world."', 'remoteEligibility'],
    ['For example: "Candidates can apply. Work from anywhere in the world."', 'remoteEligibility'],
    ['Other companies say “Their benefits are generous. Visa sponsorship available.”', 'sponsorship'],
  ] as const)(
    'never promotes a quoted third-party assertion in a later sentence into employer policy: %s',
    (description, signal) => {
      const input = job({ description });
      const result = extractJobSignals(input);
      expect(result[signal].status).toBe('unknown');
      expect(result[signal].evidence).toEqual([]);
      assertExactSpans(input, result);
    },
  );

  it.each([
    [
      'Other companies say "Jobs are flexible. Visa sponsorship available." We offer visa sponsorship.',
      'sponsorship',
      'We offer visa sponsorship',
    ],
    [
      'Other employers claim "We hire worldwide. Work from anywhere in the world." We provide work from anywhere in the world.',
      'remoteEligibility',
      'work from anywhere in the world',
    ],
    [
      'Other companies say “Their benefits are generous. Visa sponsorship available.” We offer visa sponsorship.',
      'sponsorship',
      'We offer visa sponsorship',
    ],
    [
      'A competitor says "Their remote policy is flexible. Work from anywhere in the world."\r\n🌍 Work from anywhere in the world.',
      'remoteEligibility',
      'Work from anywhere in the world',
    ],
  ] as const)(
    'recognizes an independent first-party statement after a multi-sentence quotation closes: %s',
    (description, signal, phrase) => {
      const input = job({ description });
      const result = extractJobSignals(input);
      expect(result[signal].status).toBe('explicit_yes');
      expect(result[signal].evidence.length).toBeGreaterThan(0);
      expect(result[signal].evidence.some((span) => span.quote.includes(phrase))).toBe(true);
      for (const span of result[signal].evidence) {
        expect(span.start).toBeGreaterThan(
          description.indexOf('"') >= 0 ? description.lastIndexOf('"') : description.lastIndexOf('”'),
        );
      }
      assertExactSpans(input, result);
    },
  );

  it('does not treat an apostrophe in a preceding unquoted sentence as an opening quotation', () => {
    const input = job({
      description:
        "Our customers don't need an account. Visa sponsorship available. Work from anywhere in the world.",
    });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('explicit_yes');
    expect(result.remoteEligibility.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it('preserves quoted source-wide single-quote boundaries and accepts a later employer assertion', () => {
    const input = job({
      description:
        "Other companies say 'Jobs are flexible. Visa sponsorship available.' We offer visa sponsorship.",
    });
    const result = extractJobSignals(input);
    expect(result.sponsorship.status).toBe('explicit_yes');
    expect(result.sponsorship.evidence).toHaveLength(1);
    expect(result.sponsorship.evidence[0]?.start).toBeGreaterThan(input.description!.lastIndexOf("'"));
    assertExactSpans(input, result);
  });

  it('does not treat an earlier plural possessive apostrophe as an unclosed quoted span', () => {
    const input = job({
      description: "Candidates' previous experiences matter. Work from anywhere in the world.",
    });
    const result = extractJobSignals(input);
    expect(result.remoteEligibility.status).toBe('explicit_yes');
    assertExactSpans(input, result);
  });

  it.each([
    [
      'Visa sponsorship available. Other companies say "Their policy differs. Only applicants from France may apply."',
      'sponsorship',
    ],
    [
      'Work from anywhere in the world. For example: "Some employers have restrictions. Only applicants from France may apply."',
      'remoteEligibility',
    ],
  ] as const)(
    'does not interpret quoted third-party applicant qualifiers as first-party uncertainty: %s',
    (description, signal) => {
      const input = job({ description });
      const result = extractJobSignals(input);
      expect(result[signal].status).toBe('explicit_yes');
      expect(result[signal].evidence).toHaveLength(1);
      assertExactSpans(input, result);
    },
  );
});
