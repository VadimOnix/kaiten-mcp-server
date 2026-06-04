# Card Members & Responsible — Design Spec

**Date:** 2026-06-04
**Status:** Approved (ready for implementation plan)
**Version target:** 3.2.0 → 3.3.0

## Goal

Add the ability to assign **members** (участники) to Kaiten cards and to mark a
member as **responsible** (ответственный). Today the MCP server can set a card's
`owner_id` (author/owner) via `update_card`, but there is no way to manage the
card's member list or its responsible person — a distinct Kaiten concept.

## Kaiten API (verified against developers.kaiten.ru, base `/api/latest`)

| Operation | Method | Path | Body | Notes |
|---|---|---|---|---|
| List members | `GET` | `/cards/{card_id}/members` | — | Array of user objects (each may carry `type`) |
| Add member | `POST` | `/cards/{card_id}/members` | `{ user_id }` (required) | New member defaults to participant (`type=1`) |
| Make responsible | `PATCH` | `/cards/{card_id}/members/{id}` | `{ type }` where `type` ∈ {2} (min=max=2) | Returns `{ created, updated, card_id, user_id, type }` |
| Remove member | `DELETE` | `/cards/{card_id}/members/{id}` | — | Returns `{ id }`; removes from card entirely |

`type` semantics: **1 = участник (member)**, **2 = ответственный (responsible)**.

**API constraints captured in the design:**
- `PATCH` accepts only `type=2`. There is **no** way to demote a responsible
  member back to plain participant — the only "undo" is `DELETE` (removes them
  from the card completely).
- A card may have **multiple** responsible members (multiple `type=2`).

## Tool surface (4 new tools, toolset 22 → 26)

New deep-module group `src/tools/members/`, mirroring `src/tools/relations/`.

| Tool | API mapping | Annotation | Args |
|---|---|---|---|
| `kaiten_get_card_members` | `GET /cards/{card_id}/members` | `readOnly` | `card_id`, `verbosity?` |
| `kaiten_add_card_members` | batch `POST /cards/{card_id}/members {user_id}` | `idempotent` | `card_id`, `user_ids[]` |
| `kaiten_remove_card_members` | batch `DELETE /cards/{card_id}/members/{user_id}` | `idempotent` | `card_id`, `user_ids[]` |
| `kaiten_set_card_responsible` | `POST` (auto-add) → `PATCH {type:2}` | `idempotent` | `card_id`, `user_id` |

### `kaiten_set_card_responsible` behaviour (additive — honest to the API)

1. `POST` the user as a member. If the API rejects because they are already a
   member, **swallow that error** and continue.
2. `PATCH {type:2}` to mark them responsible.
3. Return `{ card_id, user_id, type: 2 }`.
4. Other responsible members are **not** touched (Kaiten allows several). To
   unassign a responsible, use `remove_card_members` (removes from the card
   entirely). This limitation is stated explicitly in the tool description.

## Client methods (`src/kaiten-client.ts`)

- `getCardMembers(cardId, signal): Promise<KaitenMember[]>`
- `addCardMember(cardId, userId, signal): Promise<KaitenUser>`
- `removeCardMember(cardId, userId, signal): Promise<{ id: number }>`
- `setCardResponsible(cardId, userId, signal): Promise<{ card_id: number; user_id: number; type: number }>`

New type: `KaitenMember = KaitenUser & { type?: number }`. The `type` field is
passed through untouched when the API includes it.

## Batch helper (`src/tools/helpers.ts`)

Add a member-specific `batchCardMembers(userIds, cardId, verb, run)` producing:

```json
{ "card_id": <id>, "succeeded": [..], "failed": [{ "user_id": <id>, "error": ".." }], "summary": "N verb, M failed" }
```

Kept **separate** from the existing `batchPerItem` / `RELATION_KEYS` machinery,
which is byte-stability-locked to the children/parents snapshots in
`test/server.test.ts`. We do not modify that code path.

## Schemas (`src/schemas.ts`, all `.strict()`, every field `.describe()`)

- `GetCardMembersSchema` — `{ card_id, verbosity? }`
- `AddCardMembersSchema` — `{ card_id, user_ids: number[] (min 1) }`
- `RemoveCardMembersSchema` — `{ card_id, user_ids: number[] (min 1) }`
- `SetCardResponsibleSchema` — `{ card_id, user_id }`

The advertised JSON Schema is derived from these via `.shape` (no hand-written
JSON Schema), per the existing tool registry.

## Registration

Import the 4 tools in `src/tools/index.ts` and add them to `ALL_TOOLS`.
`registerTools()` advertises them automatically — no change to `src/server.ts`.

## Testing (TDD — test first, watch fail, implement)

- `test/schemas.test.ts` — valid/invalid cases for the 4 new schemas
  (e.g. empty `user_ids` rejected, unknown keys rejected by `.strict()`).
- `test/kaiten-client.test.ts` — the 4 new client methods with global `fetch`
  mocked: correct method/path/body, and `setCardResponsible` issuing POST then
  PATCH (and swallowing the add error when already a member).
- `test/members.test.ts` (new) — each tool via `tool.run(args, fakeCtx)`:
  - `add`/`remove` batch shape (`succeeded`/`failed`/`summary`) incl. a partial
    failure;
  - `set_responsible` POST→PATCH ordering and the already-member fast path;
  - `get_card_members` verbosity passthrough of `type`.

## Documentation

- Tool count 22 → 26 in `package.json`, `README.md`, `CLAUDE.md`, `TOOLS.md`.
- `CHANGELOG.md` entry for 3.3.0.
- Bump `version` 3.2.0 → 3.3.0 in `package.json`.

## Out of scope (YAGNI)

- Demoting a responsible back to participant (API cannot do it).
- "Replace responsible" semantics (would require destructive `DELETE`).
- Batch `set_responsible` (single `user_id`; call repeatedly if several needed).
- Touching `update_card` / `owner_id` (orthogonal concept, already supported).
