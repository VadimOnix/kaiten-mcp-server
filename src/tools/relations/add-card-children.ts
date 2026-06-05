import { defineTool } from '../kit.js';
import { AddCardChildrenSchema } from '../../schemas.js';
import { BatchOutput } from '../../output-schemas.js';
import { batchPerItem } from '../helpers.js';
import { ADD_CARD_CHILDREN_DESC } from './descriptions.js';

/**
 * kaiten_add_card_children — batch-relation archetype.
 *
 * Ported from the `kaiten_add_card_children` case in src/server.ts via
 * batchPerItem. relation:'children' → top key parent_card_id, per-item failed
 * key child_card_id; verb 'added'. One addCardChild call per child id, in order.
 */
export const addCardChildren = defineTool({
  name: 'kaiten_add_card_children',
  description: ADD_CARD_CHILDREN_DESC,
  schema: AddCardChildrenSchema,
  outputSchema: BatchOutput,
  annotations: { idempotent: true },
  handler: ({ card_id, child_card_ids }, ctx) =>
    batchPerItem(child_card_ids, card_id, 'children', 'added', (id) =>
      ctx.client.addCardChild(card_id, id, ctx.signal),
    ),
});
