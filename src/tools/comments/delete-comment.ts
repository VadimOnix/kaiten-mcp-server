import { defineTool, text } from '../kit.js';
import { DeleteCommentSchema } from '../../schemas.js';
import { DELETE_COMMENT_DESC } from './descriptions.js';

/**
 * kaiten_delete_comment — thin-text archetype.
 *
 * Ported from the `kaiten_delete_comment` case in src/server.ts.
 * Success string copied VERBATIM: `Comment ${comment_id} deleted successfully`.
 */
export const deleteComment = defineTool({
  name: 'kaiten_delete_comment',
  description: DELETE_COMMENT_DESC,
  schema: DeleteCommentSchema,
  annotations: { destructive: true },
  handler: async ({ card_id, comment_id }, ctx) => {
    await ctx.client.deleteComment(card_id, comment_id, ctx.signal);
    return text(`Comment ${comment_id} deleted successfully`);
  },
});
