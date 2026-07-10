import { z } from 'zod';

/**
 * Output schemas advertised via MCP `outputSchema` (spec 2025-11-25). They give
 * clients a typed contract for each tool's `structuredContent` AND let the model
 * know the response shape at plan time (so it can sequence tools more reliably).
 *
 * Design rules — keep these; they make conformance bulletproof AND cheap:
 *  - Every field is `.optional()` so verbosity=minimal (fewer fields) never
 *    fails the SDK's output validation.
 *  - Every object is `.passthrough()` so verbosity=detailed / raw API fields
 *    (extra keys) never fail, and the advertised contract is honest
 *    (additionalProperties: true — we really do return more than the key fields).
 *  - Declare only the few KEY fields a consumer/model routes on; the rest ride
 *    along via passthrough. This keeps the advertised schema SMALL, minimizing
 *    the per-connect token cost (the price of advertising outputSchema).
 *  - Collections are wrapped as { items: [...] } to mirror how the kit seam
 *    serializes an array return into structuredContent.
 */

const obj = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough();
const list = (item: z.ZodTypeAny) => obj({ items: z.array(item).optional() });

// ---- item shapes (loose, key fields only) ----
const CardItem = obj({
  id: z.number().optional(),
  title: z.string().optional(),
  board_title: z.string().optional(),
});

const UserItem = obj({
  id: z.number().optional(),
  full_name: z.string().optional(),
});

const NamedItem = obj({
  id: z.number().optional(),
  title: z.string().optional(),
});

const MemberItem = obj({
  id: z.number().optional(),
  full_name: z.string().optional(),
  type: z.number().optional(),
});

const CommentItem = obj({
  id: z.number().optional(),
  text: z.string().optional(),
  author_name: z.string().optional(),
});

// ---- single-object outputs ----
export const CardOutput = CardItem;
export const CommentOutput = CommentItem;
export const UserOutput = obj({
  id: z.number().optional(),
  full_name: z.string().optional(),
  email: z.string().optional(),
  username: z.string().optional(),
});

// ---- collection outputs ({ items: [...] }) ----
export const CardListOutput = list(CardItem);
export const UserListOutput = list(UserItem);
export const NamedListOutput = list(NamedItem);
export const MemberListOutput = list(MemberItem);
export const CommentListOutput = list(CommentItem);

// ---- mutation outputs ----
// Batch helpers share one shape; the anchor key differs by relation
// (card_id | parent_card_id | child_card_id), so all three are optional.
export const BatchOutput = obj({
  card_id: z.number().optional(),
  parent_card_id: z.number().optional(),
  child_card_id: z.number().optional(),
  succeeded: z.array(z.number()).optional(),
  failed: z.array(z.object({}).passthrough()).optional(),
  summary: z.string().optional(),
});

// Tag batch mutations report succeeded/failed by tag NAME (strings), so the
// shape differs from the id-keyed BatchOutput above.
export const TagBatchOutput = obj({
  card_id: z.number().optional(),
  succeeded: z.array(z.string()).optional(),
  failed: z.array(z.object({}).passthrough()).optional(),
  summary: z.string().optional(),
});

export const ResponsibleOutput = obj({
  card_id: z.number().optional(),
  user_id: z.number().optional(),
  type: z.number().optional(),
});

export const DeleteOutput = obj({
  card_id: z.number().optional(),
  comment_id: z.number().optional(),
  deleted: z.boolean().optional(),
});
