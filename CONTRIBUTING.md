# Разработка

Руководство для тех, кто дорабатывает Kaiten MCP Server. Пользователям сервера
оно не нужно — см. [README.md](./README.md).

## Стек

- **Node.js:** версия 20 или выше (требование `engines`)
- **TypeScript:** 5.0+
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **API-клиент:** нативный `fetch` с retry/backoff и поддержкой `AbortSignal`

## Команды

```bash
npm install        # установка зависимостей
npm run build      # сборка TypeScript в dist/
npm run dev        # запуск в dev-режиме через tsx
npm run watch      # пересборка при изменениях
npm start          # запуск скомпилированного сервера
npm test           # юнит-тесты (Vitest)
npm run test:watch # тесты в watch-режиме (TDD)
npm run inspector  # тестирование через MCP Inspector
```

## Структура проекта

```
src/
├── index.ts          # Тонкая точка входа (stdio → createServer)
├── server.ts         # createServer(): McpServer + ресурсы/промпт
├── container.ts      # makeCtx(): сборка ServerContext (DI)
├── tools/            # 26 инструментов как глубокие модули
│   ├── index.ts      # ALL_TOOLS / TOOL_MAP
│   ├── kit.ts        # defineTool, ServerContext, mapError
│   ├── registry.ts   # registerTools() → McpServer.registerTool
│   └── <группа>/     # cards/ comments/ relations/ reference/ users/
├── kaiten-client.ts  # Kaiten API клиент
├── config.ts         # Конфигурация и валидация
├── cache.ts          # LRU кеш
├── schemas.ts        # Zod схемы (валидация + источник JSON-схем)
├── transformers.ts   # simplify*() — сжатие ответов
├── utils.ts          # Utility-функции
├── logging/          # Система логирования
│   ├── logger.ts     # Unified logger (singleton)
│   ├── file-logger.ts    # Pino file logger
│   ├── mcp-logger.ts     # MCP notifications logger
│   ├── metrics.ts        # Performance metrics collector
│   └── types.ts          # RFC 5424 уровни логов + типы
└── middleware/
    └── logging-middleware.ts  # HTTP logging helpers (native fetch)

docs/adr/             # Architecture Decision Records
test/                 # Vitest юнит- и характеризационные тесты
evaluations/          # Evaluation suite (шаблоны для проверки качества)
```

## Архитектура

26 инструментов — это самостоятельные «глубокие модули» в `src/tools/**`,
описанные через `defineTool`. `createServer()` собирает высокоуровневый `McpServer`
и регистрирует инструменты через `McpServer.registerTool`; JSON-схема каждого
инструмента **выводится из его Zod-схемы** (`schemas.ts` — единый источник истины),
поэтому рукописного массива JSON-Schema нет.

Каждый handler — это `(args, ctx)` без модульных глобалов; зависимости приходят
через инжектируемый `ServerContext` из `src/container.ts#makeCtx`. Подробности —
в [docs/adr/0001-defer-tool-middleware.md](docs/adr/0001-defer-tool-middleware.md).

Пользовательские ответы сжимаются хелперами `simplify*()` из `src/transformers.ts`
(убирают base64-аватары, permissions, UI-метаданные), что сокращает размер на 92–96 %.

## MCP I/O Protocol

MCP использует stdio-транспорт для общения между клиентом и сервером:

- **stdout** — только JSON-RPC протокольные сообщения (канал должен оставаться чистым)
- **stderr** — все логи, дебаг-информация, ошибки

**Никогда не используйте `console.log()`** — это ломает протокол. Логируйте через
`safeLog.info()` / `safeLog.error()` / `safeLog.warn()` / `safeLog.debug()` из
`src/config.ts` — обёртки пишут в stderr и автоматически редактируют токены.

При отладке смотрите stderr: `node dist/index.js 2>debug.log` или используйте
MCP Inspector.

## Добавление инструментов

Инструменты добавляются по TDD. Кратко:

1. Опишите Zod-схему в `src/schemas.ts` (каждое поле — с `.describe()`, текст
   попадает в публичную JSON-схему; держите `.strict()`).
2. При необходимости добавьте метод клиента в `src/kaiten-client.ts`, пробрасывая
   `signal?: AbortSignal`.
3. Создайте модуль `src/tools/<группа>/<tool>.ts` через `defineTool`; описание —
   в `descriptions.ts` группы. Handler использует `ctx.*`, без модульных глобалов.
4. Зарегистрируйте инструмент: импорт в `src/tools/index.ts` + добавление в `ALL_TOOLS`.
5. Напишите юнит-тест против фейкового `ServerContext`.
6. Обновите документацию и счётчик инструментов в `package.json`, `README.md`,
   `CHANGELOG.md`.

Полный пошаговый гайд с примерами кода — в [CLAUDE.md](./CLAUDE.md).

## Тестирование

Юнит-тесты живут в `test/` и запускаются на [Vitest](https://vitest.dev) через
`npm test`. Нужные ENV-переменные инжектирует `vitest.config.ts`, реальный `.env`
не требуется. Покрывается детерминированный слой:

- `test/schemas.test.ts` — Zod-валидация входа каждого инструмента
- `test/transformers.test.ts` — упрощатели ответов из `src/transformers.ts`
- `test/utils.test.ts` — verbosity-контроль + усечение ответов
- `test/cache.test.ts` — LRU-кеш get/set/TTL/инвалидация
- `test/config.test.ts` — `redactSecrets` + загрузка конфигурации
- `test/kaiten-client.test.ts` — методы API-клиента (глобальный `fetch` замокан)

При добавлении/изменении инструмента сначала пишите/правьте тест, наблюдайте падение,
затем реализуйте. Логику формирования ответов держите в `src/transformers.ts`
(не инлайнить в `src/index.ts`), чтобы она оставалась юнит-тестируемой.

## Обработка ошибок (для интеграций)

Сервер использует **два разных канала ошибок** — клиент должен обрабатывать оба.

### 1. Невалидный ввод → протокольная ошибка JSON-RPC `-32602`

Если аргументы не проходят схему (неверный тип, отсутствует обязательное поле или
вызван несуществующий инструмент), запрос отклоняется на уровне протокола MCP кодом
`-32602`. В клиентском SDK это приходит как **отклонённый промис (исключение)**:

```jsonc
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32602, "message": "Invalid arguments for tool kaiten_get_card: ..." } }
```

- Неизвестные/лишние ключи **молча отбрасываются** (схема объявляет
  `additionalProperties: false`), после чего вызов продолжается.
- Несуществующий инструмент → `-32602: Tool <name> not found`.

### 2. Бизнес/API-ошибки → результат с `isError: true`

Ошибки обращения к Kaiten API (и прочие runtime-ошибки) возвращаются как **обычный
результат инструмента** с флагом `isError: true` и JSON-конвертом в теле:

```jsonc
{
  "error": {
    "type": "NOT_FOUND",          // категория (см. ниже)
    "message": "Resource not found",
    "status": 404,                // HTTP-статус (если есть)
    "details": { ... },           // тело ответа API (если есть)
    "hint": "Check that the card_id, board_id, space_id, or other resource ID is correct"
  }
}
```

Поле `type` принимает одно из значений: `AUTH_ERROR` (401/403), `NOT_FOUND` (404),
`VALIDATION_ERROR` (422), `RATE_LIMITED` (429), `TIMEOUT`, `NETWORK_ERROR`,
`API_ERROR` (5xx и прочее), `UNKNOWN_ERROR`. Поле `hint` содержит подсказку по
устранению, когда она применима.

### Пакетные операции со связями (continue-on-error)

Инструменты `kaiten_add/remove_card_children` и `kaiten_add/remove_card_parents`
делают **по одному вызову API на каждый ID** и не прерываются на первой ошибке.
Они возвращают агрегированный результат, где ошибки по отдельным элементам встроены
в тело:

```jsonc
{
  "parent_card_id": 5001,
  "succeeded": [5002],
  "failed": [{ "child_card_id": 999999, "error": "Validation error — Check the request parameters for correctness" }],
  "summary": "1 added, 1 failed"
}
```

Флаг `isError: true` ставится только если **ни один** элемент не прошёл.

## Расширенное логирование

Логирование настраивается только через переменные окружения (`KAITEN_LOG_*`).
Runtime-инструменты управления логами удалены.

```env
KAITEN_LOG_ENABLED=true            # вкл/выкл логирование (по умолчанию: true)
KAITEN_LOG_LEVEL=error             # debug|info|notice|warning|error|critical|alert|emergency
KAITEN_LOG_MCP_ENABLED=false       # отправлять логи в MCP-клиент
KAITEN_LOG_FILE_ENABLED=false      # писать логи в файл
KAITEN_LOG_FILE_PATH=./logs/kaiten-mcp.log
KAITEN_LOG_REQUESTS=false          # логировать все HTTP-запросы
KAITEN_LOG_METRICS=false           # собирать метрики производительности
```

Готовые профили:

```env
# Production — минимальное логирование
KAITEN_LOG_LEVEL=error
KAITEN_LOG_FILE_ENABLED=false
KAITEN_LOG_REQUESTS=false
KAITEN_LOG_METRICS=false

# Development — умеренное логирование для отладки
KAITEN_LOG_LEVEL=info
KAITEN_LOG_FILE_ENABLED=true
KAITEN_LOG_METRICS=true

# Debug — полное логирование
KAITEN_LOG_LEVEL=debug
KAITEN_LOG_MCP_ENABLED=true
KAITEN_LOG_FILE_ENABLED=true
KAITEN_LOG_REQUESTS=true
KAITEN_LOG_METRICS=true
```

Логи выводятся в stderr. На macOS/Linux их можно смотреть через Console.app или
запустив клиент из терминала. Файловые логи лежат в `logs/` в формате JSON.

## Документация

- [CHANGELOG.md](./CHANGELOG.md) — история изменений
- [CLAUDE.md](./CLAUDE.md) — инструкции и полный гайд по добавлению инструментов
- [docs/adr/](./docs/adr/) — Architecture Decision Records
- [evaluations/README.md](./evaluations/README.md) — руководство по evaluation suite
- [Kaiten API Docs](https://developers.kaiten.ru/) — официальная документация API
