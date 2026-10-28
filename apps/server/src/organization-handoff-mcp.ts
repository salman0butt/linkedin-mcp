import type { McpServer } from '@modelcontextprotocol/server';
import { types } from 'node:util';
import * as z from 'zod/v4';

import {
  LocalOrganizationHandoffError,
  prepareLocalOrganizationEditorialHandoff,
} from './organizations/local-editorial-handoff.js';

interface Dependencies {
  createRequestId: () => string;
  now: () => Date;
}

const MAX_WIRE_BYTES = 262_144;
const ENVELOPE_ALLOWANCE_BYTES = 2_048;
const ERROR_MESSAGE = 'Organization editorial handoff could not be safely prepared.' as const;
type ErrorCode = 'invalid_input' | 'invalid_output' | 'output_too_large';

const organizationUrn = z
  .string()
  .min(1)
  .max(128)
  .regex(/^urn:li:organization:[1-9][0-9]{0,18}$/u);
const draftId = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/u);
const text = z
  .string()
  .min(1)
  .max(3_000)
  .refine((value) => value.trim().length > 0, 'Invalid organization draft text.');
const draftInput = z.strictObject(
  { id: draftId, text },
  { error: () => 'Invalid organization editorial draft fields.' },
);
const input = z.strictObject(
  {
    organizationUrn,
    drafts: z.array(draftInput).min(1).max(5),
  },
  { error: () => 'Invalid organization editorial handoff request.' },
);

const data = z.strictObject({
  kind: z.literal('local_organization_editorial_handoff'),
  status: z.literal('manual_editorial_handoff_only'),
  provenance: z.literal('caller_supplied_unverified'),
  organizationUrn,
  organizationAuthorization: z.literal('not_evaluated'),
  organizationRole: z.literal('not_verified'),
  scopes: z.literal('not_checked'),
  approval: z.literal('not_issued'),
  publication: z.literal('not_attempted'),
  schedule: z.literal('not_created'),
  providerData: z.literal('not_fetched'),
  drafts: z.array(draftInput).min(1).max(5),
  warnings: z.tuple([
    z.literal('organization_claim_unverified'),
    z.literal('manual_copy_only'),
    z.literal('no_org_permissions_or_publication'),
  ]),
});
const output = z.strictObject({
  status: z.enum(['succeeded', 'failed']),
  data: data.optional(),
  provider: z.strictObject({
    type: z.literal('LOCAL_ONLY'),
    name: z.literal('linkedin-mcp'),
  }),
  error: z
    .strictObject({
      code: z.enum(['invalid_input', 'invalid_output', 'output_too_large']),
      message: z.literal(ERROR_MESSAGE),
      retryable: z.literal(false),
    })
    .optional(),
  metadata: z.strictObject({
    requestId: z.string().min(1).max(128),
    timestamp: z.string().max(30),
  }),
});

function reply(deps: Dependencies, status: 'succeeded' | 'failed', value?: unknown, code?: ErrorCode) {
  let requestId = 'invalid-request-id';
  try {
    const hostId = deps.createRequestId();
    if (typeof hostId === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(hostId)) {
      requestId = hostId;
    }
  } catch {
    // Host IDs are never trusted as output data.
  }

  let timestamp = '1970-01-01T00:00:00.000Z';
  try {
    const clock = deps.now();
    if (clock instanceof Date && !types.isProxy(clock)) {
      timestamp = Date.prototype.toISOString.call(clock);
    }
  } catch {
    // Do not read injected Date getters, hostile prototypes or invalid clocks.
  }
  const metadata = { requestId, timestamp };
  const provider = { type: 'LOCAL_ONLY' as const, name: 'linkedin-mcp' as const };
  const fixedError = (kind: ErrorCode) => ({
    code: kind,
    message: ERROR_MESSAGE,
    retryable: false as const,
  });
  let body = {
    status,
    ...(value === undefined ? {} : { data: value }),
    provider,
    ...(code === undefined ? {} : { error: fixedError(code) }),
    metadata,
  };
  let serialized = JSON.stringify(body);
  const fullBytes =
    Buffer.byteLength(
      JSON.stringify({
        content: [{ type: 'text', text: serialized }],
        structuredContent: body,
      }),
      'utf8',
    ) + ENVELOPE_ALLOWANCE_BYTES;
  if (fullBytes > MAX_WIRE_BYTES) {
    body = { status: 'failed', provider, error: fixedError('output_too_large'), metadata };
    serialized = JSON.stringify(body);
  }
  return {
    content: [{ type: 'text' as const, text: serialized }],
    structuredContent: body,
    ...(body.status === 'succeeded' ? {} : { isError: true as const }),
  };
}

/**
 * Stateless, caller-authored manual editorial handoff.
 * Does not access organization roles, OAuth, provider, approval, calendar, or any private store.
 */
export function registerOrganizationEditorialHandoffTools(server: McpServer, deps: Dependencies): void {
  server.registerTool(
    'linkedin.organization.content_handoff.prepare',
    {
      description:
        'Prepare 1–5 caller-written company-page drafts for manual handoff; organization identity, roles and publication are NOT verified.',
      inputSchema: input,
      outputSchema: output,
    },
    (values) => {
      try {
        const prepared = prepareLocalOrganizationEditorialHandoff(values);
        if (!data.safeParse(prepared).success) {
          return reply(deps, 'failed', undefined, 'invalid_output');
        }
        const response = reply(deps, 'succeeded', prepared);
        if (!output.safeParse(response.structuredContent).success) {
          return reply(deps, 'failed', undefined, 'invalid_output');
        }
        return response;
      } catch (error) {
        const code: ErrorCode =
          error instanceof LocalOrganizationHandoffError && error.kind === 'output_too_large'
            ? 'output_too_large'
            : 'invalid_input';
        return reply(deps, 'failed', undefined, code);
      }
    },
  );
}
