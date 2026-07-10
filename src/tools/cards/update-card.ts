import { defineTool } from '../kit.js';
import { UpdateCardSchema } from '../../schemas.js';
import { CardOutput } from '../../output-schemas.js';
import { stripAvatars } from '../../transformers.js';
import type { UpdateCardParams } from '../../kaiten-client.js';
import { UPDATE_CARD_DESC } from './descriptions.js';

/**
 * kaiten_update_card — thin-json archetype.
 *
 * Param-building: description/state/size/asap are forwarded when `!== undefined`
 * (so empty string description and zero state/size pass through), the rest when
 * truthy. The numeric `size` arg is serialised to `size_text` (a string) because
 * Kaiten's PATCH ignores the numeric `size` field on write and derives it from
 * `size_text`. A caller-supplied `idempotency_key` is forwarded into params so the
 * client sends it as the `Idempotency-Key` header (auto-generated only when
 * absent), making retries safe. The seam JSON-wraps the returned card.
 */
export const updateCard = defineTool({
  name: 'kaiten_update_card',
  description: UPDATE_CARD_DESC,
  schema: UpdateCardSchema,
  outputSchema: CardOutput,
  annotations: { idempotent: true },
  handler: async (args, ctx) => {
    const params: UpdateCardParams = {};
    if (args.title) params.title = args.title;
    if (args.description !== undefined) params.description = args.description;
    if (args.state !== undefined) params.state = args.state;
    if (args.column_id) params.column_id = args.column_id;
    if (args.lane_id) params.lane_id = args.lane_id;
    if (args.type_id) params.type_id = args.type_id;
    if (args.size !== undefined) params.size_text = String(args.size);
    if (args.asap !== undefined) params.asap = args.asap;
    if (args.owner_id) params.owner_id = args.owner_id;
    if (args.due_date) params.due_date = args.due_date;
    if (args.idempotency_key) params.idempotency_key = args.idempotency_key;

    return stripAvatars(await ctx.client.updateCard(args.card_id, params, ctx.signal));
  },
});
