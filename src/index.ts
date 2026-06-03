#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from './logging/index.js';
import { createServer } from './server.js';
import { ALL_TOOLS } from './tools/index.js';

// ============================================
// START SERVER
// ============================================

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Kaiten MCP Server started', {
    version: '3.0.0',
    tools: ALL_TOOLS.length,
    logging_enabled: logger.getConfig().enabled,
  }, 'main');
  console.error('Kaiten MCP Server v3.0.0 running on stdio');
  console.error(`- Tools: ${ALL_TOOLS.length} available`);
  console.error('- Resources: Enabled (cards, spaces, boards)');
  console.error('- Prompts: Server prompt configured');
  console.error('- Validation: Zod schemas active');
  console.error('- Logging: Configured via environment variables');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
