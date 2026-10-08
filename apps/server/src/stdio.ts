import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { createAuthService } from './auth/auth-service.js';
import { parseConfig } from './config.js';
import { createLinkedInMcpServer } from './create-server.js';

const config = parseConfig();
const authService = createAuthService(config.auth === undefined ? {} : { config: config.auth });

serveStdio(() => createLinkedInMcpServer({ authService, version: config.serverVersion }));
