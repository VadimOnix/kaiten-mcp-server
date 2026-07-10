import { describe, it, expect, vi } from 'vitest';
import { addCardTags } from '../../../src/tools/cards/add-card-tags.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_add_card_tags tool module', () => {
  it('all-success: succeeded lists the tag names, verb "added"', async () => {
    const addCardTag = vi.fn().mockResolvedValue({ id: 1, name: 'x' });
    const res = await addCardTags.run(
      { card_id: 5, tag_names: ['urgent', 'backend'] },
      fakeCtx({ client: { addCardTag } }),
    );
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual({
      card_id: 5,
      succeeded: ['urgent', 'backend'],
      failed: [],
      summary: '2 added, 0 failed',
    });
    // arg order: card_id, name, signal
    expect(addCardTag).toHaveBeenNthCalledWith(1, 5, 'urgent', undefined);
    expect(addCardTag).toHaveBeenNthCalledWith(2, 5, 'backend', undefined);
  });

  it('partial-failure: NOT isError, failed item carries tag_name', async () => {
    const addCardTag = vi
      .fn()
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce(new Error('nope'));
    const res = await addCardTags.run(
      { card_id: 5, tag_names: ['ok', 'bad'] },
      fakeCtx({ client: { addCardTag } }),
    );
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.succeeded).toEqual(['ok']);
    expect(parsed.failed).toEqual([{ tag_name: 'bad', error: 'nope' }]);
    expect(parsed.summary).toBe('1 added, 1 failed');
  });

  it('all-failure: isError true', async () => {
    const addCardTag = vi.fn().mockRejectedValue(new Error('nope'));
    const res = await addCardTags.run(
      { card_id: 5, tag_names: ['bad'] },
      fakeCtx({ client: { addCardTag } }),
    );
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).summary).toBe('0 added, 1 failed');
  });

  it('rejects invalid args via the schema', async () => {
    const res = await addCardTags.run({ card_id: 5, tag_names: [] }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(addCardTags.name).toBe('kaiten_add_card_tags');
    expect(addCardTags.annotations.idempotent).toBe(true);
    expect(addCardTags.description.length).toBeGreaterThan(0);
  });
});
