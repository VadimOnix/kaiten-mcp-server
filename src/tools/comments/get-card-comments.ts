import { defineTool } from '../kit.js';
import { GetCardCommentsSchema } from '../../schemas.js';
import { simplifyComment } from '../../transformers.js';
import { GET_CARD_COMMENTS_DESC } from './descriptions.js';

/**
 * kaiten_get_card_comments — thin-json archetype.
 *
 * Returns the comment list shaped by `verbosity` and bounded by `limit`/`offset`
 * (the Kaiten API returns the whole thread, so we paginate client-side to keep
 * long threads out of the model's context). Default: the most recent `limit`
 * comments, in chronological order, simplified via simplifyComment.
 */
function shapeComment(c: any, verbosity: 'minimal' | 'normal' | 'detailed') {
  if (verbosity === 'detailed') return c;
  if (verbosity === 'minimal') return { id: c.id, text: c.text, author_name: c.author?.full_name };
  return simplifyComment(c);
}

export const getCardComments = defineTool({
  name: 'kaiten_get_card_comments',
  description: GET_CARD_COMMENTS_DESC,
  schema: GetCardCommentsSchema,
  annotations: { readOnly: true },
  handler: async ({ card_id, limit, offset, verbosity }, ctx) => {
    const all = await ctx.client.getCardComments(card_id, ctx.signal);
    // Sort chronologically — the API may return comments out of order.
    const chronological = [...all].sort((a, b) =>
      String(a.created ?? '').localeCompare(String(b.created ?? '')),
    );
    // Default to the most recent `limit` comments; `offset` pages into older
    // history. Returned in chronological order for natural thread reading.
    const end = Math.max(0, chronological.length - offset);
    const start = Math.max(0, end - limit);
    return chronological.slice(start, end).map((c) => shapeComment(c, verbosity));
  },
});
