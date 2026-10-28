import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const before = '2026-10-20T10:00:00.000Z';
const after = '2026-10-27T10:00:00.000Z';
const entry = (id: string, previous: number | null, current: number | null) => ({
  contentId: id,
  contentKind: 'post',
  snapshots: [
    { capturedAtUtc: before, metrics: { impressions: previous, reactions: 1, comments: 0, reposts: 0 } },
    { capturedAtUtc: after, metrics: { impressions: current, reactions: 1, comments: 0, reposts: 0 } },
  ],
});
const ranking = {
  targetMetric: 'impressions',
  entries: [entry('down', 30, 20), entry('up', 2, 12), entry('missing', null, 1)],
};

const stdioScript = `
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { resolve } from 'node:path';
const client=new Client({name:'m12-ranking-built-stdio',version:'1.0.0'});
try {
  await client.connect(new StdioClientTransport({command:process.execPath,
    args:[resolve(process.cwd(),'dist/stdio.js')],env:process.env}));
  const tools=await client.listTools();
  const response=await client.callTool({name:'linkedin.analytics.rank_snapshot_changes',
    arguments:${JSON.stringify(ranking)}});
  const capabilities=await client.callTool({name:'linkedin.capabilities',arguments:{}});
  process.stdout.write(JSON.stringify({count:tools.tools.length,
    found:tools.tools.some(x=>x.name==='linkedin.analytics.rank_snapshot_changes'),
    response:response.structuredContent,error:response.isError,
    capability:capabilities.structuredContent?.data?.capabilities?.find(x=>x.id==='analytics.snapshots.rank')}));
} finally { await client.close(); }
`;
const httpScript = `
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpServer } from './dist/http.js';
import { createLinkedInRuntime } from './dist/runtime.js';
import { parseConfig } from './dist/config.js';
const server=await createHttpServer({host:'127.0.0.1',port:0,
  runtime:createLinkedInRuntime({...parseConfig({}),transport:'http'})});
const url='http://'+server.address.host+':'+server.address.port+'/mcp';
const client=new Client({name:'m12-ranking-built-http',version:'1.0.0'});
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  const tools=await client.listTools();
  const response=await client.callTool({name:'linkedin.analytics.rank_snapshot_changes',
    arguments:${JSON.stringify(ranking)}});
  const raw=await fetch(url,{method:'POST',
    headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},
    body:JSON.stringify({jsonrpc:'2.0',id:'m12-ranking-raw',method:'tools/call',
      params:{name:'linkedin.analytics.rank_snapshot_changes',arguments:${JSON.stringify(ranking)}}})});
  const rawText=await raw.text();
  const event=rawText.split(String.fromCharCode(10)).find(line=>line.startsWith('data: '));
  process.stdout.write(JSON.stringify({count:tools.tools.length,
    found:tools.tools.some(x=>x.name==='linkedin.analytics.rank_snapshot_changes'),
    response:response.structuredContent,error:response.isError,
    rawStatus:raw.status,rawBytes:Buffer.byteLength(rawText,'utf8'),
    rawEvent:event?JSON.parse(event.slice(6)):null}));
} finally { await client.close(); await server.close(); }
`;

function call(script: string) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('LINKEDIN_MCP_')),
  );
  return JSON.parse(
    execFileSync(
      'pnpm',
      ['--filter', '@linkedin-mcp/server', 'exec', 'node', '--input-type=module', '--eval', script],
      { cwd: process.cwd(), encoding: 'utf8', env, maxBuffer: 1_000_000 },
    ),
  ) as {
    count: number;
    found: boolean;
    error?: boolean;
    response: {
      status: string;
      data: {
        kind: string;
        ranked: Array<{ contentId: string; delta: number }>;
        unavailable: Array<{ contentId: string }>;
      };
    };
    capability?: { availability: string; provider: string; milestone: string };
    rawStatus?: number;
    rawBytes?: number;
    rawEvent?: { result: { structuredContent: { status: string } } };
  };
}
describe('M12.1 compiled stateless analytics ranking transports', () => {
  it('registers 66 STDIO tools, caller delta results and truthful local capability', () => {
    const value = call(stdioScript);
    expect(value.count).toBe(66);
    expect(value.found).toBe(true);
    expect(value.error).not.toBe(true);
    expect(value.response).toMatchObject({
      status: 'succeeded',
      data: {
        kind: 'local_caller_metric_delta_ranking',
        ranked: [
          { contentId: 'up', delta: 10 },
          { contentId: 'down', delta: -10 },
        ],
        unavailable: [{ contentId: 'missing' }],
      },
    });
    expect(value.capability).toMatchObject({
      provider: 'LOCAL_ONLY',
      availability: 'AVAILABLE',
      milestone: 'M12',
    });
  }, 30_000);
  it('registers 66 HTTP tools and maintains complete raw HTTP/SSE response ceiling', () => {
    const value = call(httpScript);
    expect(value.count).toBe(66);
    expect(value.found).toBe(true);
    expect(value.error).not.toBe(true);
    expect(value.response).toMatchObject({
      status: 'succeeded',
      data: {
        kind: 'local_caller_metric_delta_ranking',
        ranked: [
          { contentId: 'up', delta: 10 },
          { contentId: 'down', delta: -10 },
        ],
      },
    });
    expect(value.rawStatus).toBe(200);
    expect(value.rawBytes).toBeLessThanOrEqual(262_144);
    expect(value.rawEvent?.result?.structuredContent).toMatchObject({ status: 'succeeded' });
  }, 30_000);
});
