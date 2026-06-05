import { z } from 'zod';
import { defineTool } from '../kit.js';
import { GET_CURRENT_USER_DESC } from './descriptions.js';

/**
 * kaiten_get_current_user — thin-json archetype.
 *
 * Calls ctx.client.getCurrentUser with ctx.signal and returns the raw user
 * object. The kit seam serializes it to the same pretty JSON the original
 * handler emitted (byte-identical text: JSON.stringify(user, null, 2)) AND —
 * because this tool is read-only — mirrors it into `structuredContent` (MCP
 * spec 2025-11-25) for programmatic clients. No simplifyUser is applied
 * (matches the original).
 */
export const getCurrentUser = defineTool({
  name: 'kaiten_get_current_user',
  description: GET_CURRENT_USER_DESC,
  schema: z.object({}).strict(),
  annotations: { readOnly: true },
  handler: async (_args, ctx) => {
    return ctx.client.getCurrentUser(ctx.signal);
  },
});
