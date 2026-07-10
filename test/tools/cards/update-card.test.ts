import { describe, it, expect, vi } from 'vitest';
import { updateCard } from '../../../src/tools/cards/update-card.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_update_card tool module', () => {
  it('updates a single field and returns the card as JSON', async () => {
    const updated = { id: 5, title: 'Updated Card' };
    const updateCardFn = vi.fn().mockResolvedValue(updated);
    const res = await updateCard.run(
      { card_id: 5, title: 'Updated Card' },
      fakeCtx({ client: { updateCard: updateCardFn } }),
    );
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toBe(JSON.stringify(updated, null, 2));
    expect(updateCardFn).toHaveBeenCalledWith(5, { title: 'Updated Card' }, undefined);
  });

  it('forwards description when explicitly empty string', async () => {
    const updateCardFn = vi.fn().mockResolvedValue({ id: 5 });
    await updateCard.run(
      { card_id: 5, description: '' },
      fakeCtx({ client: { updateCard: updateCardFn } }),
    );
    expect(updateCardFn).toHaveBeenCalledWith(5, { description: '' }, undefined);
  });

  it('forwards state of zero and sends size as the writable size_text string', async () => {
    // Kaiten's PATCH ignores the numeric `size` field and only writes `size_text`
    // (from which it derives `size`), so the tool must serialise size → size_text.
    const updateCardFn = vi.fn().mockResolvedValue({ id: 5 });
    await updateCard.run(
      { card_id: 5, state: 0, size: 0 },
      fakeCtx({ client: { updateCard: updateCardFn } }),
    );
    expect(updateCardFn).toHaveBeenCalledWith(5, { state: 0, size_text: '0' }, undefined);
  });

  it('serialises a non-zero size to size_text', async () => {
    const updateCardFn = vi.fn().mockResolvedValue({ id: 5 });
    await updateCard.run(
      { card_id: 5, size: 5 },
      fakeCtx({ client: { updateCard: updateCardFn } }),
    );
    expect(updateCardFn).toHaveBeenCalledWith(5, { size_text: '5' }, undefined);
  });

  it('forwards a provided idempotency_key into params', async () => {
    const updateCardFn = vi.fn().mockResolvedValue({ id: 5 });
    await updateCard.run(
      { card_id: 5, title: 'X', idempotency_key: 'abc' },
      fakeCtx({ client: { updateCard: updateCardFn } }),
    );
    expect(updateCardFn).toHaveBeenCalledWith(5, { title: 'X', idempotency_key: 'abc' }, undefined);
  });

  it('strips base64 avatar fields from the updated-card response', async () => {
    const updated = {
      id: 5,
      title: 'X',
      owner: { id: 1, full_name: 'O', avatar_uploaded_url: 'data:image/png;base64,BBBB' },
    };
    const updateCardFn = vi.fn().mockResolvedValue(updated);
    const res = await updateCard.run(
      { card_id: 5, title: 'X' },
      fakeCtx({ client: { updateCard: updateCardFn } }),
    );
    expect(res.content[0].text).not.toContain('avatar_uploaded_url');
    expect(JSON.parse(res.content[0].text).owner).toEqual({ id: 1, full_name: 'O' });
  });

  it('maps a thrown error', async () => {
    const updateCardFn = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await updateCard.run(
      { card_id: 5, title: 'X' },
      fakeCtx({ client: { updateCard: updateCardFn } }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('has expected metadata', () => {
    expect(updateCard.name).toBe('kaiten_update_card');
    expect(updateCard.description.length).toBeGreaterThan(0);
  });
});
