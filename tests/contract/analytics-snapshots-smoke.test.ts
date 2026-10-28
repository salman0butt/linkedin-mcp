import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const input = {
  contentId: 'caller-post-01',
  contentKind: 'post',
  snapshots: [
    {
      capturedAtUtc: '2026-10-25T09:00:00.000Z',
      metrics: {
        impressions: 200,
        reactions: 20,
        comments: null,
        reposts: 1,
      },
    },
    {
      capturedAtUtc: '2026-10-27T09:00:00.000Z',
      metrics: {
        impressions: 195,
        reactions: 23,
        comments: 4,
        reposts: 1,
      },
    },
  ],
} as const;

const stdioScript = `
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { resolve } from 'node:path';
const client = new Client({name:'m12-built-stdio',version:'1.0.0'});
try {
  await client.connect(new StdioClientTransport({command:process.execPath,
    args:[resolve(process.cwd(),'dist/stdio.js')],env:process.env}));
  const tools = await client.listTools();
  const response = await client.callTool({name:'linkedin.analytics.compare_snapshots',
    arguments:${JSON.stringify(input)}});
  const capabilities = await client.callTool({name:'linkedin.capabilities',arguments:{}});
  process.stdout.write(JSON.stringify({count:tools.tools.length,found:tools.tools.some(x=>x.name==='linkedin.analytics.compare_snapshots'),
    response:response.structuredContent,error:response.isError,
    capability:capabilities.structuredContent?.data?.capabilities?.find(x=>x.id==='analytics.snapshots.compare')}));
} finally { await client.close(); }
`;

const httpScript = `
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpServer } from './dist/http.js';
import { createLinkedInRuntime } from './dist/runtime.js';
import { parseConfig } from './dist/config.js';
const server = await createHttpServer({host:'127.0.0.1',port:0,
  runtime:createLinkedInRuntime({...parseConfig({}),transport:'http'})});
const url='http://'+server.address.host+':'+server.address.port+'/mcp';
const client=new Client({name:'m12-built-http',version:'1.0.0'});
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  const tools = await client.listTools();
  const response = await client.callTool({name:'linkedin.analytics.compare_snapshots',
    arguments:${JSON.stringify(input)}});
  const rawResponse = await fetch(url,{method:'POST',
    headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},
    body:JSON.stringify({jsonrpc:'2.0',id:'m12-raw-analytics',
      method:'tools/call',params:{name:'linkedin.analytics.compare_snapshots',
      arguments:${JSON.stringify(input)}}})});
  const rawText=await rawResponse.text();
  const event=rawText.split(String.fromCharCode(10)).find(line=>line.startsWith('data: '));
  process.stdout.write(JSON.stringify({count:tools.tools.length,found:tools.tools.some(x=>x.name==='linkedin.analytics.compare_snapshots'),
    response:response.structuredContent,error:response.isError,
    rawStatus:rawResponse.status,rawBytes:Buffer.byteLength(rawText,'utf8'),rawEvent:event?JSON.parse(event.slice(6)):null}));
} finally { await client.close(); await server.close(); }
`;

function runScript(script: string) {
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
    response: {
      status: string;
      data: { kind: string; provenance: string; metrics: { impressions: { delta: number } } };
    };
    error?: boolean;
    capability?: { availability: string; provider: string; milestone: string };
    rawStatus?: number;
    rawBytes?: number;
    rawEvent?: { result: { structuredContent: { status: string } } };
  };
}

describe('M12.0 actual compiled stateless STDIO/HTTP analytics', () => {
  it('exposes 67 real STDIO tools and caller-only metrics with truthful LOCAL_ONLY capability', () => {
    const value = runScript(stdioScript);
    expect(value.count).toBe(67);
    expect(value.found).toBe(true);
    expect(value.error).not.toBe(true);
    expect(value.response).toMatchObject({
      status: 'succeeded',
      data: {
        kind: 'local_content_metric_snapshot_comparison',
        provenance: 'caller_supplied_unverified',
        metrics: { impressions: { delta: -5 } },
      },
    });
    expect(value.capability).toMatchObject({
      availability: 'AVAILABLE',
      provider: 'LOCAL_ONLY',
      milestone: 'M12',
    });
  }, 30_000);

  it('exposes stateless caller-only analytics over actual HTTP and bounded raw SSE', () => {
    const value = runScript(httpScript);
    expect(value.count).toBe(67);
    expect(value.found).toBe(true);
    expect(value.error).not.toBe(true);
    expect(value.response).toMatchObject({
      status: 'succeeded',
      data: { kind: 'local_content_metric_snapshot_comparison', metrics: { impressions: { delta: -5 } } },
    });
    expect(value.rawStatus).toBe(200);
    expect(value.rawBytes).toBeLessThanOrEqual(262_144);
    expect(value.rawEvent?.result?.structuredContent).toMatchObject({ status: 'succeeded' });
  }, 30_000);
});
