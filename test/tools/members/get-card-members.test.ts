import { describe, it, expect, vi } from 'vitest';
import { getCardMembers } from '../../../src/tools/members/get-card-members.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_get_card_members tool module', () => {
  it('returns members mapped through verbosity (normal default), preserving type', async () => {
    const raw = [{ id: 7, full_name: 'Ann', email: 'a@x.io', username: 'ann', activated: true, type: 2 }];
    const getCardMembersFn = vi.fn().mockResolvedValue(raw);
    const res = await getCardMembers.run({ card_id: 5 }, fakeCtx({ client: { getCardMembers: getCardMembersFn } }));
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual([
      { id: 7, full_name: 'Ann', email: 'a@x.io', username: 'ann', activated: true, type: 2 },
    ]);
    expect(getCardMembersFn).toHaveBeenCalledWith(5, undefined);
  });

  it('returns empty array when card has no members', async () => {
    const res = await getCardMembers.run({ card_id: 5 }, fakeCtx({ client: { getCardMembers: vi.fn().mockResolvedValue([]) } }));
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual([]);
  });

  it('maps a thrown error to an error result', async () => {
    const res = await getCardMembers.run({ card_id: 5 }, fakeCtx({ client: { getCardMembers: vi.fn().mockRejectedValue(new Error('boom')) } }));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects invalid args via the schema', async () => {
    const res = await getCardMembers.run({ card_id: -1 }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(getCardMembers.name).toBe('kaiten_get_card_members');
    expect(getCardMembers.annotations.readOnly).toBe(true);
    expect(getCardMembers.description.length).toBeGreaterThan(0);
  });
});
