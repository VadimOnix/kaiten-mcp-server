import { describe, it, expect } from 'vitest';
import {
  GetCardSchema,
  CreateCardSchema,
  UpdateCardSchema,
  DeleteCardSchema,
  SearchCardsSchema,
  GetCardCommentsSchema,
  CreateCommentSchema,
  UpdateCommentSchema,
  DeleteCommentSchema,
  ListBoardsSchema,
  ListColumnsSchema,
  ListLanesSchema,
  ListTypesSchema,
  ListUsersSchema,
  GetCardChildrenSchema,
  AddCardChildrenSchema,
  RemoveCardChildrenSchema,
} from '../src/schemas';

// Input-validation contract for the 16 remaining MCP tools.
// These guard the boundary between the LLM and the Kaiten API client.

describe('GetCardSchema', () => {
  it('accepts a positive card_id and defaults format to markdown', () => {
    const parsed = GetCardSchema.parse({ card_id: 123 });
    expect(parsed.card_id).toBe(123);
    expect(parsed.format).toBe('markdown');
  });

  it('accepts an explicit json format', () => {
    expect(GetCardSchema.parse({ card_id: 1, format: 'json' }).format).toBe('json');
  });

  it('rejects a non-positive card_id', () => {
    expect(() => GetCardSchema.parse({ card_id: 0 })).toThrow();
    expect(() => GetCardSchema.parse({ card_id: -5 })).toThrow();
  });

  it('rejects a non-integer card_id', () => {
    expect(() => GetCardSchema.parse({ card_id: 1.5 })).toThrow();
  });

  it('rejects an unknown format value', () => {
    expect(() => GetCardSchema.parse({ card_id: 1, format: 'xml' })).toThrow();
  });

  it('rejects unknown extra keys (strict)', () => {
    expect(() => GetCardSchema.parse({ card_id: 1, bogus: true })).toThrow();
  });

  it('requires card_id', () => {
    expect(() => GetCardSchema.parse({})).toThrow();
  });
});

describe('CreateCardSchema', () => {
  it('accepts the minimal required fields', () => {
    const parsed = CreateCardSchema.parse({ title: 'New task', board_id: 7 });
    expect(parsed.title).toBe('New task');
    expect(parsed.board_id).toBe(7);
  });

  it('rejects an empty title', () => {
    expect(() => CreateCardSchema.parse({ title: '', board_id: 7 })).toThrow();
  });

  it('rejects a title longer than 500 chars', () => {
    expect(() =>
      CreateCardSchema.parse({ title: 'x'.repeat(501), board_id: 7 })
    ).toThrow();
  });

  it('requires board_id', () => {
    expect(() => CreateCardSchema.parse({ title: 'No board' })).toThrow();
  });

  it('accepts optional fields including idempotency_key', () => {
    const parsed = CreateCardSchema.parse({
      title: 'Full',
      board_id: 7,
      column_id: 3,
      description: 'desc',
      size: 0,
      asap: true,
      owner_id: 99,
      idempotency_key: 'abc-123',
    });
    expect(parsed.idempotency_key).toBe('abc-123');
    expect(parsed.size).toBe(0);
  });

  it('rejects a negative owner_id', () => {
    expect(() =>
      CreateCardSchema.parse({ title: 'x', board_id: 7, owner_id: -1 })
    ).toThrow();
  });
});

describe('UpdateCardSchema', () => {
  it('requires only card_id (all updates optional)', () => {
    expect(UpdateCardSchema.parse({ card_id: 5 }).card_id).toBe(5);
  });

  it('accepts a state change', () => {
    expect(UpdateCardSchema.parse({ card_id: 5, state: 3 }).state).toBe(3);
  });

  it('rejects an empty new title', () => {
    expect(() => UpdateCardSchema.parse({ card_id: 5, title: '' })).toThrow();
  });
});

describe('DeleteCardSchema', () => {
  it('accepts a valid card_id', () => {
    expect(DeleteCardSchema.parse({ card_id: 5 }).card_id).toBe(5);
  });

  it('rejects extra keys', () => {
    expect(() => DeleteCardSchema.parse({ card_id: 5, force: true })).toThrow();
  });
});

describe('SearchCardsSchema', () => {
  it('defaults verbosity to normal and allows an empty query', () => {
    const parsed = SearchCardsSchema.parse({});
    expect(parsed.verbosity).toBe('normal');
  });

  it('caps limit at 20', () => {
    expect(() => SearchCardsSchema.parse({ limit: 21 })).toThrow();
    expect(SearchCardsSchema.parse({ limit: 20 }).limit).toBe(20);
  });

  it('allows space_id of 0 (all-spaces override)', () => {
    expect(SearchCardsSchema.parse({ space_id: 0 }).space_id).toBe(0);
  });

  it('accepts comma-separated multi-id filters as strings', () => {
    const parsed = SearchCardsSchema.parse({ owner_ids: '1,2,3' });
    expect(parsed.owner_ids).toBe('1,2,3');
  });

  it('validates sort_by enum', () => {
    expect(() => SearchCardsSchema.parse({ sort_by: 'random' })).toThrow();
    expect(SearchCardsSchema.parse({ sort_by: 'updated' }).sort_by).toBe('updated');
  });

  it('rejects condition outside 1..2', () => {
    expect(() => SearchCardsSchema.parse({ condition: 3 })).toThrow();
  });

  it('rejects a negative skip', () => {
    expect(() => SearchCardsSchema.parse({ skip: -1 })).toThrow();
  });
});

describe('comment schemas', () => {
  it('GetCardCommentsSchema requires card_id', () => {
    expect(GetCardCommentsSchema.parse({ card_id: 1 }).card_id).toBe(1);
    expect(() => GetCardCommentsSchema.parse({})).toThrow();
  });

  it('CreateCommentSchema requires non-empty text', () => {
    expect(CreateCommentSchema.parse({ card_id: 1, text: 'hi' }).text).toBe('hi');
    expect(() => CreateCommentSchema.parse({ card_id: 1, text: '' })).toThrow();
  });

  it('UpdateCommentSchema requires card_id, comment_id and text', () => {
    const parsed = UpdateCommentSchema.parse({ card_id: 1, comment_id: 2, text: 'edited' });
    expect(parsed.comment_id).toBe(2);
    expect(() => UpdateCommentSchema.parse({ card_id: 1, text: 'x' })).toThrow();
  });

  it('DeleteCommentSchema requires card_id and comment_id', () => {
    expect(DeleteCommentSchema.parse({ card_id: 1, comment_id: 2 }).comment_id).toBe(2);
    expect(() => DeleteCommentSchema.parse({ card_id: 1 })).toThrow();
  });
});

describe('board/discovery schemas', () => {
  it('ListBoardsSchema makes space_id optional and defaults verbosity', () => {
    expect(ListBoardsSchema.parse({}).verbosity).toBe('normal');
    expect(ListBoardsSchema.parse({ space_id: 9 }).space_id).toBe(9);
  });

  it('ListColumns/Lanes/Types require board_id', () => {
    for (const schema of [ListColumnsSchema, ListLanesSchema, ListTypesSchema]) {
      expect(schema.parse({ board_id: 4 }).board_id).toBe(4);
      expect(() => schema.parse({})).toThrow();
    }
  });
});

describe('ListUsersSchema', () => {
  it('defaults verbosity and allows query/limit/offset', () => {
    const parsed = ListUsersSchema.parse({ query: 'Ivanov', limit: 50, offset: 10 });
    expect(parsed.query).toBe('Ivanov');
    expect(parsed.verbosity).toBe('normal');
  });

  it('caps limit at 100', () => {
    expect(() => ListUsersSchema.parse({ limit: 101 })).toThrow();
  });

  it('rejects unknown verbosity', () => {
    expect(() => ListUsersSchema.parse({ verbosity: 'loud' })).toThrow();
  });
});

describe('GetCardChildrenSchema', () => {
  it('accepts card_id and defaults verbosity to normal', () => {
    const parsed = GetCardChildrenSchema.parse({ card_id: 12345 });
    expect(parsed.card_id).toBe(12345);
    expect(parsed.verbosity).toBe('normal');
  });

  it('accepts an explicit verbosity', () => {
    expect(GetCardChildrenSchema.parse({ card_id: 1, verbosity: 'minimal' }).verbosity).toBe('minimal');
  });

  it('rejects a non-positive card_id', () => {
    expect(() => GetCardChildrenSchema.parse({ card_id: 0 })).toThrow();
  });

  it('rejects unknown extra keys (strict)', () => {
    expect(() => GetCardChildrenSchema.parse({ card_id: 1, bogus: true })).toThrow();
  });
});

describe('AddCardChildrenSchema', () => {
  it('accepts card_id and a non-empty child_card_ids array', () => {
    const parsed = AddCardChildrenSchema.parse({ card_id: 1, child_card_ids: [2, 3] });
    expect(parsed.child_card_ids).toEqual([2, 3]);
  });

  it('rejects an empty child_card_ids array', () => {
    expect(() => AddCardChildrenSchema.parse({ card_id: 1, child_card_ids: [] })).toThrow();
  });

  it('rejects non-positive or non-integer child ids', () => {
    expect(() => AddCardChildrenSchema.parse({ card_id: 1, child_card_ids: [0] })).toThrow();
    expect(() => AddCardChildrenSchema.parse({ card_id: 1, child_card_ids: [1.5] })).toThrow();
  });

  it('requires child_card_ids', () => {
    expect(() => AddCardChildrenSchema.parse({ card_id: 1 })).toThrow();
  });

  it('rejects unknown extra keys (strict)', () => {
    expect(() => AddCardChildrenSchema.parse({ card_id: 1, child_card_ids: [2], bogus: true })).toThrow();
  });
});

describe('RemoveCardChildrenSchema', () => {
  it('accepts card_id and a non-empty child_card_ids array', () => {
    const parsed = RemoveCardChildrenSchema.parse({ card_id: 1, child_card_ids: [2] });
    expect(parsed.child_card_ids).toEqual([2]);
  });

  it('rejects an empty child_card_ids array', () => {
    expect(() => RemoveCardChildrenSchema.parse({ card_id: 1, child_card_ids: [] })).toThrow();
  });

  it('rejects non-positive or non-integer child ids', () => {
    expect(() => RemoveCardChildrenSchema.parse({ card_id: 1, child_card_ids: [0] })).toThrow();
    expect(() => RemoveCardChildrenSchema.parse({ card_id: 1, child_card_ids: [1.5] })).toThrow();
  });

  it('requires child_card_ids', () => {
    expect(() => RemoveCardChildrenSchema.parse({ card_id: 1 })).toThrow();
  });

  it('rejects unknown extra keys (strict)', () => {
    expect(() => RemoveCardChildrenSchema.parse({ card_id: 1, child_card_ids: [2], bogus: true })).toThrow();
  });
});
