import { z } from 'zod';
import { defineTool, text } from '../kit.js';
import { GET_CURRENT_USER_DESC } from './descriptions.js';

/**
 * kaiten_get_current_user — thin-json archetype.
 *
 * Ported from the `kaiten_get_current_user` case in src/server.ts. No
 * parameters (strict empty object schema). Calls ctx.client.getCurrentUser
 * with ctx.signal, then returns JSON.stringify(user, null, 2) verbatim via
 * text() — matching the original handler exactly (no simplifyUser applied).
 */
export const getCurrentUser = defineTool({
  name: 'kaiten_get_current_user',
  description: GET_CURRENT_USER_DESC,
  schema: z.object({}).strict(),
  annotations: { readOnly: true },
  handler: async (_args, ctx) => {
    const user = await ctx.client.getCurrentUser(ctx.signal);
    return text(JSON.stringify(user, null, 2));
  },
});
