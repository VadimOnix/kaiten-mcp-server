# Backlog: e2e-тестирование новой архитектуры (deep-module tools)

Дата: 2026-06-03
Метод: поднят локальный **мок-сервер Kaiten** (`e2e/mock-kaiten.mjs`, in-memory, реализует
ровно те эндпоинты, что дёргает `src/kaiten-client.ts`), MCP-сервер (`dist/index.js`)
направлен на него через `KAITEN_API_URL`, и official MCP SDK-клиент по stdio
(`e2e/run-e2e.mjs`, `e2e/probe2.mjs`) прогнал все 22 инструмента, ресурсы и промпты
против сидовых данных.

## Статус фиксов (ветка `fix/refactor-e2e-backlog`)

| # | Статус | Изменения |
|---|--------|-----------|
| P1 error-envelope | ✅ FIXED | `src/tools/kit.ts` — ветка `KaitenError` → `{ error: error.toJSON() }` |
| P1 idempotency_key | ✅ FIXED | `src/tools/cards/{create,update}-card.ts` форвардят `idempotency_key` |
| P2 detailed search | ✅ FIXED | `src/tools/render.ts` — `renderSearchSummary` устойчив к сырым карточкам |
| P3 канал ошибок | ✅ documented | README §«Обработка ошибок» — два канала (`-32602` vs `isError`) |
| P3 Node-версия | ✅ DX | `.nvmrc` (`lts/*`) влит в main |

Реконсиляция с native-fetch: ветка перенесена на main (v3.3.0, fetch вместо axios);
мои файлы fetch-рефактором не затронуты, фиксы применились чисто.

Проверка (на fetch/3.3.0): `npm test` → **359/359** ✅; `node e2e/run-e2e.mjs` → **41/41** ✅;
`node e2e/probe2.mjs` подтвердил идемпотентность, detailed и 404-envelope end-to-end.
Тесты, ранее закреплявшие баги, переписаны под новое поведение.

## Итог прогона

- **Сборка:** OK (на Node ≥20). **Unit-тесты:** 345/345 зелёные.
- **e2e:** все 22 инструмента, 4 ресурса, промпт и негативные кейсы отрабатывают.
  Архитектура (Zod-derived schemas, DI через `makeCtx`, `registerTool`, кастомные
  resources/prompts) работает корректно end-to-end.
- Найденные дефекты **пре-существующие** (рефактор сохранил поведение «verbatim»,
  сюита его закрепляет) — но их стоит починить. Каждый фикс = осознанное изменение
  поведения + правка соответствующих тестов.

---

## P1 — API-ошибки схлопываются в `UNKNOWN_ERROR` (теряются type/status/hint)

**Симптом.** `kaiten_get_card { card_id: 424242 }` (404 от API) возвращает клиенту:
```json
{ "error": { "type": "UNKNOWN_ERROR", "message": "Resource not found" } }
```
Хотя `KaitenError` нёс `type: NOT_FOUND`, `status: 404` и
`hint: "Check that the card_id, board_id, space_id, or other resource ID is correct"`.
Вся структурированная диагностика теряется для **каждого** инструмента (401/403/404/422/429/timeout/network).

**Причина.** `src/kaiten-client.ts` interceptor превращает AxiosError → `throw KaitenError`.
`mapError` (`src/tools/kit.ts:120`) проверяет только `z.ZodError` и `err.response`.
У `KaitenError` нет `.response` и это не ZodError → ветка `UNKNOWN_ERROR`.
`KaitenError.toJSON()` (type/status/details/hint) не вызывается никогда в tool-пути.

**Несогласованность.** batch-связи (`batchPerItem` в `src/tools/helpers.ts:148`) сами
обрабатывают `KaitenError` и показывают `message — hint` — т.е. relation-инструменты
дают лучшие ошибки, чем все остальные. Подтверждено: `add_card_children` с несуществующим
ребёнком → `"Validation error — Check the request parameters for correctness"`.

**Фикс.** Добавить в `mapError` ветку для `KaitenError` (через `instanceof` или дак-тайпинг
`.type`), эмитить `error.toJSON()` (с сохранением `hint`).

**Затрагивает тесты (закрепляют баг):** `test/tools/**/*.test.ts` — ~10 ассертов
`toContain('UNKNOWN_ERROR')` (get-card, search-cards, create/update-card, comments, relations),
плюс характеризационные снапшоты в `test/server.test.ts`.

---

## P1 — `idempotency_key` молча игнорируется в `create_card` / `update_card`

**Симптом.** Явный `idempotency_key` НЕ долетает до API — уходит авто-сгенерированный `mcp-...`:
```
POST  /cards            -> Idempotency-Key: mcp-1780...   (передавали KEY-CARD-1)
PATCH /cards/5001       -> Idempotency-Key: mcp-1780...   (передавали KEY-CARD-UPD)
POST  /cards/.../comments -> Idempotency-Key: KEY-COMMENT-1   ✅ (комментарии форвардят)
PATCH /cards/.../comments -> Idempotency-Key: KEY-COMMENT-UPD ✅
```
Схема (`CreateCardSchema`/`UpdateCardSchema`) **рекламирует** параметр с описанием
"Use the same key for retries", но он no-op → ретрай создаёт **дубликаты карточек**.

**Причина.** `src/tools/cards/create-card.ts:13` и `update-card.ts:12` прямо пишут:
«does NOT forward `idempotency_key` into params». Свежий комм~it `71dbb62` починил только
комментарии; карточки остались с прежним поведением.

**Фикс.** Форвардить `args.idempotency_key` в `CreateCardParams`/`UpdateCardParams`
(клиент уже умеет его принимать и слать как `Idempotency-Key`). Либо — если решено не
поддерживать — убрать параметр из схем карточек, чтобы не вводить в заблуждение.

**Затрагивает тесты (закрепляют баг):**
`test/tools/cards/create-card.test.ts:61` и `update-card.test.ts:45` —
«does not forward idempotency_key into params» (ассертят текущее поведение).

---

## P2 — `kaiten_search_cards` с `verbosity: detailed` ломает сводку

**Симптом.** `search_cards { board_id: 1000, verbosity: 'detailed' }`:
```
1. idem upd
   📋 Board: N/A
   👤 Owner: Unassigned
   🔗 undefined
```
В `normal` та же карточка показывает `Board: Dev Board`, `Owner: Test Admin`, корректный URL.
То есть `detailed` (заявлен как «full API response with all metadata») даёт **меньше**
информации в человекочитаемой сводке, чем `normal`.

**Причина.** `applyCardVerbosityDetailed` (`src/utils.ts:63`) возвращает сырые карточки,
а `renderSearchSummary` (`src/tools/render.ts:165-172`) читает производные поля
`board_title` / `owner_name` / `url`, которых у сырой `KaitenCard` нет (там вложенные
`board`/`owner`, без `url`).

**Фикс (варианты).**
- В detailed-ветке search'а отдавать сырой JSON отдельным форматом (а не прогонять через
  `renderSearchSummary`, рассчитанный на simplified-поля), **или**
- сделать `renderSearchSummary` устойчивым к сырым карточкам (фолбэк
  `card.board_title ?? card.board?.title`, `owner_name ?? owner?.full_name`,
  вычислять url из id/space).

**Затрагивает тесты:** `test/utils.test.ts:55` (только проверяет, что detailed возвращает
исходный массив — рендер не покрыт); добавить кейс на сводку detailed.

---

## P3 — Несогласованный канал ошибок: validation = протокол `-32602`, бизнес/API = `isError`

**Наблюдение.** Невалидный ввод (`card_id: -5`, отсутствует `title`) отклоняется на
уровне SDK как протокольная ошибка `-32602` (промис **бросает** исключение), а бизнес/API
ошибки приходят как `{ isError: true }` envelope. Это **by design** (ADR
`docs/adr/0001-defer-tool-middleware.md`: SDK пред-валидирует по нестрогой `z.object(shape)`,
неизвестные ключи молча отбрасываются, type/required → `-32602`).

**Риск.** Клиент должен обрабатывать ДВА разных канала ошибок на инструмент. Плюс
неизвестные ключи молча отбрасываются (раньше был бы `VALIDATION_ERROR`).

**Действие.** ✅ Сделано — README, секция «Обработка ошибок»: описаны оба канала
(`-32602` для невалидного ввода/неизвестного инструмента vs `isError`-envelope для
бизнес/API-ошибок), значения `type`, поле `hint`, и continue-on-error для пакетных
связей. Со ссылкой на ADR 0001.

---

## P3 — DX: дефолтный Node в окружении = v10, проект требует ≥20

**Наблюдение.** Активный `node` (через nvm) = v10.24.1 → `npm run build`/`npm test`
падают с непрозрачным `SyntaxError: Unexpected token ?` (нет optional chaining).
`package.json` требует `>=20`. Лечится `nvm use 22`.

**Действие.** Добавить `.nvmrc` (`22`) и/или `engine-strict=true`, упомянуть в README.
Чисто DX, не дефект продукта.

---

## Мелочи / наблюдения (не требуют немедленных действий)

- `kaiten_list_users` не валидирует наличие `query`, хотя серверный промпт говорит
  «NEVER call without query». Можно добавить мягкое предупреждение в описание (enforcement
  ломал бы легитимные кейсы).
- `applyCardVerbosityMinimal` вычисляет `board_id`/`owner_name`, но minimal-ветка
  `renderSearchSummary` их игнорирует (мёртвые поля для search; нужны для не-search путей).

---

## Артефакты харнесса (gitignored, `e2e/`)

- `e2e/mock-kaiten.mjs` — мок Kaiten API + debug-эндпоинт `GET /api/latest/__requests`.
- `e2e/run-e2e.mjs` — полный прогон 22 инструментов + ресурсы/промпты + негативы.
- `e2e/probe2.mjs` — точечные пробы: идемпотентность, `space_id:0`, `verbosity:detailed`.

Запуск (нужен Node ≥20):
```bash
node e2e/run-e2e.mjs   # полный прогон
node e2e/probe2.mjs    # точечные пробы
```
> ⚠️ Если в окружении задан `HTTP(S)_PROXY`, харнесс снимает его для дочернего MCP-процесса
> (иначе axios гонит запросы к `localhost` через прокси → 503). На реальном Kaiten это не нужно.
