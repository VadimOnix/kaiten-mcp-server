import { defineTool } from '../kit.js';
import { ListTagsSchema } from '../../schemas.js';
import { TagListOutput } from '../../output-schemas.js';
import { simplifyTag } from '../../transformers.js';
import { LIST_TAGS_DESC } from './descriptions.js';

/**
 * kaiten_list_tags — thin-json archetype.
 *
 * Resolves a tag NAME to the numeric tag_id that kaiten_search_cards filters
 * on. Without it the filter was a dead end: you could search by tag_ids but had
 * no way to learn one short of hitting REST by hand.
 *
 * `query` is required by the schema rather than optional-with-a-default because
 * Kaiten's unfiltered `GET /tags` returns only the first 100 tags and ignores
 * `limit` — an unfiltered call would look successful while quietly omitting the
 * tag being looked for. Projects through simplifyTag so the colour and
 * timestamp noise never reaches the model's context.
 */
export const listTags = defineTool({
  name: 'kaiten_list_tags',
  description: LIST_TAGS_DESC,
  schema: ListTagsSchema,
  outputSchema: TagListOutput,
  annotations: { readOnly: true },
  handler: async ({ query }, ctx) => {
    const tags = await ctx.client.listTags(query, ctx.signal);
    return tags.map(simplifyTag);
  },
});
