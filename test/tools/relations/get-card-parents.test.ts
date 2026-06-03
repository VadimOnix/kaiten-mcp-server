import { describe, it, expect, vi } from 'vitest';
import { getCardParents } from '../../../src/tools/relations/get-card-parents.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_get_card_parents tool module', () => {
  it('returns parents mapped through verbosity (normal default)', async () => {
    const raw = [{ id: 70, title: 'Parent Card', board: { title: 'Board A' } }];
    const getCardParentsFn = vi.fn().mockResolvedValue(raw);
    const res = await getCardParents.run(
      { card_id: 5 },
      fakeCtx({ client: { getCardParents: getCardParentsFn } }),
    );
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe(70);
    expect(parsed[0].title).toBe('Parent Card');
    expect(parsed[0].board_title).toBe('Board A');
    expect(parsed[0]).not.toHaveProperty('board');
    expect(getCardParentsFn).toHaveBeenCalledWith(5, undefined);
  });

  it('returns empty array when card has no parents', async () => {
    const getCardParentsFn = vi.fn().mockResolvedValue([]);
    const res = await getCardParents.run(
      { card_id: 5 },
      fakeCtx({ client: { getCardParents: getCardParentsFn } }),
    );
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual([]);
  });

  it('maps a thrown error to an error result', async () => {
    const getCardParentsFn = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await getCardParents.run(
      { card_id: 5 },
      fakeCtx({ client: { getCardParents: getCardParentsFn } }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects invalid args via the schema', async () => {
    const res = await getCardParents.run({ card_id: -1 }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(getCardParents.name).toBe('kaiten_get_card_parents');
    expect(getCardParents.annotations.readOnly).toBe(true);
    expect(getCardParents.description.length).toBeGreaterThan(0);
  });
});
