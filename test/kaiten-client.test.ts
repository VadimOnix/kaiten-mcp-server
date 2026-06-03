import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- Mock the HTTP layer ----------------------------------------------------
// KaitenClient builds its own axios instance internally, so we replace
// axios.create() with a controllable fake and stub axios-retry to a no-op.
// p-queue is left real (it simply runs the queued task).
const { mockAxiosInstance } = vi.hoisted(() => ({
  mockAxiosInstance: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

vi.mock('axios', () => ({
  default: { create: vi.fn(() => mockAxiosInstance) },
}));
vi.mock('axios-retry', () => ({ default: vi.fn() }));

import { KaitenClient, KaitenError, KaitenErrorType } from '../src/kaiten-client';

let client: KaitenClient;

beforeEach(() => {
  vi.clearAllMocks();
  client = new KaitenClient('https://test.kaiten.ru/api/latest', 'test-token-0123456789-ABCDEF');
});

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
  it('getCard GETs /cards/:id and unwraps response.data', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({ data: { id: 5, title: 'Card 5' } });
    const card = await client.getCard(5);
    expect(card).toEqual({ id: 5, title: 'Card 5' });
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/cards/5', { signal: undefined });
  });

  it('createCard POSTs /cards with an Idempotency-Key header', async () => {
    mockAxiosInstance.post.mockResolvedValueOnce({ data: { id: 9 } });
    const result = await client.createCard({ title: 'New', board_id: 3 });
    expect(result).toEqual({ id: 9 });

    const [url, data, opts] = mockAxiosInstance.post.mock.calls[0];
    expect(url).toBe('/cards');
    expect(data).toEqual({ title: 'New', board_id: 3 });
    expect(opts.headers['Idempotency-Key']).toBeTruthy();
  });

  it('createCard reuses a caller-supplied idempotency key and strips it from the body', async () => {
    mockAxiosInstance.post.mockResolvedValueOnce({ data: { id: 9 } });
    await client.createCard({ title: 'New', board_id: 3, idempotency_key: 'my-key' });
    const [, data, opts] = mockAxiosInstance.post.mock.calls[0];
    expect(data).not.toHaveProperty('idempotency_key');
    expect(opts.headers['Idempotency-Key']).toBe('my-key');
  });

  it('updateCard PATCHes /cards/:id', async () => {
    mockAxiosInstance.patch.mockResolvedValueOnce({ data: { id: 5, title: 'Updated' } });
    const result = await client.updateCard(5, { title: 'Updated' });
    expect(result).toEqual({ id: 5, title: 'Updated' });
    expect(mockAxiosInstance.patch.mock.calls[0][0]).toBe('/cards/5');
    expect(mockAxiosInstance.patch.mock.calls[0][1]).toEqual({ title: 'Updated' });
  });

  it('deleteCard DELETEs /cards/:id', async () => {
    mockAxiosInstance.delete.mockResolvedValueOnce({ data: undefined });
    await client.deleteCard(5);
    expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/cards/5', { signal: undefined });
  });

  it('getCardChildren GETs /cards/:id/children', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({ data: [{ id: 1 }] });
    const children = await client.getCardChildren(5);
    expect(children).toEqual([{ id: 1 }]);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/cards/5/children', { signal: undefined });
  });
});

describe('comment operations', () => {
  it('getCardComments GETs /cards/:id/comments', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({ data: [{ id: 1, text: 'hi' }] });
    const comments = await client.getCardComments(5);
    expect(comments).toEqual([{ id: 1, text: 'hi' }]);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/cards/5/comments', { signal: undefined });
  });

  it('createComment POSTs text to /cards/:id/comments with an idempotency header', async () => {
    mockAxiosInstance.post.mockResolvedValueOnce({ data: { id: 1 } });
    await client.createComment(5, 'hello');
    const [url, data, opts] = mockAxiosInstance.post.mock.calls[0];
    expect(url).toBe('/cards/5/comments');
    expect(data).toEqual({ text: 'hello' });
    expect(opts.headers['Idempotency-Key']).toBeTruthy();
  });

  it('updateComment PATCHes /cards/:id/comments/:commentId', async () => {
    mockAxiosInstance.patch.mockResolvedValueOnce({ data: { id: 2 } });
    await client.updateComment(5, 2, 'edited');
    expect(mockAxiosInstance.patch.mock.calls[0][0]).toBe('/cards/5/comments/2');
    expect(mockAxiosInstance.patch.mock.calls[0][1]).toEqual({ text: 'edited' });
  });

  it('deleteComment DELETEs /cards/:id/comments/:commentId', async () => {
    mockAxiosInstance.delete.mockResolvedValueOnce({ data: undefined });
    await client.deleteComment(5, 2);
    expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/cards/5/comments/2', { signal: undefined });
  });
});

describe('searchCards', () => {
  it('applies default pagination and sorting in the query string', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({ data: [] });
    await client.searchCards({});
    const url: string = mockAxiosInstance.get.mock.calls[0][0];
    expect(url.startsWith('/cards?')).toBe(true);
    expect(url).toContain('limit=10');
    expect(url).toContain('skip=0');
    expect(url).toContain('sort_by=created');
    expect(url).toContain('sort_direction=desc');
  });

  it('serialises provided filters into the query string', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({ data: [] });
    await client.searchCards({ board_id: 7, query: 'bug', limit: 5 });
    const url: string = mockAxiosInstance.get.mock.calls[0][0];
    expect(url).toContain('limit=5');
    expect(url).toContain('board_id=7');
    expect(url).toContain('query=bug');
  });
});

describe('space / board discovery', () => {
  it('getSpaces GETs /spaces', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({ data: [{ id: 1 }] });
    expect(await client.getSpaces()).toEqual([{ id: 1 }]);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/spaces', { signal: undefined });
  });

  it('getBoards GETs /spaces/:id/boards', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({ data: [{ id: 10 }] });
    await client.getBoards(1);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/spaces/1/boards', { signal: undefined });
  });

  it('getColumns / getLanes / getTypes hit the right board endpoints', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: [] });
    await client.getColumns(2);
    await client.getLanes(2);
    await client.getTypes(2);
    const urls = mockAxiosInstance.get.mock.calls.map((c) => c[0]);
    expect(urls).toContain('/boards/2/columns');
    expect(urls).toContain('/boards/2/lanes');
    expect(urls).toContain('/boards/2/card_types');
  });
});

describe('user operations', () => {
  it('getCurrentUser GETs /users/current', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({ data: { id: 1, full_name: 'Me' } });
    expect(await client.getCurrentUser()).toEqual({ id: 1, full_name: 'Me' });
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/users/current', { signal: undefined });
  });

  it('getUsers passes query/limit/offset as params', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({ data: [] });
    await client.getUsers({ query: 'Ivanov', limit: 20, offset: 5 });
    const [url, opts] = mockAxiosInstance.get.mock.calls[0];
    expect(url).toBe('/users');
    expect(opts.params).toEqual({ query: 'Ivanov', limit: 20, offset: 5 });
  });

  it('getUsers omits params that were not provided', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({ data: [] });
    await client.getUsers();
    expect(mockAxiosInstance.get.mock.calls[0][1].params).toEqual({});
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
