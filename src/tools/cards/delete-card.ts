import { defineTool, text } from '../kit.js';
import { DeleteCardSchema } from '../../schemas.js';
import { DELETE_CARD_DESC } from './descriptions.js';

/**
 * kaiten_delete_card — thin-text archetype.
 *
 * Success string copied VERBATIM from the `kaiten_delete_card` case in
 * src/server.ts: `Card ${card_id} deleted successfully`.
 */
export const deleteCard = defineTool({
  name: 'kaiten_delete_card',
  description: DELETE_CARD_DESC,
  schema: DeleteCardSchema,
  annotations: { destructive: true },
  handler: async ({ card_id }, ctx) => {
    await ctx.client.deleteCard(card_id, ctx.signal);
    return text(`Card ${card_id} deleted successfully`);
  },
});
