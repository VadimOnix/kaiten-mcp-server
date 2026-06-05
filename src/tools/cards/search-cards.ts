import { defineTool, textWithData } from '../kit.js';
import type { ServerContext } from '../kit.js';
import { SearchCardsSchema } from '../../schemas.js';
import type { z } from 'zod';
import { buildSearchParams } from '../helpers.js';
import { renderSearchSummary } from '../render.js';
import { applyCardVerbosity, truncateResponse } from '../../utils.js';
import { simplifyCardCompact } from '../../transformers.js';
import { SEARCH_CARDS_DESC } from './descriptions.js';

/**
 * kaiten_search_cards — search archetype (raw ToolResult).
 *
 * Pipeline ported VERBATIM from the `kaiten_search_cards` case in src/server.ts:
 *   1. buildSearchParams (the searchParams construction block, incl. space_id
 *      default + condition=1 default)
 *   2. searchCards(params, signal)
 *   3. applyCardVerbosity(cards, verbosity, simplifyCardCompact), verbosity
 *      defaulting to 'normal'
 *   4. the large-search warning: when effectiveLimit (= limit || 10) > 20 AND no
 *      params.space_id, emit ctx.log.warning (stderr-only side effect, does not
 *      touch the returned text). Note: the Zod schema caps limit at 20, so this
 *      branch is only reachable when the handler is invoked directly (bypassing
 *      schema validation), e.g. in unit tests that verify the warning path.
 *   5. renderSearchSummary(cards, processed, args, params)
 *   6. truncateResponse(...) before wrapping in the ToolResult
 */

/** Exported for direct handler testing (bypasses Zod schema, e.g. limit > 20). */
export async function searchCardsHandler(
  args: z.infer<typeof SearchCardsSchema> & { limit?: number },
  ctx: ServerContext,
) {
  const params = buildSearchParams(args, ctx.config.KAITEN_DEFAULT_SPACE_ID);
  const cards = await ctx.client.searchCards(params, ctx.signal);

  // Apply verbosity control
  const verbosity = args.verbosity || 'normal';
  const processedCards = applyCardVerbosity(cards, verbosity, simplifyCardCompact);

  // Warn if returning many cards without space_id filter
  const effectiveLimit = args.limit || 10;
  if (effectiveLimit > 20 && !params.space_id) {
    ctx.log.warning(
      `[Kaiten MCP] Large search result (limit=${effectiveLimit}) without space_id filter may cause context overflow. Consider adding space_id or board_id.`,
    );
  }

  const finalResponse = truncateResponse(renderSearchSummary(cards, processedCards, args, params));

  // Human-readable summary text PLUS a machine-readable structuredContent mirror
  // of the (verbosity-applied, ≤20) cards (MCP spec 2025-11-25). The result set
  // is bounded by the schema's limit cap, so the structured mirror cannot
  // re-bloat the way an unbounded list would.
  return textWithData(finalResponse, processedCards);
}

export const searchCards = defineTool({
  name: 'kaiten_search_cards',
  description: SEARCH_CARDS_DESC,
  schema: SearchCardsSchema,
  annotations: { readOnly: true },
  handler: searchCardsHandler,
});
