import { defineTool } from '../kit.js';
import { CreateCardSchema } from '../../schemas.js';
import type { CreateCardParams } from '../../kaiten-client.js';
import { CREATE_CARD_DESC } from './descriptions.js';

/**
 * kaiten_create_card — thin-json archetype.
 *
 * Param-building ported VERBATIM from the `kaiten_create_card` case in
 * src/server.ts: title + board_id always; every optional field is conditionally
 * assigned (size/asap forwarded when `!== undefined`, others when truthy). The
 * handler does NOT forward `idempotency_key` into params — matching the original
 * (the client auto-generates the key); the seam JSON-wraps the returned card.
 */
export const createCard = defineTool({
  name: 'kaiten_create_card',
  description: CREATE_CARD_DESC,
  schema: CreateCardSchema,
  annotations: {},
  handler: async (args, ctx) => {
    const params: CreateCardParams = {
      title: args.title,
      board_id: args.board_id,
    };
    if (args.column_id) params.column_id = args.column_id;
    if (args.lane_id) params.lane_id = args.lane_id;
    if (args.description) params.description = args.description;
    if (args.type_id) params.type_id = args.type_id;
    if (args.size !== undefined) params.size = args.size;
    if (args.asap !== undefined) params.asap = args.asap;
    if (args.owner_id) params.owner_id = args.owner_id;
    if (args.due_date) params.due_date = args.due_date;

    return ctx.client.createCard(params, ctx.signal);
  },
});
