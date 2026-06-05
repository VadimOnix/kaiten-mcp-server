import type { SearchCardsArgs } from '../schemas.js';
import { KaitenError } from '../kaiten-client.js';
import type { ToolResult } from './kit.js';

/**
 * Build the Kaiten search query object from validated search args.
 *
 * Ported VERBATIM from the `kaiten_search_cards` case in src/server.ts (the
 * `searchParams` construction block) so that, once Task 6 routes search through
 * this function, the characterization snapshot in test/server.test.ts stays
 * byte-identical. Every `if (a.x) p.x = a.x` line, the space_id fallback, and
 * the `condition` default mirror the live handler exactly.
 *
 * space_id rules (matching the handler's three-way branch):
 *   - explicit, non-null, non-zero  -> kept as-is
 *   - undefined AND a defaultSpaceId is set -> defaults to defaultSpaceId
 *   - 0 or null -> omitted entirely (caller's "search all spaces" escape hatch),
 *     and 0/null NEVER fall back to the default space.
 *
 * condition: defaults to 1 (active) only when undefined; explicit 0 is kept.
 */
export function buildSearchParams(
  a: SearchCardsArgs,
  defaultSpaceId?: number,
): Record<string, unknown> {
  const searchParams: Record<string, unknown> = {};

  // Text search
  if (a.query) searchParams.query = a.query;
  if (a.title) searchParams.title = a.title;

  // Handle space_id logic
  if (a.space_id !== undefined && a.space_id !== null && a.space_id !== 0) {
    searchParams.space_id = a.space_id;
  } else if (a.space_id === undefined && defaultSpaceId) {
    searchParams.space_id = defaultSpaceId;
  }

  // Basic filters
  if (a.board_id) searchParams.board_id = a.board_id;
  if (a.column_id) searchParams.column_id = a.column_id;
  if (a.lane_id) searchParams.lane_id = a.lane_id;
  if (a.state !== undefined) searchParams.state = a.state;
  if (a.owner_id) searchParams.owner_id = a.owner_id;
  if (a.type_id) searchParams.type_id = a.type_id;
  searchParams.condition = a.condition !== undefined ? a.condition : 1;

  // Date filters
  if (a.created_before) searchParams.created_before = a.created_before;
  if (a.created_after) searchParams.created_after = a.created_after;
  if (a.updated_before) searchParams.updated_before = a.updated_before;
  if (a.updated_after) searchParams.updated_after = a.updated_after;
  if (a.due_date_before) searchParams.due_date_before = a.due_date_before;
  if (a.due_date_after) searchParams.due_date_after = a.due_date_after;

  // Boolean flags
  if (a.asap !== undefined) searchParams.asap = a.asap;
  if (a.overdue !== undefined) searchParams.overdue = a.overdue;

  // Multiple IDs (comma-separated)
  if (a.owner_ids) searchParams.owner_ids = a.owner_ids;
  if (a.member_ids) searchParams.member_ids = a.member_ids;
  if (a.tag_ids) searchParams.tag_ids = a.tag_ids;

  // Sorting and pagination
  if (a.sort_by) searchParams.sort_by = a.sort_by;
  if (a.sort_direction) searchParams.sort_direction = a.sort_direction;
  if (a.limit) searchParams.limit = a.limit;
  if (a.skip) searchParams.skip = a.skip;

  return searchParams;
}

/**
 * Relation key configuration for {@link batchPerItem}.
 *
 * ⚠️ The children and parents batch handlers in src/server.ts produce DIVERGENT
 * body shapes — they were added in different versions. They are NOT a single
 * shape parameterized only by a label. The divergence (verified against the
 * snapshots in test/server.test.ts) is:
 *
 *   children: { parent_card_id, succeeded, failed:[{ child_card_id, error }], summary }
 *   parents : { child_card_id,  succeeded, failed:[{ parent_card_id, error }], summary }
 *
 * i.e. the top-level id key AND the per-item id key swap between the two. JSON
 * key insertion order is preserved by JSON.stringify, and the id key is the
 * FIRST key, so this mapping must be exact for byte-stability.
 */
const RELATION_KEYS: Record<'children' | 'parents', { topKey: string; itemKey: string }> = {
  children: { topKey: 'parent_card_id', itemKey: 'child_card_id' },
  parents: { topKey: 'child_card_id', itemKey: 'parent_card_id' },
};

/**
 * Run a per-item mutation across `ids` against one anchor card, collecting
 * per-id success/failure, and render the EXACT response envelope the four batch
 * handlers (add/remove children, add/remove parents) emit in src/server.ts.
 *
 * Faithful port details:
 *   - loop order: ids in order; success pushes the id, failure records an error.
 *   - error string: KaitenError -> `${message}${hint ? ` — ${hint}` : ''}`;
 *     other Error -> `.message`; anything else -> `String(err)`.
 *   - body key order: <topKey>, succeeded, failed, summary.
 *   - failed item key order: <itemKey>, error.
 *   - summary: `${succeeded.length} ${verb}, ${failed.length} failed`
 *     (verb is "added" or "removed", supplied by the caller).
 *   - isError: spread `{ isError: true }` ONLY when succeeded.length === 0; on
 *     any (even partial) success the property is omitted entirely.
 *
 * @param ids          item ids to operate on (child ids for 'children', parent ids for 'parents')
 * @param parentCardId the anchor card id (becomes <topKey> in the body)
 * @param relation     'children' | 'parents' — selects the divergent key naming
 * @param verb         summary verb, e.g. 'added' | 'removed'
 * @param run          the mutation to run for each id
 */
export async function batchPerItem(
  ids: number[],
  parentCardId: number,
  relation: 'children' | 'parents',
  verb: string,
  run: (id: number) => Promise<unknown>,
): Promise<ToolResult> {
  const { topKey, itemKey } = RELATION_KEYS[relation];
  const succeeded: number[] = [];
  const failed: Array<Record<string, number | string>> = [];

  for (const id of ids) {
    try {
      await run(id);
      succeeded.push(id);
    } catch (err) {
      failed.push({
        [itemKey]: id,
        error:
          err instanceof KaitenError
            ? `${err.message}${err.hint ? ` — ${err.hint}` : ''}`
            : err instanceof Error
              ? err.message
              : String(err),
      });
    }
  }

  const result = {
    [topKey]: parentCardId,
    succeeded,
    failed,
    summary: `${succeeded.length} ${verb}, ${failed.length} failed`,
  };

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
    ...(succeeded.length === 0 ? { isError: true } : {}),
  };
}

/**
 * Batch helper for card-member mutations. Runs `run` once per user id, in order,
 * collecting per-user successes/failures. Kept separate from {@link batchPerItem}
 * (which is byte-locked to the children/parents snapshots) so the members shape
 * is { card_id, succeeded, failed:[{ user_id, error }], summary }.
 */
export async function batchCardMembers(
  userIds: number[],
  cardId: number,
  verb: string,
  run: (userId: number) => Promise<unknown>,
): Promise<ToolResult> {
  const succeeded: number[] = [];
  const failed: Array<Record<string, number | string>> = [];

  for (const id of userIds) {
    try {
      await run(id);
      succeeded.push(id);
    } catch (err) {
      failed.push({
        user_id: id,
        error:
          err instanceof KaitenError
            ? `${err.message}${err.hint ? ` — ${err.hint}` : ''}`
            : err instanceof Error
              ? err.message
              : String(err),
      });
    }
  }

  const result = {
    card_id: cardId,
    succeeded,
    failed,
    summary: `${succeeded.length} ${verb}, ${failed.length} failed`,
  };

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    ...(succeeded.length === 0 ? { isError: true } : {}),
  };
}
