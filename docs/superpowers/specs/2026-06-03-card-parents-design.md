# Card Parents — дизайн-спецификация

**Дата:** 2026-06-03
**Базовая версия:** 3.1.0 (19 инструментов) → целевая 3.2.0 (22 инструмента)
**Статус:** утверждён (дизайн согласован в брейншторминге)
**Шаблон:** зеркало уже реализованной фичи Card Children
(`docs/superpowers/specs/2026-06-03-card-children-design.md`)

## Цель

Добавить управление связями потомок→родитель (привязка родительских карточек)
через MCP. Card Children уже реализован; Parents — симметричная вторая половина
иерархии. `GET /cards/{id}` уже возвращает массив `parents` и `parents_count`,
но отдельных инструментов для чтения/добавления/удаления родителей нет.

## Контракт Kaiten API

Источник: [developers.kaiten.ru](https://developers.kaiten.ru/), раздел Card parents.
Эндпоинты симметричны Card children (страницы рендерятся только через JS, поэтому
контракт выведен по аналогии с children и **должен быть подтверждён live-тестом
на этапе реализации** — см. раздел «Тестирование»).

| Операция | Метод | Путь | Тело / path | Ответ |
|----------|-------|------|-------------|-------|
| Список родителей | GET | `/cards/{card_id}/parents` | — | массив карточек |
| Добавить родителя | POST | `/cards/{card_id}/parents` | body `{ "card_id": <parent_id> }` | объект карточки |
| Удалить связь | DELETE | `/cards/{card_id}/parents/{id}` | path: `card_id` (потомок), `id` (родитель) | `{ "id": <deleted_relation_id> }` |

Как и у children, API добавляет/удаляет **по одному родителю за вызов**.

## Инструменты MCP (3 новых)

| Инструмент | API | Параметры | Поведение |
|-----------|-----|-----------|-----------|
| `kaiten_get_card_parents` | GET `/cards/{id}/parents` | `card_id`, `verbosity?` | Список родителей через `applyCardVerbosity(..., simplifyCardCompact)` |
| `kaiten_add_card_parents` | POST `/cards/{id}/parents` (×N) | `card_id`, `parent_card_ids: number[]` | Привязывает массив родителей, continue-on-error + сводка |
| `kaiten_remove_card_parents` | DELETE `/cards/{id}/parents/{parentId}` (×N) | `card_id`, `parent_card_ids: number[]` | Отвязывает массив родителей, continue-on-error + сводка |

Решения (унаследованы от Card Children):
- Массив ID (`parent_card_ids: number[]`, `.min(1)`); batch-цикл в обработчике, клиент 1:1 с API.
- Без `idempotency_key` (связь идемпотентна).
- `verbosity` только у get.

## Слои реализации

### 1. `src/kaiten-client.ts` — 2 новых метода

Рядом с `getCardChildren`/`addCardChild`/`removeCardChild` в секции `// Card relationships`:

```typescript
async getCardParents(cardId: number, signal?: AbortSignal): Promise<KaitenCard[]> {
  return this.queuedRequest(async () => {
    const response = await this.client.get(`/cards/${cardId}/parents`, { signal });
    return response.data;
  }, signal);
}

async addCardParent(cardId: number, parentCardId: number, signal?: AbortSignal): Promise<KaitenCard> {
  return this.queuedRequest(async () => {
    const response = await this.client.post(`/cards/${cardId}/parents`, { card_id: parentCardId }, { signal });
    return response.data;
  }, signal);
}

async removeCardParent(cardId: number, parentCardId: number, signal?: AbortSignal): Promise<{ id: number }> {
  return this.queuedRequest(async () => {
    const response = await this.client.delete(`/cards/${cardId}/parents/${parentCardId}`, { signal });
    return response.data;
  }, signal);
}
```
(`getCardParents` mirrors the existing `getCardChildren`; the other two mirror
`addCardChild`/`removeCardChild`.)

### 2. `src/schemas.ts` — 3 новые Zod-схемы + type-алиасы

В `// CARD SCHEMAS` секции, по образцу `*CardChildren*`:

```typescript
export const GetCardParentsSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the child card'),
  verbosity: VerbosityEnum,
}).strict();

export const AddCardParentsSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the child card'),
  parent_card_ids: z.array(z.number().positive().int()).min(1)
    .describe('IDs of parent cards to attach (one API call per ID)'),
}).strict();

export const RemoveCardParentsSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the child card'),
  parent_card_ids: z.array(z.number().positive().int()).min(1)
    .describe('IDs of parent cards to detach (one API call per ID)'),
}).strict();
```
Плюс `z.infer` type-алиасы (`GetCardParentsArgs`, `AddCardParentsArgs`,
`RemoveCardParentsArgs`) в блоке алиасов — для консистентности.

### 3. `src/index.ts` — 3 определения + 3 обработчика

Импорты схем; 3 определения в массиве `tools` (рядом с `kaiten_*_card_children`);
3 `case` в switch. `get` использует `applyCardVerbosity(parents, verbosity,
simplifyCardCompact)`. `add`/`remove` — тот же batch continue-on-error паттерн,
что у children: цикл по `parent_card_ids`, try/catch на каждый, аккумуляция
`succeeded`/`failed`, сводка, `isError: true` при полном провале, `KaitenError.hint`
в строках ошибок. Формат ответа:
```json
{ "child_card_id": 12345, "succeeded": [..], "failed": [{ "parent_card_id": .., "error": ".." }], "summary": "N added, M failed" }
```
(поле `child_card_id` — карточка-потомок, к которой привязываем родителей.)

## Обработка частичных ошибок

Идентична Card Children: continue-on-error, аккумулирование, сводка
(«N added/removed, M failed»), `isError: true` только когда `succeeded.length === 0`.
`get` — одиночный вызов, ошибка пробрасывается.

## Документация

- Счётчик инструментов: **19 → 22** в `README.md`, `CLAUDE.md`, `CHANGELOG.md`.
- Версия: **3.1.0 → 3.2.0** в `package.json`, `README.md`, `CHANGELOG.md`.
- README: новый подраздел «Родительские карточки» рядом с «Подзадачи».

## Тестирование

Vitest (`npm test`), стиль существующего набора:
1. **`test/schemas.test.ts`** — `describe`-блоки для 3 новых схем (валидный/невалидный
   `card_id`, пустой/непустой `parent_card_ids`, `.strict()`).
2. **`test/kaiten-client.test.ts`** — тесты `getCardParents` (GET `/cards/:id/parents`),
   `addCardParent` (POST body `{card_id}`), `removeCardParent` (DELETE
   `/cards/:id/parents/:parentId`), по образцу children-тестов.
3. `npm run build` — чистая компиляция; `npm test` — весь набор зелёный.
4. **Live-подтверждение контракта:** перед мержем проверить реальный ответ
   `POST/DELETE /cards/{id}/parents` через подключённый MCP-сервер `kaiten`
   (после реализации инструментов) или `npm run inspector` на тестовой карточке.
   Если фактический контракт отличается от выведенного по аналогии — скорректировать
   клиент и тесты.

## Вне области (YAGNI)

- Изменение существующего `kaiten_get_card` (он уже отдаёт `parents` инлайн).
- Идемпотентные ключи (связь идемпотентна).
- Tags и Size — отдельные спеки.
