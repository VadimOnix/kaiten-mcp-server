import { describe, it, expect, vi } from 'vitest';
import type { SearchCardsArgs } from '../../src/schemas.js';
import {
  buildSearchParams,
  batchPerItem,
  batchCardMembers,
  buildSizeText,
  assertSizeApplied,
} from '../../src/tools/helpers.js';
import { KaitenError, KaitenErrorType } from '../../src/kaiten-client.js';

// =============================================================================
// buildSearchParams — ported verbatim from the kaiten_search_cards case in
// src/server.ts (the searchParams construction block). These tests encode the
// REAL space_id + condition rules and the exact field mapping observed there.
// =============================================================================
describe('buildSearchParams', () => {
  it('omits space_id when caller passes 0 (all spaces)', () => {
    expect(buildSearchParams({ space_id: 0 } as SearchCardsArgs, 77).space_id).toBeUndefined();
  });

  it('falls back to the default space when space_id is undefined', () => {
    expect(buildSearchParams({} as SearchCardsArgs, 77).space_id).toBe(77);
  });

  it('keeps an explicit space_id', () => {
    expect(buildSearchParams({ space_id: 5 } as SearchCardsArgs, 77).space_id).toBe(5);
  });

  it('does NOT fall back to default space when space_id is explicitly 0', () => {
    expect(buildSearchParams({ space_id: 0 } as SearchCardsArgs, 77).space_id).toBeUndefined();
  });

  it('does NOT fall back to default space when space_id is explicitly null', () => {
    expect(buildSearchParams({ space_id: null } as unknown as SearchCardsArgs, 77).space_id).toBeUndefined();
  });

  it('defaults condition to 1 (active)', () => {
    expect(buildSearchParams({} as SearchCardsArgs, undefined).condition).toBe(1);
  });

  it('keeps an explicit condition (e.g. archived = 2)', () => {
    expect(buildSearchParams({ condition: 2 } as SearchCardsArgs, undefined).condition).toBe(2);
  });

  // condition=0 is blocked by the Zod schema (min 1); this documents that buildSearchParams
  // itself does not coerce falsy condition values, in case the schema ever relaxes.
  it('keeps condition 0 explicitly (does not coerce to 1)', () => {
    expect(buildSearchParams({ condition: 0 } as SearchCardsArgs, undefined).condition).toBe(0);
  });

  it('maps text search fields (query, title)', () => {
    const p = buildSearchParams({ query: 'pay', title: 'Bug' } as SearchCardsArgs, undefined);
    expect(p.query).toBe('pay');
    expect(p.title).toBe('Bug');
  });

  it('maps basic filters and only-when-truthy fields', () => {
    const p = buildSearchParams(
      {
        board_id: 3,
        column_id: 4,
        lane_id: 5,
        owner_id: 6,
        type_id: 7,
        state: 2,
      } as SearchCardsArgs,
      undefined,
    );
    expect(p.board_id).toBe(3);
    expect(p.column_id).toBe(4);
    expect(p.lane_id).toBe(5);
    expect(p.owner_id).toBe(6);
    expect(p.type_id).toBe(7);
    expect(p.state).toBe(2);
  });

  it('includes state when it is 0 (uses !== undefined check)', () => {
    expect('state' in buildSearchParams({ state: 0 } as SearchCardsArgs, undefined)).toBe(true);
    expect(buildSearchParams({ state: 0 } as SearchCardsArgs, undefined).state).toBe(0);
  });

  it('omits state entirely when undefined', () => {
    expect('state' in buildSearchParams({} as SearchCardsArgs, undefined)).toBe(false);
  });

  it('maps boolean flags via !== undefined (false is preserved)', () => {
    const p = buildSearchParams(
      {
        asap: false,
        overdue: true,
      } as SearchCardsArgs,
      undefined,
    );
    expect(p.asap).toBe(false);
    expect(p.overdue).toBe(true);
  });

  it('maps date filters', () => {
    const p = buildSearchParams(
      {
        created_before: 'a',
        created_after: 'b',
        updated_before: 'c',
        updated_after: 'd',
        due_date_before: 'e',
        due_date_after: 'f',
      } as SearchCardsArgs,
      undefined,
    );
    expect(p.created_before).toBe('a');
    expect(p.created_after).toBe('b');
    expect(p.updated_before).toBe('c');
    expect(p.updated_after).toBe('d');
    expect(p.due_date_before).toBe('e');
    expect(p.due_date_after).toBe('f');
  });

  it('maps multi-ID, sort and pagination fields', () => {
    const p = buildSearchParams(
      {
        owner_ids: '1,2',
        member_ids: '3,4',
        tag_ids: '9,10',
        sort_by: 'created',
        sort_direction: 'desc',
        limit: 25,
        skip: 5,
      } as SearchCardsArgs,
      undefined,
    );
    expect(p.owner_ids).toBe('1,2');
    expect(p.member_ids).toBe('3,4');
    expect(p.tag_ids).toBe('9,10');
    expect(p.sort_by).toBe('created');
    expect(p.sort_direction).toBe('desc');
    expect(p.limit).toBe(25);
    expect(p.skip).toBe(5);
  });
});

// =============================================================================
// batchPerItem — ported from the four batch handlers (add/remove children,
// add/remove parents). CRITICAL: children and parents DIVERGE in body shape:
//   children: top key parent_card_id, item key child_card_id
//   parents : top key child_card_id, item key parent_card_id
// The verb (added/removed) also varies, so it is a parameter.
// =============================================================================
describe('batchPerItem', () => {
  it('reports succeeded/failed and is NOT an error on partial success', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'));
    const res = await batchPerItem([1, 2], 9, 'children', 'added', run);
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('boom');
    const body = JSON.parse(res.content[0].text);
    expect(body.parent_card_id).toBe(9);
    expect(body.succeeded).toEqual([1]);
    expect(body.failed).toEqual([{ child_card_id: 2, error: 'boom' }]);
    expect(body.summary).toBe('1 added, 1 failed');
  });

  it('flags isError only when every item fails', async () => {
    const run = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await batchPerItem([1], 9, 'children', 'added', run);
    expect(res.isError).toBe(true);
  });

  it('does not set isError on full success', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const res = await batchPerItem([1], 9, 'children', 'added', run);
    expect(res.isError).toBeUndefined();
  });

  it('children full-success body: parent_card_id top key + summary verb', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const res = await batchPerItem([42], 5, 'children', 'added', run);
    expect(res.content[0].text).toBe(
      JSON.stringify(
        { parent_card_id: 5, succeeded: [42], failed: [], summary: '1 added, 0 failed' },
        null,
        2,
      ),
    );
  });

  it('children remove uses the "removed" verb', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const res = await batchPerItem([42], 5, 'children', 'removed', run);
    const body = JSON.parse(res.content[0].text);
    expect(body.summary).toBe('1 removed, 0 failed');
  });

  it('parents full-success body: child_card_id top key + parent_card_id item key', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const res = await batchPerItem([70], 5, 'parents', 'added', run);
    expect(res.content[0].text).toBe(
      JSON.stringify(
        { child_card_id: 5, succeeded: [70], failed: [], summary: '1 added, 0 failed' },
        null,
        2,
      ),
    );
  });

  it('parents failed item uses parent_card_id key', async () => {
    const run = vi.fn().mockRejectedValue(new Error('nope'));
    const res = await batchPerItem([70], 5, 'parents', 'removed', run);
    const body = JSON.parse(res.content[0].text);
    expect(body.failed).toEqual([{ parent_card_id: 70, error: 'nope' }]);
    expect(body.summary).toBe('0 removed, 1 failed');
  });

  it('formats KaitenError with hint as "message — hint"', async () => {
    const err = new KaitenError(
      KaitenErrorType.NOT_FOUND,
      'Card not found',
      404,
      undefined,
      'Verify the card id',
    );
    const run = vi.fn().mockRejectedValue(err);
    const res = await batchPerItem([42], 5, 'children', 'added', run);
    const body = JSON.parse(res.content[0].text);
    expect(body.failed[0].error).toBe('Card not found — Verify the card id');
  });

  it('formats KaitenError WITHOUT hint as just the message', async () => {
    const err = new KaitenError(KaitenErrorType.API_ERROR, 'Boom');
    const run = vi.fn().mockRejectedValue(err);
    const res = await batchPerItem([42], 5, 'children', 'added', run);
    const body = JSON.parse(res.content[0].text);
    expect(body.failed[0].error).toBe('Boom');
  });

  it('stringifies a non-Error throw', async () => {
    const run = vi.fn().mockRejectedValue('plain string');
    const res = await batchPerItem([42], 5, 'children', 'added', run);
    const body = JSON.parse(res.content[0].text);
    expect(body.failed[0].error).toBe('plain string');
  });
});

// =============================================================================
// batchCardMembers — members-specific batch helper with { card_id, succeeded,
// failed:[{ user_id, error }], summary } envelope.
// =============================================================================
describe('batchCardMembers', () => {
  it('reports per-user success and failure with a summary', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce(undefined)                       // user 2 ok
      .mockRejectedValueOnce(new Error('nope'));              // user 3 fails
    const res = await batchCardMembers([2, 3], 5, 'added', run);
    const body = JSON.parse(res.content[0].text);
    expect(body).toEqual({
      card_id: 5,
      succeeded: [2],
      failed: [{ user_id: 3, error: 'nope' }],
      summary: '1 added, 1 failed',
    });
    expect(res.isError).toBeFalsy();
  });

  it('marks the whole result isError when nothing succeeds', async () => {
    const run = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await batchCardMembers([2], 5, 'removed', run);
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).summary).toBe('0 removed, 1 failed');
  });
});

// =============================================================================
// buildSizeText / assertSizeApplied — the card-estimate write guard.
//
// Kaiten's POST/PATCH accept ONLY `size_text`; `size` and `size_unit` are
// read-only values the server derives from it. Worse, when the board does not
// have the `size` card property enabled for the card's type, Kaiten answers 200
// and silently drops the estimate — the write looks successful and is not.
// These tests pin both halves: the serialisation, and the post-write check that
// turns the silent no-op into a loud tool error.
// =============================================================================

describe('buildSizeText', () => {
  it('serialises a bare number when no unit is given', () => {
    expect(buildSizeText(2)).toBe('2');
    expect(buildSizeText(0)).toBe('0');
    expect(buildSizeText(2.5)).toBe('2.5');
  });

  it('appends the unit when one is given', () => {
    expect(buildSizeText(3, 'SP')).toBe('3 SP');
    expect(buildSizeText(1, 'h')).toBe('1 h');
  });

  it('ignores a blank unit', () => {
    expect(buildSizeText(3, '   ')).toBe('3');
  });

  it('trims surrounding whitespace on the unit', () => {
    expect(buildSizeText(3, ' SP ')).toBe('3 SP');
  });
});

describe('assertSizeApplied', () => {
  const board = (props?: unknown) => ({ id: 49114, title: 'B', card_properties: props });

  it('passes when Kaiten applied the requested estimate', () => {
    expect(() =>
      assertSizeApplied({ id: 7, size: 2 } as any, 2, '2 SP', 'updated'),
    ).not.toThrow();
  });

  it('passes for an applied zero estimate', () => {
    expect(() => assertSizeApplied({ id: 7, size: 0 } as any, 0, '0', 'updated')).not.toThrow();
  });

  it('throws a VALIDATION_ERROR when the estimate came back null', () => {
    let thrown: any;
    try {
      assertSizeApplied({ id: 7, size: null } as any, 2, '2 SP', 'updated');
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(KaitenError);
    expect(thrown.type).toBe(KaitenErrorType.VALIDATION_ERROR);
    expect(thrown.message).toContain('7');
    expect(thrown.message).toContain('2 SP');
  });

  it('throws when Kaiten stored a different number than requested', () => {
    expect(() => assertSizeApplied({ id: 7, size: 1 } as any, 2, '2', 'updated')).toThrow(
      KaitenError,
    );
  });

  it('throws when the response omits size entirely', () => {
    expect(() => assertSizeApplied({ id: 7 } as any, 2, '2', 'updated')).toThrow(KaitenError);
  });

  it('names the board card property when size is not enabled for the card type', () => {
    let thrown: any;
    try {
      assertSizeApplied(
        {
          id: 7,
          size: null,
          board_id: 49114,
          type_id: 3,
          board: board([{ key: 'size', cardTypeIds: [7] }]),
        } as any,
        2,
        '2',
        'updated',
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown.hint).toContain('card property');
    expect(thrown.hint).toContain('49114');
    expect(thrown.hint).toContain('3');
  });

  it('does not blame the board when the size property IS enabled for the type', () => {
    let thrown: any;
    try {
      assertSizeApplied(
        {
          id: 7,
          size: null,
          board_id: 49114,
          type_id: 7,
          board: board([{ key: 'size', cardTypeIds: [7] }]),
        } as any,
        2,
        '2',
        'updated',
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown.hint).not.toContain('not enabled');
  });

  it('warns against re-creating the card when the write was a create', () => {
    let thrown: any;
    try {
      assertSizeApplied({ id: 7, size: null } as any, 2, '2', 'created');
    } catch (e) {
      thrown = e;
    }
    expect(thrown.message).toContain('created');
    expect(thrown.hint).toContain('kaiten_create_card');
    expect(thrown.details.card_id).toBe(7);
  });
});
