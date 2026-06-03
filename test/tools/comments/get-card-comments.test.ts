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
});
