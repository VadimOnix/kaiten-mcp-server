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
});
