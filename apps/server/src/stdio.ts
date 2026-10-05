import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { createLinkedInMcpServer } from './create-server.js';

serveStdio(() => createLinkedInMcpServer());
