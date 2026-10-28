import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const TOOL = 'linkedin.analytics.compare_snapshot_series';
const captures = ['2026-10-20T10:00:00.000Z', '2026-10-21T10:00:00.000Z', '2026-10-22T10:00:00.000Z'];
const input = {
  contentId: 'article-1',
  contentKind: 'article',
  snapshots: captures.map((capturedAtUtc, i) => ({
    capturedAtUtc,
    metrics: {
      impressions: [10, 15, 12][i],
      reactions: [0, 1, 2][i],
      comments: [null, 3, null][i],
      reposts: 0,
    },
  })),
};

const stdioScript = `
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { resolve } from 'node:path';
const client = new Client({name:'m12-series-stdio',version:'1.0.0'});
try {
  await client.connect(new StdioClientTransport({command:process.execPath,
    args:[resolve(process.cwd(),'dist/stdio.js')],env:process.env}));
  const tools=await client.listTools();
  const response=await client.callTool({name:${JSON.stringify(TOOL)},arguments:${JSON.stringify(input)}});
  const capabilities=await client.callTool({name:'linkedin.capabilities',arguments:{}});
  process.stdout.write(JSON.stringify({count:tools.tools.length,
    found:tools.tools.filter(x=>x.name===${JSON.stringify(TOOL)}).length,
    response:response.structuredContent,error:response.isError,
    capability:capabilities.structuredContent?.data?.capabilities?.find(x=>x.id==='analytics.snapshots.series')}));
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
const client=new Client({name:'m12-series-http',version:'1.0.0'});
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  const tools=await client.listTools();
  const response=await client.callTool({name:${JSON.stringify(TOOL)},arguments:${JSON.stringify(input)}});
  const raw=await fetch(url,{method:'POST',
    headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},
    body:JSON.stringify({jsonrpc:'2.0',id:'m12-series-raw',method:'tools/call',
      params:{name:${JSON.stringify(TOOL)},arguments:${JSON.stringify(input)}}})});
  const rawText=await raw.text();
  const event=rawText.split(String.fromCharCode(10)).find(line=>line.startsWith('data: '));
  let cursor;
  let rawToolsCount=0;
  let rawToolsBytes=0;
  let rawToolsStatus=200;
  let rawToolsPages=0;
  do {
    const toolsRaw=await fetch(url,{method:'POST',
      headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},
      body:JSON.stringify({jsonrpc:'2.0',id:'x'.repeat(128),method:'tools/list',
        params:cursor===undefined?{}:{cursor}})});
    const toolsText=await toolsRaw.text();
    const toolsEvent=toolsText.split(String.fromCharCode(10)).find(line=>line.startsWith('data: '));
    const page=toolsEvent?JSON.parse(toolsEvent.slice(6)).result:null;
    rawToolsStatus=toolsRaw.status===200&&rawToolsStatus===200?200:toolsRaw.status;
    rawToolsCount+=page?.tools?.length??0;
    rawToolsBytes=Math.max(rawToolsBytes,Buffer.byteLength(toolsText,'utf8'));
    cursor=page?.nextCursor;
    rawToolsPages++;
    if(rawToolsPages>64)throw new Error('MCP tool pagination did not converge');
  } while(cursor!==undefined);
  process.stdout.write(JSON.stringify({count:tools.tools.length,
    found:tools.tools.filter(x=>x.name===${JSON.stringify(TOOL)}).length,
    response:response.structuredContent,error:response.isError,
    rawStatus:raw.status,rawBytes:Buffer.byteLength(rawText,'utf8'),
    rawToolsStatus,rawToolsBytes,rawToolsCount,rawToolsPages,
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
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env,
        maxBuffer: 1_000_000,
      },
    ),
  ) as {
    count: number;
    found: number;
    error?: boolean;
    response: {
      status: string;
      data: { kind: string; intervals: Array<{ metrics: { impressions: { delta: number } } }> };
    };
    capability?: { availability: string; provider: string; milestone: string };
    rawStatus?: number;
    rawBytes?: number;
    rawToolsStatus?: number;
    rawToolsBytes?: number;
    rawToolsCount?: number;
    rawToolsPages?: number;
    rawEvent?: { result: { structuredContent: { status: string } } };
  };
}

describe('M12.2 compiled stateless caller observation series transports', () => {
  it('registers 67 STDIO tools and truthful LOCAL_ONLY series capability', () => {
    const value = call(stdioScript);
    expect(value.count).toBe(67);
    expect(value.found).toBe(1);
    expect(value.error).not.toBe(true);
    expect(value.response).toMatchObject({
      status: 'succeeded',
      data: {
        kind: 'local_caller_metric_observation_series',
        intervals: [{ metrics: { impressions: { delta: 5 } } }, { metrics: { impressions: { delta: -3 } } }],
      },
    });
    expect(value.capability).toMatchObject({
      provider: 'LOCAL_ONLY',
      availability: 'AVAILABLE',
      milestone: 'M12',
    });
  }, 30_000);

  it('registers 67 HTTP tools and bounds complete raw HTTP/SSE response', () => {
    const value = call(httpScript);
    expect(value.count).toBe(67);
    expect(value.found).toBe(1);
    expect(value.error).not.toBe(true);
    expect(value.response).toMatchObject({
      status: 'succeeded',
      data: {
        kind: 'local_caller_metric_observation_series',
        intervals: [{ metrics: { impressions: { delta: 5 } } }, { metrics: { impressions: { delta: -3 } } }],
      },
    });
    expect(value.rawStatus).toBe(200);
    expect(value.rawBytes).toBeLessThanOrEqual(262_144);
    expect(value.rawToolsStatus).toBe(200);
    expect(value.rawToolsBytes).toBeLessThanOrEqual(262_144);
    expect(value.rawToolsCount).toBe(67);
    expect(value.rawToolsPages).toBeGreaterThan(1);
    expect(value.rawEvent?.result?.structuredContent).toMatchObject({ status: 'succeeded' });
  }, 30_000);
});
