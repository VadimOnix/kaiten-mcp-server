import { defineTool } from '../kit.js';
import { ListTypesSchema } from '../../schemas.js';
import { NamedListOutput } from '../../output-schemas.js';
import { LIST_TYPES_DESC } from './descriptions.js';

/**
 * kaiten_list_types — thin-json archetype.
 *
 * Ported from the `kaiten_list_types` case in src/server.ts. Calls
 * ctx.client.getTypes(board_id, ctx.signal) and returns the raw JSON
 * array. Not cached. No truncation.
 */
export const listTypes = defineTool({
  name: 'kaiten_list_types',
  description: LIST_TYPES_DESC,
  schema: ListTypesSchema,
  outputSchema: NamedListOutput,
  annotations: { readOnly: true },
  handler: async ({ board_id }, ctx) => {
    return ctx.client.getTypes(board_id, ctx.signal);
  },
});
