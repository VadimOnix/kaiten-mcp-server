import { defineTool } from '../kit.js';
import { GetCardChildrenSchema } from '../../schemas.js';
import { applyCardVerbosity } from '../../utils.js';
import { simplifyCardCompact } from '../../transformers.js';
import { GET_CARD_CHILDREN_DESC } from './descriptions.js';

/**
 * kaiten_get_card_children — read-relation archetype.
 *
 * Ported from the `kaiten_get_card_children` case in src/server.ts. Fetches the
 * children, then runs them through applyCardVerbosity (verbosity defaulting to
 * 'normal') with simplifyCardCompact. The original does NOT apply
 * truncateResponse — it returns JSON.stringify(processed, null, 2) directly, so
 * the seam's JSON wrapping reproduces the exact body.
 */
export const getCardChildren = defineTool({
  name: 'kaiten_get_card_children',
  description: GET_CARD_CHILDREN_DESC,
  schema: GetCardChildrenSchema,
  annotations: { readOnly: true },
  handler: async ({ card_id, verbosity }, ctx) => {
    const rows = await ctx.client.getCardChildren(card_id, ctx.signal);
    return applyCardVerbosity(rows, verbosity ?? 'normal', simplifyCardCompact);
  },
});
