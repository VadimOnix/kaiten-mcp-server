import { describe, it, expect, vi } from 'vitest';
import { searchCards, searchCardsHandler } from '../../../src/tools/cards/search-cards.js';

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

  it('mirrors the verbosity-applied cards into structuredContent.items (MCP spec 2025-11-25)', async () => {
    const searchCardsFn = vi
      .fn()
      .mockResolvedValue([{ id: 7, title: 'Found Card', board: { title: 'Board A' } }]);
    const res = await searchCards.run(
      { query: 'Found', board_id: 3 },
      fakeCtx({ client: { searchCards: searchCardsFn } }),
    );
    // bounded result set (limit ≤ 20) mirrored as a machine-readable array
    expect(Array.isArray((res.structuredContent as any)?.items)).toBe(true);
    expect((res.structuredContent as any).items).toHaveLength(1);
    expect((res.structuredContent as any).items[0]).toMatchObject({ id: 7, title: 'Found Card' });
    // the human summary text is still present and unchanged in shape
    expect(res.content[0].text).toContain('1. Found Card');
  });

  it('does NOT warn when effectiveLimit <= 20', async () => {
    const searchCardsFn = vi.fn().mockResolvedValue([]);
    const warning = vi.fn();
    await searchCards.run(
      { limit: 20, space_id: 0 },
      fakeCtx({ client: { searchCards: searchCardsFn }, log: { warning, info: vi.fn(), error: vi.fn(), debug: vi.fn() } }),
    );
    // limit=20 is not > 20, so warning must NOT fire
    expect(warning).not.toHaveBeenCalled();
    // space_id=0 omits the default
    const params = searchCardsFn.mock.calls[0][0];
    expect(params.space_id).toBeUndefined();
  });

  it('DOES warn when effectiveLimit > 20 and no space_id filter (handler direct call, bypasses schema max:20)', async () => {
    // The Zod schema enforces limit max:20, so limit=21 would be rejected via .run().
    // Call the exported handler directly to exercise the warning branch.
    const searchCardsFn = vi.fn().mockResolvedValue([]);
    const warning = vi.fn();
    await searchCardsHandler(
      { limit: 21, space_id: 0 } as any,
      fakeCtx({ client: { searchCards: searchCardsFn }, log: { warning, info: vi.fn(), error: vi.fn(), debug: vi.fn() } }),
    );
    // limit=21 > 20 AND space_id=0 means params.space_id is undefined → warning fires
    expect(warning).toHaveBeenCalled();
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

  it('renders detailed verbosity from raw cards without N/A or undefined fields', async () => {
    // Detailed verbosity passes RAW cards (nested board/owner objects, no
    // derived board_title/owner_name/url). The summary must read those nested
    // fields rather than emit "N/A"/"Unassigned"/"🔗 undefined".
    const rawCard = {
      id: 7,
      title: 'Raw Card',
      board: { title: 'Board A' },
      owner: { full_name: 'Ivan Petrov' },
      updated: '2026-02-01T10:00:00Z',
    };
    const searchCardsFn = vi.fn().mockResolvedValue([rawCard]);
    const res = await searchCards.run(
      { board_id: 3, verbosity: 'detailed' },
      fakeCtx({ client: { searchCards: searchCardsFn } }),
    );
    const text = res.content[0].text;
    expect(text).toContain('Verbosity: detailed');
    expect(text).toContain('1. Raw Card');
    expect(text).toContain('📋 Board: Board A');
    expect(text).toContain('👤 Owner: Ivan Petrov');
    expect(text).not.toContain('N/A');
    expect(text).not.toContain('Unassigned');
    expect(text).not.toContain('undefined');
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
