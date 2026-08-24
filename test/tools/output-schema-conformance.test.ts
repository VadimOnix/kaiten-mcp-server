import { describe, it, expect } from 'vitest';
import { ALL_TOOLS } from '../../src/tools/index.js';

/**
 * outputSchema conformance (MCP spec 2025-11-25).
 *
 * Advertising `outputSchema` is a CONTRACT the SDK enforces: every non-error
 * result MUST carry `structuredContent` conforming to the schema, or the SDK
 * throws at call time. This suite is the guard that the contract holds for ALL
 * 26 tools — it drives each tool's happy path with a minimal fake ctx and
 * asserts (a) the tool advertises an outputSchema, (b) it emits structuredContent,
 * and (c) that structuredContent parses against the advertised schema.
 *
 * It also doubles as living documentation of every tool's happy-path output.
 */

const resolves = (v: unknown) => () => Promise.resolve(v);

const card = { id: 1, title: 'Card', board: { title: 'Board' } };
const comment = { id: 1, text: 'hi', created: '2025-01-01T00:00:00Z', author: { id: 9, full_name: 'A' } };
const user = { id: 1, full_name: 'User', email: 'u@example.com', username: 'u', activated: true };
const member = { id: 1, full_name: 'Member', type: 1 };
const named = (title: string) => ({ id: 1, title });

// Per-tool happy-path fixture: the args + the client/cache stubs the handler
// touches. Stubs return archetype-appropriate shapes; the assertions then check
// the emitted structuredContent against the tool's own advertised outputSchema.
const FIXTURES: Record<string, { args: Record<string, unknown>; client?: Record<string, unknown>; cache?: Record<string, unknown> }> = {
  kaiten_get_card: { args: { card_id: 1 }, client: { getCard: resolves(card) } },
  kaiten_create_card: { args: { title: 'X', board_id: 1 }, client: { createCard: resolves(card) } },
  kaiten_update_card: { args: { card_id: 1, title: 'X' }, client: { updateCard: resolves(card) } },
  kaiten_delete_card: { args: { card_id: 1 }, client: { deleteCard: resolves(undefined) } },
  kaiten_add_card_tags: { args: { card_id: 1, tag_names: ['x'] }, client: { addCardTag: resolves({ id: 1, name: 'x' }) } },
  kaiten_remove_card_tags: { args: { card_id: 1, tag_names: ['x'] }, client: { getCardTags: resolves([{ id: 9, name: 'x' }]), removeCardTag: resolves(undefined) } },
  kaiten_search_cards: { args: { board_id: 1 }, client: { searchCards: resolves([card]) } },
  kaiten_get_card_comments: { args: { card_id: 1 }, client: { getCardComments: resolves([comment]) } },
  kaiten_create_comment: { args: { card_id: 1, text: 'hi' }, client: { createComment: resolves(comment) } },
  kaiten_update_comment: { args: { card_id: 1, comment_id: 1, text: 'hi' }, client: { updateComment: resolves(comment) } },
  kaiten_delete_comment: { args: { card_id: 1, comment_id: 1 }, client: { deleteComment: resolves(undefined) } },
  kaiten_get_card_children: { args: { card_id: 1 }, client: { getCardChildren: resolves([card]) } },
  kaiten_add_card_children: { args: { card_id: 1, child_card_ids: [2] }, client: { addCardChild: resolves(undefined) } },
  kaiten_remove_card_children: { args: { card_id: 1, child_card_ids: [2] }, client: { removeCardChild: resolves(undefined) } },
  kaiten_get_card_parents: { args: { card_id: 1 }, client: { getCardParents: resolves([card]) } },
  kaiten_add_card_parents: { args: { card_id: 1, parent_card_ids: [2] }, client: { addCardParent: resolves(undefined) } },
  kaiten_remove_card_parents: { args: { card_id: 1, parent_card_ids: [2] }, client: { removeCardParent: resolves(undefined) } },
  kaiten_get_card_members: { args: { card_id: 1 }, client: { getCardMembers: resolves([member]) } },
  kaiten_add_card_members: { args: { card_id: 1, user_ids: [2] }, client: { addCardMember: resolves(undefined) } },
  kaiten_remove_card_members: { args: { card_id: 1, user_ids: [2] }, client: { removeCardMember: resolves(undefined) } },
  kaiten_set_card_responsible: { args: { card_id: 1, user_id: 2 }, client: { setCardResponsible: resolves({ card_id: 1, user_id: 2, type: 2 }) } },
  kaiten_list_spaces: { args: {}, client: { getSpaces: resolves([{ id: 1, title: 'Space', boards: [] }]) } },
  kaiten_list_boards: { args: { space_id: 1 }, client: { getBoards: resolves([{ id: 1, title: 'Board', space_id: 1 }]) } },
  kaiten_list_columns: { args: { board_id: 1 }, client: { getColumns: resolves([named('Col')]) } },
  kaiten_list_lanes: { args: { board_id: 1 }, client: { getLanes: resolves([named('Lane')]) } },
  kaiten_list_types: { args: { board_id: 1 }, client: { getTypes: resolves([named('Type')]) } },
  kaiten_list_tags: { args: { query: 'x' }, client: { listTags: resolves([{ id: 1, name: 'x' }]) } },
  kaiten_get_current_user: { args: {}, client: { getCurrentUser: resolves(user) } },
  kaiten_list_users: { args: { query: 'u' }, client: { getUsers: resolves([user]) } },
};

const fakeCtx = (f: { client?: Record<string, unknown>; cache?: Record<string, unknown> }) =>
  ({
    client: f.client ?? {},
    cache: f.cache ?? {
      getUsers: () => undefined,
      setUsers: () => {},
      getSpaces: () => undefined,
      setSpaces: () => {},
      getBoards: () => undefined,
      setBoards: () => {},
    },
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
  }) as any;

describe('outputSchema conformance — every tool emits structuredContent matching its advertised schema', () => {
  it('all 28 tools advertise an outputSchema', () => {
    const without = ALL_TOOLS.filter((t) => !t.outputSchema).map((t) => t.name);
    expect(without, `tools missing an outputSchema: ${without.join(', ')}`).toEqual([]);
  });

  for (const tool of ALL_TOOLS) {
    it(`${tool.name} emits structuredContent conforming to its outputSchema`, async () => {
      const f = FIXTURES[tool.name];
      expect(f, `missing happy-path fixture for ${tool.name}`).toBeDefined();

      const res = await tool.run(f.args, fakeCtx(f));
      expect(res.isError, `${tool.name} happy path errored: ${res.content?.[0]?.text}`).toBeFalsy();
      expect(res.structuredContent, `${tool.name} must emit structuredContent (its outputSchema is advertised)`).toBeDefined();

      const parsed = tool.outputSchema!.safeParse(res.structuredContent);
      expect(
        parsed.success,
        `${tool.name} structuredContent fails its outputSchema: ${JSON.stringify(
          parsed.success ? null : parsed.error.issues,
        )}`,
      ).toBe(true);
    });
  }
});
