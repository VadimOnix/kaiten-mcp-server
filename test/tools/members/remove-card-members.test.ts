import { describe, it, expect, vi } from 'vitest';
import { removeCardMembers } from '../../../src/tools/members/remove-card-members.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_remove_card_members tool module', () => {
  it('removes each user and reports a batch summary', async () => {
    const removeCardMemberFn = vi.fn().mockResolvedValue({ id: 7 });
    const res = await removeCardMembers.run({ card_id: 5, user_ids: [7, 8] }, fakeCtx({ client: { removeCardMember: removeCardMemberFn } }));
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual({
      card_id: 5,
      succeeded: [7, 8],
      failed: [],
      summary: '2 removed, 0 failed',
    });
    expect(removeCardMemberFn).toHaveBeenNthCalledWith(1, 5, 7, undefined);
  });

  it('marks isError when every removal fails', async () => {
    const removeCardMemberFn = vi.fn().mockRejectedValue(new Error('nope'));
    const res = await removeCardMembers.run({ card_id: 5, user_ids: [7] }, fakeCtx({ client: { removeCardMember: removeCardMemberFn } }));
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).summary).toBe('0 removed, 1 failed');
  });

  it('rejects an empty user_ids array via the schema', async () => {
    const res = await removeCardMembers.run({ card_id: 5, user_ids: [] }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(removeCardMembers.name).toBe('kaiten_remove_card_members');
    expect(removeCardMembers.annotations.idempotent).toBe(true);
    expect(removeCardMembers.description.length).toBeGreaterThan(0);
  });
});
