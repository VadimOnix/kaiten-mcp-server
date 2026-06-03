# Card Parents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 MCP tools (`kaiten_get_card_parents`, `kaiten_add_card_parents`, `kaiten_remove_card_parents`) for managing parent-side card hierarchy, mirroring the existing Card Children feature.

**Architecture:** Three 1:1 API methods on `KaitenClient` (`getCardParents`, `addCardParent`, `removeCardParent`) wrapped in `queuedRequest`. Batch (array-of-IDs) continue-on-error logic with summary lives in the tool handlers in `src/index.ts`. The read tool reuses `applyCardVerbosity` + `simplifyCardCompact`. Zod schemas validate input. Exact copy of the Card Children structure with `children`→`parents`.

**Tech Stack:** TypeScript, Zod, axios (via `KaitenClient`), Vitest.

**Base:** v3.1.0 (19 tools) → v3.2.0 (22 tools). Spec: `docs/superpowers/specs/2026-06-03-card-parents-design.md`. Reference implementation: the Card Children tools/methods/schemas already in the codebase.

---

## File Structure

| File | Change |
|------|--------|
| `src/kaiten-client.ts` | Add `getCardParents`, `addCardParent`, `removeCardParent` in `// Card relationships` section (next to the `*CardChild*` methods) |
| `test/kaiten-client.test.ts` | Add 3 tests in `describe('card operations')` |
| `src/schemas.ts` | Add 3 schemas + 3 type aliases in `// CARD SCHEMAS` |
| `test/schemas.test.ts` | Add 3 `describe` blocks; extend imports |
| `src/index.ts` | Add 3 schema imports, 3 tool definitions, 3 handler cases |
| `package.json`, `README.md`, `CLAUDE.md`, `CHANGELOG.md` | Version 3.1.0→3.2.0, count 19→22 |

---

## Task 1: Client methods (getCardParents, addCardParent, removeCardParent)

**Files:**
- Modify: `src/kaiten-client.ts` (in `// Card relationships` section, after `removeCardChild`)
- Test: `test/kaiten-client.test.ts` (inside `describe('card operations')`)

- [ ] **Step 1: Write the failing tests**

Add inside `describe('card operations', () => { ... })` in `test/kaiten-client.test.ts`:

```typescript
  it('getCardParents GETs /cards/:id/parents', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({ data: [{ id: 7 }] });
    const parents = await client.getCardParents(5);
    expect(parents).toEqual([{ id: 7 }]);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/cards/5/parents', { signal: undefined });
  });

  it('addCardParent POSTs { card_id } to /cards/:id/parents', async () => {
    mockAxiosInstance.post.mockResolvedValueOnce({ data: { id: 99, title: 'Child' } });
    const result = await client.addCardParent(5, 42);
    expect(result).toEqual({ id: 99, title: 'Child' });
    const [url, data, opts] = mockAxiosInstance.post.mock.calls[0];
    expect(url).toBe('/cards/5/parents');
    expect(data).toEqual({ card_id: 42 });
    expect(opts).toEqual({ signal: undefined });
  });

  it('removeCardParent DELETEs /cards/:id/parents/:parentId', async () => {
    mockAxiosInstance.delete.mockResolvedValueOnce({ data: { id: 88 } });
    const result = await client.removeCardParent(5, 42);
    expect(result).toEqual({ id: 88 });
    expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/cards/5/parents/42', { signal: undefined });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/kaiten-client.test.ts -t "Parent"`
Expected: FAIL — `client.getCardParents is not a function` (etc.).

- [ ] **Step 3: Write the implementation**

In `src/kaiten-client.ts`, in the `// Card relationships` section after `removeCardChild`:

```typescript
  async getCardParents(cardId: number, signal?: AbortSignal): Promise<KaitenCard[]> {
    return this.queuedRequest(async () => {
      const response = await this.client.get(`/cards/${cardId}/parents`, { signal });
      return response.data;
    }, signal);
  }

  async addCardParent(cardId: number, parentCardId: number, signal?: AbortSignal): Promise<KaitenCard> {
    return this.queuedRequest(async () => {
      const response = await this.client.post(
        `/cards/${cardId}/parents`,
        { card_id: parentCardId },
        { signal }
      );
      return response.data;
    }, signal);
  }

  async removeCardParent(cardId: number, parentCardId: number, signal?: AbortSignal): Promise<{ id: number }> {
    return this.queuedRequest(async () => {
      const response = await this.client.delete(
        `/cards/${cardId}/parents/${parentCardId}`,
        { signal }
      );
      return response.data;
    }, signal);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/kaiten-client.test.ts -t "Parent"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/kaiten-client.ts test/kaiten-client.test.ts
git commit -m "feat(client): add card parents methods"
```

---

## Task 2: Zod schemas + type aliases

**Files:**
- Modify: `src/schemas.ts` (in `// CARD SCHEMAS` section, near the `*CardChildren*` schemas; aliases in the type-alias block)
- Test: `test/schemas.test.ts` (extend imports + add 3 `describe` blocks)

`VerbosityEnum` is already defined and exported in `src/schemas.ts` — reference it directly.

- [ ] **Step 1: Write the failing tests**

In `test/schemas.test.ts`, add to the `import { ... } from '../src/schemas'` list:

```typescript
  GetCardParentsSchema,
  AddCardParentsSchema,
  RemoveCardParentsSchema,
```

Then add these `describe` blocks (after the CardChildren blocks):

```typescript
describe('GetCardParentsSchema', () => {
  it('accepts card_id and defaults verbosity to normal', () => {
    const parsed = GetCardParentsSchema.parse({ card_id: 12345 });
    expect(parsed.card_id).toBe(12345);
    expect(parsed.verbosity).toBe('normal');
  });

  it('rejects a non-positive card_id', () => {
    expect(() => GetCardParentsSchema.parse({ card_id: 0 })).toThrow();
  });

  it('rejects unknown extra keys (strict)', () => {
    expect(() => GetCardParentsSchema.parse({ card_id: 1, bogus: true })).toThrow();
  });
});

describe('AddCardParentsSchema', () => {
  it('accepts card_id and a non-empty parent_card_ids array', () => {
    const parsed = AddCardParentsSchema.parse({ card_id: 1, parent_card_ids: [2, 3] });
    expect(parsed.parent_card_ids).toEqual([2, 3]);
  });

  it('rejects an empty parent_card_ids array', () => {
    expect(() => AddCardParentsSchema.parse({ card_id: 1, parent_card_ids: [] })).toThrow();
  });

  it('rejects non-positive or non-integer parent ids', () => {
    expect(() => AddCardParentsSchema.parse({ card_id: 1, parent_card_ids: [0] })).toThrow();
    expect(() => AddCardParentsSchema.parse({ card_id: 1, parent_card_ids: [1.5] })).toThrow();
  });

  it('requires parent_card_ids', () => {
    expect(() => AddCardParentsSchema.parse({ card_id: 1 })).toThrow();
  });

  it('rejects unknown extra keys (strict)', () => {
    expect(() => AddCardParentsSchema.parse({ card_id: 1, parent_card_ids: [2], bogus: true })).toThrow();
  });
});

describe('RemoveCardParentsSchema', () => {
  it('accepts card_id and a non-empty parent_card_ids array', () => {
    const parsed = RemoveCardParentsSchema.parse({ card_id: 1, parent_card_ids: [2] });
    expect(parsed.parent_card_ids).toEqual([2]);
  });

  it('rejects an empty parent_card_ids array', () => {
    expect(() => RemoveCardParentsSchema.parse({ card_id: 1, parent_card_ids: [] })).toThrow();
  });

  it('rejects non-positive or non-integer parent ids', () => {
    expect(() => RemoveCardParentsSchema.parse({ card_id: 1, parent_card_ids: [0] })).toThrow();
    expect(() => RemoveCardParentsSchema.parse({ card_id: 1, parent_card_ids: [1.5] })).toThrow();
  });

  it('requires parent_card_ids', () => {
    expect(() => RemoveCardParentsSchema.parse({ card_id: 1 })).toThrow();
  });

  it('rejects unknown extra keys (strict)', () => {
    expect(() => RemoveCardParentsSchema.parse({ card_id: 1, parent_card_ids: [2], bogus: true })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/schemas.test.ts -t "CardParents"`
Expected: FAIL — schemas not exported / import error.

- [ ] **Step 3: Write the implementation**

In `src/schemas.ts`, in the `// CARD SCHEMAS` section after the `RemoveCardChildrenSchema`:

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

Then add to the type-alias block at the bottom of the file (near `*CardChildrenArgs`):

```typescript
export type GetCardParentsArgs = z.infer<typeof GetCardParentsSchema>;
export type AddCardParentsArgs = z.infer<typeof AddCardParentsSchema>;
export type RemoveCardParentsArgs = z.infer<typeof RemoveCardParentsSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/schemas.test.ts -t "CardParents"`
Expected: PASS.

- [ ] **Step 5: Build + commit**

```bash
npm run build
git add src/schemas.ts test/schemas.test.ts
git commit -m "feat(schemas): add card parents schemas and type aliases"
```

Expected: build clean.

---

## Task 3: Three tools (get/add/remove card parents) in src/index.ts

**Files:**
- Modify: `src/index.ts` — schema import block, `tools` array, handler switch

`applyCardVerbosity`, `simplifyCardCompact` are already imported.

- [ ] **Step 1: Add the schema imports**

In `src/index.ts`, in the `import { ... } from './schemas'` block, add:

```typescript
  GetCardParentsSchema,
  AddCardParentsSchema,
  RemoveCardParentsSchema,
```

- [ ] **Step 2: Add three tool definitions**

In the `tools` array, after the `kaiten_remove_card_children` definition, add:

```typescript
  {
    name: 'kaiten_get_card_parents',
    description: `Get the parent cards of a card.

PURPOSE: List the parent cards this card is a subtask of. Use to understand where a card sits in the hierarchy or to find parent IDs before detaching.

PARAMETERS:
- card_id (required): The child card ID. Positive integer.
- verbosity (optional): minimal | normal (default) | detailed.

RETURNS: JSON array of parent cards (id, title, board, owner, url, ...). Empty array [] if the card has no parents.

RELATED TOOLS:
- kaiten_add_card_parents: Attach parents
- kaiten_remove_card_parents: Detach parents
- kaiten_get_card_children: The inverse (subtasks of a card)`,
    annotations: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      openWorld: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        card_id: { type: 'number', description: 'Child card ID' },
        verbosity: {
          type: 'string',
          enum: ['minimal', 'normal', 'detailed'],
          description: 'Response detail level (default: normal)',
        },
      },
      required: ['card_id'],
    },
  },
  {
    name: 'kaiten_add_card_parents',
    description: `Attach one or more parent cards to a card (makes this card their subtask).

PURPOSE: Link a card under existing parent cards. Accepts an array of parent IDs; the server issues one API call per parent and continues on individual failures.

PARAMETERS:
- card_id (required): The child card ID. Positive integer.
- parent_card_ids (required): Array of parent card IDs to attach. At least one.

RETURNS: JSON summary { child_card_id, succeeded: number[], failed: [{ parent_card_id, error }], summary }.

NOTE: Attaching is idempotent — re-attaching an existing parent does not create duplicates.

RELATED TOOLS:
- kaiten_get_card_parents: List current parents
- kaiten_remove_card_parents: Detach parents`,
    annotations: {
      readOnly: false,
      destructive: false,
      idempotent: true,
      openWorld: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        card_id: { type: 'number', description: 'Child card ID' },
        parent_card_ids: {
          type: 'array',
          items: { type: 'number' },
          minItems: 1,
          description: 'IDs of parent cards to attach',
        },
      },
      required: ['card_id', 'parent_card_ids'],
    },
  },
  {
    name: 'kaiten_remove_card_parents',
    description: `Detach one or more parent cards from a card.

PURPOSE: Remove parent links. Accepts an array of parent IDs; the server issues one API call per parent and continues on individual failures. Detaches the relationship only — it does NOT delete the parent cards.

PARAMETERS:
- card_id (required): The child card ID. Positive integer.
- parent_card_ids (required): Array of parent card IDs to detach. At least one.

RETURNS: JSON summary { child_card_id, succeeded: number[], failed: [{ parent_card_id, error }], summary }.

RELATED TOOLS:
- kaiten_get_card_parents: List current parents to find IDs
- kaiten_add_card_parents: Attach parents`,
    annotations: {
      readOnly: false,
      destructive: false,
      idempotent: true,
      openWorld: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        card_id: { type: 'number', description: 'Child card ID' },
        parent_card_ids: {
          type: 'array',
          items: { type: 'number' },
          minItems: 1,
          description: 'IDs of parent cards to detach',
        },
      },
      required: ['card_id', 'parent_card_ids'],
    },
  },
```

- [ ] **Step 3: Add three handler cases**

In the tool-dispatch `switch`, after the `kaiten_remove_card_children` case, add:

```typescript
      case 'kaiten_get_card_parents': {
        const validatedArgs = GetCardParentsSchema.parse(args);
        const parents = await kaitenClient.getCardParents(validatedArgs.card_id, signal);
        const verbosity = validatedArgs.verbosity || 'normal';
        const processed = applyCardVerbosity(parents, verbosity, simplifyCardCompact);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(processed, null, 2),
            },
          ],
        };
      }

      case 'kaiten_add_card_parents': {
        const validatedArgs = AddCardParentsSchema.parse(args);
        const succeeded: number[] = [];
        const failed: Array<{ parent_card_id: number; error: string }> = [];
        for (const parentId of validatedArgs.parent_card_ids) {
          try {
            await kaitenClient.addCardParent(validatedArgs.card_id, parentId, signal);
            succeeded.push(parentId);
          } catch (err) {
            failed.push({
              parent_card_id: parentId,
              error: err instanceof KaitenError
                ? `${err.message}${err.hint ? ` — ${err.hint}` : ''}`
                : err instanceof Error ? err.message : String(err),
            });
          }
        }
        const result = {
          child_card_id: validatedArgs.card_id,
          succeeded,
          failed,
          summary: `${succeeded.length} added, ${failed.length} failed`,
        };
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          ...(succeeded.length === 0 ? { isError: true } : {}),
        };
      }

      case 'kaiten_remove_card_parents': {
        const validatedArgs = RemoveCardParentsSchema.parse(args);
        const succeeded: number[] = [];
        const failed: Array<{ parent_card_id: number; error: string }> = [];
        for (const parentId of validatedArgs.parent_card_ids) {
          try {
            await kaitenClient.removeCardParent(validatedArgs.card_id, parentId, signal);
            succeeded.push(parentId);
          } catch (err) {
            failed.push({
              parent_card_id: parentId,
              error: err instanceof KaitenError
                ? `${err.message}${err.hint ? ` — ${err.hint}` : ''}`
                : err instanceof Error ? err.message : String(err),
            });
          }
        }
        const result = {
          child_card_id: validatedArgs.card_id,
          succeeded,
          failed,
          summary: `${succeeded.length} removed, ${failed.length} failed`,
        };
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          ...(succeeded.length === 0 ? { isError: true } : {}),
        };
      }
```

Note: `KaitenError` is already imported in `src/index.ts` (used by the card children handlers). If a build error says it is not, add it to the existing import from `'./kaiten-client.js'`.

- [ ] **Step 4: Build + full test suite**

Run: `npm run build && npm test`
Expected: clean compile; all tests pass (existing + new parent client/schema tests).

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(tools): add card parents tools (get/add/remove)"
```

---

## Task 4: Live API contract verification

The POST/DELETE `/cards/{id}/parents` contract was inferred by symmetry with Card Children. Verify it against the real API before trusting it. This task does NOT change code unless the contract differs.

**Files:** none (verification only), unless a mismatch requires fixing `src/kaiten-client.ts` + tests.

- [ ] **Step 1: Check for a usable API token**

Run: `test -f .env && grep -E 'KAITEN_API_(URL|TOKEN)' .env >/dev/null && echo "has-creds" || echo "no-creds"`

- [ ] **Step 2a (if has-creds): probe the contract with curl**

Read `KAITEN_API_URL` and `KAITEN_API_TOKEN` from `.env`. Pick a safe test card (a throwaway card you create or one the user designates). Verify the GET shape first (non-mutating):

```bash
# Replace <URL>, <TOKEN>, <CARD_ID>
curl -s -H "Authorization: Bearer <TOKEN>" "<URL>/cards/<CARD_ID>/parents" | head -c 500
```

Confirm it returns a JSON array of card objects (200). If you have a disposable parent card id, optionally test the POST body shape:

```bash
curl -s -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"card_id": <PARENT_ID>}' "<URL>/cards/<CARD_ID>/parents" | head -c 500
```

Expected: POST returns a card object (200); the relationship appears in a subsequent GET. Then clean up with the DELETE form `…/parents/<PARENT_ID>`.

If the POST body key is NOT `card_id` (e.g. it's `parent_id`) or the path differs, update `addCardParent`/`removeCardParent` in `src/kaiten-client.ts` and the corresponding tests to match, then re-run `npm test`.

- [ ] **Step 2b (if no-creds): document manual verification**

No usable credentials in-repo. Report status DONE_WITH_CONCERNS noting that the contract is unverified against the live API and must be confirmed by the user before merge (e.g. via `npm run inspector` after `npm run build`, calling `kaiten_add_card_parents` on a test card). The unit tests guarantee the client sends `POST /cards/{id}/parents` with body `{card_id}` and `DELETE /cards/{id}/parents/{parentId}` — only the API's acceptance of that exact shape is unconfirmed.

- [ ] **Step 3: Commit (only if the contract required a fix)**

```bash
git add src/kaiten-client.ts test/kaiten-client.test.ts
git commit -m "fix(client): align card parents contract with live API"
```

If no fix was needed, skip the commit.

---

## Task 5: Documentation & version bump

**Files:** `package.json`, `README.md`, `CLAUDE.md`, `CHANGELOG.md`

- [ ] **Step 1: Bump version**

In `package.json`, change `"version": "3.1.0"` to `"version": "3.2.0"`.

- [ ] **Step 2: README — tool count + new section**

- Change the tools heading `## Доступные инструменты (19 tools)` → `(22 tools)`.
- After the `### Подзадачи (Card Children)` section, add:
  ```markdown
  ### Родительские карточки (Card Parents)

  - `kaiten_get_card_parents` - Получить родительские карточки **[verbosity: minimal/normal/detailed]**
  - `kaiten_add_card_parents` - Привязать родителей (массив ID, continue-on-error)
  - `kaiten_remove_card_parents` - Отвязать родителей (массив ID, continue-on-error)
  ```
- If a project version string `3.1.0` appears in README, update it to `3.2.0`.

- [ ] **Step 3: CLAUDE.md**

Change "It provides 19 tools" → "It provides 22 tools"; "back the 19 tools" → "back the 22 tools"; "Defines 19 tool handlers (cards, comments, children, spaces, boards)" → "Defines 22 tool handlers (cards, comments, children, parents, spaces, boards)"; bump "Current Version" to 3.2.0.

- [ ] **Step 4: CHANGELOG.md**

Add at the top, after `# Changelog`:

```markdown
## [3.2.0] - 2026-06-03

### Added
- **Card Parents tools (3)** — manage the parent side of card hierarchy:
  - `kaiten_get_card_parents` — list a card's parent cards, with verbosity control.
  - `kaiten_add_card_parents` — attach an array of parent cards (one API call per ID, continue-on-error with summary; full-batch failure flagged via `isError`).
  - `kaiten_remove_card_parents` — detach an array of parent cards (one API call per ID, continue-on-error with summary).

Tool count: 19 → 22.
```

- [ ] **Step 5: Build + test + commit**

```bash
npm run build && npm test
git add package.json README.md CLAUDE.md CHANGELOG.md
git commit -m "docs: document card parents tools, bump to v3.2.0 (19→22 tools)"
```

Expected: clean compile; all tests pass.

---

## Verification (after all tasks)

- [ ] `npm run build` — clean.
- [ ] `npm test` — all green (existing + 3 client tests + ~14 schema assertions).
- [ ] Contract verified live (Task 4) OR flagged as a pre-merge manual check.
- [ ] Tool count is exactly 22 across `package.json`/README/CLAUDE.md.
