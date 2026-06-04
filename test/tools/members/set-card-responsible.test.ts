import { describe, it, expect, vi } from 'vitest';
import { setCardResponsible } from '../../../src/tools/members/set-card-responsible.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_set_card_responsible tool module', () => {
  it('delegates to client.setCardResponsible and returns the role', async () => {
    const setCardResponsibleFn = vi.fn().mockResolvedValue({ card_id: 5, user_id: 7, type: 2 });
    const res = await setCardResponsible.run({ card_id: 5, user_id: 7 }, fakeCtx({ client: { setCardResponsible: setCardResponsibleFn } }));
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual({ card_id: 5, user_id: 7, type: 2 });
    expect(setCardResponsibleFn).toHaveBeenCalledWith(5, 7, undefined);
  });

  it('maps a thrown error to an error result', async () => {
    const res = await setCardResponsible.run({ card_id: 5, user_id: 7 }, fakeCtx({ client: { setCardResponsible: vi.fn().mockRejectedValue(new Error('boom')) } }));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects missing user_id via the schema', async () => {
    const res = await setCardResponsible.run({ card_id: 5 } as any, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(setCardResponsible.name).toBe('kaiten_set_card_responsible');
    expect(setCardResponsible.annotations.idempotent).toBe(true);
    expect(setCardResponsible.description.length).toBeGreaterThan(0);
  });
});
