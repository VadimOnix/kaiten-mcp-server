import { defineTool } from '../kit.js';
import { SetCardResponsibleSchema } from '../../schemas.js';
import { SET_CARD_RESPONSIBLE_DESC } from './descriptions.js';

/**
 * kaiten_set_card_responsible — marks a user responsible (type 2). The client
 * auto-adds the user as a member first (swallowing the already-member error)
 * then PATCHes type:2. Additive: does not demote other responsible members.
 */
export const setCardResponsible = defineTool({
  name: 'kaiten_set_card_responsible',
  description: SET_CARD_RESPONSIBLE_DESC,
  schema: SetCardResponsibleSchema,
  annotations: { idempotent: true },
  handler: ({ card_id, user_id }, ctx) =>
    ctx.client.setCardResponsible(card_id, user_id, ctx.signal),
});
