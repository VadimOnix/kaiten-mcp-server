import { defineTool, textWithData } from '../kit.js';
import { DeleteCardSchema } from '../../schemas.js';
import { DeleteOutput } from '../../output-schemas.js';
import { DELETE_CARD_DESC } from './descriptions.js';

/**
 * kaiten_delete_card — thin-text archetype.
 *
 * Success string copied VERBATIM from the `kaiten_delete_card` case in
 * src/server.ts: `Card ${card_id} deleted successfully`. Also emits a
 * machine-readable structuredContent mirror { card_id, deleted } for the
 * advertised outputSchema.
 */
export const deleteCard = defineTool({
  name: 'kaiten_delete_card',
  description: DELETE_CARD_DESC,
  schema: DeleteCardSchema,
  outputSchema: DeleteOutput,
  annotations: { destructive: true },
  handler: async ({ card_id }, ctx) => {
    await ctx.client.deleteCard(card_id, ctx.signal);
    return textWithData(`Card ${card_id} deleted successfully`, { card_id, deleted: true });
  },
});
