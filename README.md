# Kaiten MCP Server

MCP сервер для интеграции Kaiten API с Claude Desktop. Позволяет управлять карточками, комментариями и пространствами Kaiten напрямую из Claude.

## Возможности

- **Карточки:** Чтение, создание, обновление, удаление, поиск
- **Комментарии:** Полная работа с комментариями карточек
- **Пространства и доски:** Навигация по структуре Kaiten
- **Поиск:** Продвинутый поиск с фильтрами
- **Default Space:** Автоматическая работа в выбранном пространстве
- **🎛️ Verbosity Control:** Управление детализацией ответов (minimal/normal/detailed) - экономия до 90% токенов
- **📊 Response Formats:** Выбор формата вывода (json/markdown) для разных сценариев
- **🛡️ Auto-truncation:** Автоматическая защита от переполнения контекста (100k символов)
- **🧪 Evaluation Suite:** Готовые шаблоны для тестирования качества работы
- **🔒 Production-Ready:**
  - Zod validation для всех параметров
  - Автоматический retry с exponential backoff
  - Concurrency control (rate limiting)
  - LRU кеш с TTL для spaces/boards/users
  - Расширенная обработка ошибок с hints
  - Редакция токенов в логах
  - Comprehensive logging & monitoring система

## Быстрый старт

### 1. Установка

```bash
npm install
```

### 2. Настройка .env

Создайте файл `.env`:

```bash
cp .env.example .env
```

Заполните его вашими данными:

```env
KAITEN_API_URL=https://your-domain.kaiten.ru/api/latest
KAITEN_API_TOKEN=your_api_token_here
KAITEN_DEFAULT_SPACE_ID=12345  # Ваш основной space_id

# Опциональные настройки производительности (значения по умолчанию)
KAITEN_MAX_CONCURRENT_REQUESTS=5     # Макс. одновременных запросов (1-20)
KAITEN_CACHE_TTL_SECONDS=300         # Время жизни кеша в секундах (0 = выкл.)
KAITEN_REQUEST_TIMEOUT_MS=10000      # Таймаут запроса в мс (1-60000)
```

**Как получить API токен:**

1. Войдите в Kaiten
2. Откройте настройки профиля
3. Создайте новый API токен
4. Скопируйте и вставьте в `.env`

### 3. Сборка

```bash
npm run build
```

### 4. Настройка Claude Desktop

Откройте конфигурационный файл:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Добавьте (замените путь на ваш полный путь):

```json
{
  "mcpServers": {
    "kaiten": {
      "command": "node",
      "args": ["/полный/путь/к/MCP Kaiten/dist/index.js"],
      "cwd": "/полный/путь/к/MCP Kaiten"
    }
  }
}
```

**Альтернативный способ (без .env):**

```json
{
  "mcpServers": {
    "kaiten": {
      "command": "node",
      "args": ["/полный/путь/к/MCP Kaiten/dist/index.js"],
      "env": {
        "KAITEN_API_URL": "https://your-domain.kaiten.ru/api/latest",
        "KAITEN_API_TOKEN": "your_api_token_here",
        "KAITEN_DEFAULT_SPACE_ID": "12345"
      }
    }
  }
}
```

### 5. Перезапустите Claude Desktop

Полностью закройте (⌘+Q / Alt+F4) и откройте Claude Desktop заново.

### 6. Проверка

---

## Установка через Docker (без локальной сборки)

Сервер можно запускать из готового Docker-образа — без установки Node.js и локальной сборки.

### Сборка образа

```bash
# Локальная сборка
docker build -t mcp-kaiten .

# Или через npm
npm run docker:build
```

### Публикация в реестр (опционально)

Для использования без локальной сборки — соберите и опубликуйте образ:

```bash
# Docker Hub
docker tag mcp-kaiten your-username/mcp-kaiten:latest
docker push your-username/mcp-kaiten:latest

# GitHub Container Registry
docker tag mcp-kaiten ghcr.io/your-org/kaiten-mcp-server:latest
docker push ghcr.io/your-org/kaiten-mcp-server:latest
```

В конфигурации MCP замените `mcp-kaiten` на полное имя образа (например, `ghcr.io/your-org/kaiten-mcp-server:latest`).

### Вариант A: Docker MCP Gateway (Docker Desktop + MCP Toolkit)

Если Cursor подключён к Docker MCP Gateway, добавьте Kaiten через каталог:

```bash
# 1. Соберите образ
docker build -t mcp-kaiten .

# 2. Импортируйте каталог (введите имя: kaiten-catalog)
docker mcp catalog import docker-mcp-catalog.yaml

# 3. Запустите gateway с каталогом Kaiten
docker mcp gateway run --catalog kaiten-catalog.yaml --servers mcp-kaiten
```

**Настройка в Docker Desktop:**

- **Secrets** → добавьте `mcp-kaiten.api-token` = ваш API токен Kaiten
- **Config** → настройте `mcp-kaiten` с `api-url` (https://your-domain.kaiten.ru/api/latest) и `space-id` (опционально)

### Вариант B: Прямое подключение (command: docker)

Добавьте в конфигурацию MCP (`claude_desktop_config.json` или Cursor settings):

```json
{
  "mcpServers": {
    "kaiten": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e",
        "KAITEN_API_URL=https://your-domain.kaiten.ru/api/latest",
        "-e",
        "KAITEN_API_TOKEN=your_api_token_here",
        "-e",
        "KAITEN_DEFAULT_SPACE_ID=12345",
        "mcp-kaiten"
      ]
    }
  }
}
```

**Важно:**

- `--rm` — удалять контейнер после завершения
- `-i` — интерактивный режим (необходим для MCP stdio)
- Переменные окружения передаются через `-e` (не храните токены в конфиге, используйте `${env:VAR}` если клиент поддерживает)

### Переменные окружения (опционально)

| Переменная                       | Описание                            |
| -------------------------------- | ----------------------------------- |
| `KAITEN_API_URL`                 | URL API (обязательно)               |
| `KAITEN_API_TOKEN`               | API токен (обязательно)             |
| `KAITEN_DEFAULT_SPACE_ID`        | ID пространства по умолчанию        |
| `KAITEN_MAX_CONCURRENT_REQUESTS` | Лимит одновременных запросов (1-20) |
| `KAITEN_CACHE_TTL_SECONDS`       | Время жизни кеша (0 = выкл.)        |
| `KAITEN_REQUEST_TIMEOUT_MS`      | Таймаут запросов (мс)               |

### Пример с переменными из окружения хоста (macOS/Linux)

```json
{
  "mcpServers": {
    "kaiten": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e",
        "KAITEN_API_URL=${env:KAITEN_API_URL}",
        "-e",
        "KAITEN_API_TOKEN=${env:KAITEN_API_TOKEN}",
        "-e",
        "KAITEN_DEFAULT_SPACE_ID=${env:KAITEN_DEFAULT_SPACE_ID}",
        "mcp-kaiten"
      ]
    }
  }
}
```

### Проверка

Напишите в Claude:

```
Покажи список пространств Kaiten
```

## Доступные инструменты (22 tools)

### Карточки

- `kaiten_get_card` - Получить карточку по ID **[format: json/markdown]**
- `kaiten_create_card` - Создать новую карточку
- `kaiten_update_card` - Обновить карточку
- `kaiten_delete_card` - Удалить карточку
- `kaiten_search_cards` - Поиск карточек с фильтрами (фильтрация по space_id/board_id заменяет отдельные списки) **[verbosity: minimal/normal/detailed]**

### Комментарии

- `kaiten_get_card_comments` - Получить комментарии карточки
- `kaiten_create_comment` - Создать комментарий
- `kaiten_update_comment` - Обновить комментарий
- `kaiten_delete_comment` - Удалить комментарий

### Подзадачи (Card Children)

- `kaiten_get_card_children` - Получить дочерние карточки (подзадачи) **[verbosity: minimal/normal/detailed]**
- `kaiten_add_card_children` - Привязать подзадачи (массив ID, continue-on-error)
- `kaiten_remove_card_children` - Отвязать подзадачи (массив ID, continue-on-error)

### Родительские карточки (Card Parents)

- `kaiten_get_card_parents` - Получить родительские карточки **[verbosity: minimal/normal/detailed]**
- `kaiten_add_card_parents` - Привязать родителей (массив ID, continue-on-error)
- `kaiten_remove_card_parents` - Отвязать родителей (массив ID, continue-on-error)

### Пространства и доски

- `kaiten_list_spaces` - Список всех пространств
- `kaiten_list_boards` - Список досок **[verbosity: minimal/normal/detailed]**

### Справочники (для корректных ID)

- `kaiten_list_columns` - Список колонок (статусов) доски
- `kaiten_list_lanes` - Список дорожек (lanes/swimlanes) доски
- `kaiten_list_types` - Список типов карточек доски

### Пользователи

- `kaiten_get_current_user` - Получить текущего пользователя
- `kaiten_list_users` - Список пользователей **[verbosity: minimal/normal/detailed]**

> Инструменты управления кешем и runtime-диагностики/логирования удалены: кеш истекает автоматически по TTL, а логирование настраивается через переменные окружения (`KAITEN_LOG_*`). Списки `get_space_cards`/`get_board_cards` и геттеры `get_space`/`get_board` убраны в пользу `kaiten_search_cards` и `kaiten_list_*`.

## Примеры использования

### Базовые операции

```
Покажи карточку 789
```

```
Создай карточку "Исправить баг" на доске 456 с описанием "Проблема с авторизацией"
```

```
Обнови карточку 789: измени статус на 3
```

```
Добавь комментарий к карточке 789: "Работа завершена"
```

### Verbosity Control - Экономия токенов

**Minimal** - Ультра-компактный формат (90% экономия):

```
Найди карточки на доске 456 с minimal verbosity
# Вывод: 1. [12345] Fix bug
#        2. [12346] Add feature
```

**Normal** - Сбалансированный (по умолчанию, 80% экономия):

```
Найди карточки на доске 456
# Вывод: полная информация с owner, board, статусом, URL
```

**Detailed** - Полный API response:

```
Найди карточки на доске 456 с detailed verbosity
# Вывод: все метаданные, permissions, внутренние поля
```

**Когда использовать:**

- `minimal` - Быстрый поиск, получение ID, краткие списки
- `normal` - Работа с карточками, обычные задачи (по умолчанию)
- `detailed` - Отладка, интеграции, нужны все поля

### Response Format Control

**Markdown** - Человеко-читаемый (по умолчанию):

```
Покажи карточку 12345
# Вывод: # Card Title
#        🔗 https://...
#        📋 Board: ...
```

**JSON** - Структурированные данные:

```
Покажи карточку 12345 в JSON формате
# Вывод: {"id": 12345, "title": "...", ...}
```

**Когда использовать:**

- `markdown` - Показ пользователю, презентация (по умолчанию)
- `json` - Интеграции, программная обработка, парсинг

### Поиск

```
Найди карточки со словом "авторизация" на доске 456
```

```
Покажи мои карточки в пространстве 123
```

```
Найди все карточки в работе на доске 456
```

### Default Space

По умолчанию все операции выполняются в пространстве, указанном в `KAITEN_DEFAULT_SPACE_ID`. Это делает команды короче:

```
Найди карточку про Болгарию
# Автоматически ищет в DEFAULT_SPACE_ID
```

Для поиска во всех пространствах явно укажите:

```
Найди карточку про Болгарию во ВСЕХ пространствах
```

**Как работает Default Space:**

- Все card-операции автоматически используют `KAITEN_DEFAULT_SPACE_ID`
- Для поиска в других пространствах укажите `space_id` явно
- Для поиска везде явно попросите "во всех пространствах"

## Оптимизация и производительность

### ✅ Лучшие практики поиска

**DO (Делайте так):**

```
Найди карточки "баг" на доске 456
```

**DON'T (Не делайте так):**

```
Покажи все карточки пространства и найди среди них "баг"
```

### Параметры поиска

- `limit` - количество карточек (по умолчанию 10)
- `sort_by` - сортировка: `created`, `updated`, `title`
- `sort_direction` - направление: `asc`, `desc`
- `condition` - 1=активные (по умолчанию), 2=архивные

### Примеры с параметрами

```
Найди 20 карточек на доске 456
```

```
Покажи архивные карточки на доске 456
```

```
Найди карточки на доске 456, отсортированные по дате обновления
```

## Структура проекта

> Архитектура: 22 инструмента — это самостоятельные «глубокие модули» в `src/tools/**`,
> описанные через `defineTool`. `createServer()` собирает высокоуровневый `McpServer`
> и регистрирует инструменты через `McpServer.registerTool`; JSON-схема каждого
> инструмента **выводится из его Zod-схемы** (единый источник истины), поэтому
> рукописный массив JSON-Schema удалён. Подробности — в `docs/adr/0001-defer-tool-middleware.md`.

```
MCP Kaiten/
├── src/
│   ├── index.ts          # Тонкая точка входа (stdio → createServer)
│   ├── server.ts         # createServer(): McpServer + ресурсы/промпт
│   ├── container.ts      # makeCtx(): сборка ServerContext (DI)
│   ├── tools/            # 22 инструмента как глубокие модули
│   │   ├── index.ts      # ALL_TOOLS / TOOL_MAP
│   │   ├── kit.ts        # defineTool, ServerContext, mapError
│   │   ├── registry.ts   # registerTools() → McpServer.registerTool
│   │   └── <группа>/     # cards/ comments/ relations/ reference/ users/
│   ├── kaiten-client.ts  # Kaiten API клиент
│   ├── config.ts         # Конфигурация и валидация
│   ├── cache.ts          # LRU кеш
│   ├── schemas.ts        # Zod схемы (валидация + источник JSON-схем)
│   ├── transformers.ts   # simplify*() — сжатие ответов
│   ├── utils.ts          # Utility functions (11 helpers)
│   ├── logging/          # Система логирования
│   │   ├── index.ts      # Экспорты
│   │   ├── types.ts      # TypeScript типы
│   │   ├── logger.ts     # Unified logger (singleton)
│   │   ├── file-logger.ts    # Pino file logger
│   │   ├── mcp-logger.ts     # MCP notifications logger
│   │   └── metrics.ts        # Performance metrics collector
│   └── middleware/       # HTTP middleware
│       └── logging-middleware.ts  # Axios logging interceptor
├── docs/adr/             # Architecture Decision Records
├── test/                 # Vitest unit + characterization tests
├── evaluations/          # Evaluation suite
│   ├── README.md         # Руководство по evaluations
│   └── kaiten-eval-template.xml  # Шаблон с 10 вопросами
├── logs/                 # Файлы логов (в .gitignore)
├── dist/                 # Скомпилированные файлы
├── .env                  # Конфигурация (не в git)
├── .env.example          # Пример конфигурации
├── tsconfig.json         # TypeScript конфигурация
├── package.json
├── README.md             # Этот файл
├── CHANGELOG.md          # История изменений
└── CLAUDE.md             # Инструкции для Claude Code
```

## Возможности карточек

При получении карточки возвращаются следующие поля:

```json
{
  "id": 12345,
  "title": "Название карточки",
  "url": "https://your-domain.kaiten.ru/space/12345/card/12345",
  "description": "Полное описание...",
  "created": "2025-07-23T07:55:52.934Z",
  "updated": "2025-10-01T12:14:47.754Z",
  "state": 2,
  "owner_id": 67890,
  "owner_name": "Иван Иванов",
  "board_id": 54321,
  "board_title": "Project Board",
  "blocked": true,
  "block_reason": "Ожидание данных от команды",
  "blocked_at": "2025-08-04T09:10:22.528Z",
  "blocker_name": "Иван Иванов",
  "archived": false,
  "tags": ["важно", "срочно"],
  "members": ["Иван Иванов", "Мария Петрова"],
  "due_date": "2025-10-19T00:00:00.000Z"
}
```

## Устранение неполадок

### "No server info found" / "Server not yet created" (Docker MCP Gateway)

Эти ошибки появляются, когда Cursor подключён к Docker MCP Gateway, но сервер Kaiten не добавлен в каталог.

1. Импортируйте каталог: `docker mcp catalog import docker-mcp-catalog.yaml` (имя: kaiten-catalog)
2. Запустите gateway **с нашим каталогом**: `docker mcp gateway run --catalog kaiten-catalog.yaml --servers mcp-kaiten`
3. Настройте в Docker Desktop: секрет `mcp-kaiten.api-token`, config `mcp-kaiten` с `api-url` и `space-id`
4. Проверьте: `docker mcp tools ls --verbose` — должны появиться инструменты Kaiten

Альтернатива: используйте **Вариант B** (прямое подключение `command: docker`) — не требует Docker MCP Gateway.

### Сервер не подключается

1. Проверьте правильность пути в конфигурации Claude
2. Убедитесь, что проект собран: `npm run build`
3. Проверьте `.env` файл
4. Перезапустите Claude Desktop полностью (⌘+Q)

### Ошибки API

- Проверьте, что токен действителен
- URL должен заканчиваться на `/api/latest`
- Проверьте права доступа токена в настройках Kaiten

### "unable to get local issuer certificate" (SSL ошибка)

Ошибка возникает при работе в Docker, за корпоративным proxy или при self-hosted Kaiten с самоподписанным сертификатом.

**Решения:**

1. **Docker:** Образ уже включает `ca-certificates`. Пересоберите: `docker build -t mcp-kaiten .`

2. **Корпоративный proxy / self-signed cert:** Добавьте в окружение:
   ```env
   KAITEN_INSECURE_SSL=true
   ```
   ⚠️ Отключает проверку SSL — используйте только в доверенных сетях.

3. **Docker с переменной окружения:**
   ```json
   "args": ["run", "--rm", "-i", "-e", "KAITEN_INSECURE_SSL=true", "-e", "KAITEN_API_URL=...", "-e", "KAITEN_API_TOKEN=...", "mcp-kaiten"]
   ```

### Ошибка "Tool result is too large"

Используйте фильтры и параметр `board_id`:

```
# Плохо
Найди карточки в пространстве 123

# Хорошо
Найди карточки на доске 456 в пространстве 123
```

### Отладка

**Продвинутое логирование**

Сервер поддерживает гибкую систему логирования для отладки и мониторинга. Все настройки логирования можно контролировать через переменные окружения или в runtime с помощью инструмента `kaiten_set_log_level`.

#### Переменные окружения (опционально):

```env
# Включить/выключить логирование (по умолчанию: true)
KAITEN_LOG_ENABLED=true

# Уровень логирования (по умолчанию: error)
# debug | info | notice | warning | error | critical | alert | emergency
KAITEN_LOG_LEVEL=error

# Отправлять логи в MCP клиент (по умолчанию: false)
KAITEN_LOG_MCP_ENABLED=false

# Записывать логи в файл (по умолчанию: false)
KAITEN_LOG_FILE_ENABLED=false

# Путь к файлу логов (по умолчанию: ./logs/kaiten-mcp.log)
KAITEN_LOG_FILE_PATH=./logs/kaiten-mcp.log

# Логировать все HTTP запросы (по умолчанию: false)
KAITEN_LOG_REQUESTS=false

# Собирать метрики производительности (по умолчанию: false)
KAITEN_LOG_METRICS=false
```

#### Готовые профили:

**Production (минимальное логирование):**

```env
KAITEN_LOG_LEVEL=error
KAITEN_LOG_FILE_ENABLED=false
KAITEN_LOG_REQUESTS=false
KAITEN_LOG_METRICS=false
```

**Development (умеренное логирование для отладки):**

```env
KAITEN_LOG_LEVEL=info
KAITEN_LOG_FILE_ENABLED=true
KAITEN_LOG_REQUESTS=false
KAITEN_LOG_METRICS=true
```

**Debug (полное логирование для глубокого анализа):**

```env
KAITEN_LOG_LEVEL=debug
KAITEN_LOG_MCP_ENABLED=true
KAITEN_LOG_FILE_ENABLED=true
KAITEN_LOG_REQUESTS=true
KAITEN_LOG_METRICS=true
```

#### Runtime управление логированием:

Используйте инструмент `kaiten_set_log_level` для изменения конфигурации без перезапуска:

```
# Включить debug режим
Установи уровень логирования debug с файлами и метриками

# Выключить всё логирование
Установи уровень логирования off

# Включить только метрики производительности
Установи уровень логирования info с метриками
```

#### Просмотр логов:

Логи сервера выводятся в stderr. На macOS/Linux их можно посмотреть через Console.app или запустив Claude из терминала. Файловые логи находятся в директории `logs/` в формате JSON (для дальнейшего анализа).

#### Метрики производительности:

При включенных метриках (`KAITEN_LOG_METRICS=true`) используйте `kaiten_get_status` для просмотра:

```
Покажи статус сервера
```

Метрики включают:

- Общее количество запросов
- Агрегированная статистика по инструментам (latency, success rate, cache hit rate)
- Последние 100 запросов с деталями

## Технические детали

- **Node.js:** Версия 20 или выше (требование `engines`)
- **TypeScript:** 5.0+
- **MCP SDK:** @modelcontextprotocol/sdk v1.20.0
- **API Client:** axios с retry/backoff и AbortSignal support
- **Размер:** ~600 строк TypeScript, 25KB скомпилированного кода

### MCP I/O Protocol

**Критично для отладки:** MCP использует stdio-транспорт для общения между клиентом и сервером.

- **stdout** — только JSON-RPC протокольные сообщения (чистый канал связи)
- **stderr** — все логи, дебаг-информация, ошибки

**Важно:**

- Любой `console.log()` в коде нарушает протокол → используйте `console.error()` для логов
- Этот сервер гарантирует чистоту stdout через `safeLog` wrapper (src/config.ts:126-152)
- При отладке смотрите stderr: `node dist/index.js 2>debug.log` или используйте MCP Inspector

Подробнее: [Build an MCP server](https://modelcontextprotocol.io/docs/getting-started/build-an-mcp-server)

## Лицензия

MIT

## Документация

- **[CHANGELOG.md](./CHANGELOG.md)** - История изменений
- **[CLAUDE.md](./CLAUDE.md)** - Инструкции для Claude Code разработки
- **[evaluations/README.md](./evaluations/README.md)** - Руководство по evaluation suite
- **[Kaiten API Docs](https://developers.kaiten.ru/)** - Официальная документация API
