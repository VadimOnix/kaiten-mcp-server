import { z } from 'zod';
import { defineTool, text } from '../kit.js';
import { simplifySpace } from '../../transformers.js';
import { LIST_SPACES_DESC } from './descriptions.js';

/**
 * kaiten_list_spaces — cached-list archetype.
 *
 * Ported from the `kaiten_list_spaces` case in src/server.ts. Checks the cache
 * first (ctx.cache.getSpaces()); on miss calls ctx.client.getSpaces(ctx.signal)
 * then ctx.cache.setSpaces(spaces). Maps through simplifySpace, then formats as
 * a human-readable text string (NOT JSON). Does NOT apply truncateResponse.
 */
export const listSpaces = defineTool({
  name: 'kaiten_list_spaces',
  description: LIST_SPACES_DESC,
  schema: z.object({}).strict(),
  annotations: { readOnly: true },
  handler: async (_args, ctx) => {
    // Try cache first
    let spaces = ctx.cache.getSpaces();
    if (!spaces) {
      spaces = await ctx.client.getSpaces(ctx.signal);
      ctx.cache.setSpaces(spaces);
    }
    const simplified = spaces.map(simplifySpace);

    // Human-readable format
    let output = `Found ${simplified.length} space(s):\n\n`;
    simplified.forEach((space, index) => {
      output += `${index + 1}. ${space.title} (ID: ${space.id})`;
      if (space.archived) output += ` [ARCHIVED]`;
      output += `\n`;
      if (space.boards && space.boards.length > 0) {
        output += `   📋 Boards (${space.boards.length}): ${space.boards.map(b => b.title).join(', ')}\n`;
      }
      output += `\n`;
    });

    return text(output);
  },
});
