import { describe, it, expect, vi } from 'vitest';
import { addCardParents } from '../../../src/tools/relations/add-card-parents.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_add_card_parents tool module', () => {
  it('all-success: child_card_id top key, parent_card_id item key, "added" verb', async () => {
    const addCardParent = vi.fn().mockResolvedValue({ id: 5 });
    const res = await addCardParents.run(
      { card_id: 5, parent_card_ids: [70, 71] },
      fakeCtx({ client: { addCardParent } }),
    );
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({
      child_card_id: 5,
      succeeded: [70, 71],
      failed: [],
      summary: '2 added, 0 failed',
    });
    expect(addCardParent).toHaveBeenNthCalledWith(1, 5, 70, undefined);
    expect(addCardParent).toHaveBeenNthCalledWith(2, 5, 71, undefined);
  });

  it('partial-failure: NOT isError, failed item carries parent_card_id key', async () => {
    const addCardParent = vi
      .fn()
      .mockResolvedValueOnce({ id: 5 })
      .mockRejectedValueOnce(new Error('nope'));
    const res = await addCardParents.run(
      { card_id: 5, parent_card_ids: [70, 99] },
      fakeCtx({ client: { addCardParent } }),
    );
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.child_card_id).toBe(5);
    expect(parsed.succeeded).toEqual([70]);
    expect(parsed.failed).toEqual([{ parent_card_id: 99, error: 'nope' }]);
    expect(parsed.summary).toBe('1 added, 1 failed');
  });

  it('all-failure: isError true', async () => {
    const addCardParent = vi.fn().mockRejectedValue(new Error('nope'));
    const res = await addCardParents.run(
      { card_id: 5, parent_card_ids: [70] },
      fakeCtx({ client: { addCardParent } }),
    );
    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.succeeded).toEqual([]);
    expect(parsed.failed).toEqual([{ parent_card_id: 70, error: 'nope' }]);
    expect(parsed.summary).toBe('0 added, 1 failed');
  });

  it('rejects invalid args via the schema', async () => {
    const res = await addCardParents.run({ card_id: 5, parent_card_ids: [] }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(addCardParents.name).toBe('kaiten_add_card_parents');
    expect(addCardParents.annotations.idempotent).toBe(true);
    expect(addCardParents.description.length).toBeGreaterThan(0);
  });
});
