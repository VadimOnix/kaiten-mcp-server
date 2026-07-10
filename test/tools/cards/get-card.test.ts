import { describe, it, expect, vi } from 'vitest';
import { getCard } from '../../../src/tools/cards/get-card.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_get_card tool module', () => {
  it('renders markdown by default', async () => {
    const getCardFn = vi.fn().mockResolvedValue({ id: 5, title: 'Demo Card' });
    const res = await getCard.run({ card_id: 5 }, fakeCtx({ client: { getCard: getCardFn } }));
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('# Demo Card');
    // simplifyCard builds the URL from the module-level config singleton
    // (vitest env: KAITEN_API_URL=https://test.kaiten.ru, default space 42),
    // not from ctx.config — so assert the deterministic injected host.
    expect(res.content[0].text).toContain('https://test.kaiten.ru/space/42/card/5');
    expect(getCardFn).toHaveBeenCalledWith(5, undefined);
  });

  it('returns raw card JSON when format=json', async () => {
    const card = { id: 5, title: 'Demo', board_id: 3 };
    const getCardFn = vi.fn().mockResolvedValue(card);
    const res = await getCard.run({ card_id: 5, format: 'json' }, fakeCtx({ client: { getCard: getCardFn } }));
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toBe(JSON.stringify(card, null, 2));
  });

  it('attaches the raw card as structuredContent in BOTH markdown and json modes (MCP spec 2025-11-25)', async () => {
    const card = { id: 5, title: 'Demo', board_id: 3 };
    // markdown (default): human text + machine mirror
    const md = await getCard.run({ card_id: 5 }, fakeCtx({ client: { getCard: vi.fn().mockResolvedValue(card) } }));
    expect(md.content[0].text).toContain('# Demo');
    expect(md.structuredContent).toEqual(card);
    // json mode: seam auto-mirrors the plain object return
    const json = await getCard.run({ card_id: 5, format: 'json' }, fakeCtx({ client: { getCard: vi.fn().mockResolvedValue(card) } }));
    expect(json.structuredContent).toEqual(card);
  });

  it('strips base64 avatar fields from the raw card (json body + structuredContent)', async () => {
    const card = {
      id: 5,
      title: 'Demo',
      owner: { id: 1, full_name: 'O', avatar_uploaded_url: 'data:image/png;base64,BBBB' },
    };
    const json = await getCard.run(
      { card_id: 5, format: 'json' },
      fakeCtx({ client: { getCard: vi.fn().mockResolvedValue(card) } }),
    );
    expect(json.content[0].text).not.toContain('avatar_uploaded_url');
    expect((json.structuredContent as any).owner).toEqual({ id: 1, full_name: 'O' });

    const md = await getCard.run(
      { card_id: 5 },
      fakeCtx({ client: { getCard: vi.fn().mockResolvedValue(card) } }),
    );
    expect((md.structuredContent as any).owner).toEqual({ id: 1, full_name: 'O' });
  });

  it('maps a thrown error to an error result', async () => {
    const getCardFn = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await getCard.run({ card_id: 5 }, fakeCtx({ client: { getCard: getCardFn } }));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects invalid args via the schema', async () => {
    const res = await getCard.run({ card_id: -1 }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(getCard.name).toBe('kaiten_get_card');
    expect(getCard.annotations.readOnly).toBe(true);
    expect(getCard.description.length).toBeGreaterThan(0);
  });

  // P0 context-footprint fix (see memory: context-footprint-audit). The
  // description is advertised to every client on connect, so it must be a short
  // high-signal blurb — NOT a multi-section manual that re-documents the Zod
  // schema params and repeats the server instructions.
  it('advertises a context-efficient description (concise, no embedded manual, keeps routing signal)', () => {
    // Concise: a dramatic cut from the original ~7,935-char manual.
    expect(getCard.description.length).toBeLessThanOrEqual(600);

    // No embedded per-tool manual sections (these duplicate schema .describe()
    // and the server-level instructions, so they double-bill tokens).
    for (const marker of ['PARAMETERS:', 'USAGE EXAMPLES:', 'ERRORS:', "❌ DON'T", 'RELATED TOOLS:']) {
      expect(getCard.description).not.toContain(marker);
    }

    // …but still carries the routing signal an agent needs to pick + chain it.
    expect(getCard.description).toContain('kaiten_search_cards');
    expect(getCard.description.toLowerCase()).toContain('subtask');
  });
});
