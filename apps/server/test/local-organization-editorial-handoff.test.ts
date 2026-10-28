import { describe, expect, it, vi } from 'vitest';

import {
  LocalOrganizationHandoffError,
  prepareLocalOrganizationEditorialHandoff,
} from '../src/organizations/local-editorial-handoff.js';

function sample() {
  return {
    organizationUrn: 'urn:li:organization:123456789',
    drafts: [{ id: 'launch-1', text: 'Our launch announcement.\n#CompanyNews ✨' }],
  };
}

function invalid(input: unknown): void {
  try {
    prepareLocalOrganizationEditorialHandoff(input);
    throw new Error('Expected organization editorial handoff rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(LocalOrganizationHandoffError);
    expect((error as LocalOrganizationHandoffError).kind).toBe('invalid_input');
    expect(String(error)).not.toMatch(/SECRET|PRIVATE|canary|TOKEN|password/u);
  }
}

describe('M13.0 pure local organization editorial handoff', () => {
  it('returns the exact manual-only, unverified output for one caller draft', () => {
    const input = sample();
    expect(prepareLocalOrganizationEditorialHandoff(input)).toEqual({
      kind: 'local_organization_editorial_handoff',
      status: 'manual_editorial_handoff_only',
      provenance: 'caller_supplied_unverified',
      organizationUrn: 'urn:li:organization:123456789',
      organizationAuthorization: 'not_evaluated',
      organizationRole: 'not_verified',
      scopes: 'not_checked',
      approval: 'not_issued',
      publication: 'not_attempted',
      schedule: 'not_created',
      providerData: 'not_fetched',
      drafts: [{ id: 'launch-1', text: 'Our launch announcement.\n#CompanyNews ✨' }],
      warnings: ['organization_claim_unverified', 'manual_copy_only', 'no_org_permissions_or_publication'],
    });
  });

  it('keeps five distinct ordered drafts and preserves caller text verbatim', () => {
    const input = {
      organizationUrn: 'urn:li:organization:1',
      drafts: [
        { id: 'A', text: '  Leading and trailing spaces  ' },
        { id: 'a', text: '### Markdown is copied, not rendered\n<pre>literal</pre>' },
        { id: 'id.3', text: 'مرحبا 汉字 café e\u0301 🌍' },
        { id: 'id_4', text: 'Line one\r\nLine two\t#Tag' },
        { id: 'fifth-5', text: 'Text with valid surrogate pair: 🧪' },
      ],
    };
    const result = prepareLocalOrganizationEditorialHandoff(input);
    expect(result.drafts).toEqual(input.drafts);
    expect(result.drafts.map(({ id }) => id)).toEqual(['A', 'a', 'id.3', 'id_4', 'fifth-5']);
    expect(result.drafts.every(({ text }, i) => text === input.drafts[i]?.text)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/lifecycleState|OFFICIAL_API|postUrn|approved_role/u);
  });

  it('deeply freezes the output and drafts without mutating or aliasing the caller input', () => {
    const input = sample();
    Object.freeze(input.drafts[0]);
    Object.freeze(input.drafts);
    Object.freeze(input);
    const result = prepareLocalOrganizationEditorialHandoff(input);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.drafts)).toBe(true);
    expect(Object.isFrozen(result.drafts[0])).toBe(true);
    expect(Object.isFrozen(result.warnings)).toBe(true);
    expect(result.drafts).not.toBe(input.drafts);
    expect(result.drafts[0]).not.toBe(input.drafts[0]);
    expect(() => (result.drafts as unknown as unknown[]).push('canary')).toThrow();
    expect(() => ((result.drafts[0] as unknown as { text: string }).text = 'SECRET')).toThrow();
  });

  it('enforces the organization URN and unique ASCII draft-ID grammar', () => {
    for (const organizationUrn of [
      '',
      'urn:li:organization:0',
      'urn:li:organization:01',
      'urn:li:organization:-1',
      'urn:li:organization:12345678901234567890',
      'urn:li:organization:١',
      'urn:li:organizationBrand:123',
      'urn:li:person:123',
      'https://www.linkedin.com/company/123',
      'urn:li:organization:1?token=SECRET',
      'urn:li:organization:1\n',
      'urn:li:organization:\uD800',
    ])
      invalid({ ...sample(), organizationUrn });
    for (const id of ['', '.bad', '_bad', '-bad', ' bad', 'café', '🔑', 'A'.repeat(41), 'id/2', 'id\n3']) {
      invalid({ ...sample(), drafts: [{ id, text: 'good' }] });
    }
    invalid({
      ...sample(),
      drafts: [
        { id: 'dup', text: 'one' },
        { id: 'dup', text: 'two' },
      ],
    });
  });

  it('rejects missing, extra, secret-bearing, symbolic and non-enumerable keys at every depth', () => {
    invalid({ ...sample(), SECRET_OAUTH_TOKEN: 'canary' });
    invalid({ ...sample(), organizationUrn: undefined });
    invalid({ drafts: sample().drafts });
    invalid({ organizationUrn: sample().organizationUrn });
    invalid({ ...sample(), drafts: [{ id: 'good', text: 'content', role: 'SECRET_ADMIN' }] });
    invalid({ ...sample(), drafts: [{ id: 'good', text: 'content', PRIVATE_TOKEN: 'canary' }] });
    invalid({ ...sample(), drafts: [{ id: 'good', text: 'content', media: 'SECRET' }] });
    const symbolRoot = sample() as Record<PropertyKey, unknown>;
    symbolRoot[Symbol('SECRET')] = 'canary';
    invalid(symbolRoot);
    const symbolDraft = sample();
    Object.defineProperty(symbolDraft.drafts[0], Symbol('PRIVATE'), { value: 'canary' });
    invalid(symbolDraft);
    const nonEnumerable = sample();
    Object.defineProperty(nonEnumerable.drafts[0], 'SECRET_FIELD', { value: 'canary' });
    invalid(nonEnumerable);
    const nonEnumerableRoot = sample();
    Object.defineProperty(nonEnumerableRoot, 'organizationUrn', {
      value: sample().organizationUrn,
      enumerable: false,
    });
    invalid(nonEnumerableRoot);
  });

  it('rejects empty and overlong draft lists, sparse arrays and abnormal array keys', () => {
    invalid({ ...sample(), drafts: [] });
    invalid({ ...sample(), drafts: Array.from({ length: 6 }, (_, i) => ({ id: 'd' + i, text: 'x' })) });
    invalid({ ...sample(), drafts: 'not an array' });
    invalid({ ...sample(), drafts: null });
    const sparse = sample();
    sparse.drafts = Array.from({ length: 3 }, (_, i) => ({ id: 'd' + i, text: 'x' }));
    Reflect.deleteProperty(sparse.drafts, '1');
    invalid(sparse);
    const extra = sample();
    Object.defineProperty(extra.drafts, 'PRIVATE_TOKEN', { value: 'canary' });
    invalid(extra);
    const symbol = sample();
    Object.defineProperty(symbol.drafts, Symbol('private'), { value: 'canary' });
    invalid(symbol);
    const hiddenIndex = sample();
    Object.defineProperty(hiddenIndex.drafts, '0', { value: { id: 'd', text: 'x' }, enumerable: false });
    invalid(hiddenIndex);
  });

  it('rejects whitespace-only and overlong text, malformed UTF-16 and oversized UTF-8 inputs', () => {
    for (const text of ['', '   \n\t ', 'x'.repeat(3001), '\uD800', '\uDC00', 'ok\uD800end', 'a\uDC00b']) {
      invalid({ ...sample(), drafts: [{ id: 'valid', text }] });
    }
    const large = Array.from({ length: 5 }, (_, i) => ({ id: 'id-' + i, text: '🧪'.repeat(1500) }));
    invalid({ ...sample(), drafts: large }); // 3,000 UTF-16 units/draft but over 16 KiB UTF-8.
    const tooLong = { ...sample(), drafts: [{ id: 'x', text: 'x'.repeat(3000) }] };
    expect(prepareLocalOrganizationEditorialHandoff(tooLong).drafts[0]?.text).toHaveLength(3000);
  });

  it('rejects proxy and revoked-proxy objects or arrays without invoking getters', () => {
    const rootProxy = new Proxy(sample(), {});
    invalid(rootProxy);
    const revoked = Proxy.revocable(sample(), {});
    revoked.revoke();
    invalid(revoked.proxy);
    const arrayProxy = sample();
    arrayProxy.drafts = new Proxy(arrayProxy.drafts, {});
    invalid(arrayProxy);
    const draftProxy = sample();
    draftProxy.drafts[0] = new Proxy(draftProxy.drafts[0]!, {});
    invalid(draftProxy);
    const getter = vi.fn(() => {
      throw new Error('SECRET getter canary');
    });
    const root = sample();
    Object.defineProperty(root, 'organizationUrn', { enumerable: true, get: getter });
    invalid(root);
    const draft = sample();
    Object.defineProperty(draft.drafts[0], 'text', { enumerable: true, get: getter });
    invalid(draft);
    const array = sample();
    Object.defineProperty(array.drafts, '0', { enumerable: true, get: getter });
    invalid(array);
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects inherited values and polluted/abnormal prototypes', () => {
    invalid(Object.assign(Object.create(null), sample()));
    const inherited = Object.create({ organizationUrn: 'urn:li:organization:1' }) as Record<string, unknown>;
    inherited.drafts = sample().drafts;
    invalid(inherited);
    const altered = sample();
    Object.setPrototypeOf(altered, { organizationUrn: 'urn:li:organization:1' });
    invalid(altered);
    const inheritedArray = sample();
    Object.setPrototypeOf(inheritedArray.drafts, []);
    invalid(inheritedArray);
    const inheritedDraft = sample();
    Object.setPrototypeOf(inheritedDraft.drafts[0], { text: 'PRIVATE' });
    invalid(inheritedDraft);
  });

  it('performs no clock, fetch, filesystem, provider, account or authorization work', () => {
    const input = sample();
    const now = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw Error('SECRET clock');
    });
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw Error('SECRET network');
    });
    try {
      const result = prepareLocalOrganizationEditorialHandoff(input);
      expect(result.publication).toBe('not_attempted');
      expect(result.organizationAuthorization).toBe('not_evaluated');
      expect(now).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
      fetch.mockRestore();
    }
  });

  it('bounds the exact UTF-8 output and uses fixed sanitized typed errors', () => {
    const input = sample();
    input.drafts = Array.from({ length: 5 }, (_, i) => ({ id: 'd-' + i, text: 'x'.repeat(3000) }));
    const result = prepareLocalOrganizationEditorialHandoff(input);
    expect(Buffer.byteLength(JSON.stringify(input), 'utf8')).toBeLessThanOrEqual(16_384);
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(32_768);
    const error = new LocalOrganizationHandoffError('output_too_large');
    expect(error.kind).toBe('output_too_large');
    expect(error.message).not.toMatch(/SECRET|PRIVATE|canary/u);
  });
});
