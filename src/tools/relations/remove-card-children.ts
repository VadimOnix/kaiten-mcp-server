import { defineTool } from '../kit.js';
import { RemoveCardChildrenSchema } from '../../schemas.js';
import { BatchOutput } from '../../output-schemas.js';
import { batchPerItem } from '../helpers.js';
import { REMOVE_CARD_CHILDREN_DESC } from './descriptions.js';

/**
 * kaiten_remove_card_children — batch-relation archetype.
 *
 * Ported from the `kaiten_remove_card_children` case in src/server.ts via
 * batchPerItem. relation:'children' → top key parent_card_id, per-item failed
 * key child_card_id; verb 'removed'. One removeCardChild call per child id.
 */
export const removeCardChildren = defineTool({
  name: 'kaiten_remove_card_children',
  description: REMOVE_CARD_CHILDREN_DESC,
  schema: RemoveCardChildrenSchema,
  outputSchema: BatchOutput,
  annotations: { idempotent: true },
  handler: ({ card_id, child_card_ids }, ctx) =>
    batchPerItem(child_card_ids, card_id, 'children', 'removed', (id) =>
      ctx.client.removeCardChild(card_id, id, ctx.signal),
    ),
});
