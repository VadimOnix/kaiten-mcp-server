import { describe, it, expect, vi } from 'vitest';
import { updateComment } from '../../../src/tools/comments/update-comment.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_update_comment tool module', () => {
  it('updates a comment and returns raw comment as JSON', async () => {
    const updated = { id: 11, text: 'edited', card_id: 5 };
    const updateCommentFn = vi.fn().mockResolvedValue(updated);
    const res = await updateComment.run(
      { card_id: 5, comment_id: 11, text: 'edited' },
      fakeCtx({ client: { updateComment: updateCommentFn } }),
    );
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toBe(JSON.stringify(updated, null, 2));
    // exact arg order: card_id, comment_id, text, undefined (idempotency_key), signal
    expect(updateCommentFn).toHaveBeenCalledWith(5, 11, 'edited', undefined, undefined);
  });

  it('does NOT forward idempotency_key to client (original behaviour)', async () => {
    const updateCommentFn = vi.fn().mockResolvedValue({ id: 1 });
    await updateComment.run(
      { card_id: 5, comment_id: 11, text: 'new text', idempotency_key: 'key-123' },
      fakeCtx({ client: { updateComment: updateCommentFn } }),
    );
    // idempotency_key from args is intentionally ignored — undefined is always passed
    expect(updateCommentFn).toHaveBeenCalledWith(5, 11, 'new text', undefined, undefined);
  });

  it('maps a thrown error to an error result', async () => {
    const updateCommentFn = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await updateComment.run(
      { card_id: 5, comment_id: 11, text: 'new' },
      fakeCtx({ client: { updateComment: updateCommentFn } }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects invalid args via the schema', async () => {
    // comment_id must be positive
    const res = await updateComment.run({ card_id: 5, comment_id: -1, text: 'hi' }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(updateComment.name).toBe('kaiten_update_comment');
    expect(updateComment.annotations.idempotent).toBe(true);
    expect(updateComment.description.length).toBeGreaterThan(0);
  });
});
