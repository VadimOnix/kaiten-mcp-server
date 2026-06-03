import { defineTool, text } from '../kit.js';
import { GetCardSchema } from '../../schemas.js';
import { renderCardMarkdown } from '../render.js';
import { GET_CARD_DESC } from './descriptions.js';

/**
 * kaiten_get_card — markdown-card archetype.
 *
 * Ported from the `kaiten_get_card` case in src/server.ts. The JSON branch
 * returns the RAW card object (matching the original `JSON.stringify(card)`,
 * NOT the simplified one); the markdown branch defers to renderCardMarkdown.
 */
export const getCard = defineTool({
  name: 'kaiten_get_card',
  description: GET_CARD_DESC,
  schema: GetCardSchema,
  annotations: { readOnly: true },
  handler: async ({ card_id, format }, ctx) => {
    const card = await ctx.client.getCard(card_id, ctx.signal);
    if (format === 'json') return card; // → JSON-wrapped by the seam (raw card)
    return text(await renderCardMarkdown(card, ctx));
  },
});
