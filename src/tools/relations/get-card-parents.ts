import { defineTool } from '../kit.js';
import { GetCardParentsSchema } from '../../schemas.js';
import { CardListOutput } from '../../output-schemas.js';
import { applyCardVerbosity } from '../../utils.js';
import { simplifyCardCompact } from '../../transformers.js';
import { GET_CARD_PARENTS_DESC } from './descriptions.js';

/**
 * kaiten_get_card_parents — read-relation archetype.
 *
 * Ported from the `kaiten_get_card_parents` case in src/server.ts. Fetches the
 * parents, then runs them through applyCardVerbosity (verbosity defaulting to
 * 'normal') with simplifyCardCompact. The original does NOT apply
 * truncateResponse — it returns JSON.stringify(processed, null, 2) directly, so
 * the seam's JSON wrapping reproduces the exact body.
 */
export const getCardParents = defineTool({
  name: 'kaiten_get_card_parents',
  description: GET_CARD_PARENTS_DESC,
  schema: GetCardParentsSchema,
  outputSchema: CardListOutput,
  annotations: { readOnly: true },
  handler: async ({ card_id, verbosity }, ctx) => {
    const rows = await ctx.client.getCardParents(card_id, ctx.signal);
    return applyCardVerbosity(rows, verbosity ?? 'normal', simplifyCardCompact);
  },
});
