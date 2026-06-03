# Kaiten MCP Server — Roadmap нереализованных фичей

Документ содержит список возможностей Kaiten API ([developers.kaiten.ru](https://developers.kaiten.ru/)), которые **не реализованы** в текущей версии MCP-сервера. Предназначен для формирования roadmap развития продукта.

**Текущая версия:** 2.3.0  
**Реализовано инструментов:** 26  
**Дата анализа:** 11 февраля 2026

---

## Реализованные возможности (для справки)

- **Карточки:** get, create, update, delete, search, get_space_cards, get_board_cards
- **Комментарии:** get, create, update, delete
- **Пространства и доски:** list_spaces, get_space, list_boards, get_board
- **Справочники:** list_columns, list_lanes, list_types
- **Пользователи:** get_current_user, list_users
- **Кеш и диагностика:** cache*invalidate*\*, get_status, set_log_level

---

## 1. Карточки — расширенные сущности

### 1.1 Связи родитель–потомок (Card Children)

| Endpoint               | Метод  | Описание                       | Приоритет |
| ---------------------- | ------ | ------------------------------ | --------- |
| `/cards/{id}/children` | POST   | Добавить подзадачи к карточке  | Высокий   |
| `/cards/{id}/children` | DELETE | Удалить связь родитель–потомок | Высокий   |

**Примечание:** `getCardChildren` уже есть в `KaitenClient`, но используется только внутри `kaiten_get_card`. Отдельного инструмента `kaiten_get_card_children` нет.

### 1.2 Члены карточки (Card Members)

| Endpoint              | Метод  | Описание                      | Приоритет |
| --------------------- | ------ | ----------------------------- | --------- |
| `/cards/{id}/members` | POST   | Добавить участника в карточку | Средний   |
| `/cards/{id}/members` | GET    | Список участников карточки    | Средний   |
| `/cards/{id}/members` | PATCH  | Обновить роль участника       | Средний   |
| `/cards/{id}/members` | DELETE | Удалить участника из карточки | Средний   |

### 1.3 Блокирующие пользователи (Card Blocker Users)

| Endpoint                    | Метод  | Описание                                      | Приоритет |
| --------------------------- | ------ | --------------------------------------------- | --------- |
| `/cards/{id}/blocker_users` | POST   | Добавить пользователя в блокировку            | Средний   |
| `/cards/{id}/blocker_users` | GET    | Список пользователей блокировки               | Средний   |
| `/cards/{id}/blocker_users` | DELETE | Удалить пользователя из блокировки            | Средний   |
| Card blockers               | PATCH  | Обновить блокировку карточки                  | Средний   |
| `/blocker_users/cards`      | GET    | Карточки с блокировками текущего пользователя | Низкий    |

### 1.4 Разрешённые пользователи (Card Allowed Users)

| Endpoint                    | Метод | Описание                                   | Приоритет |
| --------------------------- | ----- | ------------------------------------------ | --------- |
| `/cards/{id}/allowed_users` | GET   | Список пользователей с доступом к карточке | Низкий    |

---

## 2. Учёт времени (Time Logs)

| Endpoint                         | Метод  | Описание                      | Приоритет |
| -------------------------------- | ------ | ----------------------------- | --------- |
| `/cards/{id}/time_logs`          | POST   | Добавить запись учёта времени | Высокий   |
| `/cards/{id}/time_logs`          | GET    | Получить записи учёта времени | Высокий   |
| `/cards/{id}/time_logs/{log_id}` | PATCH  | Обновить запись               | Средний   |
| `/cards/{id}/time_logs/{log_id}` | DELETE | Удалить запись                | Средний   |

**Примечание:** Карточки возвращают `time_spent_sum`, `time_blocked_sum`, но сами записи time logs недоступны через MCP.

---

## 3. Чеклисты (Checklists)

| Endpoint                      | Метод  | Описание                      | Приоритет |
| ----------------------------- | ------ | ----------------------------- | --------- |
| `/cards/{id}/checklists`      | POST   | Добавить чеклист к карточке   | Высокий   |
| `/cards/{id}/checklists`      | GET    | Получить чеклисты карточки    | Высокий   |
| `/cards/{id}/checklists/{id}` | PATCH  | Обновить чеклист              | Средний   |
| `/cards/{id}/checklists/{id}` | DELETE | Удалить чеклист               | Средний   |
| Checklist items               | POST   | Добавить пункт в чеклист      | Высокий   |
| Checklist items               | PATCH  | Обновить пункт чеклиста       | Средний   |
| Checklist items               | DELETE | Удалить пункт чеклиста        | Средний   |
| Cards with checklist          | GET    | Карточки с чеклистами (поиск) | Низкий    |

---

## 4. Теги (Tags)

| Endpoint           | Метод  | Описание                | Приоритет |
| ------------------ | ------ | ----------------------- | --------- |
| `/cards/{id}/tags` | POST   | Добавить тег к карточке | Высокий   |
| `/cards/{id}/tags` | GET    | Список тегов карточки   | Средний   |
| `/cards/{id}/tags` | DELETE | Удалить тег с карточки  | Высокий   |

**Примечание:** Теги возвращаются в `simplifyCard` как `tags: string[]`, но управление тегами отсутствует.

---

## 5. Файлы (Card Files)

| Endpoint                 | Метод  | Описание                   | Приоритет |
| ------------------------ | ------ | -------------------------- | --------- |
| `/cards/{id}/files`      | PUT    | Прикрепить файл к карточке | Высокий   |
| `/cards/{id}/files/{id}` | PATCH  | Обновить метаданные файла  | Низкий    |
| `/cards/{id}/files/{id}` | DELETE | Открепить файл от карточки | Высокий   |

**Примечание:** Загрузка файлов через MCP потребует особой обработки (multipart/form-data, ограничения размера).

---

## 6. Внешние ссылки (External Links)

| Endpoint                          | Метод  | Описание                       | Приоритет |
| --------------------------------- | ------ | ------------------------------ | --------- |
| `/cards/{id}/external_links`      | POST   | Добавить внешнюю ссылку        | Средний   |
| `/cards/{id}/external_links`      | GET    | Список внешних ссылок карточки | Средний   |
| `/cards/{id}/external_links/{id}` | PATCH  | Обновить ссылку                | Низкий    |
| `/cards/{id}/external_links/{id}` | DELETE | Удалить ссылку                 | Средний   |

---

## 7. Пользовательские свойства (Custom Properties)

| Endpoint                     | Метод | Описание                                      | Приоритет |
| ---------------------------- | ----- | --------------------------------------------- | --------- |
| Properties                   | GET   | Список пользовательских свойств (с фильтрами) | Высокий   |
| Custom property score values | PATCH | Обновить score-значение                       | Низкий    |

**Примечание:** При создании/обновлении карточки API поддерживает поле `properties`. Сервер передаёт `custom_fields`, но полноценная работа со справочником свойств отсутствует.

---

## 8. SLA карточки

| Endpoint | Метод | Описание                      | Приоритет |
| -------- | ----- | ----------------------------- | --------- |
| Card SLA | GET   | Получить SLA-метрики карточки | Низкий    |

_Релевантно для Service Desk._

---

## 9. Аутоматизации (Automations)

| Endpoint    | Метод  | Описание               | Приоритет |
| ----------- | ------ | ---------------------- | --------- |
| Automations | POST   | Создать автоматизацию  | Средний   |
| Automations | GET    | Список автоматизаций   | Средний   |
| Automations | PATCH  | Обновить автоматизацию | Средний   |
| Automations | DELETE | Удалить автоматизацию  | Средний   |

---

## 10. Service Desk

| Endpoint                              | Метод  | Описание                     | Приоритет |
| ------------------------------------- | ------ | ---------------------------- | --------- |
| Service desk services                 | GET    | Список сервисов Service Desk | Низкий    |
| Card service desk external recipients | POST   | Добавить внешнего получателя | Низкий    |
| Card service desk external recipients | DELETE | Удалить получателя           | Низкий    |

---

## 11. Webhooks

| Концепция         | Описание                                                                            | Приоритет |
| ----------------- | ----------------------------------------------------------------------------------- | --------- |
| External Webhooks | Настройка webhooks выполняется в Kaiten UI. API не предоставляет CRUD для webhooks. | Инфо      |

**Примечание:** Webhooks отправляют события по Spaces, Boards, Cards, Blocks, Comments, Time Logs, Tags, Files. MCP-сервер может выступать **приёмником** webhooks (если развернуть HTTP-сервер), но не инициатором их создания через API.

---

## 12. Дополнительные справочники

| Endpoint            | Метод | Описание                                       | Приоритет |
| ------------------- | ----- | ---------------------------------------------- | --------- |
| Card types (global) | GET   | Список типов карточек (не привязанный к доске) | Низкий    |
| Group admins        | GET   | Список администраторов групп                   | Низкий    |

---

## 13. Расширения карточек (Create/Update)

Поля API, которые можно дополнительно поддерживать при создании/обновлении карточек:

| Поле                           | Описание                                    | Приоритет |
| ------------------------------ | ------------------------------------------- | --------- |
| `responsible_id`               | Ответственный (отдельно от owner)           | Средний   |
| `external_id`                  | Внешний идентификатор для интеграций        | Средний   |
| `position`                     | Позиция в колонке                           | Низкий    |
| `text_format_type_id`          | Формат текста (Markdown и т.п.)             | Низкий    |
| `expires_later`                | Флаг отложенного дедлайна                   | Низкий    |
| `size_text`                    | Текстовый размер (например, "S", "M", "XL") | Низкий    |
| `due_date_time_present`        | Дедлайн с точностью до минут                | Низкий    |
| `planned_start`, `planned_end` | Планируемые даты                            | Низкий    |

---

## Сводная таблица приоритетов

| Категория          | Высокий | Средний | Низкий |
| ------------------ | ------- | ------- | ------ |
| Card Children      | 2       | —       | —      |
| Card Members       | —       | 4       | —      |
| Card Blocker Users | —       | 4       | 1      |
| Time Logs          | 2       | 2       | —      |
| Checklists         | 4       | 3       | 1      |
| Tags               | 2       | 1       | —      |
| Files              | 2       | —       | 1      |
| External Links     | —       | 3       | 1      |
| Custom Properties  | 1       | —       | 1      |
| Automations        | —       | 4       | —      |
| Service Desk       | —       | —       | 3      |
| Другое             | —       | 2       | 6+     |

---

## Рекомендуемый порядок внедрения (Roadmap)

### Фаза 1 — Core расширения (v2.4)

1. ✅ **Card Children** — `kaiten_add_card_children`, `kaiten_remove_card_children`, `kaiten_get_card_children` (реализовано в v3.1.0)
2. **Time Logs** — `kaiten_add_time_log`, `kaiten_get_card_time_logs`
3. **Checklists** — `kaiten_add_checklist`, `kaiten_get_card_checklists`, `kaiten_add_checklist_item`, `kaiten_update_checklist_item`, `kaiten_delete_checklist_item`
4. **Tags** — `kaiten_add_card_tag`, `kaiten_remove_card_tag`

### Фаза 2 — Участники и блокировки (v2.5)

5. **Card Members** — `kaiten_add_card_member`, `kaiten_get_card_members`, `kaiten_remove_card_member`
6. **Card Blocker Users** — `kaiten_add_card_blocker`, `kaiten_remove_card_blocker`

### Фаза 3 — Файлы и ссылки (v2.6)

7. **Files** — `kaiten_attach_file`, `kaiten_get_card_files`, `kaiten_detach_file`
8. **External Links** — `kaiten_add_external_link`, `kaiten_get_card_external_links`, `kaiten_remove_external_link`

### Фаза 4 — Свойства и автоматизации (v2.7+)

9. **Custom Properties** — `kaiten_list_custom_properties`
10. **Automations** — `kaiten_list_automations`, `kaiten_create_automation`, `kaiten_update_automation`, `kaiten_delete_automation`
11. Расширение `create_card`/`update_card` (`responsible_id`, `external_id`, `properties`)

---

## Источники

- [Kaiten API Documentation](https://developers.kaiten.ru/)
- [Kaiten API — Create new card](https://developers.kaiten.ru/cards/create-new-card)
- [Kaiten API — Custom properties](https://developers.kaiten.ru/custom-properties/get-list-of-properties)
- [Kaiten API — External Webhooks](https://developers.kaiten.ru/external-webhooks)
- [Kaiten API — Addons](https://developers.kaiten.ru/addons)
- Текущая реализация: `src/kaiten-client.ts`, `src/index.ts`
