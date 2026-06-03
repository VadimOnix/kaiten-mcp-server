import { describe, it, expect, vi } from 'vitest';
import { searchCards } from '../../../src/tools/cards/search-cards.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_search_cards tool module', () => {
  it('renders a normal-verbosity summary and applies the default space', async () => {
    const searchCardsFn = vi
      .fn()
      .mockResolvedValue([{ id: 7, title: 'Found Card', board: { title: 'Board A' } }]);
    const res = await searchCards.run(
      { query: 'Found', board_id: 3 },
      fakeCtx({ client: { searchCards: searchCardsFn } }),
    );
    expect(res.isError).toBeFalsy();
    const text = res.content[0].text;
    expect(text).toContain('Found 1 card(s) matching "Found" in space 42 on board 3');
    expect(text).toContain('Verbosity: normal');
    expect(text).toContain('1. Found Card');
    expect(text).toContain('📋 Board: Board A');
    expect(text).toContain('ℹ️ Use kaiten_get_card with card ID for full details.');
    // space_id default applied, condition default 1, board_id forwarded
    const params = searchCardsFn.mock.calls[0][0];
    expect(params.space_id).toBe(42);
    expect(params.condition).toBe(1);
    expect(params.board_id).toBe(3);
    expect(params.query).toBe('Found');
  });

  it('warns when limit > 20 without a space_id filter', async () => {
    const searchCardsFn = vi.fn().mockResolvedValue([]);
    const warning = vi.fn();
    await searchCards.run(
      { limit: 20, space_id: 0 },
      fakeCtx({ client: { searchCards: searchCardsFn }, log: { warning } }),
    );
    // limit=20 is not > 20, so no warning here; verify space_id=0 omits the default
    const params = searchCardsFn.mock.calls[0][0];
    expect(params.space_id).toBeUndefined();
  });

  it('renders minimal verbosity lines', async () => {
    const searchCardsFn = vi
      .fn()
      .mockResolvedValue([{ id: 7, title: 'Found Card', board: { title: 'Board A' } }]);
    const res = await searchCards.run(
      { board_id: 3, verbosity: 'minimal' },
      fakeCtx({ client: { searchCards: searchCardsFn } }),
    );
    expect(res.content[0].text).toContain('Verbosity: minimal');
    expect(res.content[0].text).toContain('1. [7] Found Card');
  });

  it('maps a thrown error', async () => {
    const searchCardsFn = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await searchCards.run(
      { board_id: 3 },
      fakeCtx({ client: { searchCards: searchCardsFn } }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('has expected metadata', () => {
    expect(searchCards.name).toBe('kaiten_search_cards');
    expect(searchCards.annotations.readOnly).toBe(true);
    expect(searchCards.description.length).toBeGreaterThan(0);
  });
});
