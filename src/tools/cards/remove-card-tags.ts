import { defineTool } from '../kit.js';
import { RemoveCardTagsSchema } from '../../schemas.js';
import { TagBatchOutput } from '../../output-schemas.js';
import { batchCardTags } from '../helpers.js';
import { REMOVE_CARD_TAGS_DESC } from './descriptions.js';

/**
 * kaiten_remove_card_tags — batch-tag archetype.
 *
 * The DELETE endpoint is keyed by numeric tag id, but the tool takes names, so
 * it fetches the card's current tags ONCE and builds a case-insensitive
 * name→id map. Each requested name is resolved and unlinked via batchCardTags
 * (verb 'removed'); a name absent from the card becomes a per-item failure
 * ('tag not found on card') rather than aborting the whole batch. A failure of
 * the tag lookup itself propagates and is mapped to an error envelope by the kit.
 */
export const removeCardTags = defineTool({
  name: 'kaiten_remove_card_tags',
  description: REMOVE_CARD_TAGS_DESC,
  schema: RemoveCardTagsSchema,
  outputSchema: TagBatchOutput,
  annotations: { idempotent: true },
  handler: async ({ card_id, tag_names }, ctx) => {
    const existing = await ctx.client.getCardTags(card_id, ctx.signal);
    const byName = new Map(existing.map((t) => [t.name.trim().toLowerCase(), t]));

    return batchCardTags(tag_names, card_id, 'removed', async (name) => {
      const tag = byName.get(name.trim().toLowerCase());
      if (!tag || tag.id === undefined) throw new Error('tag not found on card');
      await ctx.client.removeCardTag(card_id, tag.id, ctx.signal);
    });
  },
});
