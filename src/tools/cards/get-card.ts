import { defineTool, textWithData } from '../kit.js';
import { GetCardSchema } from '../../schemas.js';
import { CardOutput } from '../../output-schemas.js';
import { stripAvatars } from '../../transformers.js';
import { renderCardMarkdown } from '../render.js';
import { GET_CARD_DESC } from './descriptions.js';

/**
 * kaiten_get_card — markdown-card archetype.
 *
 * The JSON branch returns the RAW card object (matching the original
 * `JSON.stringify(card)`, NOT the simplified one) — the kit seam JSON-wraps it
 * and (read-only) mirrors it into structuredContent. The markdown branch
 * defers to renderCardMarkdown for the human view but ALSO attaches the raw
 * card as structuredContent (MCP spec 2025-11-25) via textWithData, so a
 * programmatic client gets machine-readable data without parsing the markdown.
 */
export const getCard = defineTool({
  name: 'kaiten_get_card',
  description: GET_CARD_DESC,
  schema: GetCardSchema,
  outputSchema: CardOutput,
  annotations: { readOnly: true },
  handler: async ({ card_id, format }, ctx) => {
    const card = await ctx.client.getCard(card_id, ctx.signal);
    // Drop the base64 avatar URL fields from every raw-card payload (json body
    // AND the structuredContent mirror). The markdown view already projects via
    // simplifyCard, so the human text is unaffected.
    const clean = stripAvatars(card);
    if (format === 'json') return clean; // → JSON-wrapped + structuredContent by the seam
    return textWithData(await renderCardMarkdown(card, ctx), clean);
  },
});
