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
