import { describe, it, expect, vi } from 'vitest';
import { listBoards } from '../../../src/tools/reference/list-boards.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: { getBoards: () => null, setBoards: () => {} },
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_list_boards tool module', () => {
  it('cache miss: fetches, sets cache, returns JSON (normal verbosity default)', async () => {
    const boards = [{ id: 10, title: 'Board A', space_id: 42, archived: false }];
    const getBoards = vi.fn().mockResolvedValue(boards);
    const setBoards = vi.fn();
    const res = await listBoards.run(
      { space_id: 42 },
      fakeCtx({
        client: { getBoards },
        cache: { getBoards: () => null, setBoards },
      }),
    );
    expect(res.isError).toBeFalsy();
    expect(getBoards).toHaveBeenCalledWith(42, undefined);
    expect(setBoards).toHaveBeenCalledWith(boards, 42);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe(10);
    expect(parsed[0].title).toBe('Board A');
    expect(parsed[0].space_id).toBe(42);
    expect(parsed[0].archived).toBe(false);
  });

  it('cache hit: does NOT call client.getBoards', async () => {
    const boards = [{ id: 99, title: 'Cached', space_id: 42, archived: false }];
    const getBoards = vi.fn();
    const res = await listBoards.run(
      { space_id: 42 },
      fakeCtx({
        client: { getBoards },
        cache: { getBoards: () => boards, setBoards: vi.fn() },
      }),
    );
    expect(res.isError).toBeFalsy();
    expect(getBoards).not.toHaveBeenCalled();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed[0].id).toBe(99);
  });

  it('falls back to ctx.config.KAITEN_DEFAULT_SPACE_ID when space_id not provided', async () => {
    const boards = [{ id: 10, title: 'Board A', space_id: 42, archived: false }];
    const getBoards = vi.fn().mockResolvedValue(boards);
    const setBoards = vi.fn();
    const res = await listBoards.run(
      {},
      fakeCtx({
        client: { getBoards },
        cache: { getBoards: () => null, setBoards },
        config: { KAITEN_DEFAULT_SPACE_ID: 42 },
      }),
    );
    expect(res.isError).toBeFalsy();
    expect(getBoards).toHaveBeenCalledWith(42, undefined);
    expect(setBoards).toHaveBeenCalledWith(boards, 42);
  });

  it('throws when neither space_id nor default space is set', async () => {
    const res = await listBoards.run(
      {},
      fakeCtx({
        config: { KAITEN_DEFAULT_SPACE_ID: undefined },
        cache: { getBoards: () => null, setBoards: vi.fn() },
      }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('space_id is required');
  });

  it('applies minimal verbosity', async () => {
    const boards = [{ id: 10, title: 'Board A', space_id: 42, archived: false }];
    const res = await listBoards.run(
      { space_id: 42, verbosity: 'minimal' },
      fakeCtx({
        client: { getBoards: vi.fn().mockResolvedValue(boards) },
        cache: { getBoards: () => null, setBoards: vi.fn() },
      }),
    );
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed[0]).toEqual({ id: 10, title: 'Board A' });
    expect(parsed[0]).not.toHaveProperty('space_id');
  });

  it('maps a thrown error to an error result', async () => {
    const res = await listBoards.run(
      { space_id: 42 },
      fakeCtx({
        client: { getBoards: vi.fn().mockRejectedValue(new Error('boom')) },
        cache: { getBoards: () => null, setBoards: vi.fn() },
      }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects invalid args via the schema', async () => {
    const res = await listBoards.run({ space_id: -1 }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(listBoards.name).toBe('kaiten_list_boards');
    expect(listBoards.annotations.readOnly).toBe(true);
    expect(listBoards.description.length).toBeGreaterThan(0);
  });
});
