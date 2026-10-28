import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const calendar = {
  referenceUtc: '2026-10-27T10:00:00.000Z',
  items: [
    {
      id: 'second',
      label: 'Later 🌍 plan',
      kind: 'image_post',
      plannedAtUtc: '2026-10-29T12:00:00.000Z',
    },
    {
      id: 'first',
      label: 'Earlier 🤖 plan',
      kind: 'text_post',
      plannedAtUtc: '2026-10-28T12:00:00.000Z',
    },
  ],
} as const;

const companionCalendar = {
  referenceUtc: '2026-10-27T10:00:00.000Z',
  items: [
    {
      id: 'shared-other-plan',
      label: 'Private second-plan label 🪐',
      kind: 'manual_article_handoff',
      plannedAtUtc: '2026-10-28T12:00:00.000Z',
    },
    {
      id: 'independent',
      label: 'Private unique idea 🛰️',
      kind: 'text_post',
      plannedAtUtc: '2026-10-30T12:00:00.000Z',
    },
  ],
} as const;

const realStdioScript = `
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const calendar = ${JSON.stringify(calendar)};
const companionCalendar = ${JSON.stringify(companionCalendar)};
const client = new Client({ name: 'm11-private-calendar-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath,
  args: [resolve(process.cwd(), 'dist/stdio.js')], env: process.env });
try {
  await client.connect(transport);
  const create = await client.callTool({ name:'linkedin.calendar.plans.create',
    arguments:{ idempotencyKey:'calendar-persisted-test', calendar } });
  const id = create.structuredContent?.data?.id;
  const companion = await client.callTool({name:'linkedin.calendar.plans.create',
    arguments:{idempotencyKey:'calendar-persisted-companion',calendar:companionCalendar}});
  const companionId = companion.structuredContent?.data?.id;
  const list = await client.callTool({ name:'linkedin.calendar.plans.list', arguments:{} });
  const get = id ? await client.callTool({ name:'linkedin.calendar.plans.get', arguments:{id} }) : null;
  const inspect = id ? await client.callTool({name:'linkedin.calendar.plans.inspect',
    arguments:{id,expectedRevision:1,asOfUtc:'2026-10-28T12:00:00.000Z'}}) : null;
  const beforeCompare = readFileSync(process.env.LINKEDIN_MCP_CALENDAR_STORE_PATH);
  const compare = id && companionId ? await client.callTool({name:'linkedin.calendar.plans.compare_slots',
    arguments:{plans:[{id,expectedRevision:1},{id:companionId,expectedRevision:1}]}}) : null;
  const comparisonDidNotModifyStore = beforeCompare.equals(readFileSync(process.env.LINKEDIN_MCP_CALENDAR_STORE_PATH));
  process.stdout.write(JSON.stringify({create:create.structuredContent,
    companion:companion.structuredContent,companionError:companion.isError,
    createError:create.isError,list:list.structuredContent,listError:list.isError,
    get:get?.structuredContent,getError:get?.isError,
    inspect:inspect?.structuredContent,inspectError:inspect?.isError,
    compare:compare?.structuredContent,compareError:compare?.isError,comparisonDidNotModifyStore}));
} finally { await client.close(); }
`;

const realHttpScript = `
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpServer } from './dist/http.js';
import { createLinkedInRuntime } from './dist/runtime.js';
import { parseConfig } from './dist/config.js';
const runtime = createLinkedInRuntime({ ...parseConfig({}), transport:'http' });
let reads = 0;
Object.defineProperty(runtime, 'calendarStore', { enumerable:true, configurable:true,
  get() { reads++; throw new Error('PRIVATE_CALENDAR_GETTER_MUST_NOT_RUN'); } });
const server = await createHttpServer({ host:'127.0.0.1', port:0, runtime });
const client = new Client({ name:'m11-calendar-http-isolation', version:'1.0.0' });
const transport = new StreamableHTTPClientTransport(
  new URL('http://' + server.address.host + ':' + server.address.port + '/mcp'));
try {
  await client.connect(transport);
  const calls = [
    {name:'linkedin.calendar.plans.create',arguments:{idempotencyKey:'http-must-fail',calendar:${JSON.stringify(calendar)}}},
    {name:'linkedin.calendar.plans.list',arguments:{}},
    {name:'linkedin.calendar.plans.get',arguments:{id:'123e4567-e89b-42d3-a456-426614174000'}},
    {name:'linkedin.calendar.plans.inspect',arguments:{id:'123e4567-e89b-42d3-a456-426614174000',expectedRevision:1,asOfUtc:'2026-10-28T12:00:00.000Z'}},
    {name:'linkedin.calendar.plans.compare_slots',arguments:{plans:[{id:'123e4567-e89b-42d3-a456-426614174000',expectedRevision:1},{id:'123e4567-e89b-42d3-a456-426614174001',expectedRevision:1}]}},
    {name:'linkedin.calendar.plans.update',arguments:{id:'123e4567-e89b-42d3-a456-426614174000',expectedRevision:1,calendar:${JSON.stringify(calendar)}}},
    {name:'linkedin.calendar.plans.remove',arguments:{id:'123e4567-e89b-42d3-a456-426614174000',expectedRevision:1}},
  ];
  const results = [];
  for(const call of calls) {
    const response = await client.callTool(call);
    results.push({name:call.name,isError:response.isError,body:response.structuredContent});
  }
  process.stdout.write(JSON.stringify({results,reads}));
} finally { await client.close(); await server.close(); }
`;

function invokeScript(script: string, environment: Record<string, string>): unknown {
  return JSON.parse(
    execFileSync(
      'pnpm',
      ['--filter', '@linkedin-mcp/server', 'exec', 'node', '--input-type=module', '--eval', script],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(([key]) => !key.startsWith('LINKEDIN_MCP_')),
          ),
          ...environment,
        },
      },
    ),
  ) as unknown;
}

describe('M11.1–M11.3 real compiled STDIO / HTTP private calendar transport', () => {
  it('persists an original-order multilingual calendar through real STDIO restarts only with host opt-in', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'm11-calendar-stdio-')));
    const path = join(root, 'private', 'plans.json');
    try {
      const run = () =>
        invokeScript(realStdioScript, { LINKEDIN_MCP_CALENDAR_STORE_PATH: path }) as {
          createError?: boolean;
          listError?: boolean;
          getError?: boolean;
          inspectError?: boolean;
          companionError?: boolean;
          compareError?: boolean;
          comparisonDidNotModifyStore: boolean;
          create: { status: string; data: { id: string; revision: number; calendar: typeof calendar } };
          companion: { status: string; data: { id: string; revision: number } };
          list: { status: string; data: Array<Record<string, unknown>> };
          get: { status: string; data: { id: string; calendar: typeof calendar } };
          inspect: {
            status: string;
            data: {
              id: string;
              revision: number;
              planDigest: string;
              pastAsOf: Array<{ id: string }>;
              futureAsOf: Array<{ id: string }>;
              counts: { pastAsOf: number; futureAsOf: number };
            };
          };
          compare: {
            status: string;
            data: {
              snapshotConsistency: string;
              plans: Array<{ id: string; revision: number }>;
              collisions: Array<{ plannedAtUtc: string; items: Array<{ planId: string; itemId: string }> }>;
              counts: { comparedPlans: number; collisionMinutes: number; collisionItems: number };
            };
          };
        };
      const first = run();
      const replayAfterRestart = run();
      expect(first.createError).not.toBe(true);
      expect(first.listError).not.toBe(true);
      expect(first.getError).not.toBe(true);
      expect(first.inspectError).not.toBe(true);
      expect(first.companionError).not.toBe(true);
      expect(first.compareError).not.toBe(true);
      expect(first.comparisonDidNotModifyStore).toBe(true);
      expect(first.create.status).toBe('succeeded');
      expect(first.create.data.id).toMatch(/^[0-9a-f-]{36}$/iu);
      expect(first.create.data.revision).toBe(1);
      expect(first.create.data.calendar.items).toEqual(calendar.items);
      expect(first.get.data).toMatchObject({ id: first.create.data.id, calendar });
      expect(first.inspect.status).toBe('succeeded');
      expect(first.inspect.data).toMatchObject({
        id: first.create.data.id,
        revision: 1,
        pastAsOf: [{ id: 'first' }],
        futureAsOf: [{ id: 'second' }],
        counts: { pastAsOf: 1, futureAsOf: 1 },
      });
      expect(first.inspect.data.planDigest).toMatch(/^[0-9a-f]{64}$/u);
      expect(JSON.stringify(first.inspect)).not.toContain('Earlier 🤖 plan');
      expect(JSON.stringify(first.inspect)).not.toContain('Later 🌍 plan');
      expect(first.companion.status).toBe('succeeded');
      expect(first.companion.data.id).not.toBe(first.create.data.id);
      expect(first.compare.status).toBe('succeeded');
      expect(first.compare.data).toMatchObject({
        snapshotConsistency: 'independent_revisions_not_atomic',
        plans: [
          { id: first.create.data.id, revision: 1 },
          { id: first.companion.data.id, revision: 1 },
        ],
        collisions: [
          {
            plannedAtUtc: '2026-10-28T12:00:00.000Z',
            items: [
              { planId: first.create.data.id, itemId: 'first' },
              { planId: first.companion.data.id, itemId: 'shared-other-plan' },
            ],
          },
        ],
        counts: { comparedPlans: 2, collisionMinutes: 1, collisionItems: 2 },
      });
      expect(JSON.stringify(first.compare)).not.toContain('Earlier 🤖 plan');
      expect(JSON.stringify(first.compare)).not.toContain('Private second-plan label 🪐');
      expect(first.list.data).toHaveLength(2);
      expect(JSON.stringify(first.list)).not.toContain('Earlier 🤖 plan');
      expect(replayAfterRestart.create.data.id).toBe(first.create.data.id);
      expect(replayAfterRestart.get.data.calendar).toEqual(first.get.data.calendar);
      expect(replayAfterRestart.inspect.data.planDigest).toBe(first.inspect.data.planDigest);
      expect(replayAfterRestart.companion.data.id).toBe(first.companion.data.id);
      expect(replayAfterRestart.compare.data.collisions).toEqual(first.compare.data.collisions);
      expect((await readFile(path, 'utf8')).includes('Later 🌍 plan')).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it('denies all private plan methods over real loopback HTTP without touching injected store getter', () => {
    const output = invokeScript(realHttpScript, {}) as {
      reads: number;
      results: Array<{ name: string; isError?: boolean; body: { status: string; error?: { code: string } } }>;
    };
    expect(output.reads).toBe(0);
    expect(output.results).toHaveLength(7);
    for (const result of output.results) {
      expect(result.isError).toBe(true);
      expect(result.body).toMatchObject({
        status: 'unsupported',
        error: { code: 'local_store_not_available' },
      });
    }
  }, 30_000);
});
