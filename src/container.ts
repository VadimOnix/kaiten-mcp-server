import { KaitenClient } from './kaiten-client.js';
import { cache } from './cache.js';
import { config } from './config.js';
import { logger } from './logging/index.js';
import type { ServerContext } from './tools/kit.js';

// Single shared client instance — identical construction to what server.ts did inline.
export const client = new KaitenClient(config.KAITEN_API_URL, config.KAITEN_API_TOKEN);

const base = { client, cache, config, log: logger } as const;

export function makeCtx(signal?: AbortSignal): ServerContext {
  return { ...base, signal };
}
