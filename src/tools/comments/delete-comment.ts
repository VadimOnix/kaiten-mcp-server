import { defineTool, textWithData } from '../kit.js';
import { DeleteCommentSchema } from '../../schemas.js';
import { DeleteOutput } from '../../output-schemas.js';
import { DELETE_COMMENT_DESC } from './descriptions.js';

/**
 * kaiten_delete_comment — thin-text archetype.
 *
 * Success string copied VERBATIM: `Comment ${comment_id} deleted successfully`.
 * Also emits a machine-readable structuredContent mirror { card_id, comment_id,
 * deleted } for the advertised outputSchema.
 */
export const deleteComment = defineTool({
  name: 'kaiten_delete_comment',
  description: DELETE_COMMENT_DESC,
  schema: DeleteCommentSchema,
  outputSchema: DeleteOutput,
  annotations: { destructive: true },
  handler: async ({ card_id, comment_id }, ctx) => {
    await ctx.client.deleteComment(card_id, comment_id, ctx.signal);
    return textWithData(`Comment ${comment_id} deleted successfully`, {
      card_id,
      comment_id,
      deleted: true,
    });
  },
});
