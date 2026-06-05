import { defineTool, textWithData } from '../kit.js';
import { ListUsersSchema } from '../../schemas.js';
import { UserListOutput } from '../../output-schemas.js';
import { applyUserVerbosity, truncateResponse } from '../../utils.js';
import { LIST_USERS_DESC } from './descriptions.js';

/**
 * kaiten_list_users — two-path archetype.
 *
 * Ported from the `kaiten_list_users` case in src/server.ts. Has two code
 * paths:
 *
 * 1. Query path (query || limit || offset truthy): server-side filter via
 *    ctx.client.getUsers({ query, limit, offset }, ctx.signal). NOT cached.
 *    Applies applyUserVerbosity then truncateResponse.
 *
 * 2. Cached-all path (no query/limit/offset): returns all users via
 *    ctx.cache.getUsers() / ctx.cache.setUsers(). On cache miss, calls
 *    ctx.client.getUsers(undefined, ctx.signal). Applies applyUserVerbosity
 *    then truncateResponse.
 *
 * Both paths resolve verbosity as validatedArgs.verbosity || 'normal' and
 * return text(output) — matching the original handler exactly.
 */
export const listUsers = defineTool({
  name: 'kaiten_list_users',
  description: LIST_USERS_DESC,
  schema: ListUsersSchema,
  outputSchema: UserListOutput,
  annotations: { readOnly: true },
  handler: async ({ query, limit, offset, verbosity }, ctx) => {
    // Use server-side filtering when parameters provided
    // /users endpoint supports query, limit, and offset for server-side filtering
    if (query || limit || offset) {
      const users = await ctx.client.getUsers({
        query,
        limit,
        offset,
      }, ctx.signal);

      // Apply verbosity control
      const resolvedVerbosity = verbosity || 'normal';
      const processedUsers = applyUserVerbosity(users, resolvedVerbosity);

      const output = truncateResponse(JSON.stringify(processedUsers, null, 2));

      return textWithData(output, processedUsers);
    }

    // Fallback: cache full list when no parameters
    // Note: Starting mid-July, /users endpoint returns max 100 users per request
    ctx.log.warning('[Kaiten MCP] WARNING: kaiten_list_users called without parameters. Consider using query parameter for better performance.');
    let allUsers = ctx.cache.getUsers();
    if (!allUsers) {
      allUsers = await ctx.client.getUsers(undefined, ctx.signal);
      ctx.cache.setUsers(allUsers);
    }

    // Apply verbosity control
    const resolvedVerbosity = verbosity || 'normal';
    const processedUsers = applyUserVerbosity(allUsers, resolvedVerbosity);

    const output = truncateResponse(JSON.stringify(processedUsers, null, 2));

    return textWithData(output, processedUsers);
  },
});
