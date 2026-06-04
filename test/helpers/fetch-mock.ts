import { vi } from 'vitest';

/**
 * Replaces global `fetch` with a vi.fn() mock and returns it.
 * Call inside the test module top-level (after imports) or in beforeEach.
 */
export function installFetchMock() {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/**
 * Builds a real Response for the mock to resolve with.
 * - `data === undefined` -> empty body (mirrors 204 / DELETE).
 * - default status 200, content-type application/json.
 */
export function jsonResponse(
  data?: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const status = init.status ?? 200;
  const body = data === undefined ? null : JSON.stringify(data);
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}
