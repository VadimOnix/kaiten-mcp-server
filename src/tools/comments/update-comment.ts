import { defineTool } from '../kit.js';
import { UpdateCommentSchema } from '../../schemas.js';
import { UPDATE_COMMENT_DESC } from './descriptions.js';

/**
 * kaiten_update_comment — thin-json archetype.
 *
 * Ported from the `kaiten_update_comment` case in src/server.ts.
 * Returns the RAW comment object (not simplified), matching the original.
 * Arg order: card_id, comment_id, text, idempotency_key (or undefined), signal.
 */
export const updateComment = defineTool({
  name: 'kaiten_update_comment',
  description: UPDATE_COMMENT_DESC,
  schema: UpdateCommentSchema,
  annotations: { idempotent: true },
  handler: async ({ card_id, comment_id, text }, ctx) => {
    return ctx.client.updateComment(card_id, comment_id, text, undefined, ctx.signal);
  },
});
