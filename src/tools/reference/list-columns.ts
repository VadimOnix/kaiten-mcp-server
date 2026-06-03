import { defineTool } from '../kit.js';
import { ListColumnsSchema } from '../../schemas.js';
import { LIST_COLUMNS_DESC } from './descriptions.js';

/**
 * kaiten_list_columns — thin-json archetype.
 *
 * Ported from the `kaiten_list_columns` case in src/server.ts. Calls
 * ctx.client.getColumns(board_id, ctx.signal) and returns the raw JSON
 * array. Not cached. No truncation.
 */
export const listColumns = defineTool({
  name: 'kaiten_list_columns',
  description: LIST_COLUMNS_DESC,
  schema: ListColumnsSchema,
  annotations: { readOnly: true },
  handler: async ({ board_id }, ctx) => {
    return ctx.client.getColumns(board_id, ctx.signal);
  },
});
