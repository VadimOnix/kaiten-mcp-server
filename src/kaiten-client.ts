import { default as PQueue } from 'p-queue';
import { randomBytes } from 'crypto';
import { config, safeLog } from './config.js';
import { logger } from './logging/index.js';
import { logHttpRequest, logHttpResponse, logHttpError } from './middleware/logging-middleware.js';
import { VERSION } from './version.js';

// ============================================
// ENHANCED ERROR TYPES
// ============================================

export enum KaitenErrorType {
  AUTH_ERROR = 'AUTH_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  NOT_FOUND = 'NOT_FOUND',
  TIMEOUT = 'TIMEOUT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  API_ERROR = 'API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class KaitenError extends Error {
  constructor(
    public type: KaitenErrorType,
    message: string,
    public status?: number,
    public details?: any,
    public hint?: string
  ) {
    super(message);
    this.name = 'KaitenError';
  }

  toJSON() {
    return {
      type: this.type,
      message: this.message,
      status: this.status,
      details: this.details,
      hint: this.hint,
    };
  }
}

// ============================================
// ENHANCED TYPES
// ============================================

export interface KaitenUser {
  id: number;
  full_name: string;
  email?: string;
  username?: string;
  activated?: boolean;
}

export interface KaitenBoard {
  id: number;
  title: string;
  space_id?: number;
  archived?: boolean;
}

export interface KaitenColumn {
  id: number;
  title: string;
}

export interface KaitenLane {
  id: number;
  title: string;
}

export interface KaitenType {
  id: number;
  name: string;
}

export interface KaitenTag {
  name: string;
}

export interface KaitenBlocker {
  reason?: string;
  created?: string;
  blocker?: {
    full_name: string;
  };
}

export interface KaitenCard {
  id: number;
  title: string;
  description?: string;
  state?: number;
  board_id?: number;
  column_id?: number;
  lane_id?: number;
  position?: number;
  type_id?: number;
  size?: number;
  asap?: boolean;
  blocked?: boolean;
  blocked_by_id?: number;
  due_date?: string;
  owner_id?: number;
  created?: string;
  updated?: string;
  archived?: string | null;
  space_id?: number;
  board?: KaitenBoard;
  owner?: KaitenUser;
  column?: KaitenColumn;
  lane?: KaitenLane;
  type?: KaitenType;
  tags?: KaitenTag[];
  members?: KaitenUser[];
  blockers?: KaitenBlocker[];
  comments_total?: number;
  comment_last_added_at?: string;
  properties?: Record<string, any>;
  custom_fields?: Record<string, any>;
  // Card relationships (counts from API)
  parents_count?: number;
  children_count?: number;
  children_done?: number;
  // Populated by additional requests
  parent_cards?: KaitenCard[];
  children_cards?: KaitenCard[];
}

export interface KaitenComment {
  id: number;
  card_id: number;
  author_id?: number;
  author?: KaitenUser;
  text: string;
  created: string;
  updated?: string;
}

export interface KaitenMember extends KaitenUser {
  /** Role on the card: 1 = participant (участник), 2 = responsible (ответственный). */
  type?: number;
}

export interface KaitenMemberRole {
  created?: string;
  updated?: string;
  card_id: number;
  user_id: number;
  type: number;
}

export interface KaitenSpace {
  id: number;
  title: string;
  description?: string;
  archived?: boolean;
  boards?: KaitenBoard[];
}

export interface CreateCardParams {
  title: string;
  board_id: number;
  column_id?: number;
  lane_id?: number;
  description?: string;
  type_id?: number;
  size?: number;
  asap?: boolean;
  owner_id?: number;
  due_date?: string;
  custom_fields?: Record<string, any>;
  idempotency_key?: string;
}

export interface UpdateCardParams {
  title?: string;
  description?: string;
  state?: number;
  column_id?: number;
  lane_id?: number;
  type_id?: number;
  size?: number;
  asap?: boolean;
  owner_id?: number;
  due_date?: string;
  custom_fields?: Record<string, any>;
  idempotency_key?: string;
}

// ============================================
// KAITEN CLIENT WITH RETRY/BACKOFF/CONCURRENCY
// ============================================

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
      'User-Agent': `mcp-kaiten/${VERSION} (+https://github.com/VadimOnix/kaiten-mcp-server)`,
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

  // Wrap all requests with queue for concurrency control
  private async queuedRequest<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    // If signal is already aborted, throw immediately
    if (signal?.aborted) {
      throw new KaitenError(
        KaitenErrorType.UNKNOWN_ERROR,
        'Request aborted before execution',
        undefined,
        { code: 'ABORTED' },
        'The operation was cancelled by the client'
      );
    }

    // Add task to queue with signal support
    return this.queue.add(
      async ({ signal: queueSignal }: { signal?: AbortSignal } = {}) => {
        // Use external signal if provided, otherwise use queue's signal
        const effectiveSignal = signal || queueSignal;

        // Check again before executing
        if (effectiveSignal?.aborted) {
          throw new KaitenError(
            KaitenErrorType.UNKNOWN_ERROR,
            'Request aborted',
            undefined,
            { code: 'ABORTED' },
            'The operation was cancelled'
          );
        }

        return fn();
      },
      { signal } // Pass signal to p-queue for cancellation support
    ) as Promise<T>;
  }

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

  // Card member operations
  async getCardMembers(cardId: number, signal?: AbortSignal): Promise<KaitenMember[]> {
    return this.queuedRequest(() => this.request<KaitenMember[]>(`/cards/${cardId}/members`, { signal }), signal);
  }

  async addCardMember(cardId: number, userId: number, signal?: AbortSignal): Promise<KaitenMember> {
    return this.queuedRequest(
      () => this.request<KaitenMember>(`/cards/${cardId}/members`, { method: 'POST', body: { user_id: userId }, signal }),
      signal,
    );
  }

  async removeCardMember(cardId: number, userId: number, signal?: AbortSignal): Promise<{ id: number }> {
    return this.queuedRequest(
      () => this.request<{ id: number }>(`/cards/${cardId}/members/${userId}`, { method: 'DELETE', signal }),
      signal,
    );
  }

  async setCardResponsible(cardId: number, userId: number, signal?: AbortSignal): Promise<KaitenMemberRole> {
    // The PATCH role endpoint only works on existing members. Ensure membership
    // first; if the user is already a member the add call errors — swallow it and
    // proceed. A genuinely invalid card/user surfaces on the PATCH below.
    try {
      await this.addCardMember(cardId, userId, signal);
    } catch {
      // already a member (or add not required) — continue to set the role
    }
    return this.queuedRequest(
      () => this.request<KaitenMemberRole>(`/cards/${cardId}/members/${userId}`, { method: 'PATCH', body: { type: 2 }, signal }),
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
