import { defineTool, text } from '../kit.js';
import { ListBoardsSchema } from '../../schemas.js';
import { applyBoardVerbosity, truncateResponse } from '../../utils.js';
import { LIST_BOARDS_DESC } from './descriptions.js';

/**
 * kaiten_list_boards — cached-list archetype.
 *
 * Ported from the `kaiten_list_boards` case in src/server.ts. Resolves
 * space_id via provided arg or ctx.config.KAITEN_DEFAULT_SPACE_ID; throws if
 * neither is set (same error message as the original). Checks the cache via
 * ctx.cache.getBoards(spaceId); on miss calls ctx.client.getBoards(spaceId,
 * ctx.signal) then ctx.cache.setBoards(boards, spaceId). Applies
 * applyBoardVerbosity then truncateResponse — both match the original handler.
 */
export const listBoards = defineTool({
  name: 'kaiten_list_boards',
  description: LIST_BOARDS_DESC,
  schema: ListBoardsSchema,
  annotations: { readOnly: true },
  handler: async ({ space_id, verbosity }, ctx) => {
    // spaceId is now required by API - use provided or fallback to DEFAULT_SPACE_ID
    const spaceId = space_id || ctx.config.KAITEN_DEFAULT_SPACE_ID;

    if (!spaceId) {
      throw new Error(
        'space_id is required. Set KAITEN_DEFAULT_SPACE_ID environment variable or provide space_id parameter.'
      );
    }

    // Try cache first
    let boards = ctx.cache.getBoards(spaceId);
    if (!boards) {
      boards = await ctx.client.getBoards(spaceId, ctx.signal);
      ctx.cache.setBoards(boards, spaceId);
    }

    // Apply verbosity control
    const resolvedVerbosity = verbosity || 'normal';
    const processedBoards = applyBoardVerbosity(boards, resolvedVerbosity);

    return text(truncateResponse(JSON.stringify(processedBoards, null, 2)));
  },
});
