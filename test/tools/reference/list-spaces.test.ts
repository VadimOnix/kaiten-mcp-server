import { describe, it, expect, vi } from 'vitest';
import { listSpaces } from '../../../src/tools/reference/list-spaces.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: { getSpaces: () => null, setSpaces: () => {} },
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_list_spaces tool module', () => {
  it('cache miss: fetches from client, sets cache, returns human-readable text', async () => {
    const spaces = [{ id: 1, title: 'Space One', archived: false, boards: [{ id: 10, title: 'Board A' }] }];
    const getSpaces = vi.fn().mockResolvedValue(spaces);
    const setSpaces = vi.fn();
    const res = await listSpaces.run(
      {},
      fakeCtx({
        client: { getSpaces },
        cache: { getSpaces: () => null, setSpaces },
      }),
    );
    expect(res.isError).toBeFalsy();
    expect(getSpaces).toHaveBeenCalledWith(undefined);
    expect(setSpaces).toHaveBeenCalledWith(spaces);
    expect(res.content[0].text).toContain('Found 1 space(s):');
    expect(res.content[0].text).toContain('Space One (ID: 1)');
    expect(res.content[0].text).toContain('Board A');
  });

  it('cache hit: does NOT call client.getSpaces', async () => {
    const spaces = [{ id: 2, title: 'Cached Space', archived: false, boards: [] }];
    const getSpaces = vi.fn().mockResolvedValue([]);
    const res = await listSpaces.run(
      {},
      fakeCtx({
        client: { getSpaces },
        cache: { getSpaces: () => spaces, setSpaces: vi.fn() },
      }),
    );
    expect(res.isError).toBeFalsy();
    expect(getSpaces).not.toHaveBeenCalled();
    expect(res.content[0].text).toContain('Cached Space (ID: 2)');
  });

  it('archived space shows [ARCHIVED] marker', async () => {
    const spaces = [{ id: 3, title: 'Old Space', archived: true, boards: [] }];
    const res = await listSpaces.run(
      {},
      fakeCtx({
        client: { getSpaces: vi.fn().mockResolvedValue(spaces) },
        cache: { getSpaces: () => null, setSpaces: vi.fn() },
      }),
    );
    expect(res.content[0].text).toContain('[ARCHIVED]');
  });

  it('space with no boards omits board line', async () => {
    const spaces = [{ id: 4, title: 'Empty Space', archived: false, boards: [] }];
    const res = await listSpaces.run(
      {},
      fakeCtx({
        client: { getSpaces: vi.fn().mockResolvedValue(spaces) },
        cache: { getSpaces: () => null, setSpaces: vi.fn() },
      }),
    );
    expect(res.content[0].text).not.toContain('Boards');
  });

  it('maps a thrown error to an error result', async () => {
    const res = await listSpaces.run(
      {},
      fakeCtx({
        client: { getSpaces: vi.fn().mockRejectedValue(new Error('boom')) },
        cache: { getSpaces: () => null, setSpaces: vi.fn() },
      }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('has expected metadata', () => {
    expect(listSpaces.name).toBe('kaiten_list_spaces');
    expect(listSpaces.annotations.readOnly).toBe(true);
    expect(listSpaces.description.length).toBeGreaterThan(0);
  });
});
