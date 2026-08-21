import { defineTool } from '../kit.js';
import { CreateCardSchema } from '../../schemas.js';
import { CardOutput } from '../../output-schemas.js';
import { stripAvatars } from '../../transformers.js';
import { assertSizeApplied, buildSizeText } from '../helpers.js';
import type { CreateCardParams } from '../../kaiten-client.js';
import { CREATE_CARD_DESC } from './descriptions.js';

/**
 * kaiten_create_card — thin-json archetype.
 *
 * Param-building: title + board_id always; every optional field is conditionally
 * assigned (size/asap forwarded when `!== undefined`, others when truthy). The
 * numeric `size` arg (plus the optional `size_unit`) is serialised to `size_text`
 * (a string) because Kaiten's POST ignores the numeric `size` field on write,
 * and the response is checked with `assertSizeApplied` so a silently dropped
 * estimate surfaces as a tool error instead of a successful-looking create. A
 * caller-supplied `idempotency_key` is forwarded into params so the client sends
 * it as the `Idempotency-Key` header (the client falls back to an auto-generated
 * key only when none is provided), making retries safe against duplicate cards.
 * The seam JSON-wraps the returned card.
 */
export const createCard = defineTool({
  name: 'kaiten_create_card',
  description: CREATE_CARD_DESC,
  schema: CreateCardSchema,
  outputSchema: CardOutput,
  annotations: { idempotent: true },
  handler: async (args, ctx) => {
    const params: CreateCardParams = {
      title: args.title,
      board_id: args.board_id,
    };
    if (args.column_id) params.column_id = args.column_id;
    if (args.lane_id) params.lane_id = args.lane_id;
    if (args.description) params.description = args.description;
    if (args.type_id) params.type_id = args.type_id;
    if (args.size !== undefined) params.size_text = buildSizeText(args.size, args.size_unit);
    if (args.asap !== undefined) params.asap = args.asap;
    if (args.owner_id) params.owner_id = args.owner_id;
    if (args.due_date) params.due_date = args.due_date;
    if (args.idempotency_key) params.idempotency_key = args.idempotency_key;

    const card = await ctx.client.createCard(params, ctx.signal);
    // Kaiten answers 200 even when it drops the estimate, so verify the write
    // landed instead of handing a silent no-op back as a success.
    if (args.size !== undefined) {
      assertSizeApplied(card, args.size, params.size_text!, 'created');
    }
    return stripAvatars(card);
  },
});
