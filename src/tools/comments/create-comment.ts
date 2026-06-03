import { defineTool } from '../kit.js';
import { CreateCommentSchema } from '../../schemas.js';
import { CREATE_COMMENT_DESC } from './descriptions.js';

/**
 * kaiten_create_comment — thin-json archetype.
 *
 * Ported from the `kaiten_create_comment` case in src/server.ts.
 * Returns the RAW comment object (not simplified), matching the original.
 * Arg order: card_id, text, idempotency_key (undefined when the caller omits it), signal.
 * The caller-supplied idempotency_key is forwarded so the client sends the
 * Idempotency-Key header, preventing duplicate comments on retry.
 */
export const createComment = defineTool({
  name: 'kaiten_create_comment',
  description: CREATE_COMMENT_DESC,
  schema: CreateCommentSchema,
  annotations: { idempotent: true },
  handler: async ({ card_id, text, idempotency_key }, ctx) => {
    return ctx.client.createComment(card_id, text, idempotency_key, ctx.signal);
  },
});
