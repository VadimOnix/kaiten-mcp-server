import { describe, it, expect, vi } from 'vitest';
import { listUsers } from '../../../src/tools/users/list-users.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: { getUsers: () => null, setUsers: () => {} },
    config: { KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

const alice = { id: 2, full_name: 'Alice', email: 'alice@example.com', username: 'alice', activated: true };

describe('kaiten_list_users tool module', () => {
  // ============================================================
  // QUERY PATH (server-side filter, no cache)
  // ============================================================

  it('query path: calls client.getUsers with query param, returns processed users', async () => {
    const getUsers = vi.fn().mockResolvedValue([alice]);
    const setUsers = vi.fn();
    const warningSpy = vi.fn();
    const res = await listUsers.run(
      { query: 'Alice' },
      fakeCtx({
        client: { getUsers },
        cache: { getUsers: () => null, setUsers },
        log: { warning: warningSpy, info: () => {}, error: () => {}, debug: () => {} },
      }),
    );
    expect(res.isError).toBeFalsy();
    expect(getUsers).toHaveBeenCalledWith({ query: 'Alice', limit: undefined, offset: undefined }, undefined);
    expect(setUsers).not.toHaveBeenCalled();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe(2);
    expect(parsed[0].full_name).toBe('Alice');
    expect(parsed[0].email).toBe('alice@example.com');
    expect(warningSpy).not.toHaveBeenCalled();
  });

  it('query path: with limit — uses server-side filter path', async () => {
    const getUsers = vi.fn().mockResolvedValue([alice]);
    const res = await listUsers.run(
      { limit: 10 },
      fakeCtx({ client: { getUsers }, cache: { getUsers: () => null, setUsers: vi.fn() } }),
    );
    expect(res.isError).toBeFalsy();
    expect(getUsers).toHaveBeenCalledWith({ query: undefined, limit: 10, offset: undefined }, undefined);
  });

  it('query path: with offset — uses server-side filter path', async () => {
    const getUsers = vi.fn().mockResolvedValue([alice]);
    const res = await listUsers.run(
      { offset: 5 },
      fakeCtx({ client: { getUsers }, cache: { getUsers: () => null, setUsers: vi.fn() } }),
    );
    expect(res.isError).toBeFalsy();
    expect(getUsers).toHaveBeenCalledWith({ query: undefined, limit: undefined, offset: 5 }, undefined);
  });

  it('query path: applies verbosity (minimal)', async () => {
    const getUsers = vi.fn().mockResolvedValue([alice]);
    const res = await listUsers.run(
      { query: 'Alice', verbosity: 'minimal' },
      fakeCtx({ client: { getUsers }, cache: { getUsers: () => null, setUsers: vi.fn() } }),
    );
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed[0]).toEqual({ id: 2, full_name: 'Alice' });
    expect(parsed[0]).not.toHaveProperty('email');
  });

  it('query path: passes ctx.signal to client.getUsers', async () => {
    const signal = new AbortController().signal;
    const getUsers = vi.fn().mockResolvedValue([alice]);
    await listUsers.run(
      { query: 'Alice' },
      fakeCtx({ client: { getUsers }, cache: { getUsers: () => null, setUsers: vi.fn() }, signal }),
    );
    expect(getUsers).toHaveBeenCalledWith(expect.any(Object), signal);
  });

  // ============================================================
  // CACHED-ALL PATH (no query/limit/offset → use cache)
  // ============================================================

  it('cached-all path: cache miss → fetches, sets cache, returns users', async () => {
    const getUsers = vi.fn().mockResolvedValue([alice]);
    const setUsers = vi.fn();
    const warningSpy = vi.fn();
    const res = await listUsers.run(
      {},
      fakeCtx({
        client: { getUsers },
        cache: { getUsers: () => null, setUsers },
        log: { warning: warningSpy, info: () => {}, error: () => {}, debug: () => {} },
      }),
    );
    expect(res.isError).toBeFalsy();
    expect(getUsers).toHaveBeenCalledWith(undefined, undefined);
    expect(setUsers).toHaveBeenCalledWith([alice]);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed[0].id).toBe(2);
    expect(warningSpy).toHaveBeenCalledWith('[Kaiten MCP] WARNING: kaiten_list_users called without parameters. Consider using query parameter for better performance.');
  });

  it('cached-all path: cache hit → does NOT call client.getUsers', async () => {
    const getUsers = vi.fn();
    const warningSpy = vi.fn();
    const res = await listUsers.run(
      {},
      fakeCtx({
        client: { getUsers },
        cache: { getUsers: () => [alice], setUsers: vi.fn() },
        log: { warning: warningSpy, info: () => {}, error: () => {}, debug: () => {} },
      }),
    );
    expect(res.isError).toBeFalsy();
    expect(getUsers).not.toHaveBeenCalled();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed[0].id).toBe(2);
    expect(warningSpy).toHaveBeenCalledWith('[Kaiten MCP] WARNING: kaiten_list_users called without parameters. Consider using query parameter for better performance.');
  });

  it('cached-all path: applies verbosity (minimal)', async () => {
    const res = await listUsers.run(
      { verbosity: 'minimal' },
      fakeCtx({
        client: { getUsers: vi.fn().mockResolvedValue([alice]) },
        cache: { getUsers: () => null, setUsers: vi.fn() },
      }),
    );
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed[0]).toEqual({ id: 2, full_name: 'Alice' });
    expect(parsed[0]).not.toHaveProperty('email');
  });

  it('cached-all path: applies verbosity (detailed)', async () => {
    const res = await listUsers.run(
      { verbosity: 'detailed' },
      fakeCtx({
        client: { getUsers: vi.fn().mockResolvedValue([alice]) },
        cache: { getUsers: () => null, setUsers: vi.fn() },
      }),
    );
    const parsed = JSON.parse(res.content[0].text);
    // detailed returns all fields from the user object
    expect(parsed[0]).toEqual(alice);
  });

  it('cached-all path: normal verbosity returns id/full_name/email/username/activated', async () => {
    const res = await listUsers.run(
      {},
      fakeCtx({
        client: { getUsers: vi.fn().mockResolvedValue([alice]) },
        cache: { getUsers: () => null, setUsers: vi.fn() },
      }),
    );
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed[0]).toEqual({
      id: 2,
      full_name: 'Alice',
      email: 'alice@example.com',
      username: 'alice',
      activated: true,
    });
  });

  // ============================================================
  // ERROR HANDLING
  // ============================================================

  it('maps a thrown error to an error result', async () => {
    const res = await listUsers.run(
      { query: 'Alice' },
      fakeCtx({
        client: { getUsers: vi.fn().mockRejectedValue(new Error('boom')) },
      }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects invalid args via the schema (limit > 100)', async () => {
    const res = await listUsers.run({ limit: 200 }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  // ============================================================
  // METADATA
  // ============================================================

  it('has expected metadata', () => {
    expect(listUsers.name).toBe('kaiten_list_users');
    expect(listUsers.annotations.readOnly).toBe(true);
    expect(listUsers.description.length).toBeGreaterThan(0);
  });
});
