import { describe, it, expect, vi } from 'vitest';
import { getCardComments } from '../../../src/tools/comments/get-card-comments.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_get_card_comments tool module', () => {
  it('returns simplified comments as JSON', async () => {
    const raw = [
      { id: 1, text: 'first comment', created: '2025-01-01T00:00:00Z', author: { id: 2, full_name: 'Alice' } },
    ];
    const getCardCommentsFn = vi.fn().mockResolvedValue(raw);
    const res = await getCardComments.run(
      { card_id: 5 },
      fakeCtx({ client: { getCardComments: getCardCommentsFn } }),
    );
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({
      id: 1,
      text: 'first comment',
      created: '2025-01-01T00:00:00Z',
      author_id: 2,
      author_name: 'Alice',
    });
    // simplifyComment removes 'updated' when undefined, and strips 'author' object
    expect(parsed[0]).not.toHaveProperty('author');
    expect(getCardCommentsFn).toHaveBeenCalledWith(5, undefined);
  });

  it('returns empty array when card has no comments', async () => {
    const getCardCommentsFn = vi.fn().mockResolvedValue([]);
    const res = await getCardComments.run(
      { card_id: 5 },
      fakeCtx({ client: { getCardComments: getCardCommentsFn } }),
    );
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual([]);
  });

  it('maps a thrown error to an error result', async () => {
    const getCardCommentsFn = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await getCardComments.run(
      { card_id: 5 },
      fakeCtx({ client: { getCardComments: getCardCommentsFn } }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects invalid args via the schema', async () => {
    const res = await getCardComments.run({ card_id: -1 }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(getCardComments.name).toBe('kaiten_get_card_comments');
    expect(getCardComments.annotations.readOnly).toBe(true);
    expect(getCardComments.description.length).toBeGreaterThan(0);
  });

  // Pagination + verbosity (context-economy: a long thread must not dump every
  // comment into the model). Default = the most recent `limit` comments, in
  // chronological order; offset pages into older history.
  const thread = [
    { id: 1, text: 'oldest', created: '2025-01-01T00:00:00Z', author: { id: 9, full_name: 'A' } },
    { id: 2, text: 'middle', created: '2025-01-02T00:00:00Z', author: { id: 9, full_name: 'A' } },
    { id: 3, text: 'newest', created: '2025-01-03T00:00:00Z', author: { id: 9, full_name: 'A' } },
  ];

  it('limit returns the most recent N comments, in chronological order', async () => {
    const fn = vi.fn().mockResolvedValue(thread);
    const res = await getCardComments.run({ card_id: 5, limit: 2 }, fakeCtx({ client: { getCardComments: fn } }));
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text).map((c: any) => c.id)).toEqual([2, 3]);
  });

  it('offset pages into older history (skips the most recent)', async () => {
    const fn = vi.fn().mockResolvedValue(thread);
    const res = await getCardComments.run({ card_id: 5, limit: 1, offset: 1 }, fakeCtx({ client: { getCardComments: fn } }));
    expect(JSON.parse(res.content[0].text).map((c: any) => c.id)).toEqual([2]);
  });

  it('sorts by created even if the API returns them out of order', async () => {
    const fn = vi.fn().mockResolvedValue([thread[2], thread[0], thread[1]]); // shuffled
    const res = await getCardComments.run({ card_id: 5 }, fakeCtx({ client: { getCardComments: fn } }));
    expect(JSON.parse(res.content[0].text).map((c: any) => c.id)).toEqual([1, 2, 3]);
  });

  it('verbosity=minimal returns only id, text, author_name', async () => {
    const raw = [{ id: 1, text: 'hi', created: '2025-01-01T00:00:00Z', updated: '2025-01-02T00:00:00Z', author: { id: 9, full_name: 'A' } }];
    const fn = vi.fn().mockResolvedValue(raw);
    const res = await getCardComments.run({ card_id: 5, verbosity: 'minimal' }, fakeCtx({ client: { getCardComments: fn } }));
    expect(JSON.parse(res.content[0].text)[0]).toEqual({ id: 1, text: 'hi', author_name: 'A' });
  });

  it('verbosity=detailed returns the raw comment untouched', async () => {
    const raw = [{ id: 1, text: 'hi', created: '2025-01-01T00:00:00Z', author: { id: 9, full_name: 'A' }, extra: 'kept' }];
    const fn = vi.fn().mockResolvedValue(raw);
    const res = await getCardComments.run({ card_id: 5, verbosity: 'detailed' }, fakeCtx({ client: { getCardComments: fn } }));
    const parsed = JSON.parse(res.content[0].text)[0];
    expect(parsed).toHaveProperty('extra', 'kept');
    expect(parsed.author).toEqual({ id: 9, full_name: 'A' });
  });
});
