import { describe, it, expect, vi } from 'vitest';
import { createComment } from '../../../src/tools/comments/create-comment.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_create_comment tool module', () => {
  it('creates a comment and returns raw comment as JSON', async () => {
    const created = { id: 11, text: 'hello', card_id: 5 };
    const createCommentFn = vi.fn().mockResolvedValue(created);
    const res = await createComment.run(
      { card_id: 5, text: 'hello' },
      fakeCtx({ client: { createComment: createCommentFn } }),
    );
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toBe(JSON.stringify(created, null, 2));
    // exact arg order: card_id, text, undefined (idempotency_key), signal
    expect(createCommentFn).toHaveBeenCalledWith(5, 'hello', undefined, undefined);
  });

  it('does NOT forward idempotency_key to client (original behaviour)', async () => {
    const createCommentFn = vi.fn().mockResolvedValue({ id: 1 });
    await createComment.run(
      { card_id: 5, text: 'msg', idempotency_key: 'my-key' },
      fakeCtx({ client: { createComment: createCommentFn } }),
    );
    // idempotency_key from args is intentionally ignored — undefined is always passed
    expect(createCommentFn).toHaveBeenCalledWith(5, 'msg', undefined, undefined);
  });

  it('maps a thrown error to an error result', async () => {
    const createCommentFn = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await createComment.run(
      { card_id: 5, text: 'hi' },
      fakeCtx({ client: { createComment: createCommentFn } }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects invalid args via the schema', async () => {
    // card_id must be positive, text must be non-empty
    const res = await createComment.run({ card_id: -1, text: 'hi' }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(createComment.name).toBe('kaiten_create_comment');
    expect(createComment.annotations.idempotent).toBe(true);
    expect(createComment.description.length).toBeGreaterThan(0);
  });
});
