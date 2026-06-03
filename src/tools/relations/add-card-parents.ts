import { defineTool } from '../kit.js';
import { AddCardParentsSchema } from '../../schemas.js';
import { batchPerItem } from '../helpers.js';
import { ADD_CARD_PARENTS_DESC } from './descriptions.js';

/**
 * kaiten_add_card_parents — batch-relation archetype.
 *
 * Ported from the `kaiten_add_card_parents` case in src/server.ts via
 * batchPerItem. relation:'parents' → top key child_card_id, per-item failed key
 * parent_card_id; verb 'added'. One addCardParent call per parent id, in order.
 */
export const addCardParents = defineTool({
  name: 'kaiten_add_card_parents',
  description: ADD_CARD_PARENTS_DESC,
  schema: AddCardParentsSchema,
  annotations: { idempotent: true },
  handler: ({ card_id, parent_card_ids }, ctx) =>
    batchPerItem(parent_card_ids, card_id, 'parents', 'added', (id) =>
      ctx.client.addCardParent(card_id, id, ctx.signal),
    ),
});
