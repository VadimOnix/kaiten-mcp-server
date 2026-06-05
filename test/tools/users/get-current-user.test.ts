import { describe, it, expect, vi } from 'vitest';
import { getCurrentUser } from '../../../src/tools/users/get-current-user.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_get_current_user tool module', () => {
  it('returns the raw user as JSON (no simplifyUser)', async () => {
    const user = { id: 1, full_name: 'Me', email: 'me@example.com', username: 'me', activated: true };
    const getCurrentUserFn = vi.fn().mockResolvedValue(user);
    const res = await getCurrentUser.run(
      {},
      fakeCtx({ client: { getCurrentUser: getCurrentUserFn } }),
    );
    expect(res.isError).toBeFalsy();
    expect(getCurrentUserFn).toHaveBeenCalledWith(undefined);
    expect(res.content[0].text).toBe(JSON.stringify(user, null, 2));
  });

  it('mirrors the user into structuredContent (read-only tool, MCP spec 2025-11-25)', async () => {
    const user = { id: 1, full_name: 'Me', email: 'me@example.com', username: 'me', activated: true };
    const res = await getCurrentUser.run(
      {},
      fakeCtx({ client: { getCurrentUser: vi.fn().mockResolvedValue(user) } }),
    );
    expect(res.structuredContent).toEqual(user);
    // text stays byte-identical to the original pretty-JSON output
    expect(res.content[0].text).toBe(JSON.stringify(user, null, 2));
  });

  it('passes ctx.signal to client.getCurrentUser', async () => {
    const signal = new AbortController().signal;
    const user = { id: 1, full_name: 'Me', email: 'me@example.com', username: 'me', activated: true };
    const getCurrentUserFn = vi.fn().mockResolvedValue(user);
    await getCurrentUser.run(
      {},
      fakeCtx({ client: { getCurrentUser: getCurrentUserFn }, signal }),
    );
    expect(getCurrentUserFn).toHaveBeenCalledWith(signal);
  });

  it('maps a thrown error to an error result (UNKNOWN_ERROR)', async () => {
    const res = await getCurrentUser.run(
      {},
      fakeCtx({
        client: { getCurrentUser: vi.fn().mockRejectedValue(new Error('network failure')) },
      }),
    );
    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error.type).toBe('UNKNOWN_ERROR');
    expect(parsed.error.message).toBe('network failure');
  });

  it('maps an API error (with .response) to API_ERROR', async () => {
    const apiError = Object.assign(new Error('Not Found'), {
      response: { status: 404, data: { message: 'not found' } },
    });
    const res = await getCurrentUser.run(
      {},
      fakeCtx({ client: { getCurrentUser: vi.fn().mockRejectedValue(apiError) } }),
    );
    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error.type).toBe('API_ERROR');
    expect(parsed.error.status).toBe(404);
  });

  it('rejects extra fields via the schema', async () => {
    const res = await getCurrentUser.run(
      { unexpected: true },
      fakeCtx({ client: { getCurrentUser: vi.fn() } }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(getCurrentUser.name).toBe('kaiten_get_current_user');
    expect(getCurrentUser.annotations.readOnly).toBe(true);
    expect(getCurrentUser.description.length).toBeGreaterThan(0);
  });
});
