import { describe, it, expect, vi } from 'vitest';
import { listTags } from '../../../src/tools/reference/list-tags.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_list_tags tool module', () => {
  it('returns matching tags reduced to id + name', async () => {
    const listTagsFn = vi.fn().mockResolvedValue([
      { id: 76886, name: 'Token team', color: 13, created: '2026-08-20T06:34:31.864Z' },
      { id: 12, name: 'Tokenizer', color: 4, updated: '2026-01-01T00:00:00Z' },
    ]);
    const res = await listTags.run({ query: 'token' }, fakeCtx({ client: { listTags: listTagsFn } }));

    expect(res.isError).toBeFalsy();
    expect(listTagsFn).toHaveBeenCalledWith('token', undefined);
    expect(JSON.parse(res.content[0].text)).toEqual([
      { id: 76886, name: 'Token team' },
      { id: 12, name: 'Tokenizer' },
    ]);
  });

  it('drops the colour and timestamp noise from the advertised payload', async () => {
    const listTagsFn = vi.fn().mockResolvedValue([
      { id: 1, name: 'x', color: 9, created: 'c', updated: 'u', card_id: 5, tag_id: 1 },
    ]);
    const res = await listTags.run({ query: 'x' }, fakeCtx({ client: { listTags: listTagsFn } }));
    const text = res.content[0].text;
    for (const noise of ['color', 'created', 'updated', 'card_id', 'tag_id']) {
      expect(text).not.toContain(noise);
    }
  });

  it('returns an empty array when nothing matches', async () => {
    const listTagsFn = vi.fn().mockResolvedValue([]);
    const res = await listTags.run({ query: 'nope' }, fakeCtx({ client: { listTags: listTagsFn } }));
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual([]);
  });

  it('rejects a missing query instead of dumping the first 100 company tags', async () => {
    const listTagsFn = vi.fn();
    const res = await listTags.run({} as never, fakeCtx({ client: { listTags: listTagsFn } }));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
    expect(listTagsFn).not.toHaveBeenCalled();
  });

  it('maps a thrown error', async () => {
    const listTagsFn = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await listTags.run({ query: 'x' }, fakeCtx({ client: { listTags: listTagsFn } }));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('has expected metadata', () => {
    expect(listTags.name).toBe('kaiten_list_tags');
    expect(listTags.annotations.readOnly).toBe(true);
    expect(listTags.description.length).toBeGreaterThan(60);
  });
});
