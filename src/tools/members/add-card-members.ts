import { defineTool } from '../kit.js';
import { AddCardMembersSchema } from '../../schemas.js';
import { BatchOutput } from '../../output-schemas.js';
import { batchCardMembers } from '../helpers.js';
import { ADD_CARD_MEMBERS_DESC } from './descriptions.js';

/**
 * kaiten_add_card_members — batch add. One addCardMember call per user id, in
 * order, via batchCardMembers. New members join as participants (type 1).
 */
export const addCardMembers = defineTool({
  name: 'kaiten_add_card_members',
  description: ADD_CARD_MEMBERS_DESC,
  schema: AddCardMembersSchema,
  outputSchema: BatchOutput,
  annotations: { idempotent: true },
  handler: ({ card_id, user_ids }, ctx) =>
    batchCardMembers(user_ids, card_id, 'added', (id) =>
      ctx.client.addCardMember(card_id, id, ctx.signal),
    ),
});
