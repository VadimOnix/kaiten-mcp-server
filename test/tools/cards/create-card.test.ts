import { describe, it, expect, vi } from 'vitest';
import { createCard } from '../../../src/tools/cards/create-card.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_create_card tool module', () => {
  it('builds minimal params and returns the created card as JSON', async () => {
    const created = { id: 9, title: 'New Card', board_id: 3 };
    const createCardFn = vi.fn().mockResolvedValue(created);
    const res = await createCard.run(
      { title: 'New Card', board_id: 3 },
      fakeCtx({ client: { createCard: createCardFn } }),
    );
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toBe(JSON.stringify(created, null, 2));
    expect(createCardFn).toHaveBeenCalledWith({ title: 'New Card', board_id: 3 }, undefined);
  });

  it('only forwards provided optional fields', async () => {
    const createCardFn = vi.fn().mockResolvedValue({ id: 1 });
    await createCard.run(
      {
        title: 'T',
        board_id: 3,
        column_id: 11,
        lane_id: 12,
        description: 'desc',
        type_id: 13,
        size: 0,
        asap: false,
        owner_id: 14,
        due_date: '2025-11-01T00:00:00Z',
      },
      fakeCtx({ client: { createCard: createCardFn } }),
    );
    // size is serialised to the writable size_text string (the numeric `size`
    // field is ignored by Kaiten's POST, same as PATCH).
    expect(createCardFn).toHaveBeenCalledWith(
      {
        title: 'T',
        board_id: 3,
        column_id: 11,
        lane_id: 12,
        description: 'desc',
        type_id: 13,
        size_text: '0',
        asap: false,
        owner_id: 14,
        due_date: '2025-11-01T00:00:00Z',
      },
      undefined,
    );
  });

  it('serialises a non-zero size to size_text', async () => {
    const createCardFn = vi.fn().mockResolvedValue({ id: 1 });
    await createCard.run(
      { title: 'T', board_id: 3, size: 5 },
      fakeCtx({ client: { createCard: createCardFn } }),
    );
    expect(createCardFn).toHaveBeenCalledWith(
      { title: 'T', board_id: 3, size_text: '5' },
      undefined,
    );
  });

  it('forwards a provided idempotency_key into params', async () => {
    const createCardFn = vi.fn().mockResolvedValue({ id: 1 });
    await createCard.run(
      { title: 'T', board_id: 3, idempotency_key: 'abc' },
      fakeCtx({ client: { createCard: createCardFn } }),
    );
    expect(createCardFn).toHaveBeenCalledWith(
      { title: 'T', board_id: 3, idempotency_key: 'abc' },
      undefined,
    );
  });

  it('strips base64 avatar fields from the created-card response', async () => {
    const created = {
      id: 9,
      title: 'X',
      owner: { id: 1, full_name: 'O', avatar_initials_url: 'data:image/png;base64,AAAA' },
    };
    const createCardFn = vi.fn().mockResolvedValue(created);
    const res = await createCard.run(
      { title: 'X', board_id: 3 },
      fakeCtx({ client: { createCard: createCardFn } }),
    );
    expect(res.content[0].text).not.toContain('avatar_initials_url');
    expect(JSON.parse(res.content[0].text).owner).toEqual({ id: 1, full_name: 'O' });
  });

  it('maps a thrown error', async () => {
    const createCardFn = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await createCard.run(
      { title: 'T', board_id: 3 },
      fakeCtx({ client: { createCard: createCardFn } }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('has expected metadata', () => {
    expect(createCard.name).toBe('kaiten_create_card');
    expect(createCard.description.length).toBeGreaterThan(0);
  });
});
