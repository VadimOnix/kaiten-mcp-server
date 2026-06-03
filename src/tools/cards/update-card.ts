import { defineTool } from '../kit.js';
import { UpdateCardSchema } from '../../schemas.js';
import type { UpdateCardParams } from '../../kaiten-client.js';
import { UPDATE_CARD_DESC } from './descriptions.js';

/**
 * kaiten_update_card — thin-json archetype.
 *
 * Param-building ported VERBATIM from the `kaiten_update_card` case in
 * src/server.ts: description/state/size/asap are forwarded when `!== undefined`
 * (so empty string description and zero state/size pass through), the rest when
 * truthy. `idempotency_key` is NOT forwarded into params (the client
 * auto-generates it); the seam JSON-wraps the returned card.
 */
export const updateCard = defineTool({
  name: 'kaiten_update_card',
  description: UPDATE_CARD_DESC,
  schema: UpdateCardSchema,
  annotations: { idempotent: true },
  handler: async (args, ctx) => {
    const params: UpdateCardParams = {};
    if (args.title) params.title = args.title;
    if (args.description !== undefined) params.description = args.description;
    if (args.state !== undefined) params.state = args.state;
    if (args.column_id) params.column_id = args.column_id;
    if (args.lane_id) params.lane_id = args.lane_id;
    if (args.type_id) params.type_id = args.type_id;
    if (args.size !== undefined) params.size = args.size;
    if (args.asap !== undefined) params.asap = args.asap;
    if (args.owner_id) params.owner_id = args.owner_id;
    if (args.due_date) params.due_date = args.due_date;

    return ctx.client.updateCard(args.card_id, params, ctx.signal);
  },
});
