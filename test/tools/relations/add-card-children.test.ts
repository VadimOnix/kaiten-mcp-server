import { describe, it, expect, vi } from 'vitest';
import { addCardChildren } from '../../../src/tools/relations/add-card-children.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_add_card_children tool module', () => {
  it('all-success: parent_card_id top key, child_card_id item key, "added" verb', async () => {
    const addCardChild = vi.fn().mockResolvedValue({ id: 5 });
    const res = await addCardChildren.run(
      { card_id: 5, child_card_ids: [42, 43] },
      fakeCtx({ client: { addCardChild } }),
    );
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({
      parent_card_id: 5,
      succeeded: [42, 43],
      failed: [],
      summary: '2 added, 0 failed',
    });
    // arg order: card_id, childId, signal
    expect(addCardChild).toHaveBeenNthCalledWith(1, 5, 42, undefined);
    expect(addCardChild).toHaveBeenNthCalledWith(2, 5, 43, undefined);
  });

  it('partial-failure: NOT isError, failed item carries child_card_id key', async () => {
    const addCardChild = vi
      .fn()
      .mockResolvedValueOnce({ id: 5 })
      .mockRejectedValueOnce(new Error('nope'));
    const res = await addCardChildren.run(
      { card_id: 5, child_card_ids: [42, 99] },
      fakeCtx({ client: { addCardChild } }),
    );
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.parent_card_id).toBe(5);
    expect(parsed.succeeded).toEqual([42]);
    expect(parsed.failed).toEqual([{ child_card_id: 99, error: 'nope' }]);
    expect(parsed.summary).toBe('1 added, 1 failed');
  });

  it('all-failure: isError true', async () => {
    const addCardChild = vi.fn().mockRejectedValue(new Error('nope'));
    const res = await addCardChildren.run(
      { card_id: 5, child_card_ids: [42] },
      fakeCtx({ client: { addCardChild } }),
    );
    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.succeeded).toEqual([]);
    expect(parsed.failed).toEqual([{ child_card_id: 42, error: 'nope' }]);
    expect(parsed.summary).toBe('0 added, 1 failed');
  });

  it('rejects invalid args via the schema', async () => {
    const res = await addCardChildren.run({ card_id: 5, child_card_ids: [] }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(addCardChildren.name).toBe('kaiten_add_card_children');
    expect(addCardChildren.annotations.idempotent).toBe(true);
    expect(addCardChildren.description.length).toBeGreaterThan(0);
  });
});
