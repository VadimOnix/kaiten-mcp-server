import { describe, it, expect, vi } from 'vitest';
import { removeCardTags } from '../../../src/tools/cards/remove-card-tags.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_remove_card_tags tool module', () => {
  it('resolves names to ids (case-insensitively) then DELETEs each, verb "removed"', async () => {
    const getCardTags = vi.fn().mockResolvedValue([
      { id: 11, name: 'Urgent' },
      { id: 22, name: 'backend' },
    ]);
    const removeCardTag = vi.fn().mockResolvedValue(undefined);
    const res = await removeCardTags.run(
      { card_id: 5, tag_names: ['urgent', 'BACKEND'] },
      fakeCtx({ client: { getCardTags, removeCardTag } }),
    );
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual({
      card_id: 5,
      succeeded: ['urgent', 'BACKEND'],
      failed: [],
      summary: '2 removed, 0 failed',
    });
    // resolved to the ids from getCardTags, arg order card_id, tagId, signal
    expect(removeCardTag).toHaveBeenNthCalledWith(1, 5, 11, undefined);
    expect(removeCardTag).toHaveBeenNthCalledWith(2, 5, 22, undefined);
  });

  it('records a per-item failure when the tag is not on the card (NOT isError if others succeed)', async () => {
    const getCardTags = vi.fn().mockResolvedValue([{ id: 11, name: 'urgent' }]);
    const removeCardTag = vi.fn().mockResolvedValue(undefined);
    const res = await removeCardTags.run(
      { card_id: 5, tag_names: ['urgent', 'ghost'] },
      fakeCtx({ client: { getCardTags, removeCardTag } }),
    );
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.succeeded).toEqual(['urgent']);
    expect(parsed.failed).toEqual([{ tag_name: 'ghost', error: 'tag not found on card' }]);
    expect(removeCardTag).toHaveBeenCalledTimes(1);
  });

  it('all names missing: isError true and no DELETE issued', async () => {
    const getCardTags = vi.fn().mockResolvedValue([{ id: 11, name: 'urgent' }]);
    const removeCardTag = vi.fn().mockResolvedValue(undefined);
    const res = await removeCardTags.run(
      { card_id: 5, tag_names: ['ghost'] },
      fakeCtx({ client: { getCardTags, removeCardTag } }),
    );
    expect(res.isError).toBe(true);
    expect(removeCardTag).not.toHaveBeenCalled();
  });

  it('surfaces an error when the tag lookup itself fails', async () => {
    const getCardTags = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await removeCardTags.run(
      { card_id: 5, tag_names: ['urgent'] },
      fakeCtx({ client: { getCardTags, removeCardTag: vi.fn() } }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects invalid args via the schema', async () => {
    const res = await removeCardTags.run({ card_id: 5, tag_names: [] }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(removeCardTags.name).toBe('kaiten_remove_card_tags');
    expect(removeCardTags.annotations.idempotent).toBe(true);
    expect(removeCardTags.description.length).toBeGreaterThan(0);
  });
});
