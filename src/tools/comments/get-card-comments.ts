import { defineTool } from '../kit.js';
import { GetCardCommentsSchema } from '../../schemas.js';
import { simplifyComment } from '../../transformers.js';
import { GET_CARD_COMMENTS_DESC } from './descriptions.js';

/**
 * kaiten_get_card_comments — thin-json archetype.
 *
 * Ported from the `kaiten_get_card_comments` case in src/server.ts.
 * Returns the comment list mapped through simplifyComment (NOT raw),
 * matching the original handler exactly.
 */
export const getCardComments = defineTool({
  name: 'kaiten_get_card_comments',
  description: GET_CARD_COMMENTS_DESC,
  schema: GetCardCommentsSchema,
  annotations: { readOnly: true },
  handler: async ({ card_id }, ctx) => {
    const comments = await ctx.client.getCardComments(card_id, ctx.signal);
    return comments.map(simplifyComment);
  },
});
