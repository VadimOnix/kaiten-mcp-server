# Замена Axios на нативный `fetch`

**Дата:** 2026-06-04
**Статус:** Approved (design)
**Тип:** Рефакторинг (drop-in замена HTTP-транспорта)

## Цель

Убрать зависимости `axios` и `axios-retry` из `kaiten-mcp-server`, заменив HTTP-транспорт
на нативный Node.js `fetch` (Node >= 20). Поведение клиента должно сохраниться 1:1:
retry с экспоненциальным backoff, контроль конкурентности (p-queue), idempotency-key,
timeout, логирование и метрики HTTP-запросов.

## Решения (зафиксированы)

1. **Insecure SSL:** при `config.KAITEN_INSECURE_SSL === true` в конструкторе клиента
   выставляем `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` (вместо per-instance
   `https.Agent({ rejectUnauthorized: false })`). Без новых зависимостей. Сохраняем
   существующий `safeLog.warn`. Эффект глобальный на процесс, что приемлемо: клиент —
   синглтон, а фича предназначена для dev/corporate-сетей.
2. **Объём:** строгий drop-in. Публичный API `KaitenClient`, класс `KaitenError`, все
   типы ошибок и поведение ретраев сохраняются без изменений. Внутренняя реализация
   меняется на единый `request()`-хелпер.
3. **Retry-тесты:** добавляем — retry стал нашим кодом (раньше библиотека `axios-retry`),
   без тестов он не защищён.

## Архитектура

### 1. Приватный `request<T>()` в `KaitenClient` (`src/kaiten-client.ts`)

Заменяет `AxiosInstance`. Сигнатура:

```ts
private async request<T>(path: string, init?: {
  method?: string;                    // default 'GET'
  body?: unknown;                     // JSON.stringify внутри, если задан
  headers?: Record<string, string>;   // напр. { 'Idempotency-Key': key }
  signal?: AbortSignal;               // caller signal (ctx.signal)
}): Promise<T>
```

Шаги выполнения:

1. **URL.** `this.baseURL + path`. Методы сами собирают query-строку (как сейчас в
   `searchCards`, `getCardsFromBoard`, `getCardsFromSpace`). `getUsers` переводится на
   inline-сборку query через `URLSearchParams` (поле `params` не вводим — единообразие).
2. **Headers.** Дефолтные (`Authorization: Bearer <token>`, `Content-Type: application/json`,
   `User-Agent`) мёржатся с per-call `headers`.
3. **Timeout + отмена.** `AbortSignal.any([AbortSignal.timeout(config.KAITEN_REQUEST_TIMEOUT_MS),
   callerSignal].filter(Boolean))`. Ссылка на timeout-signal сохраняется локально, чтобы при
   abort различить TIMEOUT (сработал timeout) от ABORTED (отменил вызывающий).
4. **Retry-loop.** До 3 ретраев (4 попытки суммарно). Поведение зеркалит текущий `axios-retry`:
   - Ретраим при: сетевой ошибке (`fetch` бросил `TypeError`), timeout, статусах **429 / 408 / 5xx**.
   - **НЕ** ретраим caller-abort (внешний signal) — бросаем сразу.
   - Backoff: `1000 * 2^(retryCount-1) + jitter`, где `jitter = Math.random() * 500` (0–500 мс).
   - На 429 уважаем заголовок `Retry-After` (секунды → мс), как сейчас.
   - Логируем попытки ретрая через `safeLog.warn` (тексты сохраняем).
5. **Логирование/метрики.** Вызываем функции из `logging-middleware` (см. раздел 3) до/после fetch.
6. **Парсинг тела.** `const text = await res.text(); return text ? JSON.parse(text) : undefined;`
   Корректно обрабатывает пустой ответ (204 у `deleteCard`).
7. **Ошибки.** non-ok `Response` и брошенные ошибки нормализуются (раздел 2).

### 2. Нормализация ошибок (рефактор `handleAxiosError`)

Разбивается на две чистые функции. Все `KaitenErrorType`, сообщения и `hint`-ы сохраняются 1:1.

- `mapResponseError(status: number, headers: Headers, body: unknown): KaitenError`
  HTTP-ошибки: 401/403 → AUTH_ERROR, 404 → NOT_FOUND, 422 → VALIDATION_ERROR,
  429 → RATE_LIMITED (с `retry_after` из заголовка), 5xx → API_ERROR, прочее → API_ERROR.
- `mapNetworkError(err: unknown, isTimeout: boolean): KaitenError`
  timeout → TIMEOUT (`Request timeout after <ms>ms`); сетевая → NETWORK_ERROR с тем же
  SSL-детектором (regex по message/code: `certificate|issuer|UNABLE_TO_GET|CERT_HAS_EXPIRED|
  SELF_SIGNED|DEPTH_ZERO|SSL`) и тем же выбором hint в зависимости от `KAITEN_INSECURE_SSL`.

`KaitenError`, `KaitenErrorType` и `toJSON()` не меняются.

### 3. `src/middleware/logging-middleware.ts` — переписать под fetch

`setupLoggingMiddleware(axiosInstance)` удаляется (interceptors больше нет). Вместо него —
чистые функции, вызываемые из `request()`:

- `logHttpRequest({ method, url })` — debug-лог при `process.env.KAITEN_LOG_REQUESTS === 'true'`.
- `logHttpResponse({ method, url, status, durationMs })` — debug-лог (под тем же флагом)
  + `logger.recordMetric({ tool: 'http_request', latency_ms, success: true, timestamp })`.
- `logHttpError({ method, url, status, durationMs, message })` — `logger.error` +
  `logger.recordMetric({ ..., success: false, error })`.

Логика и формат метрик идентичны текущим. Модуль становится юнит-тестируемым (без axios).

### 4. Без изменений

- `p-queue` / `queuedRequest` — оборачивает `() => this.request(...)`, signal-логика та же.
- `lru-cache`, `pino`, `zod`, idempotency-генерация (`generateIdempotencyKey`).
- Публичный API `KaitenClient` (все методы и сигнатуры), `getQueueStatus()`.
- Все `Kaiten*` интерфейсы и `Create/UpdateCardParams`.

### 5. Insecure SSL

В конструкторе:
```ts
if (config.KAITEN_INSECURE_SSL) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  safeLog.warn('⚠️ SSL certificate verification is DISABLED ...'); // текст сохраняем
}
```
Импорт `https` удаляется.

### 6. package.json

- Удалить из `dependencies`: `axios`, `axios-retry`.
- Версию бампнуть (решим при реализации; вероятно minor 3.3.0 — внутренняя замена транспорта).

## Изменяемые методы клиента (механически)

Каждый публичный метод вида
```ts
return this.queuedRequest(async () => {
  const r = await this.client.get(`/cards/${id}`, { signal });
  return r.data;
}, signal);
```
становится
```ts
return this.queuedRequest(
  () => this.request<KaitenCard>(`/cards/${id}`, { signal }),
  signal,
);
```
Для мутаций — `{ method: 'POST'|'PATCH'|'DELETE', body, headers: { 'Idempotency-Key': key }, signal }`.

## Тестирование (TDD — тесты первыми)

### `test/kaiten-client.test.ts` — переписать
- Заменить мок `axios.create()` / `axios-retry` на `vi.stubGlobal('fetch', vi.fn())`.
- `fetch` возвращает `Response`-подобный объект: `{ ok, status, headers: new Headers(...),
  text: async () => JSON.stringify(data) }` (или реальный `new Response(...)`).
- Ассерты: `fetch.mock.calls[0]` → `[url, init]`. Проверяем полный URL (baseURL + path + query),
  `init.method`, `JSON.parse(init.body)`, `init.headers['Idempotency-Key']`.
- Покрыть все существующие методы (паритет с текущими кейсами): card CRUD, comments,
  searchCards (query-строка), spaces/boards/columns/lanes/types, users (query/limit/offset),
  card relationships, `getQueueStatus`.

### Новые тесты (retry + error-mapping)
- Retry на 5xx → успех со 2-й попытки (fake timers для backoff).
- Retry на сетевой ошибке (`fetch` reject `TypeError`).
- Уважение `Retry-After` на 429.
- Caller-abort не ретраится и даёт KaitenError ABORTED/UNKNOWN.
- Timeout → KaitenError TIMEOUT.
- Маппинг 401/403/404/422 → корректные `KaitenErrorType`.

### `test/` для logging-middleware (опционально, лёгкое)
- `logHttpResponse`/`logHttpError` вызывают `logger.recordMetric` с правильными полями.

## Риски и заметки

- `AbortSignal.any` доступен с Node 20.3+; `engines` уже требует Node >= 20. Проверить, что
  CI/целевая среда не на 20.0–20.2 (если да — собрать комбинированный signal вручную).
- Retry с реальным `setTimeout` в тестах требует fake timers, иначе тесты будут медленными.
- Success-path тесты не должны провоцировать ретраи (иначе появятся задержки).
- `fetch` бросает `TypeError` на сетевых сбоях и `DOMException`(name `AbortError`) на abort —
  это основа различения сетевой ошибки / timeout / отмены.
