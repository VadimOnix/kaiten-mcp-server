# Kaiten MCP Server

[![npm](https://img.shields.io/npm/v/kaiten-mcp-server)](https://www.npmjs.com/package/kaiten-mcp-server)
[![docker](https://img.shields.io/docker/v/vadimkorolev/kaiten-mcp-server?label=docker&sort=semver)](https://hub.docker.com/r/vadimkorolev/kaiten-mcp-server)
[![release](https://github.com/VadimOnix/kaiten-mcp-server/actions/workflows/release.yml/badge.svg)](https://github.com/VadimOnix/kaiten-mcp-server/actions/workflows/release.yml)
[![license](https://img.shields.io/npm/l/kaiten-mcp-server)](./LICENSE)

MCP-сервер для интеграции Kaiten API с Claude Desktop. Позволяет управлять
карточками, комментариями, пространствами и досками Kaiten напрямую из Claude.

## Возможности

- **Карточки:** чтение, создание, обновление, удаление, поиск
- **Комментарии:** полная работа с комментариями карточек
- **Связи:** подзадачи, родительские карточки, участники и ответственные
- **Пространства и доски:** навигация по структуре Kaiten
- **Default Space:** автоматическая работа в выбранном пространстве
- **Контроль детализации:** уровни `minimal`/`normal`/`detailed` — экономия до 90 % токенов
- **Форматы ответа:** `json` или `markdown` под разные сценарии
- **Production-ready:** Zod-валидация, retry с backoff, rate limiting, LRU-кеш,
  понятные ошибки с подсказками, редакция токенов в логах

## Быстрый старт

**Понадобится API-токен Kaiten:** войдите в Kaiten → настройки профиля →
создайте новый API-токен.

Конфигурационный файл Claude Desktop:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

После любого изменения конфига полностью перезапустите Claude Desktop
(⌘+Q / Alt+F4) и проверьте: напишите в чате «Покажи список пространств Kaiten».

### Вариант 1 — npx (рекомендуется)

Ничего не нужно клонировать и собирать — только установленный
[Node.js 20+](https://nodejs.org). Пакет скачается из npm автоматически:

```json
{
  "mcpServers": {
    "kaiten": {
      "command": "npx",
      "args": ["-y", "kaiten-mcp-server"],
      "env": {
        "KAITEN_API_URL": "https://your-domain.kaiten.ru/api/latest",
        "KAITEN_API_TOKEN": "your_api_token_here",
        "KAITEN_DEFAULT_SPACE_ID": "12345"
      }
    }
  }
}
```

Для [Claude Code](https://claude.com/claude-code) — одна команда:

```bash
claude mcp add kaiten \
  -e KAITEN_API_URL=https://your-domain.kaiten.ru/api/latest \
  -e KAITEN_API_TOKEN=your_api_token_here \
  -e KAITEN_DEFAULT_SPACE_ID=12345 \
  -- npx -y kaiten-mcp-server
```

### Вариант 2 — Docker

Node.js не нужен. Готовый multi-arch образ (amd64/arm64) публикуется на
[Docker Hub](https://hub.docker.com/r/vadimkorolev/kaiten-mcp-server) при каждом релизе:

```json
{
  "mcpServers": {
    "kaiten": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "KAITEN_API_URL=https://your-domain.kaiten.ru/api/latest",
        "-e", "KAITEN_API_TOKEN=your_api_token_here",
        "-e", "KAITEN_DEFAULT_SPACE_ID=12345",
        "vadimkorolev/kaiten-mcp-server:latest"
      ]
    }
  }
}
```

`--rm` удаляет контейнер после завершения, `-i` включает интерактивный режим
(необходим для MCP stdio). Вместо `latest` можно закрепить версию: `:3`, `:3.5`,
`:3.5.1`. Не храните токены в конфиге, если клиент поддерживает `${env:VAR}`.

### Вариант 3 — из исходников

Для разработки или доработки под себя:

```bash
git clone https://github.com/VadimOnix/kaiten-mcp-server.git
cd kaiten-mcp-server
npm install
cp .env.example .env   # заполните KAITEN_API_URL / KAITEN_API_TOKEN / KAITEN_DEFAULT_SPACE_ID
npm run build
```

```json
{
  "mcpServers": {
    "kaiten": {
      "command": "node",
      "args": ["/полный/путь/к/kaiten-mcp-server/dist/index.js"],
      "cwd": "/полный/путь/к/kaiten-mcp-server"
    }
  }
}
```

Переменные можно передать и через блок `"env"` в конфиге вместо `.env` —
как в вариантах выше. Локальная сборка образа: `npm run docker:build`.

## Переменные окружения

| Переменная                       | Описание                                       |
| -------------------------------- | ---------------------------------------------- |
| `KAITEN_API_URL`                 | URL API, должен заканчиваться на `/api/latest` (обязательно) |
| `KAITEN_API_TOKEN`               | API-токен, минимум 20 символов (обязательно)   |
| `KAITEN_DEFAULT_SPACE_ID`        | ID пространства по умолчанию (рекомендуется)    |
| `KAITEN_MAX_CONCURRENT_REQUESTS` | Лимит одновременных запросов, 1–20 (по умолч. 5) |
| `KAITEN_CACHE_TTL_SECONDS`       | Время жизни кеша в секундах, 0 = выкл. (по умолч. 300) |
| `KAITEN_REQUEST_TIMEOUT_MS`      | Таймаут запроса в мс, 1–60000 (по умолч. 10000) |
| `KAITEN_INSECURE_SSL`            | `true` — отключить проверку SSL (для self-signed) |

Полный список, включая настройки логирования, — в `.env.example`.

## Доступные инструменты (28)

### Карточки

- `kaiten_get_card` — получить карточку по ID
- `kaiten_create_card` — создать карточку
- `kaiten_update_card` — обновить карточку (меняются только переданные поля)
- `kaiten_delete_card` — удалить карточку (необратимо)
- `kaiten_search_cards` — поиск карточек с фильтрами (текст, доска, статус, ответственный, даты, ASAP/просроченные), новые сверху

### Метки (теги)

- `kaiten_add_card_tags` — привязать метки к карточке по имени (массив имён; метка создаётся, если её ещё нет)
- `kaiten_remove_card_tags` — отвязать метки по имени (массив имён, регистронезависимо)

### Комментарии

- `kaiten_get_card_comments` — получить комментарии карточки
- `kaiten_create_comment` — создать комментарий
- `kaiten_update_comment` — обновить комментарий
- `kaiten_delete_comment` — удалить комментарий

### Подзадачи (card children)

- `kaiten_get_card_children` — получить дочерние карточки
- `kaiten_add_card_children` — привязать подзадачи (массив ID)
- `kaiten_remove_card_children` — отвязать подзадачи (массив ID)

### Родительские карточки

- `kaiten_get_card_parents` — получить родительские карточки
- `kaiten_add_card_parents` — привязать родителей (массив ID)
- `kaiten_remove_card_parents` — отвязать родителей (массив ID)

### Участники и ответственный

- `kaiten_get_card_members` — список участников карточки с ролями
- `kaiten_add_card_members` — добавить участников (batch)
- `kaiten_remove_card_members` — удалить участников / снять ответственного (batch)
- `kaiten_set_card_responsible` — назначить ответственного

### Пространства и доски

- `kaiten_list_spaces` — список всех пространств
- `kaiten_list_boards` — список досок

### Справочники (для корректных ID)

- `kaiten_list_columns` — список колонок (статусов) доски
- `kaiten_list_lanes` — список дорожек (lanes) доски
- `kaiten_list_types` — список типов карточек доски

### Пользователи

- `kaiten_get_current_user` — получить текущего пользователя
- `kaiten_list_users` — список пользователей

Параметр `verbosity` (`minimal`/`normal`/`detailed`) поддерживают `search_cards`,
`list_boards`, `list_users`, `get_card_children`, `get_card_parents`,
`get_card_members` и `get_card_comments`; `get_card` — выбор формата
(`json`/`markdown`). Примеры промтов — в [docs/USAGE.md](./docs/USAGE.md).

## Устранение неполадок

### Сервер не подключается

1. Проверьте JSON-конфиг: валидность, значения `KAITEN_*` в блоке `env`
2. npx-вариант: убедитесь, что `node --version` ≥ 20; Docker-вариант: что Docker запущен
3. Вариант «из исходников»: проект собран (`npm run build`), путь в `args` полный и правильный, `.env` заполнен
4. Перезапустите Claude Desktop полностью (⌘+Q / Alt+F4)

### Ошибки API

- Проверьте, что токен действителен и не истёк
- URL должен заканчиваться на `/api/latest`
- Проверьте права доступа токена в настройках Kaiten

### «unable to get local issuer certificate» (SSL)

Возникает за корпоративным proxy или с self-hosted Kaiten на самоподписанном
сертификате. Добавьте в окружение:

```env
KAITEN_INSECURE_SSL=true
```

Это отключает проверку SSL — используйте только в доверенных сетях.

### «Tool result is too large»

Указывайте `board_id` и фильтры вместо выгрузки всего пространства:

```
# Плохо
Найди карточки в пространстве 123

# Хорошо
Найди карточки на доске 456 в пространстве 123
```

## Документация

- [docs/USAGE.md](./docs/USAGE.md) — примеры промтов и сценарии использования
- [CONTRIBUTING.md](./CONTRIBUTING.md) — разработка, архитектура, тестирование
- [CHANGELOG.md](./CHANGELOG.md) — история изменений
- [Kaiten API Docs](https://developers.kaiten.ru/) — официальная документация API

## Лицензия

MIT
