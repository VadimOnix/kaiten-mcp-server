import { defineTool } from '../kit.js';
import { AddCardTagsSchema } from '../../schemas.js';
import { TagBatchOutput } from '../../output-schemas.js';
import { batchCardTags } from '../helpers.js';
import { ADD_CARD_TAGS_DESC } from './descriptions.js';

/**
 * kaiten_add_card_tags — batch-tag archetype.
 *
 * One addCardTag(name) POST per requested name, in order, via batchCardTags
 * (top key card_id, per-item failure key tag_name, verb 'added'). Kaiten
 * creates-or-links a tag by name, so this is idempotent.
 */
export const addCardTags = defineTool({
  name: 'kaiten_add_card_tags',
  description: ADD_CARD_TAGS_DESC,
  schema: AddCardTagsSchema,
  outputSchema: TagBatchOutput,
  annotations: { idempotent: true },
  handler: ({ card_id, tag_names }, ctx) =>
    batchCardTags(tag_names, card_id, 'added', (name) =>
      ctx.client.addCardTag(card_id, name, ctx.signal),
    ),
});
