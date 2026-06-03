import { describe, it, expect, vi } from 'vitest';
import { deleteComment } from '../../../src/tools/comments/delete-comment.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_delete_comment tool module', () => {
  it('deletes the comment and returns the exact success string', async () => {
    const deleteCommentFn = vi.fn().mockResolvedValue(undefined);
    const res = await deleteComment.run(
      { card_id: 5, comment_id: 11 },
      fakeCtx({ client: { deleteComment: deleteCommentFn } }),
    );
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toBe('Comment 11 deleted successfully');
    expect(deleteCommentFn).toHaveBeenCalledWith(5, 11, undefined);
  });

  it('maps a thrown error to an error result', async () => {
    const deleteCommentFn = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await deleteComment.run(
      { card_id: 5, comment_id: 11 },
      fakeCtx({ client: { deleteComment: deleteCommentFn } }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects invalid args via the schema', async () => {
    const res = await deleteComment.run({ card_id: 5, comment_id: -1 }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(deleteComment.name).toBe('kaiten_delete_comment');
    expect(deleteComment.annotations.destructive).toBe(true);
    expect(deleteComment.description.length).toBeGreaterThan(0);
  });
});
