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
