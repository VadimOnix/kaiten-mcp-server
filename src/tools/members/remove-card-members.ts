import { defineTool } from '../kit.js';
import { RemoveCardMembersSchema } from '../../schemas.js';
import { batchCardMembers } from '../helpers.js';
import { REMOVE_CARD_MEMBERS_DESC } from './descriptions.js';

/**
 * kaiten_remove_card_members — batch remove. One removeCardMember call per user
 * id, in order, via batchCardMembers. Also the only way to unassign a
 * responsible user (removes them from the card entirely).
 */
export const removeCardMembers = defineTool({
  name: 'kaiten_remove_card_members',
  description: REMOVE_CARD_MEMBERS_DESC,
  schema: RemoveCardMembersSchema,
  annotations: { idempotent: true },
  handler: ({ card_id, user_ids }, ctx) =>
    batchCardMembers(user_ids, card_id, 'removed', (id) =>
      ctx.client.removeCardMember(card_id, id, ctx.signal),
    ),
});
