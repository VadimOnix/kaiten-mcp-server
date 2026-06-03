import { describe, it, expect, vi } from 'vitest';
import { deleteCard } from '../../../src/tools/cards/delete-card.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_delete_card tool module', () => {
  it('deletes the card and returns the exact success string', async () => {
    const deleteCardFn = vi.fn().mockResolvedValue(undefined);
    const res = await deleteCard.run({ card_id: 5 }, fakeCtx({ client: { deleteCard: deleteCardFn } }));
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toBe('Card 5 deleted successfully');
    expect(deleteCardFn).toHaveBeenCalledWith(5, undefined);
  });

  it('maps a thrown error', async () => {
    const deleteCardFn = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await deleteCard.run({ card_id: 5 }, fakeCtx({ client: { deleteCard: deleteCardFn } }));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects invalid args via the schema', async () => {
    const res = await deleteCard.run({ card_id: -1 }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(deleteCard.name).toBe('kaiten_delete_card');
    expect(deleteCard.annotations.destructive).toBe(true);
    expect(deleteCard.description.length).toBeGreaterThan(0);
  });
});
