import { defineTool } from '../kit.js';
import { RemoveCardParentsSchema } from '../../schemas.js';
import { BatchOutput } from '../../output-schemas.js';
import { batchPerItem } from '../helpers.js';
import { REMOVE_CARD_PARENTS_DESC } from './descriptions.js';

/**
 * kaiten_remove_card_parents — batch-relation archetype.
 *
 * Ported from the `kaiten_remove_card_parents` case in src/server.ts via
 * batchPerItem. relation:'parents' → top key child_card_id, per-item failed key
 * parent_card_id; verb 'removed'. One removeCardParent call per parent id.
 */
export const removeCardParents = defineTool({
  name: 'kaiten_remove_card_parents',
  description: REMOVE_CARD_PARENTS_DESC,
  schema: RemoveCardParentsSchema,
  outputSchema: BatchOutput,
  annotations: { idempotent: true },
  handler: ({ card_id, parent_card_ids }, ctx) =>
    batchPerItem(parent_card_ids, card_id, 'parents', 'removed', (id) =>
      ctx.client.removeCardParent(card_id, id, ctx.signal),
    ),
});
