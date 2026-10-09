import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createTextPostPreview } from '../../../packages/core/dist/index.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthService } from '../src/auth/auth-service.js';
import { createLinkedInMcpServer } from '../src/create-server.js';
import { createApprovalService } from '../src/publishing/approval-service.js';
import type { CreateTextPostInput } from '../src/publishing/linkedin-posts.js';
import { createTextPostService } from '../src/publishing/text-post-service.js';
import { TextPostServiceError } from '../src/publishing/text-post-service.js';
import { IdempotencyLedgerError } from '../src/publishing/idempotency-ledger.js';

const activeClients: Client[] = [];
const activeHandlers: Array<ReturnType<typeof createMcpHandler>> = [];

afterEach(async () => {
  await Promise.all(activeClients.splice(0).map((client) => client.close()));
  await Promise.all(activeHandlers.splice(0).map((handler) => handler.close()));
});

async function connect(deps: unknown = {}) {
  const handler = createMcpHandler(() => createLinkedInMcpServer(deps as never));
  activeHandlers.push(handler);
  return connectTo(handler);
}

async function connectTo(handler: ReturnType<typeof createMcpHandler>) {
  const client = new Client({ name: 'text-post-contract-test', version: '1.0.0' });
  activeClients.push(client);
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  await client.connect(transport);
  return client;
}

const canonicalPreview = createTextPostPreview({
  text: 'A safe post preview',
  visibility: 'CONNECTIONS',
  disableReshare: true,
});

describe('M02 text-post MCP contract', () => {
  it('previews text locally with core canonical output and no configured dependencies', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'linkedin.post.preview.text',
      arguments: { text: 'A safe post preview', visibility: 'CONNECTIONS', disableReshare: true },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: {
        ...canonicalPreview,
      },
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      metadata: { audit: { operation: 'post.preview.text', payloadHash: canonicalPreview.payloadHash } },
    });
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.structuredContent) }]);
  });

  it('issues approval from local status only after explicit confirmation and canonical hash match', async () => {
    const getStatus = vi.fn(() =>
      Promise.resolve({
        state: 'connected' as const,
        provider: 'OFFICIAL_API' as const,
        scopes: ['openid', 'w_member_social'],
        refreshAvailable: false,
        subject: 'member-123',
      }),
    );
    const getProviderContext = vi.fn(() => Promise.reject(new Error('must not get provider context')));
    const getProfile = vi.fn(() => Promise.reject(new Error('must not fetch identity')));
    const auth = {
      getStatus,
      getProviderContext,
      getProfile,
    } as unknown as AuthService;
    const approvals = createApprovalService({
      now: () => new Date('2026-10-08T12:00:00.000Z'),
      randomId: () => 'receipt-test-only',
    });
    const client = await connect({ authService: auth, publishing: { approvals } });
    const result = await client.callTool({
      name: 'linkedin.post.approve.text',
      arguments: {
        payload: canonicalPreview.payload,
        payloadHash: canonicalPreview.payloadHash,
        approved: true,
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: {
        receiptId: 'receipt-test-only',
        payloadHash: canonicalPreview.payloadHash,
        provider: 'LOCAL_ONLY',
      },
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      metadata: { audit: { operation: 'post.approve.text', payloadHash: canonicalPreview.payloadHash } },
    });
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(getProviderContext).not.toHaveBeenCalled();
    expect(getProfile).not.toHaveBeenCalled();
  });

  it.each([false, undefined])('requires literal approved:true (received %j)', async (approved) => {
    const getStatus = vi.fn();
    const issue = vi.fn();
    const client = await connect({
      authService: { getStatus } as unknown as AuthService,
      publishing: { approvals: { issue } },
    });
    const result = await client.callTool({
      name: 'linkedin.post.approve.text',
      arguments: {
        payload: canonicalPreview.payload,
        payloadHash: canonicalPreview.payloadHash,
        ...(approved === undefined ? {} : { approved }),
      },
    });

    expect(result.isError).toBe(true);
    expect(getStatus).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
  });

  it('maps approval status, subject and scope gates without issuing receipts', async () => {
    const cases = [
      { state: 'authorization_pending', expected: 'human_action_required' },
      { state: 'disconnected', expected: 'permission_required' },
      { state: 'expired', expected: 'permission_required' },
      { state: 'error', expected: 'failed' },
      { state: 'connected', scopes: ['openid'], subject: 'member-123', expected: 'permission_required' },
      {
        state: 'connected',
        scopes: ['openid', 'w_member_social'],
        subject: '   ',
        expected: 'permission_required',
      },
      { state: 'connected', scopes: ['openid', 'w_member_social'], expected: 'permission_required' },
    ] as const;

    for (const [index, scenario] of cases.entries()) {
      const getStatus = vi.fn(() =>
        Promise.resolve({
          state: scenario.state,
          provider: 'OFFICIAL_API',
          scopes: 'scopes' in scenario ? [...scenario.scopes] : ['openid', 'w_member_social'],
          refreshAvailable: false,
          ...('subject' in scenario ? { subject: scenario.subject } : {}),
        }),
      );
      const auth = {
        getStatus,
      } as unknown as AuthService;
      const approvals = createApprovalService({ randomId: () => `unused-${index}` });
      const issue = vi.spyOn(approvals, 'issue');
      const client = await connect({ authService: auth, publishing: { approvals } });
      const result = await client.callTool({
        name: 'linkedin.post.approve.text',
        arguments: {
          payload: canonicalPreview.payload,
          payloadHash: canonicalPreview.payloadHash,
          approved: true,
        },
      });

      expect((result.structuredContent as { status: string }).status).toBe(scenario.expected);
      expect(issue).not.toHaveBeenCalled();
      expect(getStatus).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects an approval hash mismatch before reading local authorization state', async () => {
    const getStatus = vi.fn();
    const auth = { getStatus } as unknown as AuthService;
    const approvals = createApprovalService();
    const issue = vi.spyOn(approvals, 'issue');
    const client = await connect({ authService: auth, publishing: { approvals } });
    const result = await client.callTool({
      name: 'linkedin.post.approve.text',
      arguments: { payload: canonicalPreview.payload, payloadHash: '0'.repeat(64), approved: true },
    });

    expect(result.structuredContent).toMatchObject({
      status: 'failed',
      error: { code: 'payload_hash_mismatch' },
    });
    expect(getStatus).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
  });

  it('reports unconfigured publishing after receipt preflight without creating a publisher', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'linkedin.post.create.text',
      arguments: {
        payload: canonicalPreview.payload,
        approvalReceiptId: 'valid-shaped-receipt',
        idempotencyKey: 'raw-key',
      },
    });

    expect(result.structuredContent).toMatchObject({
      status: 'permission_required',
      provider: { type: 'OFFICIAL_API', name: 'LinkedIn' },
      error: { code: 'publishing_not_configured', retryable: false },
    });
  });

  it.each([undefined, null, 7, {}, '', '   '])(
    'returns structured requires_approval for malformed receipt %j before the publisher',
    async (approvalReceiptId) => {
      const publish = vi.fn(() => Promise.reject(new Error('publisher must not be called')));
      const client = await connect({
        publishing: {
          approvals: createApprovalService(),
          textPostService: { publish },
        },
      });
      const arguments_ = {
        payload: canonicalPreview.payload,
        idempotencyKey: 'safe-key-1',
        ...(approvalReceiptId === undefined ? {} : { approvalReceiptId }),
      };
      const result = await client.callTool({ name: 'linkedin.post.create.text', arguments: arguments_ });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        status: 'requires_approval',
        provider: { type: 'OFFICIAL_API', name: 'LinkedIn' },
        error: { code: 'approval_required', retryable: false },
      });
      expect(publish).not.toHaveBeenCalled();
      expect((result.structuredContent as { error?: { message?: string } }).error?.message).toBe(
        'A valid approval receipt is required.',
      );
    },
  );

  it.each([
    ['approval_not_found', 'requires_approval', 'A valid approval receipt is required.'],
    ['approval_expired', 'requires_approval', 'A valid approval receipt is required.'],
    ['approval_mismatch', 'requires_approval', 'A valid approval receipt is required.'],
    ['approval_consumed', 'requires_approval', 'A valid approval receipt is required.'],
    ['auth_unconfigured', 'permission_required', 'LinkedIn member authorization is not configured.'],
    ['not_connected', 'permission_required', 'LinkedIn member authorization is required.'],
    ['reauth_required', 'permission_required', 'LinkedIn member authorization is required.'],
    ['permission_required', 'permission_required', 'LinkedIn member authorization is required.'],
    ['rate_limited', 'rate_limited', 'LinkedIn rate limits prevented this operation.'],
    ['outcome_unknown', 'partial', 'The post outcome is unknown; do not retry with a new key.'],
    ['invalid_payload', 'failed', 'Text publishing did not complete.'],
    ['idempotency_conflict', 'failed', 'Text publishing did not complete.'],
    ['provider_conflict', 'failed', 'Text publishing did not complete.'],
    ['storage_failure', 'failed', 'Text publishing did not complete.'],
  ] as const)(
    'maps publishing service error %s to %s with the exact safe envelope',
    async (kind, expectedStatus, message) => {
      const requestId = `request-${kind}`;
      const now = () => new Date('2026-10-08T12:00:00.000Z');
      const publish = vi.fn(() => Promise.reject(new TextPostServiceError(kind)));
      const client = await connect({
        createRequestId: () => requestId,
        now,
        publishing: { approvals: createApprovalService(), textPostService: { publish } },
      });
      const result = await client.callTool({
        name: 'linkedin.post.create.text',
        arguments: {
          payload: canonicalPreview.payload,
          approvalReceiptId: 'test-receipt-secret',
          idempotencyKey: 'test-raw-key-secret',
        },
      });

      const expected = {
        status: expectedStatus,
        ...(kind === 'outcome_unknown' ? { data: { state: 'outcome_unknown' } } : {}),
        provider: { type: 'OFFICIAL_API', name: 'LinkedIn' },
        error: { code: kind, message, retryable: false },
        metadata: {
          requestId,
          timestamp: now().toISOString(),
          audit: { operation: 'post.create.text', payloadHash: canonicalPreview.payloadHash },
        },
      };
      expect(result.structuredContent).toEqual(expected);
      expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(expected) }]);
      expect(publish).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result.structuredContent)).not.toContain('test-receipt-secret');
      expect(JSON.stringify(result.structuredContent)).not.toContain('test-raw-key-secret');
    },
  );

  it('sanitizes unknown publisher exceptions and never reflects their cause', async () => {
    const publish = vi.fn(() => Promise.reject(new Error('bearer top-secret-provider-body')));
    const client = await connect({
      publishing: { approvals: createApprovalService(), textPostService: { publish } },
    });
    const result = await client.callTool({
      name: 'linkedin.post.create.text',
      arguments: {
        payload: canonicalPreview.payload,
        approvalReceiptId: 'test-receipt-secret',
        idempotencyKey: 'test-raw-key-secret',
      },
    });

    expect(result.structuredContent).toMatchObject({
      status: 'failed',
      error: { code: 'provider_failure', message: 'Text publishing did not complete.' },
    });
    const serialized = JSON.stringify(result.structuredContent);
    expect(serialized).not.toContain('top-secret-provider-body');
    expect(serialized).not.toContain('test-receipt-secret');
    expect(serialized).not.toContain('test-raw-key-secret');
  });

  it.each([
    {
      state: 'verified' as const,
      replay: false,
      verification: { state: 'verified' as const },
      warnings: undefined,
    },
    {
      state: 'created_unverified' as const,
      replay: false,
      verification: { state: 'created_unverified' as const, reason: 'read_permission_unavailable' as const },
      warnings: ['The post was created, but read confirmation is unavailable or did not match.'],
    },
    {
      state: 'verification_failed' as const,
      replay: true,
      verification: { state: 'verification_failed' as const, reason: 'read_not_found' as const },
      warnings: ['The post was created, but read confirmation is unavailable or did not match.'],
    },
  ])('preserves the exact Task 6 success envelope for $state', async (scenario) => {
    const requestId = `request-${scenario.state}`;
    const now = () => new Date('2026-10-08T12:00:00.000Z');
    const data = {
      state: 'succeeded' as const,
      provider: 'OFFICIAL_API' as const,
      postUrn: 'urn:li:ugcPost:34567',
      replay: scenario.replay,
      verification: scenario.verification,
    };
    const publish = vi.fn(() => Promise.resolve(data));
    const client = await connect({
      createRequestId: () => requestId,
      now,
      publishing: { approvals: createApprovalService(), textPostService: { publish } },
    });
    const result = await client.callTool({
      name: 'linkedin.post.create.text',
      arguments: {
        payload: canonicalPreview.payload,
        approvalReceiptId: 'receipt-private',
        idempotencyKey: 'key-private',
      },
    });
    const expected = {
      status: 'succeeded',
      data,
      provider: { type: 'OFFICIAL_API', name: 'LinkedIn' },
      ...(scenario.warnings === undefined ? {} : { warnings: scenario.warnings }),
      metadata: {
        requestId,
        timestamp: now().toISOString(),
        audit: {
          operation: 'post.create.text',
          payloadHash: canonicalPreview.payloadHash,
          replay: scenario.replay,
        },
      },
    };

    expect(result.structuredContent).toEqual(expected);
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(expected) }]);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result.structuredContent)).not.toContain('receipt-private');
    expect(JSON.stringify(result.structuredContent)).not.toContain('key-private');
  });

  it('rejects strict create root, nested, array and blank-key controls before any dependency effect', async () => {
    const authGetStatus = vi.fn();
    const approvals = createApprovalService();
    const issue = vi.spyOn(approvals, 'issue');
    const publish = vi.fn();
    const client = await connect({
      authService: { getStatus: authGetStatus } as unknown as AuthService,
      publishing: { approvals, textPostService: { publish } },
    });
    const controls = [
      { author: 'urn:li:person:private' },
      { token: 'private' },
      { provider: 'fake' },
      { memberPostReadEnabled: true },
      { publishingLedgerPath: '/tmp/private' },
      { apiVersion: '202610' },
      { approvalTtlMs: 1 },
      { payload: { ...canonicalPreview.payload, author: 'urn:li:person:private' } },
      { payload: { ...canonicalPreview.payload, token: 'private' } },
      {
        payload: {
          ...canonicalPreview.payload,
          distribution: { ...canonicalPreview.payload.distribution, provider: 'fake' },
        },
      },
      {
        payload: {
          ...canonicalPreview.payload,
          distribution: { ...canonicalPreview.payload.distribution, targetEntities: ['urn:li:person:1'] },
        },
      },
      {
        payload: {
          ...canonicalPreview.payload,
          distribution: {
            ...canonicalPreview.payload.distribution,
            thirdPartyDistributionChannels: ['OTHER'],
          },
        },
      },
    ];
    const results = await Promise.all([
      ...controls.map((control) =>
        client.callTool({
          name: 'linkedin.post.create.text',
          arguments: {
            payload: canonicalPreview.payload,
            approvalReceiptId: 'valid-shaped-receipt',
            idempotencyKey: 'raw-key',
            ...control,
          },
        }),
      ),
      ...['', '   '].map((idempotencyKey) =>
        client.callTool({
          name: 'linkedin.post.create.text',
          arguments: {
            payload: canonicalPreview.payload,
            approvalReceiptId: 'valid-shaped-receipt',
            idempotencyKey,
          },
        }),
      ),
    ]);

    expect(results.every((result) => result.isError === true)).toBe(true);
    expect(authGetStatus).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('retains strict preview and approval root and nested rejection through real MCP clients', async () => {
    const authGetStatus = vi.fn();
    const approvals = createApprovalService();
    const issue = vi.spyOn(approvals, 'issue');
    const publish = vi.fn();
    const client = await connect({
      authService: { getStatus: authGetStatus } as unknown as AuthService,
      publishing: { approvals, textPostService: { publish } },
    });
    const previewInput = { text: 'strict validation' };
    const approvalInput = {
      payload: canonicalPreview.payload,
      payloadHash: canonicalPreview.payloadHash,
      approved: true,
    };
    const results = await Promise.all([
      client.callTool({
        name: 'linkedin.post.preview.text',
        arguments: { ...previewInput, apiVersion: '202610' },
      }),
      client.callTool({
        name: 'linkedin.post.approve.text',
        arguments: {
          ...approvalInput,
          payload: { ...canonicalPreview.payload, author: 'urn:li:person:private' },
        },
      }),
      client.callTool({
        name: 'linkedin.post.approve.text',
        arguments: {
          ...approvalInput,
          payload: {
            ...canonicalPreview.payload,
            distribution: { ...canonicalPreview.payload.distribution, provider: 'fake' },
          },
        },
      }),
      client.callTool({
        name: 'linkedin.post.approve.text',
        arguments: { ...approvalInput, publishingLedgerPath: '/tmp/private' },
      }),
    ]);

    expect(results.every((result) => result.isError === true)).toBe(true);
    expect(authGetStatus).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('exposes only the approved public fields in tool input schemas', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const tool = (name: string) => tools.find((candidate) => candidate.name === name)?.inputSchema;
    const properties = (schema: unknown) => (schema as { properties?: Record<string, unknown> }).properties;
    const previewProperties = properties(tool('linkedin.post.preview.text'));
    const approvalProperties = properties(tool('linkedin.post.approve.text'));
    const publishProperties = properties(tool('linkedin.post.create.text'));
    const payloadProperties = properties(approvalProperties?.payload);
    const distributionProperties = properties(payloadProperties?.distribution);

    expect(Object.keys(previewProperties ?? {}).sort()).toEqual(['disableReshare', 'text', 'visibility']);
    expect(Object.keys(approvalProperties ?? {}).sort()).toEqual(['approved', 'payload', 'payloadHash']);
    expect(Object.keys(publishProperties ?? {}).sort()).toEqual([
      'approvalReceiptId',
      'idempotencyKey',
      'payload',
    ]);
    expect(Object.keys(payloadProperties ?? {}).sort()).toEqual([
      'commentary',
      'distribution',
      'isReshareDisabled',
      'lifecycleState',
      'visibility',
    ]);
    expect(Object.keys(distributionProperties ?? {}).sort()).toEqual([
      'feedDistribution',
      'targetEntities',
      'thirdPartyDistributionChannels',
    ]);
  });

  it('shares approval and publishing state across real MCP connections and replays without a second POST', async () => {
    const now = () => new Date('2026-10-08T12:00:00.000Z');
    let subject = 'member-123';
    const getStatus = vi.fn(() =>
      Promise.resolve({
        state: 'connected' as const,
        provider: 'OFFICIAL_API' as const,
        scopes: ['openid', 'w_member_social'],
        refreshAvailable: false,
        subject,
      }),
    );
    const getProviderContext = vi.fn(() =>
      Promise.resolve({
        accessToken: 'trusted-test-token',
        subject,
        scopes: ['openid', 'w_member_social'],
      }),
    );
    const auth = {
      getStatus,
      getProviderContext,
      getProfile: vi.fn(),
      markReauthRequired: vi.fn(),
    } as unknown as AuthService;
    let receiptSequence = 0;
    const approvals = createApprovalService({ now, randomId: () => `receipt-shared-${++receiptSequence}` });
    const records = new Map<
      string,
      {
        idempotencyKey: string;
        payloadHash: string;
        state: 'reserved' | 'succeeded' | 'failed_terminal' | 'outcome_unknown';
        createdAt: string;
        updatedAt: string;
        result?: { postUrn?: string; errorCode?: string };
      }
    >();
    const reserve = vi.fn(
      ({ idempotencyKey, payloadHash }: { idempotencyKey: string; payloadHash: string }) => {
        const existing = records.get(idempotencyKey);
        if (existing !== undefined) {
          if (existing.payloadHash !== payloadHash) {
            return Promise.reject(new IdempotencyLedgerError('conflict'));
          }
          return Promise.resolve({ status: 'replay' as const, record: existing });
        }
        const record = {
          idempotencyKey,
          payloadHash,
          state: 'reserved' as const,
          createdAt: now().toISOString(),
          updatedAt: now().toISOString(),
        };
        records.set(idempotencyKey, record);
        return Promise.resolve({ status: 'reserved' as const, record });
      },
    );
    const complete = vi.fn(
      ({
        idempotencyKey,
        payloadHash,
        state,
        result: mutationResult,
      }: {
        idempotencyKey: string;
        payloadHash: string;
        state: 'succeeded' | 'failed_terminal' | 'outcome_unknown';
        result?: { postUrn?: string; errorCode?: string };
      }) => {
        const record = {
          idempotencyKey,
          payloadHash,
          state,
          createdAt: now().toISOString(),
          updatedAt: now().toISOString(),
          ...(mutationResult === undefined ? {} : { result: mutationResult }),
        };
        records.set(idempotencyKey, record);
        return Promise.resolve(record);
      },
    );
    const ledger = {
      reserve,
      complete,
    };
    let postedInput: CreateTextPostInput | undefined;
    const createTextPost = vi.fn((input: CreateTextPostInput) => {
      postedInput = input;
      return Promise.resolve({ postUrn: 'urn:li:share:123456' });
    });
    const getTextPost = vi.fn();
    const posts = {
      createTextPost,
      getTextPost,
    };
    const textPostService = createTextPostService({
      auth,
      approvals,
      ledger,
      posts,
      memberPostReadEnabled: false,
    });
    const handler = createMcpHandler(() =>
      createLinkedInMcpServer({
        authService: auth,
        publishing: { approvals, textPostService },
        now,
      }),
    );
    activeHandlers.push(handler);
    const first = await connectTo(handler);
    const second = await connectTo(handler);
    const preview = await first.callTool({
      name: 'linkedin.post.preview.text',
      arguments: { text: '  retain text bytes  ', visibility: 'PUBLIC' },
    });
    const previewData = preview.structuredContent as { data: { payload: unknown; payloadHash: string } };
    const approval = await first.callTool({
      name: 'linkedin.post.approve.text',
      arguments: {
        payload: previewData.data.payload,
        payloadHash: previewData.data.payloadHash,
        approved: true,
      },
    });
    const receipt = (approval.structuredContent as { data: { receiptId: string } }).data.receiptId;
    const arguments_ = {
      payload: previewData.data.payload,
      approvalReceiptId: receipt,
      idempotencyKey: '  same-raw-key  ',
    };
    subject = 'member-456';
    const mismatchedMember = await second.callTool({
      name: 'linkedin.post.create.text',
      arguments: arguments_,
    });
    expect(mismatchedMember.structuredContent).toMatchObject({
      status: 'requires_approval',
      error: {
        code: 'approval_mismatch',
        message: 'A valid approval receipt is required.',
        retryable: false,
      },
    });
    expect(reserve).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(createTextPost).not.toHaveBeenCalled();
    expect(getTextPost).not.toHaveBeenCalled();
    expect(records.size).toBe(0);
    subject = 'member-123';
    const changedWithoutReapproval = createTextPostPreview({
      text: '  changed without reapproval  ',
      visibility: 'PUBLIC',
    });
    const payloadMismatch = await second.callTool({
      name: 'linkedin.post.create.text',
      arguments: {
        ...arguments_,
        payload: changedWithoutReapproval.payload,
      },
    });
    expect(payloadMismatch.structuredContent).toMatchObject({
      status: 'requires_approval',
      provider: { type: 'OFFICIAL_API', name: 'LinkedIn' },
      error: {
        code: 'approval_mismatch',
        message: 'A valid approval receipt is required.',
        retryable: false,
      },
      metadata: {
        audit: { operation: 'post.create.text', payloadHash: changedWithoutReapproval.payloadHash },
      },
    });
    expect(reserve).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(createTextPost).not.toHaveBeenCalled();
    expect(getTextPost).not.toHaveBeenCalled();
    expect(records.size).toBe(0);
    const firstPublish = await second.callTool({ name: 'linkedin.post.create.text', arguments: arguments_ });
    const replay = await first.callTool({ name: 'linkedin.post.create.text', arguments: arguments_ });

    expect((firstPublish.structuredContent as { status: string }).status).toBe('succeeded');
    expect((firstPublish.structuredContent as { data: { replay: boolean } }).data.replay).toBe(false);
    expect((replay.structuredContent as { data: { replay: boolean } }).data.replay).toBe(true);
    expect(createTextPost).toHaveBeenCalledTimes(1);
    expect(postedInput).toMatchObject({
      payload: { commentary: '  retain text bytes  ' },
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(records.size).toBe(1);
    const durableSuccess = JSON.stringify([...records.values()]);
    const consumedReceipt = await first.callTool({
      name: 'linkedin.post.create.text',
      arguments: { ...arguments_, idempotencyKey: 'new-raw-key' },
    });
    expect(consumedReceipt.structuredContent).toMatchObject({
      status: 'requires_approval',
      error: {
        code: 'approval_consumed',
        message: 'A valid approval receipt is required.',
        retryable: false,
      },
    });
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(createTextPost).toHaveBeenCalledTimes(1);
    expect(getTextPost).not.toHaveBeenCalled();
    expect(JSON.stringify([...records.values()])).toBe(durableSuccess);

    const changedPayload = createTextPostPreview({
      text: 'different approved payload',
      visibility: 'PUBLIC',
    });
    const secondApproval = await first.callTool({
      name: 'linkedin.post.approve.text',
      arguments: {
        payload: changedPayload.payload,
        payloadHash: changedPayload.payloadHash,
        approved: true,
      },
    });
    const secondReceipt = (secondApproval.structuredContent as { data: { receiptId: string } }).data
      .receiptId;
    const conflict = await second.callTool({
      name: 'linkedin.post.create.text',
      arguments: {
        payload: changedPayload.payload,
        approvalReceiptId: secondReceipt,
        idempotencyKey: arguments_.idempotencyKey,
      },
    });
    expect(conflict.structuredContent).toMatchObject({
      status: 'failed',
      error: { code: 'idempotency_conflict', message: 'Text publishing did not complete.', retryable: false },
      metadata: { audit: { payloadHash: changedPayload.payloadHash } },
    });
    expect(reserve).toHaveBeenCalledTimes(3);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(createTextPost).toHaveBeenCalledTimes(1);
    expect(getTextPost).not.toHaveBeenCalled();
    expect(JSON.stringify([...records.values()])).toBe(durableSuccess);
    expect(JSON.stringify(firstPublish.structuredContent)).not.toContain(receipt);
    expect(JSON.stringify(firstPublish.structuredContent)).not.toContain('same-raw-key');
    expect(firstPublish.content).toEqual([
      { type: 'text', text: JSON.stringify(firstPublish.structuredContent) },
    ]);
  });
});
