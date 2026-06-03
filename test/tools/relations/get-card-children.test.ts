import { describe, it, expect, vi } from 'vitest';
import { getCardChildren } from '../../../src/tools/relations/get-card-children.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_get_card_children tool module', () => {
  it('returns children mapped through verbosity (normal default)', async () => {
    const raw = [{ id: 42, title: 'Subtask', board: { title: 'Board A' } }];
    const getCardChildrenFn = vi.fn().mockResolvedValue(raw);
    const res = await getCardChildren.run(
      { card_id: 5 },
      fakeCtx({ client: { getCardChildren: getCardChildrenFn } }),
    );
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe(42);
    expect(parsed[0].title).toBe('Subtask');
    expect(parsed[0].board_title).toBe('Board A');
    // verbosity default is normal -> compact shape, no nested board object
    expect(parsed[0]).not.toHaveProperty('board');
    // signal forwarded
    expect(getCardChildrenFn).toHaveBeenCalledWith(5, undefined);
  });

  it('returns empty array when card has no children', async () => {
    const getCardChildrenFn = vi.fn().mockResolvedValue([]);
    const res = await getCardChildren.run(
      { card_id: 5 },
      fakeCtx({ client: { getCardChildren: getCardChildrenFn } }),
    );
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual([]);
  });

  it('maps a thrown error to an error result', async () => {
    const getCardChildrenFn = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await getCardChildren.run(
      { card_id: 5 },
      fakeCtx({ client: { getCardChildren: getCardChildrenFn } }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects invalid args via the schema', async () => {
    const res = await getCardChildren.run({ card_id: -1 }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(getCardChildren.name).toBe('kaiten_get_card_children');
    expect(getCardChildren.annotations.readOnly).toBe(true);
    expect(getCardChildren.description.length).toBeGreaterThan(0);
  });
});
