# Kaiten MCP Server

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

### 1. Установка

```bash
npm install
```

### 2. Настройка .env

```bash
cp .env.example .env
```

Заполните файл вашими данными:

```env
KAITEN_API_URL=https://your-domain.kaiten.ru/api/latest
KAITEN_API_TOKEN=your_api_token_here
KAITEN_DEFAULT_SPACE_ID=12345  # Ваш основной space_id
```

**Как получить API-токен:** войдите в Kaiten → настройки профиля → создайте новый
API-токен → скопируйте в `.env`.

### 3. Сборка

```bash
npm run build
```

### 4. Настройка Claude Desktop

Откройте конфигурационный файл:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Добавьте (замените путь на ваш полный путь к проекту):

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

Альтернатива без `.env` — передать переменные прямо в конфиге:

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

### 5. Перезапуск и проверка

Полностью закройте (⌘+Q / Alt+F4) и откройте Claude Desktop заново. Затем напишите:

```
Покажи список пространств Kaiten
```

## Установка через Docker

Сервер можно запускать из Docker-образа — без установки Node.js и локальной сборки.

```bash
docker build -t mcp-kaiten .   # или: npm run docker:build
```

Подключение в `claude_desktop_config.json`:

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
        "mcp-kaiten"
      ]
    }
  }
}
```

`--rm` удаляет контейнер после завершения, `-i` включает интерактивный режим
(необходим для MCP stdio). Не храните токены в конфиге, если клиент поддерживает
`${env:VAR}`.

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

1. Проверьте правильность пути в конфигурации Claude
2. Убедитесь, что проект собран: `npm run build`
3. Проверьте `.env`
4. Перезапустите Claude Desktop полностью (⌘+Q)

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
