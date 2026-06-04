import { describe, it, expect, vi } from 'vitest';
import { addCardMembers } from '../../../src/tools/members/add-card-members.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_add_card_members tool module', () => {
  it('adds each user and reports a batch summary', async () => {
    const addCardMemberFn = vi.fn().mockResolvedValue({ id: 1 });
    const res = await addCardMembers.run({ card_id: 5, user_ids: [7, 8] }, fakeCtx({ client: { addCardMember: addCardMemberFn } }));
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual({
      card_id: 5,
      succeeded: [7, 8],
      failed: [],
      summary: '2 added, 0 failed',
    });
    expect(addCardMemberFn).toHaveBeenNthCalledWith(1, 5, 7, undefined);
    expect(addCardMemberFn).toHaveBeenNthCalledWith(2, 5, 8, undefined);
  });

  it('continues on individual failures', async () => {
    const addCardMemberFn = vi.fn()
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce(new Error('nope'));
    const res = await addCardMembers.run({ card_id: 5, user_ids: [7, 8] }, fakeCtx({ client: { addCardMember: addCardMemberFn } }));
    const body = JSON.parse(res.content[0].text);
    expect(body.succeeded).toEqual([7]);
    expect(body.failed).toEqual([{ user_id: 8, error: 'nope' }]);
  });

  it('rejects an empty user_ids array via the schema', async () => {
    const res = await addCardMembers.run({ card_id: 5, user_ids: [] }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(addCardMembers.name).toBe('kaiten_add_card_members');
    expect(addCardMembers.annotations.idempotent).toBe(true);
    expect(addCardMembers.description.length).toBeGreaterThan(0);
  });
});
