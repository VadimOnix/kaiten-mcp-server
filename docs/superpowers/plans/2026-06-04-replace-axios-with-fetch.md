# Replace Axios with Native `fetch` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `axios` and `axios-retry` dependencies from kaiten-mcp-server, replacing the HTTP transport with native Node.js `fetch`, preserving all behavior (retry/backoff, p-queue concurrency, idempotency keys, timeout, logging/metrics, error mapping) 1:1.

**Architecture:** A single private `request<T>()` method on `KaitenClient` replaces the axios instance + axios-retry + interceptors. It builds the URL/headers, combines a per-attempt `AbortSignal.timeout` with the caller signal via `AbortSignal.any`, runs a manual retry loop (network/timeout/429/408/5xx), parses the body, and routes errors through two pure mappers. `src/middleware/logging-middleware.ts` becomes plain logging functions called from `request()`. `p-queue`, `lru-cache`, idempotency generation, the public API, and all `Kaiten*` types are untouched.

**Tech Stack:** TypeScript (ESM, Node >= 20), native `fetch`/`Response`/`Headers`/`AbortSignal`, p-queue, pino, Vitest.

---

## ⚠️ Environment Gotchas (read before any build/test command)

1. **Node version.** The default shell `node` is v10.24.1 → `npm run build`/`npm test` fail with `SyntaxError: Unexpected token ?`. **Every** build/test command in this plan MUST be prefixed with the Node 22 PATH:

   ```bash
   export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
   ```

   Run this once per shell session before the first npm/node command. If a fresh shell is used per task, re-run it.

2. **Working directory.** All paths are relative to the worktree root:
   `/Users/korolevvadim/Documents/github/kaiten-mcp-server/.claude/worktrees/distracted-visvesvaraya-bdb18e`

3. **Native fetch & proxies.** Unlike axios, native `fetch` (undici) does NOT auto-honor `HTTP_PROXY/HTTPS_PROXY` env vars. This is benign here (and helps the e2e mock), but note the behavior change.

---

## File Structure

| File | Action | Responsibility after change |
|------|--------|------------------------------|
| `src/kaiten-client.ts` | Modify | Native-fetch transport: `request<T>()`, retry loop, `mapResponseError`/`mapNetworkError`, public methods unchanged in signature |
| `src/middleware/logging-middleware.ts` | Rewrite | Pure logging fns: `logHttpRequest`/`logHttpResponse`/`logHttpError` (no axios) |
| `test/helpers/fetch-mock.ts` | Create | Test helper: `installFetchMock()` + `jsonResponse()` |
| `test/kaiten-client.test.ts` | Rewrite | Asserts against the `fetch` mock instead of an axios instance |
| `test/server.test.ts` | Modify | Same mock-layer swap; snapshots unchanged |
| `test/middleware/logging-middleware.test.ts` | Create | Unit tests for the new logging fns |
| `package.json` | Modify | Drop `axios`, `axios-retry`; version bump |
| `README.md`, `CHANGELOG.md`, `CLAUDE.md` | Modify | Remove "axios" from current-state descriptions; add changelog entry |

> `test/tools/kit.test.ts` mentions "axios-style error" but only constructs plain `{ response: {...} }` objects to exercise `mapError` — it does NOT import the axios package. **Leave it unchanged.**

---

## Task 1: Create the fetch test helper

**Files:**
- Create: `test/helpers/fetch-mock.ts`

This is shared test infrastructure (no test-of-the-test needed). It installs a `vi.fn()` as global `fetch` and provides an ergonomic `Response` builder.

- [ ] **Step 1: Create the helper**

```ts
// test/helpers/fetch-mock.ts
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
```

- [ ] **Step 2: Commit**

```bash
git add test/helpers/fetch-mock.ts
git commit -m "test: add native-fetch test helper"
```

---

## Task 2: Rewrite `test/kaiten-client.test.ts` against the fetch mock (RED)

**Files:**
- Test: `test/kaiten-client.test.ts` (full rewrite)

The current file mocks `axios.create()`. Replace the whole file. Tests assert on `fetchMock.mock.calls[i]` = `[url, init]`, where `url` is the full `baseURL + path (+ query)` and `init` carries `method`, `headers`, `body`.

- [ ] **Step 1: Replace the file with the fetch-based version**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installFetchMock, jsonResponse } from './helpers/fetch-mock';
import { KaitenClient, KaitenError, KaitenErrorType } from '../src/kaiten-client';

const BASE = 'https://test.kaiten.ru/api/latest';
let client: KaitenClient;
let fetchMock: ReturnType<typeof installFetchMock>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = installFetchMock();
  client = new KaitenClient(BASE, 'test-token-0123456789-ABCDEF');
});

/** Helper: the [url, init] tuple of the Nth fetch call. */
function call(n = 0): [string, RequestInit] {
  return fetchMock.mock.calls[n] as [string, RequestInit];
}

describe('KaitenError', () => {
  it('captures type, message, status, details and hint', () => {
    const err = new KaitenError(KaitenErrorType.NOT_FOUND, 'missing', 404, { id: 1 }, 'check the id');
    expect(err.name).toBe('KaitenError');
    expect(err.message).toBe('missing');
    expect(err.status).toBe(404);
  });

  it('serialises to a plain JSON object', () => {
    const err = new KaitenError(KaitenErrorType.AUTH_ERROR, 'denied', 403, undefined, 'check token');
    expect(err.toJSON()).toEqual({
      type: 'AUTH_ERROR',
      message: 'denied',
      status: 403,
      details: undefined,
      hint: 'check token',
    });
  });
});

describe('card operations', () => {
  it('getCard GETs /cards/:id and unwraps the JSON body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 5, title: 'Card 5' }));
    const card = await client.getCard(5);
    expect(card).toEqual({ id: 5, title: 'Card 5' });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/cards/5`);
    expect((init.method ?? 'GET').toUpperCase()).toBe('GET');
  });

  it('createCard POSTs /cards with an Idempotency-Key header and JSON body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 9 }));
    const result = await client.createCard({ title: 'New', board_id: 3 });
    expect(result).toEqual({ id: 9 });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/cards`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ title: 'New', board_id: 3 });
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy();
  });

  it('createCard reuses a caller-supplied idempotency key and strips it from the body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 9 }));
    await client.createCard({ title: 'New', board_id: 3, idempotency_key: 'my-key' });
    const [, init] = call();
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty('idempotency_key');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('my-key');
  });

  it('updateCard PATCHes /cards/:id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 5, title: 'Updated' }));
    const result = await client.updateCard(5, { title: 'Updated' });
    expect(result).toEqual({ id: 5, title: 'Updated' });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/cards/5`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ title: 'Updated' });
  });

  it('deleteCard DELETEs /cards/:id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(undefined, { status: 200 }));
    await client.deleteCard(5);
    const [url, init] = call();
    expect(url).toBe(`${BASE}/cards/5`);
    expect(init.method).toBe('DELETE');
  });

  it('getCardChildren GETs /cards/:id/children', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 1 }]));
    expect(await client.getCardChildren(5)).toEqual([{ id: 1 }]);
    expect(call()[0]).toBe(`${BASE}/cards/5/children`);
  });

  it('addCardChild POSTs { card_id } to /cards/:id/children', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 99, title: 'Parent' }));
    const result = await client.addCardChild(5, 42);
    expect(result).toEqual({ id: 99, title: 'Parent' });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/cards/5/children`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ card_id: 42 });
  });

  it('removeCardChild DELETEs /cards/:id/children/:childId', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 99 }));
    const result = await client.removeCardChild(5, 42);
    expect(result).toEqual({ id: 99 });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/cards/5/children/42`);
    expect(init.method).toBe('DELETE');
  });

  it('getCardParents GETs /cards/:id/parents', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 7 }]));
    expect(await client.getCardParents(5)).toEqual([{ id: 7 }]);
    expect(call()[0]).toBe(`${BASE}/cards/5/parents`);
  });

  it('addCardParent POSTs { card_id } to /cards/:id/parents', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 99, title: 'Child' }));
    const result = await client.addCardParent(5, 42);
    expect(result).toEqual({ id: 99, title: 'Child' });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/cards/5/parents`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ card_id: 42 });
  });

  it('removeCardParent DELETEs /cards/:id/parents/:parentId', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 88 }));
    const result = await client.removeCardParent(5, 42);
    expect(result).toEqual({ id: 88 });
    expect(call()[0]).toBe(`${BASE}/cards/5/parents/42`);
    expect(call()[1].method).toBe('DELETE');
  });
});

describe('comment operations', () => {
  it('getCardComments GETs /cards/:id/comments', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 1, text: 'hi' }]));
    expect(await client.getCardComments(5)).toEqual([{ id: 1, text: 'hi' }]);
    expect(call()[0]).toBe(`${BASE}/cards/5/comments`);
  });

  it('createComment POSTs text to /cards/:id/comments with an idempotency header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1 }));
    await client.createComment(5, 'hello');
    const [url, init] = call();
    expect(url).toBe(`${BASE}/cards/5/comments`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'hello' });
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy();
  });

  it('updateComment PATCHes /cards/:id/comments/:commentId', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 2 }));
    await client.updateComment(5, 2, 'edited');
    const [url, init] = call();
    expect(url).toBe(`${BASE}/cards/5/comments/2`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'edited' });
  });

  it('deleteComment DELETEs /cards/:id/comments/:commentId', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(undefined));
    await client.deleteComment(5, 2);
    expect(call()[0]).toBe(`${BASE}/cards/5/comments/2`);
    expect(call()[1].method).toBe('DELETE');
  });
});

describe('searchCards', () => {
  it('applies default pagination and sorting in the query string', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await client.searchCards({});
    const url = call()[0];
    expect(url.startsWith(`${BASE}/cards?`)).toBe(true);
    expect(url).toContain('limit=10');
    expect(url).toContain('skip=0');
    expect(url).toContain('sort_by=created');
    expect(url).toContain('sort_direction=desc');
  });

  it('serialises provided filters into the query string', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await client.searchCards({ board_id: 7, query: 'bug', limit: 5 });
    const url = call()[0];
    expect(url).toContain('limit=5');
    expect(url).toContain('board_id=7');
    expect(url).toContain('query=bug');
  });
});

describe('space / board discovery', () => {
  it('getSpaces GETs /spaces', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 1 }]));
    expect(await client.getSpaces()).toEqual([{ id: 1 }]);
    expect(call()[0]).toBe(`${BASE}/spaces`);
  });

  it('getBoards GETs /spaces/:id/boards', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 10 }]));
    await client.getBoards(1);
    expect(call()[0]).toBe(`${BASE}/spaces/1/boards`);
  });

  it('getColumns / getLanes / getTypes hit the right board endpoints', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    await client.getColumns(2);
    await client.getLanes(2);
    await client.getTypes(2);
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain(`${BASE}/boards/2/columns`);
    expect(urls).toContain(`${BASE}/boards/2/lanes`);
    expect(urls).toContain(`${BASE}/boards/2/card_types`);
  });
});

describe('user operations', () => {
  it('getCurrentUser GETs /users/current', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, full_name: 'Me' }));
    expect(await client.getCurrentUser()).toEqual({ id: 1, full_name: 'Me' });
    expect(call()[0]).toBe(`${BASE}/users/current`);
  });

  it('getUsers passes query/limit/offset in the query string', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await client.getUsers({ query: 'Ivanov', limit: 20, offset: 5 });
    const url = call()[0];
    expect(url.startsWith(`${BASE}/users?`)).toBe(true);
    expect(url).toContain('query=Ivanov');
    expect(url).toContain('limit=20');
    expect(url).toContain('offset=5');
  });

  it('getUsers omits params that were not provided', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await client.getUsers();
    expect(call()[0]).toBe(`${BASE}/users`);
  });
});

describe('getQueueStatus', () => {
  it('exposes the concurrency configuration', () => {
    const status = client.getQueueStatus();
    expect(status).toHaveProperty('pending');
    expect(status).toHaveProperty('size');
    expect(status).toHaveProperty('concurrency');
  });
});
```

- [ ] **Step 2: Run the test — expect RED**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
npm test -- test/kaiten-client.test.ts
```

Expected: FAIL. The client still uses axios, so the `fetch` mock is never called and assertions on `fetchMock.mock.calls` fail (e.g. "Cannot read properties of undefined"). This confirms the tests drive the new transport.

- [ ] **Step 3: Commit**

```bash
git add test/kaiten-client.test.ts
git commit -m "test: rewrite kaiten-client tests against native fetch (red)"
```

---

## Task 3: Rewrite `logging-middleware.ts` + `kaiten-client.ts` to native fetch (GREEN for client tests)

These two files ship together — the client imports the logging fns, so changing one without the other breaks `tsc`.

**Files:**
- Rewrite: `src/middleware/logging-middleware.ts`
- Modify: `src/kaiten-client.ts`

- [ ] **Step 1: Replace `src/middleware/logging-middleware.ts` entirely**

```ts
import { logger } from '../logging/index.js';

const requestsEnabled = (): boolean => process.env.KAITEN_LOG_REQUESTS === 'true';

export function logHttpRequest(info: { method: string; url: string }): void {
  if (requestsEnabled()) {
    logger.debug('HTTP Request', { method: info.method.toUpperCase(), url: info.url }, 'http-client');
  }
}

export function logHttpResponse(info: {
  method: string;
  url: string;
  status: number;
  durationMs: number;
}): void {
  if (requestsEnabled()) {
    logger.debug('HTTP Response', {
      method: info.method.toUpperCase(),
      url: info.url,
      status: info.status,
      duration_ms: info.durationMs,
    }, 'http-client');
  }

  logger.recordMetric({
    tool: 'http_request',
    latency_ms: info.durationMs,
    success: true,
    timestamp: new Date().toISOString(),
  });
}

export function logHttpError(info: {
  method: string;
  url: string;
  status?: number;
  durationMs: number;
  message: string;
}): void {
  logger.error('HTTP Response Error', {
    method: info.method.toUpperCase(),
    url: info.url,
    status: info.status,
    duration_ms: info.durationMs,
    message: info.message,
  }, 'http-client');

  logger.recordMetric({
    tool: 'http_request',
    latency_ms: info.durationMs,
    success: false,
    timestamp: new Date().toISOString(),
    error: info.message,
  });
}
```

- [ ] **Step 2: Rewrite the head of `src/kaiten-client.ts` (imports + class transport)**

Replace lines 1–8 (the imports) with:

```ts
import { default as PQueue } from 'p-queue';
import { randomBytes } from 'crypto';
import { config, safeLog } from './config.js';
import { logger } from './logging/index.js';
import { logHttpRequest, logHttpResponse, logHttpError } from './middleware/logging-middleware.js';
```

(Removes `axios`, `axios-retry`, `https`, and `setupLoggingMiddleware`.)

Keep the `KaitenErrorType` enum, `KaitenError` class, and all `Kaiten*`/`*Params` interfaces (lines 14–181) **unchanged**.

- [ ] **Step 3: Replace the `KaitenClient` transport internals**

Replace the class body from `export class KaitenClient {` through the end of the `handleAxiosError` method (original lines 187–366) with the following. The constructor drops the axios instance; `request<T>()`, the retry helpers, and the two error mappers are new; `queuedRequest` is unchanged.

```ts
interface KaitenRequestInit {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export class KaitenClient {
  private static readonly MAX_RETRIES = 3;

  private queue: PQueue;
  private readonly baseURL: string;
  private readonly defaultHeaders: Record<string, string>;

  // Helper to generate idempotency key
  private generateIdempotencyKey(): string {
    return `mcp-${Date.now()}-${randomBytes(8).toString('hex')}`;
  }

  constructor(apiUrl: string, apiToken: string) {
    this.baseURL = apiUrl.replace(/\/+$/, '');
    this.defaultHeaders = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'mcp-kaiten/2.2.0 (+https://github.com/yourusername/mcp-kaiten)',
    };

    if (config.KAITEN_INSECURE_SSL) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      safeLog.warn('⚠️ SSL certificate verification is DISABLED (KAITEN_INSECURE_SSL=true). Use only for dev/corporate networks.');
    }

    // Initialize concurrency queue
    this.queue = new PQueue({
      concurrency: config.KAITEN_MAX_CONCURRENT_REQUESTS,
      interval: 1000,
      intervalCap: config.KAITEN_MAX_CONCURRENT_REQUESTS,
    });

    safeLog.info(
      `KaitenClient initialized with ${config.KAITEN_MAX_CONCURRENT_REQUESTS} max concurrent requests`
    );

    logger.info('KaitenClient initialized', {
      max_concurrent: config.KAITEN_MAX_CONCURRENT_REQUESTS,
      cache_ttl: config.KAITEN_CACHE_TTL_SECONDS,
      timeout: config.KAITEN_REQUEST_TIMEOUT_MS,
    }, 'kaiten-client');
  }

  // -------------------------------------------------------------------------
  // Native-fetch transport with retry/backoff + logging + error mapping
  // -------------------------------------------------------------------------

  private isRetryableStatus(status: number): boolean {
    return status === 429 || status === 408 || (status >= 500 && status < 600);
  }

  private backoffDelay(retryCount: number, retryAfterHeader: string | null): number {
    if (retryAfterHeader) {
      const seconds = parseInt(retryAfterHeader, 10);
      if (!isNaN(seconds)) {
        safeLog.warn(`Rate limited. Waiting ${seconds}s as per Retry-After header.`);
        return seconds * 1000;
      }
    }
    const baseDelay = 1000;
    const exponentialDelay = baseDelay * Math.pow(2, retryCount - 1);
    const jitter = Math.random() * 500;
    return exponentialDelay + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async safeParseBody(res: Response): Promise<unknown> {
    try {
      const text = await res.text();
      return text ? JSON.parse(text) : undefined;
    } catch {
      return undefined;
    }
  }

  private async request<T>(path: string, init: KaitenRequestInit = {}): Promise<T> {
    const method = (init.method ?? 'GET').toUpperCase();
    const url = `${this.baseURL}${path}`;
    const callerSignal = init.signal;

    let lastError: unknown;

    for (let attempt = 0; attempt <= KaitenClient.MAX_RETRIES; attempt++) {
      const timeoutSignal = AbortSignal.timeout(config.KAITEN_REQUEST_TIMEOUT_MS);
      const signal = callerSignal
        ? AbortSignal.any([timeoutSignal, callerSignal])
        : timeoutSignal;

      const startTime = Date.now();
      logHttpRequest({ method, url });

      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers: { ...this.defaultHeaders, ...init.headers },
          ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
          signal,
        });
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const isAbort = err instanceof Error && err.name === 'AbortError';

        // Caller cancellation -> never retry.
        if (isAbort && callerSignal?.aborted) {
          logHttpError({ method, url, durationMs, message: 'Request aborted' });
          throw new KaitenError(
            KaitenErrorType.UNKNOWN_ERROR,
            'Request aborted',
            undefined,
            { code: 'ABORTED' },
            'The operation was cancelled'
          );
        }

        const isTimeout = isAbort; // abort that isn't caller-driven == timeout
        lastError = this.mapNetworkError(err, isTimeout);
        logHttpError({ method, url, durationMs, message: (err as Error)?.message ?? 'network error' });

        if (attempt < KaitenClient.MAX_RETRIES) {
          safeLog.warn(`Retry attempt ${attempt + 1} for ${method} ${url}`);
          await this.sleep(this.backoffDelay(attempt + 1, null));
          continue;
        }
        throw lastError;
      }

      const durationMs = Date.now() - startTime;

      if (res.ok) {
        logHttpResponse({ method, url, status: res.status, durationMs });
        const text = await res.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }

      // Non-OK response.
      logHttpError({ method, url, status: res.status, durationMs, message: `HTTP ${res.status}` });

      if (this.isRetryableStatus(res.status) && attempt < KaitenClient.MAX_RETRIES) {
        safeLog.warn(`Retrying request due to status ${res.status}`);
        await this.sleep(this.backoffDelay(attempt + 1, res.headers.get('retry-after')));
        continue;
      }

      const body = await this.safeParseBody(res);
      throw this.mapResponseError(res.status, res.headers, body);
    }

    throw lastError ?? new KaitenError(
      KaitenErrorType.UNKNOWN_ERROR,
      'Request failed',
      undefined,
      {},
      undefined
    );
  }

  private mapResponseError(status: number, headers: Headers, data: unknown): KaitenError {
    const errorMap: Record<number, [KaitenErrorType, string, string]> = {
      401: [KaitenErrorType.AUTH_ERROR, 'Authentication failed', 'Check your KAITEN_API_TOKEN in .env file'],
      403: [KaitenErrorType.AUTH_ERROR, 'Insufficient permissions', 'Your API token does not have permission to perform this action'],
      404: [KaitenErrorType.NOT_FOUND, 'Resource not found', 'Check that the card_id, board_id, space_id, or other resource ID is correct'],
      422: [KaitenErrorType.VALIDATION_ERROR, 'Validation error', 'Check the request parameters for correctness'],
    };

    if (errorMap[status]) {
      const [type, message, hint] = errorMap[status];
      return new KaitenError(type, message, status, data, hint);
    }

    if (status === 429) {
      const retryAfter = headers.get('retry-after') || 'unknown';
      return new KaitenError(
        KaitenErrorType.RATE_LIMITED,
        'Rate limit exceeded',
        status,
        { ...(typeof data === 'object' && data !== null ? data : {}), retry_after: retryAfter },
        'Reduce the frequency of requests or decrease the limit parameter'
      );
    }

    if (status >= 500 && status < 600) {
      return new KaitenError(
        KaitenErrorType.API_ERROR,
        'Kaiten server error',
        status,
        data,
        'The Kaiten API is experiencing issues. Try again later.'
      );
    }

    return new KaitenError(
      KaitenErrorType.API_ERROR,
      `API request failed with status ${status}`,
      status,
      data,
      undefined
    );
  }

  private mapNetworkError(err: unknown, isTimeout: boolean): KaitenError {
    if (isTimeout) {
      return new KaitenError(
        KaitenErrorType.TIMEOUT,
        `Request timeout after ${config.KAITEN_REQUEST_TIMEOUT_MS}ms`,
        undefined,
        { code: 'ETIMEDOUT' },
        'Try reducing the limit parameter or specifying a more specific board_id/space_id'
      );
    }

    const e = err as { message?: string; code?: string; cause?: { code?: string; message?: string } };
    const sslText = `${e.message || ''} ${e.code || ''} ${e.cause?.code || ''} ${e.cause?.message || ''}`;
    const isSslError = /certificate|issuer|UNABLE_TO_GET|CERT_HAS_EXPIRED|SELF_SIGNED|DEPTH_ZERO|SSL/i.test(sslText);
    return new KaitenError(
      KaitenErrorType.NETWORK_ERROR,
      e.message || 'Network error occurred',
      undefined,
      { code: e.code ?? e.cause?.code },
      isSslError
        ? config.KAITEN_INSECURE_SSL
          ? 'SSL error persists despite KAITEN_INSECURE_SSL=true. Check your network/proxy or CA configuration.'
          : 'SSL certificate error. Preferred fix: update ca-certificates (rebuild the Docker image). Last resort on a trusted network (self-signed/corporate proxy): set KAITEN_INSECURE_SSL=true'
        : 'Check your internet connection and API URL configuration'
    );
  }
```

> The `queuedRequest` method (original lines 368–402) stays exactly as-is — it follows immediately after `mapNetworkError`. Do not delete it.

- [ ] **Step 4: Rewrite every public method to call `request()` via `queuedRequest`**

Replace the public method bodies (original lines 404–739) with these. Signatures are unchanged.

```ts
  // Card operations
  async getCard(cardId: number, signal?: AbortSignal): Promise<KaitenCard> {
    return this.queuedRequest(() => this.request<KaitenCard>(`/cards/${cardId}`, { signal }), signal);
  }

  async createCard(params: CreateCardParams, signal?: AbortSignal): Promise<KaitenCard> {
    const { idempotency_key, ...cardData } = params;
    const key = idempotency_key || this.generateIdempotencyKey();
    return this.queuedRequest(
      () => this.request<KaitenCard>('/cards', {
        method: 'POST',
        body: cardData,
        headers: { 'Idempotency-Key': key },
        signal,
      }),
      signal,
    );
  }

  async updateCard(cardId: number, params: UpdateCardParams, signal?: AbortSignal): Promise<KaitenCard> {
    const { idempotency_key, ...cardData } = params;
    const key = idempotency_key || this.generateIdempotencyKey();
    return this.queuedRequest(
      () => this.request<KaitenCard>(`/cards/${cardId}`, {
        method: 'PATCH',
        body: cardData,
        headers: { 'Idempotency-Key': key },
        signal,
      }),
      signal,
    );
  }

  async deleteCard(cardId: number, signal?: AbortSignal): Promise<void> {
    await this.queuedRequest(
      () => this.request<void>(`/cards/${cardId}`, { method: 'DELETE', signal }),
      signal,
    );
  }

  async getCardsFromBoard(
    boardId: number,
    limit: number = 10,
    skip: number = 0,
    condition: number = 1,
    signal?: AbortSignal
  ): Promise<KaitenCard[]> {
    const path = `/boards/${boardId}/cards?limit=${limit}&skip=${skip}&sort_by=created&sort_direction=desc&condition=${condition}`;
    return this.queuedRequest(() => this.request<KaitenCard[]>(path, { signal }), signal);
  }

  async getCardsFromSpace(
    spaceId: number,
    limit: number = 10,
    skip: number = 0,
    condition: number = 1,
    signal?: AbortSignal
  ): Promise<KaitenCard[]> {
    const path = `/spaces/${spaceId}/cards?limit=${limit}&skip=${skip}&sort_by=created&sort_direction=desc&condition=${condition}`;
    return this.queuedRequest(() => this.request<KaitenCard[]>(path, { signal }), signal);
  }

  async searchCards(params: {
    query?: string;
    title?: string;
    space_id?: number;
    board_id?: number;
    column_id?: number;
    lane_id?: number;
    state?: number;
    owner_id?: number;
    type_id?: number;
    condition?: number;
    created_before?: string;
    created_after?: string;
    updated_before?: string;
    updated_after?: string;
    due_date_before?: string;
    due_date_after?: string;
    last_moved_to_done_at_before?: string;
    last_moved_to_done_at_after?: string;
    asap?: boolean;
    archived?: boolean;
    overdue?: boolean;
    done_on_time?: boolean;
    with_due_date?: boolean;
    owner_ids?: string;
    member_ids?: string;
    column_ids?: string;
    type_ids?: string;
    tag_ids?: string;
    exclude_board_ids?: string;
    exclude_owner_ids?: string;
    exclude_card_ids?: string;
    sort_by?: string;
    sort_direction?: string;
    limit?: number;
    skip?: number;
  }, signal?: AbortSignal): Promise<KaitenCard[]> {
    const queryParams = new URLSearchParams();
    const limit = params.limit || 10;
    const skip = params.skip || 0;
    queryParams.append('limit', limit.toString());
    queryParams.append('skip', skip.toString());
    const sortBy = params.sort_by || 'created';
    const sortDirection = params.sort_direction || 'desc';
    queryParams.append('sort_by', sortBy);
    queryParams.append('sort_direction', sortDirection);

    Object.entries(params).forEach(([key, value]) => {
      if (
        value !== undefined &&
        key !== 'limit' &&
        key !== 'skip' &&
        key !== 'sort_by' &&
        key !== 'sort_direction'
      ) {
        queryParams.append(key, value.toString());
      }
    });

    return this.queuedRequest(
      () => this.request<KaitenCard[]>(`/cards?${queryParams.toString()}`, { signal }),
      signal,
    );
  }

  // Comment operations
  async getCardComments(cardId: number, signal?: AbortSignal): Promise<KaitenComment[]> {
    return this.queuedRequest(() => this.request<KaitenComment[]>(`/cards/${cardId}/comments`, { signal }), signal);
  }

  async createComment(cardId: number, text: string, idempotencyKey?: string, signal?: AbortSignal): Promise<KaitenComment> {
    const key = idempotencyKey || this.generateIdempotencyKey();
    return this.queuedRequest(
      () => this.request<KaitenComment>(`/cards/${cardId}/comments`, {
        method: 'POST',
        body: { text },
        headers: { 'Idempotency-Key': key },
        signal,
      }),
      signal,
    );
  }

  async updateComment(cardId: number, commentId: number, text: string, idempotencyKey?: string, signal?: AbortSignal): Promise<KaitenComment> {
    const key = idempotencyKey || this.generateIdempotencyKey();
    return this.queuedRequest(
      () => this.request<KaitenComment>(`/cards/${cardId}/comments/${commentId}`, {
        method: 'PATCH',
        body: { text },
        headers: { 'Idempotency-Key': key },
        signal,
      }),
      signal,
    );
  }

  async deleteComment(cardId: number, commentId: number, signal?: AbortSignal): Promise<void> {
    await this.queuedRequest(
      () => this.request<void>(`/cards/${cardId}/comments/${commentId}`, { method: 'DELETE', signal }),
      signal,
    );
  }

  // Card relationships
  async getCardChildren(cardId: number, signal?: AbortSignal): Promise<KaitenCard[]> {
    return this.queuedRequest(() => this.request<KaitenCard[]>(`/cards/${cardId}/children`, { signal }), signal);
  }

  async addCardChild(cardId: number, childCardId: number, signal?: AbortSignal): Promise<KaitenCard> {
    return this.queuedRequest(
      () => this.request<KaitenCard>(`/cards/${cardId}/children`, { method: 'POST', body: { card_id: childCardId }, signal }),
      signal,
    );
  }

  async removeCardChild(cardId: number, childCardId: number, signal?: AbortSignal): Promise<{ id: number }> {
    return this.queuedRequest(
      () => this.request<{ id: number }>(`/cards/${cardId}/children/${childCardId}`, { method: 'DELETE', signal }),
      signal,
    );
  }

  async getCardParents(cardId: number, signal?: AbortSignal): Promise<KaitenCard[]> {
    return this.queuedRequest(() => this.request<KaitenCard[]>(`/cards/${cardId}/parents`, { signal }), signal);
  }

  async addCardParent(cardId: number, parentCardId: number, signal?: AbortSignal): Promise<KaitenCard> {
    return this.queuedRequest(
      () => this.request<KaitenCard>(`/cards/${cardId}/parents`, { method: 'POST', body: { card_id: parentCardId }, signal }),
      signal,
    );
  }

  async removeCardParent(cardId: number, parentCardId: number, signal?: AbortSignal): Promise<{ id: number }> {
    return this.queuedRequest(
      () => this.request<{ id: number }>(`/cards/${cardId}/parents/${parentCardId}`, { method: 'DELETE', signal }),
      signal,
    );
  }

  // Space operations
  async getSpaces(signal?: AbortSignal): Promise<KaitenSpace[]> {
    return this.queuedRequest(() => this.request<KaitenSpace[]>('/spaces', { signal }), signal);
  }

  async getSpace(spaceId: number, signal?: AbortSignal): Promise<KaitenSpace> {
    return this.queuedRequest(() => this.request<KaitenSpace>(`/spaces/${spaceId}`, { signal }), signal);
  }

  // Board operations
  async getBoards(spaceId: number, signal?: AbortSignal): Promise<KaitenBoard[]> {
    return this.queuedRequest(() => this.request<KaitenBoard[]>(`/spaces/${spaceId}/boards`, { signal }), signal);
  }

  async getBoard(boardId: number, signal?: AbortSignal): Promise<KaitenBoard> {
    return this.queuedRequest(() => this.request<KaitenBoard>(`/boards/${boardId}`, { signal }), signal);
  }

  // Board справочники (columns, lanes, types)
  async getColumns(boardId: number, signal?: AbortSignal): Promise<KaitenColumn[]> {
    return this.queuedRequest(() => this.request<KaitenColumn[]>(`/boards/${boardId}/columns`, { signal }), signal);
  }

  async getLanes(boardId: number, signal?: AbortSignal): Promise<KaitenLane[]> {
    return this.queuedRequest(() => this.request<KaitenLane[]>(`/boards/${boardId}/lanes`, { signal }), signal);
  }

  async getTypes(boardId: number, signal?: AbortSignal): Promise<KaitenType[]> {
    return this.queuedRequest(() => this.request<KaitenType[]>(`/boards/${boardId}/card_types`, { signal }), signal);
  }

  // User operations
  async getCurrentUser(signal?: AbortSignal): Promise<KaitenUser> {
    return this.queuedRequest(() => this.request<KaitenUser>('/users/current', { signal }), signal);
  }

  async getUsers(params?: {
    query?: string;
    limit?: number;
    offset?: number;
  }, signal?: AbortSignal): Promise<KaitenUser[]> {
    const qs = new URLSearchParams();
    if (params?.query) qs.append('query', params.query);
    if (params?.limit !== undefined) qs.append('limit', String(params.limit));
    if (params?.offset !== undefined) qs.append('offset', String(params.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this.queuedRequest(() => this.request<KaitenUser[]>(`/users${suffix}`, { signal }), signal);
  }

  // Queue status (for debugging)
  getQueueStatus() {
    return {
      pending: this.queue.pending,
      size: this.queue.size,
      concurrency: this.queue.concurrency,
    };
  }
}
```

- [ ] **Step 5: Type-check & run the client tests — expect GREEN**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
npm run build && npm test -- test/kaiten-client.test.ts
```

Expected: `tsc` compiles with no errors; all `test/kaiten-client.test.ts` tests PASS.

> NOTE: `test/server.test.ts` will now FAIL (it still mocks axios). That is expected and fixed in Task 4. Do not run the full suite yet.

- [ ] **Step 6: Commit**

```bash
git add src/kaiten-client.ts src/middleware/logging-middleware.ts
git commit -m "refactor: replace axios with native fetch in KaitenClient"
```

---

## Task 4: Migrate `test/server.test.ts` to the fetch mock

**Files:**
- Modify: `test/server.test.ts`

The transform is mechanical: swap the mock layer, then replace each per-test mock setup. Snapshots are byte-identical (same transformer output from the same data), so **no snapshot blocks change**.

- [ ] **Step 1: Replace the mock-setup header (original lines 1–31)**

Replace lines 1–31 (from `import { describe...` through the `import { ALL_TOOLS }` line, including the `vi.hoisted`/`vi.mock('axios')`/`vi.mock('axios-retry')` block) with:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installFetchMock, jsonResponse } from './helpers/fetch-mock';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { cache } from '../src/cache.js';
import { ALL_TOOLS } from '../src/tools/index.js';

let fetchMock: ReturnType<typeof installFetchMock>;
```

> `KaitenError`/`KaitenErrorType` are no longer imported here — the 404 test now drives the real mapper via a 404 response (Step 4).

- [ ] **Step 2: Install the fetch mock in `beforeEach`**

Replace the existing `beforeEach(() => { ... })` block (original lines 52–58) with:

```ts
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = installFetchMock();
  // The LRU cache is a shared singleton imported by server.ts. list_spaces,
  // list_boards and parameterless list_users cache their results, so we clear
  // it between tests to keep every snapshot self-contained and deterministic.
  cache.invalidateAll();
});
```

- [ ] **Step 3: Mechanical find/replace across the rest of the file**

Apply these replacements everywhere they occur:

- `mockAxiosInstance.get.mockResolvedValueOnce({ data: X })` → `fetchMock.mockResolvedValueOnce(jsonResponse(X))`
- `mockAxiosInstance.post.mockResolvedValueOnce({ data: X })` → `fetchMock.mockResolvedValueOnce(jsonResponse(X))`
- `mockAxiosInstance.patch.mockResolvedValueOnce({ data: X })` → `fetchMock.mockResolvedValueOnce(jsonResponse(X))`
- `mockAxiosInstance.delete.mockResolvedValueOnce({ data: undefined })` → `fetchMock.mockResolvedValueOnce(jsonResponse(undefined))`
- `mockAxiosInstance.delete.mockResolvedValueOnce({ data: X })` → `fetchMock.mockResolvedValueOnce(jsonResponse(X))`

(The verb no longer matters: the server calls each tool once, so a single queued `jsonResponse` is consumed per test in order.)

- [ ] **Step 4: Fix the 404 test (original lines 143–160)**

Replace its body so the real client maps a 404 Response:

```ts
  it('maps a Kaiten 404 to an error result mentioning not found', async () => {
    // The live client maps a 404 Response into a KaitenError(NOT_FOUND).
    fetchMock.mockResolvedValueOnce(jsonResponse({}, { status: 404 }));
    const client = await connect();
    const res = await client.callTool({ name: 'kaiten_get_card', arguments: { card_id: 999999 } });
    expect(res.isError).toBe(true);
    expect((res.content as any[])[0].text).toMatch(/NOT_FOUND|not found/i);
  });
```

- [ ] **Step 5: Fix the abort test (original lines 164–175)**

Replace `mockAxiosInstance.get.mockImplementation(() => new Promise(() => {}));` with:

```ts
    fetchMock.mockImplementation(() => new Promise(() => {})); // never resolves
```

- [ ] **Step 6: Run the full suite — expect GREEN**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
npm test
```

Expected: ALL test files PASS, including every inline snapshot in `test/server.test.ts` (unchanged byte-for-byte).

- [ ] **Step 7: Commit**

```bash
git add test/server.test.ts
git commit -m "test: migrate server tests to native-fetch mock"
```

---

## Task 5: Unit-test the logging middleware functions

**Files:**
- Create: `test/middleware/logging-middleware.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as loggerModule from '../../src/logging/index.js';
import { logHttpRequest, logHttpResponse, logHttpError } from '../../src/middleware/logging-middleware.js';

describe('logging-middleware', () => {
  let recordMetric: ReturnType<typeof vi.spyOn>;
  let debug: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    recordMetric = vi.spyOn(loggerModule.logger, 'recordMetric').mockImplementation(() => {});
    debug = vi.spyOn(loggerModule.logger, 'debug').mockImplementation(() => {});
    error = vi.spyOn(loggerModule.logger, 'error').mockImplementation(() => {});
    delete process.env.KAITEN_LOG_REQUESTS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.KAITEN_LOG_REQUESTS;
  });

  it('logHttpResponse records a success metric with latency', () => {
    logHttpResponse({ method: 'get', url: '/x', status: 200, durationMs: 42 });
    expect(recordMetric).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'http_request', latency_ms: 42, success: true }),
    );
  });

  it('logHttpError records a failure metric with the error message', () => {
    logHttpError({ method: 'get', url: '/x', status: 500, durationMs: 7, message: 'boom' });
    expect(error).toHaveBeenCalled();
    expect(recordMetric).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'http_request', success: false, error: 'boom' }),
    );
  });

  it('logHttpRequest is silent unless KAITEN_LOG_REQUESTS=true', () => {
    logHttpRequest({ method: 'get', url: '/x' });
    expect(debug).not.toHaveBeenCalled();

    process.env.KAITEN_LOG_REQUESTS = 'true';
    logHttpRequest({ method: 'get', url: '/x' });
    expect(debug).toHaveBeenCalledWith('HTTP Request', expect.objectContaining({ method: 'GET', url: '/x' }), 'http-client');
  });
});
```

- [ ] **Step 2: Run — expect GREEN**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
npm test -- test/middleware/logging-middleware.test.ts
```

Expected: PASS. (If `logger.recordMetric`/`debug`/`error` are not spy-able as named, adjust the spy target to the actual exported logger object — confirm via `src/logging/index.ts`.)

- [ ] **Step 3: Commit**

```bash
git add test/middleware/logging-middleware.test.ts
git commit -m "test: unit-test fetch logging middleware functions"
```

---

## Task 6: Add retry & error-mapping tests for the new transport

**Files:**
- Create: `test/kaiten-client-retry.test.ts`

These cover code that was previously the `axios-retry` library. Retry tests use **fake timers** advanced by a bounded amount (≤ 9000ms) so per-attempt `AbortSignal.timeout(10000)` never fires during the test.

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installFetchMock, jsonResponse } from './helpers/fetch-mock';
import { KaitenClient, KaitenErrorType } from '../src/kaiten-client';

const BASE = 'https://test.kaiten.ru/api/latest';
let client: KaitenClient;
let fetchMock: ReturnType<typeof installFetchMock>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = installFetchMock();
  client = new KaitenClient(BASE, 'test-token-0123456789-ABCDEF');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('retry behavior', () => {
  it('retries a 5xx and succeeds on the next attempt', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({ id: 7, title: 'OK' }));
    const p = client.getCard(7);
    await vi.advanceTimersByTimeAsync(2000); // one backoff (1000-1500ms) + p-queue interval
    await expect(p).resolves.toEqual({ id: 7, title: 'OK' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on a network error (fetch rejects with TypeError)', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse({ id: 1 }));
    const p = client.getCard(1);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(p).resolves.toEqual({ id: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('honors Retry-After on a 429 before succeeding', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(jsonResponse({ id: 3 }));
    const p = client.getCard(3);
    await vi.advanceTimersByTimeAsync(2500); // retry-after = 2000ms
    await expect(p).resolves.toEqual({ id: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries on persistent 5xx and throws API_ERROR', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse({}, { status: 503 }));
    const p = client.getCard(9).catch((e) => e);
    await vi.advanceTimersByTimeAsync(9000); // covers 1000+2000+4000 backoffs (+jitter)
    const err = await p;
    expect(err.type).toBe(KaitenErrorType.API_ERROR);
    expect(err.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 + 3 retries
  });

  it('maps a timeout (AbortError, no caller signal) to TIMEOUT after retries', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(Object.assign(new Error('The operation timed out'), { name: 'AbortError' }));
    const p = client.getCard(11).catch((e) => e);
    await vi.advanceTimersByTimeAsync(9000);
    const err = await p;
    expect(err.type).toBe(KaitenErrorType.TIMEOUT);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe('error mapping (non-retryable, single attempt)', () => {
  it.each([
    [401, KaitenErrorType.AUTH_ERROR],
    [403, KaitenErrorType.AUTH_ERROR],
    [404, KaitenErrorType.NOT_FOUND],
    [422, KaitenErrorType.VALIDATION_ERROR],
  ])('maps %i to %s', async (status, type) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ msg: 'x' }, { status }));
    const err = await client.getCard(1).catch((e) => e);
    expect(err.type).toBe(type);
    expect(err.status).toBe(status);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('caller cancellation', () => {
  it('an already-aborted caller signal yields ABORTED and never calls fetch', async () => {
    const ac = new AbortController();
    ac.abort();
    const err = await client.getCard(5, ac.signal).catch((e) => e);
    expect(err.details?.code).toBe('ABORTED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect GREEN**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
npm test -- test/kaiten-client-retry.test.ts
```

Expected: PASS. If any retry test hangs, the fake-timer advance window is the lever: increase the `advanceTimersByTimeAsync` value but keep it **< 10000** so per-attempt timeouts don't fire.

- [ ] **Step 3: Commit**

```bash
git add test/kaiten-client-retry.test.ts
git commit -m "test: cover fetch retry/backoff and error mapping"
```

---

## Task 7: Remove axios dependencies & bump version

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove the dependencies and bump the version**

In `package.json`, delete these two lines from `dependencies`:

```json
    "axios": "^1.12.2",
    "axios-retry": "^4.5.0",
```

And change the version:

```json
  "version": "3.3.0",
```

- [ ] **Step 2: Refresh the lockfile / node_modules**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
npm install
```

Expected: `package-lock.json` updates; `axios`/`axios-retry` removed from the tree.

- [ ] **Step 3: Verify axios is fully gone & the suite is green**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
grep -rn "from 'axios'" src/ test/ ; echo "grep exit: $?"   # expect: no matches (exit 1)
npm run build && npm test
```

Expected: the grep prints nothing (exit 1); `tsc` compiles; **all** tests pass.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: drop axios/axios-retry deps, bump to 3.3.0"
```

---

## Task 8: Update documentation

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `CLAUDE.md`

> CHANGELOG entries for *past* versions (lines ~158/188/306/342/353/381) are historical records — **do not edit them**. Only add a new entry.

- [ ] **Step 1: Update `README.md`**

Line ~465 — replace:
```
│       └── logging-middleware.ts  # Axios logging interceptor
```
with:
```
│       └── logging-middleware.ts  # HTTP logging helpers (native fetch)
```

Line ~667 — replace:
```
- **API Client:** axios с retry/backoff и AbortSignal support
```
with:
```
- **API Client:** нативный fetch с retry/backoff и AbortSignal support
```

- [ ] **Step 2: Update `CLAUDE.md`**

Line ~52 — replace `(axios mocked, p-queue real)` with `(global fetch mocked, p-queue real)`.

Line ~97 — replace `Axios-based HTTP client with retry logic (3 retries with exponential backoff)` with `Native fetch HTTP client with manual retry logic (3 retries with exponential backoff)`.

Line ~131 — replace `Axios interceptor for HTTP request/response logging` with `Logging helpers for HTTP request/response (called from the fetch wrapper)`.

- [ ] **Step 3: Add a `CHANGELOG.md` entry at the top of the version list**

```markdown
## [3.3.0] - 2026-06-04

### Changed
- **HTTP transport:** replaced `axios` + `axios-retry` with the native Node.js `fetch` API.
  Retry/backoff (network errors, 429/408/5xx, `Retry-After`), p-queue concurrency,
  idempotency keys, timeout, logging and metrics are preserved 1:1. Public `KaitenClient`
  API, `KaitenError` types, and error hints are unchanged.
- `KAITEN_INSECURE_SSL=true` now sets `NODE_TLS_REJECT_UNAUTHORIZED=0` (process-wide)
  instead of a per-instance `https.Agent` — same effect, no `https` import.

### Removed
- Dependencies: `axios`, `axios-retry`.

### Notes
- Native `fetch` (undici) does not honor `HTTP_PROXY`/`HTTPS_PROXY` env vars (axios did).
```

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md CLAUDE.md
git commit -m "docs: update for native-fetch transport (3.3.0)"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full build + test from a clean shell**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
npm run build && npm test
```

Expected: `tsc` succeeds with no errors; every test file passes (client, retry, server snapshots, middleware, plus the pre-existing schemas/transformers/utils/cache/config/kit suites).

- [ ] **Step 2: Confirm zero axios references remain in shipped code**

```bash
grep -rn "axios" src/ ; echo "exit: $?"   # expect: no matches (exit 1)
```

- [ ] **Step 3 (optional): e2e smoke against the in-repo mock**

If `e2e/` exists, run the mock harness per `local-testing-setup` memory. The harness strips `HTTP_PROXY`/`HTTPS_PROXY` and sets `NO_PROXY` for the child — still correct (and native fetch ignores proxies anyway).

---

## Self-Review (completed by plan author)

**Spec coverage:**
- `request<T>()` (spec §1) → Task 3 Step 3.
- URL/headers/timeout via `AbortSignal.any`+`timeout` (spec §1.1–1.3) → Task 3 Step 3.
- Retry loop incl. `Retry-After` & caller-abort no-retry (spec §1.4) → Task 3 Step 3; tested Task 6.
- Body parse incl. empty/204 (spec §1.6) → Task 3 (`safeParseBody`/text); tested via `deleteCard`.
- `mapResponseError`/`mapNetworkError` (spec §2) → Task 3 Step 3; tested Task 6.
- logging-middleware rewrite (spec §3) → Task 3 Step 1; tested Task 5.
- Untouched p-queue/idempotency/public API (spec §4) → preserved in Task 3 Step 4.
- Insecure SSL via `NODE_TLS_REJECT_UNAUTHORIZED` (spec §5) → Task 3 constructor.
- package.json dep removal + version (spec §6) → Task 7.
- Test rewrites + new retry/error tests (spec §7) → Tasks 2, 4, 6.
- `getUsers` inline query (spec §1.1) → Task 3 Step 4; tested Task 2.

**Placeholder scan:** none — all code blocks are complete.

**Type consistency:** `request`, `KaitenRequestInit`, `mapResponseError(status, headers, data)`, `mapNetworkError(err, isTimeout)`, `backoffDelay`, `isRetryableStatus`, `sleep`, `safeParseBody`, `installFetchMock`, `jsonResponse` are used consistently across tasks. Public method names/signatures match the originals.
