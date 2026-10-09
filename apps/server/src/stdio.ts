import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { parseConfig } from './config.js';
import { createLinkedInMcpServer } from './create-server.js';
import { createLinkedInRuntime } from './runtime.js';

const config = parseConfig();
const runtime = createLinkedInRuntime(config);

serveStdio(() => createLinkedInMcpServer(runtime));
