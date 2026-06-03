import { defineTool } from '../kit.js';
import { ListLanesSchema } from '../../schemas.js';
import { LIST_LANES_DESC } from './descriptions.js';

/**
 * kaiten_list_lanes — thin-json archetype.
 *
 * Ported from the `kaiten_list_lanes` case in src/server.ts. Calls
 * ctx.client.getLanes(board_id, ctx.signal) and returns the raw JSON
 * array. Not cached. No truncation.
 */
export const listLanes = defineTool({
  name: 'kaiten_list_lanes',
  description: LIST_LANES_DESC,
  schema: ListLanesSchema,
  annotations: { readOnly: true },
  handler: async ({ board_id }, ctx) => {
    return ctx.client.getLanes(board_id, ctx.signal);
  },
});
