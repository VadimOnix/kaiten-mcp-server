# Card Children — дизайн-спецификация

**Дата:** 2026-06-03
**Фаза роадмапа:** Фаза 1, пункт 1 — Card Children
**Базовая версия:** 3.0.0 (16 инструментов) → целевая 3.1.0 (19 инструментов)
**Статус:** утверждён, синхронизирован с `main` v3.0.0

> **Синхронизация с v3.0.0.** На `main` тулсет урезан 26→16, трансформеры
> вынесены в `src/transformers.ts`, verbosity-хелперы — в `src/utils.ts`, добавлен
> Vitest-набор в `test/`. Удалены инструменты: `kaiten_get_space`,
> `kaiten_get_board`, `kaiten_get_space_cards`, `kaiten_get_board_cards`,
> `kaiten_cache_invalidate_*` (×4), `kaiten_get_status`, `kaiten_set_log_level`.
> Спецификация ниже отражает это новое состояние.

## Цель

Добавить полноценное управление связями родитель–потомок (подзадачами) карточек
Kaiten через MCP. Сейчас клиентский метод `getCardChildren` существует, но
используется только внутри `kaiten_get_card`; отдельных инструментов для чтения,
добавления и удаления подзадач нет.

## Контракт Kaiten API

Источник: [developers.kaiten.ru](https://developers.kaiten.ru/), раздел Card children.

| Операция | Метод | Путь | Тело / path-параметры | Ответ |
|----------|-------|------|------------------------|-------|
| Получить детей | GET | `/cards/{card_id}/children` | — | массив объектов карточек |
| Добавить ребёнка | POST | `/cards/{card_id}/children` | body `{ "card_id": <child_id> }` | объект карточки |
| Удалить связь | DELETE | `/cards/{card_id}/children/{id}` | path: `card_id` (родитель), `id` (ребёнок) | `{ "id": <deleted_relation_id> }` |

Ключевая особенность: API добавляет/удаляет **по одному ребёнку за вызов**. Поле
`card_id` в теле POST — это ID одной дочерней карточки.

## Инструменты MCP (3 новых)

| Инструмент | API | Параметры | Поведение |
|-----------|-----|-----------|-----------|
| `kaiten_get_card_children` | GET `/cards/{id}/children` | `card_id`, `verbosity?` | Список дочерних карточек через `applyCardVerbosity` (из `src/utils.ts`) |
| `kaiten_add_card_children` | POST `/cards/{id}/children` (×N) | `card_id`, `child_card_ids: number[]` | Привязывает массив подзадач, по одному вызову на ID |
| `kaiten_remove_card_children` | DELETE `/cards/{id}/children/{childId}` (×N) | `card_id`, `child_card_ids: number[]` | Отвязывает массив подзадач |

### Решение: массив ID вместо одного

Инструменты add/remove принимают `child_card_ids: number[]` (а не один ID), хотя
API работает по одному. Это удобнее для типичного сценария «привязать пачку
подзадач за раз». Цикл по массиву живёт в обработчике инструмента (`src/index.ts`),
а не в клиенте — клиент остаётся 1:1 с API.

## Слои реализации

### 1. `src/kaiten-client.ts` — 2 новых метода

Рядом с существующим `getCardChildren` (≈ строка 591), в секции `// Card relationships`:

```typescript
async addCardChild(cardId: number, childCardId: number, signal?: AbortSignal): Promise<KaitenCard> {
  return this.queuedRequest(async () => {
    const response = await this.client.post(`/cards/${cardId}/children`, { card_id: childCardId }, { signal });
    return response.data;
  }, signal);
}

async removeCardChild(cardId: number, childCardId: number, signal?: AbortSignal): Promise<{ id: number }> {
  return this.queuedRequest(async () => {
    const response = await this.client.delete(`/cards/${cardId}/children/${childCardId}`, { signal });
    return response.data;
  }, signal);
}
```

Каждый метод обёрнут в `queuedRequest` — наследует ретраи, экспоненциальный
backoff и контроль конкурентности (p-queue). Batch-цикл НЕ здесь.

### 2. `src/schemas.ts` — 3 новые Zod-схемы

В секции card-схем:

```typescript
export const GetCardChildrenSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the parent card'),
  verbosity: VerbosityEnum,
}).strict();

export const AddCardChildrenSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the parent card'),
  child_card_ids: z.array(z.number().positive().int()).min(1)
    .describe('IDs of child cards to attach as subtasks'),
}).strict();

export const RemoveCardChildrenSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the parent card'),
  child_card_ids: z.array(z.number().positive().int()).min(1)
    .describe('IDs of child cards to detach'),
}).strict();
```

Без `idempotency_key`: добавление/удаление связи родитель–потомок идемпотентно по
природе — повторный вызов не создаёт дубликатов.

### 3. `src/index.ts` — 3 определения в массиве `tools` + 3 обработчика

Определения в массиве `tools` (ListToolsRequest) с описаниями и примерами в стиле
остальных инструментов.

Импорты хелперов (после рефакторинга v3.0.0):
- `simplifyCard`, `simplifyCardCompact` — из `src/transformers.ts`
- `applyCardVerbosity(cards, verbosity, transformerFn)` — из `src/utils.ts`

Обработчики (CallToolRequest):

- `kaiten_get_card_children`: вызвать `getCardChildren`, прогнать через
  `applyCardVerbosity(children, verbosity, simplifyCardCompact)` — тот же паттерн,
  что в `kaiten_search_cards` (≈ `src/index.ts:2513`).
- `kaiten_add_card_children` / `kaiten_remove_card_children`: цикл по
  `child_card_ids`, continue-on-error со сводкой (см. ниже).

## Обработка частичных ошибок (batch)

Add/remove проходят по `child_card_ids`, аккумулируя результат и **не падая на
первой ошибке**. Формат ответа:

```json
{
  "parent_card_id": 12345,
  "succeeded": [111, 222],
  "failed": [{ "child_card_id": 333, "error": "Not found" }],
  "summary": "2 added, 1 failed"
}
```

(для remove — `"2 removed, 1 failed"`.)

LLM видит, что прошло и что нет, и может среагировать. Ошибка отдельного вызова
ловится через `KaitenError` (поле `message`/`hint`). `signal` (AbortSignal)
пробрасывается во все вызовы; abort прерывает оставшиеся итерации цикла.

`kaiten_get_card_children` — одиночный вызов, ошибка пробрасывается напрямую (как
у остальных read-инструментов).

## Документация

- Счётчик инструментов: **16 → 19** в `README.md`, `CLAUDE.md`, `CHANGELOG.md`,
  `TOOLS.md` (если есть).
- Версия: **3.0.0 → 3.1.0** (minor — обратносовместимое добавление инструментов)
  в `package.json`, `README.md`, `CHANGELOG.md`.
- Описания инструментов с примерами в массиве `tools`.
- Обновить `ROADMAP_FEATURES.md` — отметить пункт 1 Фазы 1 выполненным.

## Тестирование

В v3.0.0 добавлен Vitest-набор (`test/`, скрипт `npm test`). Новый функционал
должен прийти со своими unit-тестами в существующем стиле:

1. **`test/schemas.test.ts`** — добавить `describe`-блоки для `GetCardChildrenSchema`,
   `AddCardChildrenSchema`, `RemoveCardChildrenSchema`: валидные/невалидные `card_id`,
   пустой/непустой `child_card_ids`, отказ при лишних полях (`.strict()`).
2. **`test/kaiten-client.test.ts`** — добавить тесты для `addCardChild`
   (POST `/cards/:id/children` с телом `{ card_id }`) и `removeCardChild`
   (DELETE `/cards/:id/children/:childId`), по образцу существующего теста
   `getCardChildren` (строка ≈ 95).
3. `npm run build` — компиляция TypeScript без ошибок.
4. `npm test` — весь набор зелёный (включая новые тесты).
5. Опционально — ручная проверка через `npm run inspector` или подключённый
   MCP-сервер `kaiten` на реальной карточке с детьми.

> Логика continue-on-error со сводкой живёт в обработчике `src/index.ts`. Если
> покрытие этой логики тестом потребует выноса batch-цикла в отдельную
> тестируемую функцию — это допустимое улучшение в рамках задачи.

## Вне области (YAGNI)

- Группировка нескольких подзадач в один HTTP-запрос — API не поддерживает.
- `idempotency_key` для этих операций — не нужен (связь идемпотентна).
- Изменение существующего поведения `kaiten_get_card` / `kaiten_delete_card`,
  которые уже используют `getCardChildren`.
