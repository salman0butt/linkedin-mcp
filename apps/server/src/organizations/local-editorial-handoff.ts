import { types } from 'node:util';

const MAX_INPUT_BYTES = 16 * 1024;
const MAX_OUTPUT_BYTES = 32 * 1024;
const ORGANIZATION_URN = /^urn:li:organization:[1-9][0-9]{0,18}$/u;
const DRAFT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/u;

export class LocalOrganizationHandoffError extends Error {
  constructor(readonly kind: 'invalid_input' | 'output_too_large') {
    super(
      kind === 'invalid_input'
        ? 'Invalid local organization editorial handoff input.'
        : 'Local organization editorial handoff exceeds its output size limit.',
    );
    this.name = 'LocalOrganizationHandoffError';
  }
}

export interface LocalOrganizationEditorialHandoff {
  readonly kind: 'local_organization_editorial_handoff';
  readonly status: 'manual_editorial_handoff_only';
  readonly provenance: 'caller_supplied_unverified';
  readonly organizationUrn: string;
  readonly organizationAuthorization: 'not_evaluated';
  readonly organizationRole: 'not_verified';
  readonly scopes: 'not_checked';
  readonly approval: 'not_issued';
  readonly publication: 'not_attempted';
  readonly schedule: 'not_created';
  readonly providerData: 'not_fetched';
  readonly drafts: readonly Readonly<{ id: string; text: string }>[];
  readonly warnings: readonly [
    'organization_claim_unverified',
    'manual_copy_only',
    'no_org_permissions_or_publication',
  ];
}

function invalid(): never {
  throw new LocalOrganizationHandoffError('invalid_input');
}

/**
 * Reject all inherited, non-enumerable, symbolic, accessor and proxy fields
 * before accessing any caller-owned property value.
 */
function exactOwnRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid();
  }

  const ownNames = Reflect.ownKeys(value);
  if (
    ownNames.length !== keys.length ||
    ownNames.some((key) => typeof key !== 'string' || !keys.includes(key))
  ) {
    invalid();
  }
  const ownDescriptors = Object.getOwnPropertyDescriptors(value);
  const safe = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = ownDescriptors[key];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
    safe[key] = descriptor.value as unknown;
  }
  return safe;
}

function exactDenseDraftArray(value: unknown): readonly unknown[] {
  if (
    value === null ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    invalid();
  }
  const length = value.length;
  if (length < 1 || length > 5 || Reflect.ownKeys(value).length !== length + 1) invalid();
  const drafts: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
    drafts.push(descriptor.value);
  }
  return drafts;
}

function fullMatch(pattern: RegExp, value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = pattern.exec(value);
  // JavaScript's '$' may match immediately before a terminal newline.
  return match !== null && match[0] === value;
}

function validSurrogates(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const pair = value.charCodeAt(++index);
      if (pair < 0xdc00 || pair > 0xdfff) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

/** Strictly local copy package; never fetches a company, verifies roles or publishes. */
export function prepareLocalOrganizationEditorialHandoff(
  input: unknown,
): Readonly<LocalOrganizationEditorialHandoff> {
  const root = exactOwnRecord(input, ['organizationUrn', 'drafts']);
  const organizationUrn = root.organizationUrn;
  if (!fullMatch(ORGANIZATION_URN, organizationUrn) || organizationUrn.length > 128) {
    invalid();
  }

  const rawDrafts = exactDenseDraftArray(root.drafts);
  const ids = new Set<string>();
  const drafts: Readonly<{ id: string; text: string }>[] = [];
  for (const rawDraft of rawDrafts) {
    const draft = exactOwnRecord(rawDraft, ['id', 'text']);
    const id = draft.id;
    const text = draft.text;
    if (
      !fullMatch(DRAFT_ID, id) ||
      ids.has(id) ||
      typeof text !== 'string' ||
      text.length > 3_000 ||
      !text.trim() ||
      !validSurrogates(text)
    ) {
      invalid();
    }
    ids.add(id);
    drafts.push(Object.freeze({ id, text }));
  }

  const normalizedInput = { organizationUrn, drafts };
  if (Buffer.byteLength(JSON.stringify(normalizedInput), 'utf8') > MAX_INPUT_BYTES) invalid();

  const result: LocalOrganizationEditorialHandoff = Object.freeze({
    kind: 'local_organization_editorial_handoff',
    status: 'manual_editorial_handoff_only',
    provenance: 'caller_supplied_unverified',
    organizationUrn,
    organizationAuthorization: 'not_evaluated',
    organizationRole: 'not_verified',
    scopes: 'not_checked',
    approval: 'not_issued',
    publication: 'not_attempted',
    schedule: 'not_created',
    providerData: 'not_fetched',
    drafts: Object.freeze(drafts),
    warnings: Object.freeze([
      'organization_claim_unverified',
      'manual_copy_only',
      'no_org_permissions_or_publication',
    ] as const),
  });
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_OUTPUT_BYTES) {
    throw new LocalOrganizationHandoffError('output_too_large');
  }
  return result;
}
