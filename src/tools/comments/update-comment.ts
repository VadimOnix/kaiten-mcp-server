import { defineTool } from '../kit.js';
import { UpdateCommentSchema } from '../../schemas.js';
import { CommentOutput } from '../../output-schemas.js';
import { UPDATE_COMMENT_DESC } from './descriptions.js';

/**
 * kaiten_update_comment — thin-json archetype.
 *
 * Ported from the `kaiten_update_comment` case in src/server.ts.
 * Returns the RAW comment object (not simplified), matching the original.
 * Arg order: card_id, comment_id, text, idempotency_key (undefined when the caller omits it), signal.
 * The caller-supplied idempotency_key is forwarded so the client sends the
 * Idempotency-Key header, preventing duplicate edits on retry.
 */
export const updateComment = defineTool({
  name: 'kaiten_update_comment',
  description: UPDATE_COMMENT_DESC,
  schema: UpdateCommentSchema,
  outputSchema: CommentOutput,
  annotations: { idempotent: true },
  handler: async ({ card_id, comment_id, text, idempotency_key }, ctx) => {
    return ctx.client.updateComment(card_id, comment_id, text, idempotency_key, ctx.signal);
  },
});
