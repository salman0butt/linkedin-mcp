import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const TOOL = 'linkedin.organization.content_handoff.prepare';
const draft = {
  organizationUrn: 'urn:li:organization:12345',
  drafts: [
    { id: 'launch', text: 'Company update 🤖\n#Engineering' },
    { id: 'jobs', text: 'We are hiring! #Remote' },
  ],
};

const stdio = `
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { resolve } from 'node:path';
const client=new Client({name:'m13-stdio',version:'1.0.0'});
try {
 await client.connect(new StdioClientTransport({command:process.execPath,args:[resolve(process.cwd(),'dist/stdio.js')],env:process.env}));
 const tools=await client.listTools();
 const handoff=await client.callTool({name:${JSON.stringify(TOOL)},arguments:${JSON.stringify(draft)}});
 const capabilities=await client.callTool({name:'linkedin.capabilities',arguments:{}});
 process.stdout.write(JSON.stringify({count:tools.tools.length,toolCount:tools.tools.filter(t=>t.name===${JSON.stringify(TOOL)}).length,
   handoff:handoff.structuredContent,error:handoff.isError,
   localCapability:capabilities.structuredContent?.data?.capabilities?.find(c=>c.id==='organization.content_handoff'),
   providerCapability:capabilities.structuredContent?.data?.capabilities?.find(c=>c.id==='organization.post.create')}));
}finally{await client.close()}
`;

const http = `
import { Client,StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpServer } from './dist/http.js';
const server=await createHttpServer({host:'127.0.0.1',port:0});
const url='http://'+server.address.host+':'+server.address.port+'/mcp';
const client=new Client({name:'m13-http',version:'1.0.0'});
try{
 await client.connect(new StreamableHTTPClientTransport(new URL(url)));
 const tools=await client.listTools();
 const handoff=await client.callTool({name:${JSON.stringify(TOOL)},arguments:${JSON.stringify(draft)}});
 const raw=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},
   body:JSON.stringify({jsonrpc:'2.0',id:String.fromCharCode(0).repeat(128),method:'tools/call',params:{name:${JSON.stringify(TOOL)},arguments:${JSON.stringify(draft)}}})});
 const text=await raw.text();const event=text.split(String.fromCharCode(10)).find(line=>line.startsWith('data: '));
 const secrets=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},
   body:JSON.stringify({jsonrpc:'2.0',id:'bad',method:'tools/call',params:{name:${JSON.stringify(TOOL)},
     arguments:{...${JSON.stringify(draft)},accessToken:'SECRET_M13_ACCESS_TOKEN'}}})});
 const secretBody=await secrets.text();
 process.stdout.write(JSON.stringify({count:tools.tools.length,toolCount:tools.tools.filter(t=>t.name===${JSON.stringify(TOOL)}).length,
   handoff:handoff.structuredContent,error:handoff.isError,rawStatus:raw.status,rawBytes:Buffer.byteLength(text,'utf8'),
   rawResult:event?JSON.parse(event.slice(6)):null,secretBody,secretBytes:Buffer.byteLength(secretBody,'utf8')}));
}finally{await client.close();await server.close()}
`;

function invoke(script: string) {
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
    toolCount: number;
    error?: boolean;
    handoff: {
      status: string;
      provider: { type: string };
      data: {
        kind: string;
        organizationAuthorization: string;
        publication: string;
        drafts: Array<{ id: string; text: string }>;
      };
    };
    localCapability?: { provider: string; availability: string; milestone: string };
    providerCapability?: { provider: string; availability: string; status: string };
    rawStatus?: number;
    rawBytes?: number;
    rawResult?: { id: string; result: { structuredContent: { status: string } } };
    secretBody?: string;
    secretBytes?: number;
  };
}

describe('M13.0 real compiled local-only company editorial handoff', () => {
  it('lists 67 STDIO tools and distinguishes local manual handoff from unavailable official publishing', () => {
    const result = invoke(stdio);
    expect(result.count).toBe(67);
    expect(result.toolCount).toBe(1);
    expect(result.error).not.toBe(true);
    expect(result.handoff).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY' },
      data: {
        kind: 'local_organization_editorial_handoff',
        organizationAuthorization: 'not_evaluated',
        publication: 'not_attempted',
        drafts: draft.drafts,
      },
    });
    expect(result.localCapability).toMatchObject({
      provider: 'LOCAL_ONLY',
      availability: 'AVAILABLE',
      milestone: 'M13',
    });
    expect(result.providerCapability).toMatchObject({
      provider: 'OFFICIAL_API',
      availability: 'UNAVAILABLE',
      status: 'PLANNED',
    });
  }, 30_000);

  it('aggregates 67 HTTP tools and bounds raw SSE success, escaped ID and secret-key failure', () => {
    const result = invoke(http);
    expect(result.count).toBe(67);
    expect(result.toolCount).toBe(1);
    expect(result.error).not.toBe(true);
    expect(result.handoff.data.drafts).toEqual(draft.drafts);
    expect(result.rawStatus).toBe(200);
    expect(result.rawBytes).toBeLessThanOrEqual(262_144);
    expect(result.rawResult?.id).toBe('\u0000'.repeat(128));
    expect(result.rawResult?.result?.structuredContent).toMatchObject({ status: 'succeeded' });
    expect(result.secretBytes).toBeLessThanOrEqual(262_144);
    expect(result.secretBody).not.toContain('SECRET_M13_ACCESS_TOKEN');
    expect(result.secretBody).not.toContain('accessToken');
  }, 30_000);
});
