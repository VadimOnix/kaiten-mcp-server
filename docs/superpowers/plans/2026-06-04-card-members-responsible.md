# Card Members & Responsible Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four MCP tools to manage Kaiten card members (участники) and mark a member as responsible (ответственный).

**Architecture:** A new deep-module tool group `src/tools/members/` mirroring `src/tools/relations/`. Four client methods wrap the `/cards/{id}/members` endpoints; batch add/remove reuse a new members-specific batch helper; `set_card_responsible` auto-adds the user then PATCHes `type:2`. The advertised JSON Schema is derived from new Zod schemas. No changes to `src/server.ts` (registration is automatic via `ALL_TOOLS`).

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Zod schemas, native `fetch` client with p-queue, Vitest. TDD throughout.

**Reference spec:** `docs/superpowers/specs/2026-06-04-card-members-responsible-design.md`

**Pre-flight context (verified against the live codebase):**
- `package.json` version is **already 3.3.0** — no version bump needed.
- There is **no** `TOOLS.md` file. Tool-count references to update (22 → 26): `README.md:240`, `README.md:434`, `README.md:446`, `CLAUDE.md:7`, `CLAUDE.md:46`, `CLAUDE.md:80`.
- `VerbosityEnum` (`src/schemas.ts:11`) is already `.optional()`, so `verbosity: VerbosityEnum` yields an optional field.
- The existing `batchPerItem` / `RELATION_KEYS` helper is byte-stability-locked to the children/parents snapshots in `test/server.test.ts` — **do not touch it**. We add a separate `batchCardMembers`.
- `isRetryableStatus` retries only 429/408/5xx, so a 409 response is **not** retried (used in the `setCardResponsible` swallow test).
- Tool tests live at `test/tools/<group>/<tool>.test.ts`, one per tool, and call `tool.run(args, fakeCtx)`.

Run all tests with `npm test`. Run a single file with `npx vitest run <path>`.

---

## File Structure

**Create:**
- `src/tools/members/descriptions.ts` — the four tool description strings
- `src/tools/members/get-card-members.ts` — `kaiten_get_card_members`
- `src/tools/members/add-card-members.ts` — `kaiten_add_card_members`
- `src/tools/members/remove-card-members.ts` — `kaiten_remove_card_members`
- `src/tools/members/set-card-responsible.ts` — `kaiten_set_card_responsible`
- `test/tools/members/get-card-members.test.ts`
- `test/tools/members/add-card-members.test.ts`
- `test/tools/members/remove-card-members.test.ts`
- `test/tools/members/set-card-responsible.test.ts`

**Modify:**
- `src/kaiten-client.ts` — add `KaitenMember` + `KaitenMemberRole` types and 4 client methods
- `src/schemas.ts` — add 4 schemas + their `type` exports
- `src/utils.ts` — add `applyMemberVerbosity`
- `src/tools/helpers.ts` — add `batchCardMembers`
- `src/tools/index.ts` — import + register the 4 tools
- `test/kaiten-client.test.ts` — new describe block for the 4 client methods
- `test/schemas.test.ts` — import + describe blocks for the 4 schemas
- `README.md`, `CLAUDE.md` — tool count 22 → 26
- `CHANGELOG.md` — feature entry under `[Unreleased]`

---

## Task 1: Client types + methods

**Files:**
- Modify: `src/kaiten-client.ts` (types near `KaitenComment` ~line 131; methods after `removeCardParent` ~line 658)
- Test: `test/kaiten-client.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this describe block to `test/kaiten-client.test.ts` (after the existing `describe('card operations', ...)` block; reuse the file's existing `BASE`, `client`, `fetchMock`, `call`, `jsonResponse` helpers):

```ts
describe('card member operations', () => {
  it('getCardMembers GETs /cards/:id/members', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ id: 7, full_name: 'Ann', type: 2 }]),
    );
    const members = await client.getCardMembers(5);
    expect(members).toEqual([{ id: 7, full_name: 'Ann', type: 2 }]);
    const [url, init] = call();
    expect(url).toBe(`${BASE}/cards/5/members`);
    expect((init.method ?? 'GET').toUpperCase()).toBe('GET');
  });

  it('addCardMember POSTs /cards/:id/members with { user_id }', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 7, full_name: 'Ann' }));
    const res = await client.addCardMember(5, 7);
    expect(res).toEqual({ id: 7, full_name: 'Ann' });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/cards/5/members`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ user_id: 7 });
  });

  it('removeCardMember DELETEs /cards/:id/members/:userId', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 7 }));
    const res = await client.removeCardMember(5, 7);
    expect(res).toEqual({ id: 7 });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/cards/5/members/7`);
    expect(init.method).toBe('DELETE');
  });

  it('setCardResponsible POSTs then PATCHes { type: 2 }', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 7, full_name: 'Ann' })) // add
      .mockResolvedValueOnce(jsonResponse({ card_id: 5, user_id: 7, type: 2 })); // patch
    const res = await client.setCardResponsible(5, 7);
    expect(res).toEqual({ card_id: 5, user_id: 7, type: 2 });

    const [addUrl, addInit] = call(0);
    expect(addUrl).toBe(`${BASE}/cards/5/members`);
    expect(addInit.method).toBe('POST');

    const [patchUrl, patchInit] = call(1);
    expect(patchUrl).toBe(`${BASE}/cards/5/members/7`);
    expect(patchInit.method).toBe('PATCH');
    expect(JSON.parse(patchInit.body as string)).toEqual({ type: 2 });
  });

  it('setCardResponsible swallows an add error (already a member) and still PATCHes', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'already a member' }, { status: 409 })) // add fails (409 not retried)
      .mockResolvedValueOnce(jsonResponse({ card_id: 5, user_id: 7, type: 2 })); // patch
    const res = await client.setCardResponsible(5, 7);
    expect(res).toEqual({ card_id: 5, user_id: 7, type: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(call(1)[1].method).toBe('PATCH');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/kaiten-client.test.ts`
Expected: FAIL — `client.getCardMembers is not a function` (and the other three methods).

- [ ] **Step 3: Add the types**

In `src/kaiten-client.ts`, after the `KaitenComment` interface (ends ~line 141), add:

```ts
export interface KaitenMember extends KaitenUser {
  /** Role on the card: 1 = participant (участник), 2 = responsible (ответственный). */
  type?: number;
}

export interface KaitenMemberRole {
  created?: string;
  updated?: string;
  card_id: number;
  user_id: number;
  type: number;
}
```

- [ ] **Step 4: Add the client methods**

In `src/kaiten-client.ts`, after `removeCardParent` (ends ~line 658), add:

```ts
  // Card member operations
  async getCardMembers(cardId: number, signal?: AbortSignal): Promise<KaitenMember[]> {
    return this.queuedRequest(() => this.request<KaitenMember[]>(`/cards/${cardId}/members`, { signal }), signal);
  }

  async addCardMember(cardId: number, userId: number, signal?: AbortSignal): Promise<KaitenMember> {
    return this.queuedRequest(
      () => this.request<KaitenMember>(`/cards/${cardId}/members`, { method: 'POST', body: { user_id: userId }, signal }),
      signal,
    );
  }

  async removeCardMember(cardId: number, userId: number, signal?: AbortSignal): Promise<{ id: number }> {
    return this.queuedRequest(
      () => this.request<{ id: number }>(`/cards/${cardId}/members/${userId}`, { method: 'DELETE', signal }),
      signal,
    );
  }

  async setCardResponsible(cardId: number, userId: number, signal?: AbortSignal): Promise<KaitenMemberRole> {
    // The PATCH role endpoint only works on existing members. Ensure membership
    // first; if the user is already a member the add call errors — swallow it and
    // proceed. A genuinely invalid card/user surfaces on the PATCH below.
    try {
      await this.addCardMember(cardId, userId, signal);
    } catch {
      // already a member (or add not required) — continue to set the role
    }
    return this.queuedRequest(
      () => this.request<KaitenMemberRole>(`/cards/${cardId}/members/${userId}`, { method: 'PATCH', body: { type: 2 }, signal }),
      signal,
    );
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/kaiten-client.test.ts`
Expected: PASS (all member-operation tests green).

- [ ] **Step 6: Commit**

```bash
git add src/kaiten-client.ts test/kaiten-client.test.ts
git commit -m "feat(client): add card member + responsible API methods"
```

---

## Task 2: Zod schemas

**Files:**
- Modify: `src/schemas.ts` (schemas near the relations block ~line 95; `type` exports near line 228+)
- Test: `test/schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

In `test/schemas.test.ts`, add these four names to the import block from `../src/schemas`:

```ts
  GetCardMembersSchema,
  AddCardMembersSchema,
  RemoveCardMembersSchema,
  SetCardResponsibleSchema,
```

Then add these describe blocks at the end of the file:

```ts
describe('GetCardMembersSchema', () => {
  it('accepts a positive card_id; verbosity optional', () => {
    expect(GetCardMembersSchema.parse({ card_id: 5 })).toEqual({ card_id: 5 });
    expect(GetCardMembersSchema.parse({ card_id: 5, verbosity: 'detailed' }).verbosity).toBe('detailed');
  });
  it('rejects non-positive card_id and unknown keys', () => {
    expect(() => GetCardMembersSchema.parse({ card_id: 0 })).toThrow();
    expect(() => GetCardMembersSchema.parse({ card_id: 5, bogus: true })).toThrow();
  });
});

describe('AddCardMembersSchema', () => {
  it('accepts card_id and a non-empty user_ids array', () => {
    expect(AddCardMembersSchema.parse({ card_id: 1, user_ids: [2, 3] })).toEqual({ card_id: 1, user_ids: [2, 3] });
  });
  it('rejects empty / non-int ids, missing user_ids, and unknown keys', () => {
    expect(() => AddCardMembersSchema.parse({ card_id: 1, user_ids: [] })).toThrow();
    expect(() => AddCardMembersSchema.parse({ card_id: 1, user_ids: [0] })).toThrow();
    expect(() => AddCardMembersSchema.parse({ card_id: 1, user_ids: [1.5] })).toThrow();
    expect(() => AddCardMembersSchema.parse({ card_id: 1 })).toThrow();
    expect(() => AddCardMembersSchema.parse({ card_id: 1, user_ids: [2], bogus: true })).toThrow();
  });
});

describe('RemoveCardMembersSchema', () => {
  it('accepts card_id and a non-empty user_ids array', () => {
    expect(RemoveCardMembersSchema.parse({ card_id: 1, user_ids: [2] })).toEqual({ card_id: 1, user_ids: [2] });
  });
  it('rejects empty user_ids and unknown keys', () => {
    expect(() => RemoveCardMembersSchema.parse({ card_id: 1, user_ids: [] })).toThrow();
    expect(() => RemoveCardMembersSchema.parse({ card_id: 1, user_ids: [2], bogus: true })).toThrow();
  });
});

describe('SetCardResponsibleSchema', () => {
  it('accepts positive card_id and user_id', () => {
    expect(SetCardResponsibleSchema.parse({ card_id: 1, user_id: 2 })).toEqual({ card_id: 1, user_id: 2 });
  });
  it('rejects non-positive ids, missing fields, and unknown keys', () => {
    expect(() => SetCardResponsibleSchema.parse({ card_id: 1 })).toThrow();
    expect(() => SetCardResponsibleSchema.parse({ card_id: 0, user_id: 2 })).toThrow();
    expect(() => SetCardResponsibleSchema.parse({ card_id: 1, user_id: 2, bogus: true })).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/schemas.test.ts`
Expected: FAIL — the four schema names are `undefined` (import error / `Cannot read properties of undefined`).

- [ ] **Step 3: Add the schemas**

In `src/schemas.ts`, after the relations schemas block (after `RemoveCardParentsSchema`, ~line 95), add:

```ts
export const GetCardMembersSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the card whose members to list'),
  verbosity: VerbosityEnum,
}).strict();

export const AddCardMembersSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the card to add members to'),
  user_ids: z.array(z.number().positive().int()).min(1)
    .describe('IDs of users to add as card members (one API call per ID)'),
}).strict();

export const RemoveCardMembersSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the card to remove members from'),
  user_ids: z.array(z.number().positive().int()).min(1)
    .describe('IDs of users to remove from the card (one API call per ID)'),
}).strict();

export const SetCardResponsibleSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the card'),
  user_id: z.number().positive().int()
    .describe('The ID of the user to mark responsible (auto-added as a member if not already one)'),
}).strict();
```

- [ ] **Step 4: Add the type exports**

In `src/schemas.ts`, alongside the other `export type ... = z.infer<...>` lines (~line 228+), add:

```ts
export type GetCardMembersArgs = z.infer<typeof GetCardMembersSchema>;
export type AddCardMembersArgs = z.infer<typeof AddCardMembersSchema>;
export type RemoveCardMembersArgs = z.infer<typeof RemoveCardMembersSchema>;
export type SetCardResponsibleArgs = z.infer<typeof SetCardResponsibleSchema>;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/schemas.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/schemas.ts test/schemas.test.ts
git commit -m "feat(schemas): add card member + responsible tool schemas"
```

---

## Task 3: `batchCardMembers` helper + `applyMemberVerbosity`

**Files:**
- Modify: `src/tools/helpers.ts` (append a new exported function)
- Modify: `src/utils.ts` (add `applyMemberVerbosity` near `applyUserVerbosity`)
- Test: `test/tools/helpers.test.ts`, `test/utils.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `test/tools/helpers.test.ts` (it already imports from `../../src/tools/helpers`; add `batchCardMembers` to that import, and add `KaitenError` from `../../src/kaiten-client` if not already imported):

```ts
describe('batchCardMembers', () => {
  it('reports per-user success and failure with a summary', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce(undefined)                       // user 2 ok
      .mockRejectedValueOnce(new Error('nope'));              // user 3 fails
    const res = await batchCardMembers([2, 3], 5, 'added', run);
    const body = JSON.parse(res.content[0].text);
    expect(body).toEqual({
      card_id: 5,
      succeeded: [2],
      failed: [{ user_id: 3, error: 'nope' }],
      summary: '1 added, 1 failed',
    });
    expect(res.isError).toBeFalsy();
  });

  it('marks the whole result isError when nothing succeeds', async () => {
    const run = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await batchCardMembers([2], 5, 'removed', run);
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).summary).toBe('0 removed, 1 failed');
  });
});
```

Append to `test/utils.test.ts` (add `applyMemberVerbosity` to the import from `../src/utils`):

```ts
describe('applyMemberVerbosity', () => {
  const members = [
    { id: 7, full_name: 'Ann', email: 'a@x.io', username: 'ann', activated: true, type: 2 },
  ];
  it('keeps only id, full_name, type at minimal', () => {
    expect(applyMemberVerbosity(members, 'minimal')).toEqual([{ id: 7, full_name: 'Ann', type: 2 }]);
  });
  it('keeps essential fields plus type at normal (default)', () => {
    expect(applyMemberVerbosity(members)).toEqual([
      { id: 7, full_name: 'Ann', email: 'a@x.io', username: 'ann', activated: true, type: 2 },
    ]);
  });
  it('returns members untouched at detailed', () => {
    expect(applyMemberVerbosity(members, 'detailed')).toBe(members);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/tools/helpers.test.ts test/utils.test.ts`
Expected: FAIL — `batchCardMembers` / `applyMemberVerbosity` are not exported.

- [ ] **Step 3: Add `batchCardMembers`**

Append to `src/tools/helpers.ts` (file already imports `KaitenError` and `type { ToolResult }`):

```ts
/**
 * Batch helper for card-member mutations. Runs `run` once per user id, in order,
 * collecting per-user successes/failures. Kept separate from {@link batchPerItem}
 * (which is byte-locked to the children/parents snapshots) so the members shape
 * is { card_id, succeeded, failed:[{ user_id, error }], summary }.
 */
export async function batchCardMembers(
  userIds: number[],
  cardId: number,
  verb: string,
  run: (userId: number) => Promise<unknown>,
): Promise<ToolResult> {
  const succeeded: number[] = [];
  const failed: Array<Record<string, number | string>> = [];

  for (const id of userIds) {
    try {
      await run(id);
      succeeded.push(id);
    } catch (err) {
      failed.push({
        user_id: id,
        error:
          err instanceof KaitenError
            ? `${err.message}${err.hint ? ` — ${err.hint}` : ''}`
            : err instanceof Error
              ? err.message
              : String(err),
      });
    }
  }

  const result = {
    card_id: cardId,
    succeeded,
    failed,
    summary: `${succeeded.length} ${verb}, ${failed.length} failed`,
  };

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    ...(succeeded.length === 0 ? { isError: true } : {}),
  };
}
```

- [ ] **Step 4: Add `applyMemberVerbosity`**

In `src/utils.ts`, immediately after `applyUserVerbosity`, add (and ensure `KaitenMember` is imported from `./kaiten-client.js` in the existing type-import line that already pulls `KaitenUser`/`KaitenCard`):

```ts
export function applyMemberVerbosity(
  members: KaitenMember[],
  verbosity: VerbosityLevel = 'normal'
): any[] {
  switch (verbosity) {
    case 'minimal':
      return members.map((m) => ({ id: m.id, full_name: m.full_name, type: m.type }));
    case 'detailed':
      return members;
    case 'normal':
    default:
      return members.map((m) => ({
        id: m.id,
        full_name: m.full_name,
        email: m.email,
        username: m.username,
        activated: m.activated,
        type: m.type,
      }));
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/tools/helpers.test.ts test/utils.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/helpers.ts src/utils.ts test/tools/helpers.test.ts test/utils.test.ts
git commit -m "feat(tools): add batchCardMembers helper + applyMemberVerbosity"
```

---

## Task 4: Tool descriptions

**Files:**
- Create: `src/tools/members/descriptions.ts`

(No test — pure string constants, exercised via the tool tests in Tasks 5–8.)

- [ ] **Step 1: Create the descriptions file**

Create `src/tools/members/descriptions.ts`:

```ts
export const GET_CARD_MEMBERS_DESC = `Get the members (участники) of a card, including who is responsible.

PURPOSE: List everyone attached to a card and their role. Use to review assignments or find user IDs before changing membership.

PARAMETERS:
- card_id (required): Card ID. Positive integer.
- verbosity (optional): minimal | normal (default) | detailed.

RETURNS: JSON array of members (id, full_name, ..., type). type 1 = participant (участник), type 2 = responsible (ответственный). Empty array [] if the card has no members.

RELATED TOOLS:
- kaiten_add_card_members: Add participants
- kaiten_remove_card_members: Remove members
- kaiten_set_card_responsible: Mark a member responsible`;

export const ADD_CARD_MEMBERS_DESC = `Add one or more participants (участники) to a card.

PURPOSE: Attach existing users as card members. Accepts an array of user IDs; the server issues one API call per user and continues on individual failures. New members join as participants (type 1).

PARAMETERS:
- card_id (required): Card ID. Positive integer.
- user_ids (required): Array of user IDs to add. At least one.

RETURNS: JSON summary { card_id, succeeded: number[], failed: [{ user_id, error }], summary }.

NOTE: Adding is idempotent — re-adding an existing member does not create duplicates.

RELATED TOOLS:
- kaiten_get_card_members: List current members
- kaiten_set_card_responsible: Mark a member responsible
- kaiten_remove_card_members: Remove members`;

export const REMOVE_CARD_MEMBERS_DESC = `Remove one or more members from a card.

PURPOSE: Detach users from a card. Accepts an array of user IDs; the server issues one API call per user and continues on individual failures. This is also the only way to unassign a responsible user (it removes them from the card entirely).

PARAMETERS:
- card_id (required): Card ID. Positive integer.
- user_ids (required): Array of user IDs to remove. At least one.

RETURNS: JSON summary { card_id, succeeded: number[], failed: [{ user_id, error }], summary }.

RELATED TOOLS:
- kaiten_get_card_members: List current members to find IDs
- kaiten_add_card_members: Add participants`;

export const SET_CARD_RESPONSIBLE_DESC = `Mark a user as responsible (ответственный) for a card.

PURPOSE: Make a user the responsible person on a card. If they are not already a member they are added automatically first, then promoted to responsible (type 2).

PARAMETERS:
- card_id (required): Card ID. Positive integer.
- user_id (required): User ID to mark responsible.

RETURNS: JSON { card_id, user_id, type } with type 2 (responsible).

NOTE: This is additive — it does NOT demote any existing responsible member (Kaiten allows several). The Kaiten API cannot demote a responsible back to a plain participant; to unassign, use kaiten_remove_card_members (removes them from the card entirely).

RELATED TOOLS:
- kaiten_get_card_members: See who is responsible (type 2)
- kaiten_add_card_members: Add participants
- kaiten_remove_card_members: Remove a member / unassign responsible`;
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no errors; the constants are unused until Tasks 5–8 but valid).

- [ ] **Step 3: Commit**

```bash
git add src/tools/members/descriptions.ts
git commit -m "feat(tools): add card member tool descriptions"
```

---

## Task 5: `kaiten_get_card_members` tool

**Files:**
- Create: `src/tools/members/get-card-members.ts`
- Test: `test/tools/members/get-card-members.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/tools/members/get-card-members.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { getCardMembers } from '../../../src/tools/members/get-card-members.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_get_card_members tool module', () => {
  it('returns members mapped through verbosity (normal default), preserving type', async () => {
    const raw = [{ id: 7, full_name: 'Ann', email: 'a@x.io', username: 'ann', activated: true, type: 2 }];
    const getCardMembersFn = vi.fn().mockResolvedValue(raw);
    const res = await getCardMembers.run({ card_id: 5 }, fakeCtx({ client: { getCardMembers: getCardMembersFn } }));
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual([
      { id: 7, full_name: 'Ann', email: 'a@x.io', username: 'ann', activated: true, type: 2 },
    ]);
    expect(getCardMembersFn).toHaveBeenCalledWith(5, undefined);
  });

  it('returns empty array when card has no members', async () => {
    const res = await getCardMembers.run({ card_id: 5 }, fakeCtx({ client: { getCardMembers: vi.fn().mockResolvedValue([]) } }));
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual([]);
  });

  it('maps a thrown error to an error result', async () => {
    const res = await getCardMembers.run({ card_id: 5 }, fakeCtx({ client: { getCardMembers: vi.fn().mockRejectedValue(new Error('boom')) } }));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects invalid args via the schema', async () => {
    const res = await getCardMembers.run({ card_id: -1 }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(getCardMembers.name).toBe('kaiten_get_card_members');
    expect(getCardMembers.annotations?.readOnlyHint).toBe(true);
  });
});
```

> Note: if `getCardChildren.annotations?.readOnlyHint` is not the exact key used in the sibling test, open `test/tools/relations/get-card-children.test.ts` and copy its `has expected metadata` assertion verbatim, adjusting the name to `kaiten_get_card_members`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/tools/members/get-card-members.test.ts`
Expected: FAIL — cannot find module `get-card-members.js`.

- [ ] **Step 3: Create the tool**

Create `src/tools/members/get-card-members.ts`:

```ts
import { defineTool } from '../kit.js';
import { GetCardMembersSchema } from '../../schemas.js';
import { applyMemberVerbosity } from '../../utils.js';
import { GET_CARD_MEMBERS_DESC } from './descriptions.js';

/**
 * kaiten_get_card_members — read tool. Fetches the card's members and runs them
 * through applyMemberVerbosity (default 'normal'), preserving the `type` field
 * (1 = participant, 2 = responsible) at every verbosity level.
 */
export const getCardMembers = defineTool({
  name: 'kaiten_get_card_members',
  description: GET_CARD_MEMBERS_DESC,
  schema: GetCardMembersSchema,
  annotations: { readOnly: true },
  handler: async ({ card_id, verbosity }, ctx) => {
    const members = await ctx.client.getCardMembers(card_id, ctx.signal);
    return applyMemberVerbosity(members, verbosity ?? 'normal');
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/tools/members/get-card-members.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/members/get-card-members.ts test/tools/members/get-card-members.test.ts
git commit -m "feat(tools): add kaiten_get_card_members"
```

---

## Task 6: `kaiten_add_card_members` tool

**Files:**
- Create: `src/tools/members/add-card-members.ts`
- Test: `test/tools/members/add-card-members.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/tools/members/add-card-members.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { addCardMembers } from '../../../src/tools/members/add-card-members.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_add_card_members tool module', () => {
  it('adds each user and reports a batch summary', async () => {
    const addCardMemberFn = vi.fn().mockResolvedValue({ id: 1 });
    const res = await addCardMembers.run({ card_id: 5, user_ids: [7, 8] }, fakeCtx({ client: { addCardMember: addCardMemberFn } }));
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual({
      card_id: 5,
      succeeded: [7, 8],
      failed: [],
      summary: '2 added, 0 failed',
    });
    expect(addCardMemberFn).toHaveBeenNthCalledWith(1, 5, 7, undefined);
    expect(addCardMemberFn).toHaveBeenNthCalledWith(2, 5, 8, undefined);
  });

  it('continues on individual failures', async () => {
    const addCardMemberFn = vi.fn()
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce(new Error('nope'));
    const res = await addCardMembers.run({ card_id: 5, user_ids: [7, 8] }, fakeCtx({ client: { addCardMember: addCardMemberFn } }));
    const body = JSON.parse(res.content[0].text);
    expect(body.succeeded).toEqual([7]);
    expect(body.failed).toEqual([{ user_id: 8, error: 'nope' }]);
  });

  it('rejects an empty user_ids array via the schema', async () => {
    const res = await addCardMembers.run({ card_id: 5, user_ids: [] }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(addCardMembers.name).toBe('kaiten_add_card_members');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/tools/members/add-card-members.test.ts`
Expected: FAIL — cannot find module `add-card-members.js`.

- [ ] **Step 3: Create the tool**

Create `src/tools/members/add-card-members.ts`:

```ts
import { defineTool } from '../kit.js';
import { AddCardMembersSchema } from '../../schemas.js';
import { batchCardMembers } from '../helpers.js';
import { ADD_CARD_MEMBERS_DESC } from './descriptions.js';

/**
 * kaiten_add_card_members — batch add. One addCardMember call per user id, in
 * order, via batchCardMembers. New members join as participants (type 1).
 */
export const addCardMembers = defineTool({
  name: 'kaiten_add_card_members',
  description: ADD_CARD_MEMBERS_DESC,
  schema: AddCardMembersSchema,
  annotations: { idempotent: true },
  handler: ({ card_id, user_ids }, ctx) =>
    batchCardMembers(user_ids, card_id, 'added', (id) =>
      ctx.client.addCardMember(card_id, id, ctx.signal),
    ),
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/tools/members/add-card-members.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/members/add-card-members.ts test/tools/members/add-card-members.test.ts
git commit -m "feat(tools): add kaiten_add_card_members"
```

---

## Task 7: `kaiten_remove_card_members` tool

**Files:**
- Create: `src/tools/members/remove-card-members.ts`
- Test: `test/tools/members/remove-card-members.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/tools/members/remove-card-members.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { removeCardMembers } from '../../../src/tools/members/remove-card-members.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_remove_card_members tool module', () => {
  it('removes each user and reports a batch summary', async () => {
    const removeCardMemberFn = vi.fn().mockResolvedValue({ id: 7 });
    const res = await removeCardMembers.run({ card_id: 5, user_ids: [7, 8] }, fakeCtx({ client: { removeCardMember: removeCardMemberFn } }));
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual({
      card_id: 5,
      succeeded: [7, 8],
      failed: [],
      summary: '2 removed, 0 failed',
    });
    expect(removeCardMemberFn).toHaveBeenNthCalledWith(1, 5, 7, undefined);
  });

  it('marks isError when every removal fails', async () => {
    const removeCardMemberFn = vi.fn().mockRejectedValue(new Error('nope'));
    const res = await removeCardMembers.run({ card_id: 5, user_ids: [7] }, fakeCtx({ client: { removeCardMember: removeCardMemberFn } }));
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).summary).toBe('0 removed, 1 failed');
  });

  it('rejects an empty user_ids array via the schema', async () => {
    const res = await removeCardMembers.run({ card_id: 5, user_ids: [] }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(removeCardMembers.name).toBe('kaiten_remove_card_members');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/tools/members/remove-card-members.test.ts`
Expected: FAIL — cannot find module `remove-card-members.js`.

- [ ] **Step 3: Create the tool**

Create `src/tools/members/remove-card-members.ts`:

```ts
import { defineTool } from '../kit.js';
import { RemoveCardMembersSchema } from '../../schemas.js';
import { batchCardMembers } from '../helpers.js';
import { REMOVE_CARD_MEMBERS_DESC } from './descriptions.js';

/**
 * kaiten_remove_card_members — batch remove. One removeCardMember call per user
 * id, in order, via batchCardMembers. Also the only way to unassign a
 * responsible user (removes them from the card entirely).
 */
export const removeCardMembers = defineTool({
  name: 'kaiten_remove_card_members',
  description: REMOVE_CARD_MEMBERS_DESC,
  schema: RemoveCardMembersSchema,
  annotations: { idempotent: true },
  handler: ({ card_id, user_ids }, ctx) =>
    batchCardMembers(user_ids, card_id, 'removed', (id) =>
      ctx.client.removeCardMember(card_id, id, ctx.signal),
    ),
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/tools/members/remove-card-members.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/members/remove-card-members.ts test/tools/members/remove-card-members.test.ts
git commit -m "feat(tools): add kaiten_remove_card_members"
```

---

## Task 8: `kaiten_set_card_responsible` tool

**Files:**
- Create: `src/tools/members/set-card-responsible.ts`
- Test: `test/tools/members/set-card-responsible.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/tools/members/set-card-responsible.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { setCardResponsible } from '../../../src/tools/members/set-card-responsible.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_set_card_responsible tool module', () => {
  it('delegates to client.setCardResponsible and returns the role', async () => {
    const setCardResponsibleFn = vi.fn().mockResolvedValue({ card_id: 5, user_id: 7, type: 2 });
    const res = await setCardResponsible.run({ card_id: 5, user_id: 7 }, fakeCtx({ client: { setCardResponsible: setCardResponsibleFn } }));
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual({ card_id: 5, user_id: 7, type: 2 });
    expect(setCardResponsibleFn).toHaveBeenCalledWith(5, 7, undefined);
  });

  it('maps a thrown error to an error result', async () => {
    const res = await setCardResponsible.run({ card_id: 5, user_id: 7 }, fakeCtx({ client: { setCardResponsible: vi.fn().mockRejectedValue(new Error('boom')) } }));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects missing user_id via the schema', async () => {
    const res = await setCardResponsible.run({ card_id: 5 } as any, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(setCardResponsible.name).toBe('kaiten_set_card_responsible');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/tools/members/set-card-responsible.test.ts`
Expected: FAIL — cannot find module `set-card-responsible.js`.

- [ ] **Step 3: Create the tool**

Create `src/tools/members/set-card-responsible.ts`:

```ts
import { defineTool } from '../kit.js';
import { SetCardResponsibleSchema } from '../../schemas.js';
import { SET_CARD_RESPONSIBLE_DESC } from './descriptions.js';

/**
 * kaiten_set_card_responsible — marks a user responsible (type 2). The client
 * auto-adds the user as a member first (swallowing the already-member error)
 * then PATCHes type:2. Additive: does not demote other responsible members.
 */
export const setCardResponsible = defineTool({
  name: 'kaiten_set_card_responsible',
  description: SET_CARD_RESPONSIBLE_DESC,
  schema: SetCardResponsibleSchema,
  annotations: { idempotent: true },
  handler: ({ card_id, user_id }, ctx) =>
    ctx.client.setCardResponsible(card_id, user_id, ctx.signal),
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/tools/members/set-card-responsible.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/members/set-card-responsible.ts test/tools/members/set-card-responsible.test.ts
git commit -m "feat(tools): add kaiten_set_card_responsible"
```

---

## Task 9: Register the tools

**Files:**
- Modify: `src/tools/index.ts`

- [ ] **Step 1: Add the imports**

In `src/tools/index.ts`, after the relations imports (after line 17, `import { removeCardParents } ...`), add:

```ts
import { getCardMembers } from './members/get-card-members.js';
import { addCardMembers } from './members/add-card-members.js';
import { removeCardMembers } from './members/remove-card-members.js';
import { setCardResponsible } from './members/set-card-responsible.js';
```

- [ ] **Step 2: Add them to `ALL_TOOLS`**

In the `ALL_TOOLS` array, after `removeCardParents,` (line 41), add:

```ts
  getCardMembers,
  addCardMembers,
  removeCardMembers,
  setCardResponsible,
```

- [ ] **Step 3: Run the full suite + typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: PASS — all tests green, including the existing `test/server.test.ts` (the relations snapshots are untouched; the four new tools are now advertised).

- [ ] **Step 4: Commit**

```bash
git add src/tools/index.ts
git commit -m "feat(tools): register card member + responsible tools in ALL_TOOLS"
```

---

## Task 10: Documentation

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `CHANGELOG.md`

- [ ] **Step 1: Update tool counts 22 → 26**

Edit these exact locations, changing `22` to `26`:
- `README.md:240` — `## Доступные инструменты (22 tools)`
- `README.md:434` — `> Архитектура: 22 инструмента ...`
- `README.md:446` — `│   ├── tools/            # 22 инструмента как глубокие модули`
- `CLAUDE.md:7` — `It provides 22 tools ...`
- `CLAUDE.md:46` — `Coverage targets the pure, deterministic layers that back the 22 tools:`
- `CLAUDE.md:80` — `Registers the 22 tools via registerTools() ...`

- [ ] **Step 2: Add a tools section to README**

In `README.md`, under `## Доступные инструменты (26 tools)`, add a new subsection after the relations/card tools (place near the other card-related groups):

```markdown
### Участники и ответственный

- `kaiten_get_card_members` - Список участников карточки с ролями (type 1 = участник, 2 = ответственный) **[verbosity]**
- `kaiten_add_card_members` - Добавить участников (batch по user_ids[])
- `kaiten_remove_card_members` - Удалить участников / снять ответственного (batch)
- `kaiten_set_card_responsible` - Назначить ответственного (авто-добавляет в участники)
```

- [ ] **Step 3: Add a CHANGELOG entry**

In `CHANGELOG.md`, under `## [Unreleased]`, add an `### Added` section above `### Changed`:

```markdown
### Added
- **Card members & responsible (4 new tools, toolset 22 → 26).**
  `kaiten_get_card_members`, `kaiten_add_card_members`,
  `kaiten_remove_card_members`, and `kaiten_set_card_responsible` manage card
  participants (участники) and the responsible person (ответственный) via the
  `/cards/{id}/members` endpoints. Add/remove are batch (one API call per user,
  continue-on-error). `set_card_responsible` auto-adds the user then PATCHes
  `type:2`; it is additive (does not demote other responsible members), matching
  the Kaiten API which cannot demote a responsible back to a participant — use
  `remove_card_members` to unassign.
```

- [ ] **Step 4: Verify and commit**

Run: `npm test`
Expected: PASS (docs-only changes; nothing breaks).

```bash
git add README.md CLAUDE.md CHANGELOG.md
git commit -m "docs: document card member + responsible tools (22 -> 26)"
```

---

## Final verification

- [ ] Run the full suite once more: `npx tsc --noEmit && npm test` — expect all green.
- [ ] Optional manual smoke test against a live Kaiten (per memory: requires nvm Node ≥20 and real ENV): `npm run build && npm run inspector`, then exercise `kaiten_get_card_members` and `kaiten_set_card_responsible` on a known card.
- [ ] Finish the branch per `superpowers:finishing-a-development-branch` (merge / PR / cleanup).

---

## Self-review notes (filled in by the planner)

- **Spec coverage:** all four tools, client methods, batch helper, member verbosity, schemas, registration, tests, docs, and the additive-responsible semantics are each covered by a task. Version bump omitted on purpose — `package.json` is already 3.3.0. `TOOLS.md` omitted — it does not exist.
- **Type consistency:** `KaitenMember` (extends `KaitenUser`, adds optional `type`) and `KaitenMemberRole` (`{ created?, updated?, card_id, user_id, type }`) are defined in Task 1 and consumed consistently in Tasks 3/5/8. Client method names (`getCardMembers`, `addCardMember`, `removeCardMember`, `setCardResponsible`) match between Task 1 and the tool handlers in Tasks 5–8. Batch result shape `{ card_id, succeeded, failed:[{user_id,error}], summary }` is identical in Task 3, 6, and 7.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code; the only judgement call (the `has expected metadata` annotation key) carries an explicit fallback instruction.
