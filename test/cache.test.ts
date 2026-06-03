import { describe, it, expect, afterEach, vi } from 'vitest';
import { KaitenCache } from '../src/cache';
import type { KaitenSpace, KaitenBoard, KaitenUser } from '../src/kaiten-client';

// vitest.config.ts sets KAITEN_CACHE_TTL_SECONDS=300, so a fresh KaitenCache is
// enabled with a 300s TTL. Expiry is exercised by advancing Date.now().

const spaces: KaitenSpace[] = [{ id: 1, title: 'Space 1' }];
const boards: KaitenBoard[] = [{ id: 10, title: 'Board 10', space_id: 1 }];
const users: KaitenUser[] = [{ id: 100, full_name: 'User 100' }];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('spaces cache', () => {
  it('returns null before anything is cached', () => {
    expect(new KaitenCache().getSpaces()).toBeNull();
  });

  it('stores and retrieves the spaces list', () => {
    const cache = new KaitenCache();
    cache.setSpaces(spaces);
    expect(cache.getSpaces()).toEqual(spaces);
  });

  it('stores and retrieves a single space by id', () => {
    const cache = new KaitenCache();
    cache.setSpace(1, spaces[0]);
    expect(cache.getSpace(1)).toEqual(spaces[0]);
    expect(cache.getSpace(2)).toBeNull();
  });
});

describe('boards cache', () => {
  it('keys the boards list by space id', () => {
    const cache = new KaitenCache();
    cache.setBoards(boards, 1);
    expect(cache.getBoards(1)).toEqual(boards);
    expect(cache.getBoards(2)).toBeNull();
  });

  it('stores and retrieves a single board by id', () => {
    const cache = new KaitenCache();
    cache.setBoard(10, boards[0]);
    expect(cache.getBoard(10)).toEqual(boards[0]);
    expect(cache.getBoard(11)).toBeNull();
  });
});

describe('users cache', () => {
  it('stores and retrieves the users list', () => {
    const cache = new KaitenCache();
    cache.setUsers(users);
    expect(cache.getUsers()).toEqual(users);
  });
});

describe('TTL expiry', () => {
  it('returns the entry while within the TTL window', () => {
    const t0 = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(t0);
    const cache = new KaitenCache();
    cache.setSpaces(spaces);

    vi.spyOn(Date, 'now').mockReturnValue(t0 + 100_000); // +100s < 300s
    expect(cache.getSpaces()).toEqual(spaces);
  });

  it('evicts the entry once the TTL has passed', () => {
    const t0 = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(t0);
    const cache = new KaitenCache();
    cache.setSpaces(spaces);

    vi.spyOn(Date, 'now').mockReturnValue(t0 + 300_001); // just past 300s
    expect(cache.getSpaces()).toBeNull();
  });
});

describe('invalidation', () => {
  it('invalidateSpaces clears only the spaces cache', () => {
    const cache = new KaitenCache();
    cache.setSpaces(spaces);
    cache.setBoards(boards, 1);
    cache.invalidateSpaces();
    expect(cache.getSpaces()).toBeNull();
    expect(cache.getBoards(1)).toEqual(boards);
  });

  it('invalidateAll clears every cache', () => {
    const cache = new KaitenCache();
    cache.setSpaces(spaces);
    cache.setBoards(boards, 1);
    cache.setUsers(users);
    cache.invalidateAll();
    expect(cache.getSpaces()).toBeNull();
    expect(cache.getBoards(1)).toBeNull();
    expect(cache.getUsers()).toBeNull();
  });
});

describe('getStats', () => {
  it('reports enabled state, TTL and per-type sizes', () => {
    const cache = new KaitenCache();
    cache.setSpaces(spaces);
    const stats = cache.getStats();
    expect(stats.enabled).toBe(true);
    expect(stats.ttl_seconds).toBe(300);
    expect(stats.spaces.size).toBe(1);
    expect(stats.spaces.max).toBe(100);
    expect(stats.boards.size).toBe(0);
  });
});
