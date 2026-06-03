# Card Children Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 MCP tools (`kaiten_get_card_children`, `kaiten_add_card_children`, `kaiten_remove_card_children`) for managing parent–child card relationships (subtasks) in Kaiten.

**Architecture:** Two new 1:1 API methods in `KaitenClient` (`addCardChild`, `removeCardChild`) wrapped in the existing `queuedRequest`. Batch (array-of-IDs) logic with continue-on-error + summary lives in the tool handlers in `src/index.ts`, not in the client. The read tool reuses `applyCardVerbosity` + `simplifyCardCompact`. Zod schemas validate input.

**Tech Stack:** TypeScript, Zod, axios (via `KaitenClient`), Vitest.

**Base:** v3.0.0 (16 tools) → v3.1.0 (19 tools). Helpers live in `src/transformers.ts` (`simplifyCardCompact`) and `src/utils.ts` (`applyCardVerbosity`). Spec: `docs/superpowers/specs/2026-06-03-card-children-design.md`.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/kaiten-client.ts` | 1:1 HTTP methods | Add `addCardChild`, `removeCardChild` after `getCardChildren` (≈ line 591, `// Card relationships` section) |
| `test/kaiten-client.test.ts` | Client unit tests | Add tests for the two new methods inside `describe('card operations')` |
| `src/schemas.ts` | Zod input schemas | Add 3 schemas in `// CARD SCHEMAS` section after `DeleteCardSchema` (≈ line 72) |
| `test/schemas.test.ts` | Schema unit tests | Add 3 `describe` blocks; extend the import list |
| `src/index.ts` | Tool defs + handlers | Add 3 schema imports, 3 tool definitions in `tools` array, 3 `case` handlers in the switch |
| `package.json`, `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `ROADMAP_FEATURES.md` | Docs | Version 3.0.0→3.1.0, count 16→19, mark roadmap item done |

---

## Task 1: Client method `addCardChild`

**Files:**
- Modify: `src/kaiten-client.ts` (after `getCardChildren`, ≈ line 596)
- Test: `test/kaiten-client.test.ts` (inside `describe('card operations')`, after the `getCardChildren` test ≈ line 100)

- [ ] **Step 1: Write the failing test**

Add inside `describe('card operations', () => { ... })` in `test/kaiten-client.test.ts`:

```typescript
  it('addCardChild POSTs { card_id } to /cards/:id/children', async () => {
    mockAxiosInstance.post.mockResolvedValueOnce({ data: { id: 5, title: 'Parent' } });
    const result = await client.addCardChild(5, 42);
    expect(result).toEqual({ id: 5, title: 'Parent' });
    const [url, data, opts] = mockAxiosInstance.post.mock.calls[0];
    expect(url).toBe('/cards/5/children');
    expect(data).toEqual({ card_id: 42 });
    expect(opts).toEqual({ signal: undefined });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/kaiten-client.test.ts -t "addCardChild"`
Expected: FAIL — `client.addCardChild is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/kaiten-client.ts`, immediately after the `getCardChildren` method (in the `// Card relationships` section):

```typescript
  async addCardChild(cardId: number, childCardId: number, signal?: AbortSignal): Promise<KaitenCard> {
    return this.queuedRequest(async () => {
      const response = await this.client.post(
        `/cards/${cardId}/children`,
        { card_id: childCardId },
        { signal }
      );
      return response.data;
    }, signal);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/kaiten-client.test.ts -t "addCardChild"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/kaiten-client.ts test/kaiten-client.test.ts
git commit -m "feat(client): add addCardChild method"
```

---

## Task 2: Client method `removeCardChild`

**Files:**
- Modify: `src/kaiten-client.ts` (after `addCardChild`)
- Test: `test/kaiten-client.test.ts` (inside `describe('card operations')`)

- [ ] **Step 1: Write the failing test**

Add inside `describe('card operations', ...)`:

```typescript
  it('removeCardChild DELETEs /cards/:id/children/:childId', async () => {
    mockAxiosInstance.delete.mockResolvedValueOnce({ data: { id: 99 } });
    const result = await client.removeCardChild(5, 42);
    expect(result).toEqual({ id: 99 });
    expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/cards/5/children/42', { signal: undefined });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/kaiten-client.test.ts -t "removeCardChild"`
Expected: FAIL — `client.removeCardChild is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/kaiten-client.ts`, immediately after `addCardChild`:

```typescript
  async removeCardChild(cardId: number, childCardId: number, signal?: AbortSignal): Promise<{ id: number }> {
    return this.queuedRequest(async () => {
      const response = await this.client.delete(
        `/cards/${cardId}/children/${childCardId}`,
        { signal }
      );
      return response.data;
    }, signal);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/kaiten-client.test.ts -t "removeCardChild"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/kaiten-client.ts test/kaiten-client.test.ts
git commit -m "feat(client): add removeCardChild method"
```

---

## Task 3: Zod schemas

**Files:**
- Modify: `src/schemas.ts` (in `// CARD SCHEMAS` section, after `DeleteCardSchema` ≈ line 72)
- Test: `test/schemas.test.ts` (extend imports + add 3 `describe` blocks)

`VerbosityEnum` is already defined and exported in `src/schemas.ts` (≈ line 11) — reference it directly, no new import.

- [ ] **Step 1: Write the failing tests**

In `test/schemas.test.ts`, add the three new names to the import block at the top (the `import { ... } from '../src/schemas'` list):

```typescript
  GetCardChildrenSchema,
  AddCardChildrenSchema,
  RemoveCardChildrenSchema,
```

Then add these `describe` blocks (anywhere after the existing card-schema blocks):

```typescript
describe('GetCardChildrenSchema', () => {
  it('accepts card_id and defaults verbosity to normal', () => {
    const parsed = GetCardChildrenSchema.parse({ card_id: 12345 });
    expect(parsed.card_id).toBe(12345);
    expect(parsed.verbosity).toBe('normal');
  });

  it('accepts an explicit verbosity', () => {
    expect(GetCardChildrenSchema.parse({ card_id: 1, verbosity: 'minimal' }).verbosity).toBe('minimal');
  });

  it('rejects a non-positive card_id', () => {
    expect(() => GetCardChildrenSchema.parse({ card_id: 0 })).toThrow();
  });

  it('rejects unknown extra keys (strict)', () => {
    expect(() => GetCardChildrenSchema.parse({ card_id: 1, bogus: true })).toThrow();
  });
});

describe('AddCardChildrenSchema', () => {
  it('accepts card_id and a non-empty child_card_ids array', () => {
    const parsed = AddCardChildrenSchema.parse({ card_id: 1, child_card_ids: [2, 3] });
    expect(parsed.child_card_ids).toEqual([2, 3]);
  });

  it('rejects an empty child_card_ids array', () => {
    expect(() => AddCardChildrenSchema.parse({ card_id: 1, child_card_ids: [] })).toThrow();
  });

  it('rejects non-positive or non-integer child ids', () => {
    expect(() => AddCardChildrenSchema.parse({ card_id: 1, child_card_ids: [0] })).toThrow();
    expect(() => AddCardChildrenSchema.parse({ card_id: 1, child_card_ids: [1.5] })).toThrow();
  });

  it('requires child_card_ids', () => {
    expect(() => AddCardChildrenSchema.parse({ card_id: 1 })).toThrow();
  });

  it('rejects unknown extra keys (strict)', () => {
    expect(() => AddCardChildrenSchema.parse({ card_id: 1, child_card_ids: [2], bogus: true })).toThrow();
  });
});

describe('RemoveCardChildrenSchema', () => {
  it('accepts card_id and a non-empty child_card_ids array', () => {
    const parsed = RemoveCardChildrenSchema.parse({ card_id: 1, child_card_ids: [2] });
    expect(parsed.child_card_ids).toEqual([2]);
  });

  it('rejects an empty child_card_ids array', () => {
    expect(() => RemoveCardChildrenSchema.parse({ card_id: 1, child_card_ids: [] })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/schemas.test.ts -t "CardChildren"`
Expected: FAIL — schemas are not exported / import error.

- [ ] **Step 3: Write minimal implementation**

In `src/schemas.ts`, after `DeleteCardSchema` (within the `// CARD SCHEMAS` section):

```typescript
export const GetCardChildrenSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the parent card'),
  verbosity: VerbosityEnum,
}).strict();

export const AddCardChildrenSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the parent card'),
  child_card_ids: z.array(z.number().positive().int()).min(1)
    .describe('IDs of child cards to attach as subtasks (one API call per ID)'),
}).strict();

export const RemoveCardChildrenSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the parent card'),
  child_card_ids: z.array(z.number().positive().int()).min(1)
    .describe('IDs of child cards to detach (one API call per ID)'),
}).strict();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/schemas.test.ts -t "CardChildren"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/schemas.ts test/schemas.test.ts
git commit -m "feat(schemas): add card children schemas"
```

---

## Task 4: `kaiten_get_card_children` tool

**Files:**
- Modify: `src/index.ts` — schema import block (≈ line 33), `tools` array, handler switch

`applyCardVerbosity`, `simplifyCardCompact` are already imported in `src/index.ts` (≈ lines 44, 53).

- [ ] **Step 1: Add the schema import**

In `src/index.ts`, in the `import { ... } from './schemas'` block, add:

```typescript
  GetCardChildrenSchema,
  AddCardChildrenSchema,
  RemoveCardChildrenSchema,
```

- [ ] **Step 2: Add the tool definition**

In the `tools` array (e.g. right after the `kaiten_get_card_comments` definition), add:

```typescript
  {
    name: 'kaiten_get_card_children',
    description: `Get the child cards (subtasks) of a parent card.

PURPOSE: List the subtasks linked under a parent card. Use to review breakdown, check progress, or find child IDs before detaching.

PARAMETERS:
- card_id (required): Parent card ID. Positive integer.
- verbosity (optional): minimal | normal (default) | detailed.

RETURNS: JSON array of child cards (id, title, board, owner, url, ...). Empty array [] if the card has no children.

RELATED TOOLS:
- kaiten_add_card_children: Attach subtasks
- kaiten_remove_card_children: Detach subtasks
- kaiten_get_card: Check children_count before fetching`,
    annotations: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      openWorld: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        card_id: { type: 'number', description: 'Parent card ID' },
        verbosity: {
          type: 'string',
          enum: ['minimal', 'normal', 'detailed'],
          description: 'Response detail level (default: normal)',
        },
      },
      required: ['card_id'],
    },
  },
```

- [ ] **Step 3: Add the handler**

In the `switch` handling tool calls (e.g. after the `kaiten_get_card_comments` case ≈ line 2398), add:

```typescript
      case 'kaiten_get_card_children': {
        const validatedArgs = GetCardChildrenSchema.parse(args);
        const children = await kaitenClient.getCardChildren(validatedArgs.card_id, signal);
        const verbosity = validatedArgs.verbosity || 'normal';
        const processed = applyCardVerbosity(children, verbosity, simplifyCardCompact);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(processed, null, 2),
            },
          ],
        };
      }
```

- [ ] **Step 4: Build to verify it compiles**

Run: `npm run build`
Expected: TypeScript compiles with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(tools): add kaiten_get_card_children tool"
```

---

## Task 5: `kaiten_add_card_children` tool (batch, continue-on-error)

**Files:**
- Modify: `src/index.ts` — `tools` array, handler switch

- [ ] **Step 1: Add the tool definition**

In the `tools` array, after `kaiten_get_card_children`:

```typescript
  {
    name: 'kaiten_add_card_children',
    description: `Attach one or more child cards (subtasks) to a parent card.

PURPOSE: Link existing cards as subtasks under a parent. Accepts an array of child IDs; the server issues one API call per child and continues on individual failures.

PARAMETERS:
- card_id (required): Parent card ID. Positive integer.
- child_card_ids (required): Array of child card IDs to attach. At least one.

RETURNS: JSON summary { parent_card_id, succeeded: number[], failed: [{ child_card_id, error }], summary }.

NOTE: Attaching is idempotent — re-attaching an existing child does not create duplicates.

RELATED TOOLS:
- kaiten_get_card_children: List current children
- kaiten_remove_card_children: Detach subtasks`,
    annotations: {
      readOnly: false,
      destructive: false,
      idempotent: true,
      openWorld: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        card_id: { type: 'number', description: 'Parent card ID' },
        child_card_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'IDs of child cards to attach',
        },
      },
      required: ['card_id', 'child_card_ids'],
    },
  },
```

- [ ] **Step 2: Add the handler**

In the `switch`, after the `kaiten_get_card_children` case:

```typescript
      case 'kaiten_add_card_children': {
        const validatedArgs = AddCardChildrenSchema.parse(args);
        const succeeded: number[] = [];
        const failed: Array<{ child_card_id: number; error: string }> = [];
        for (const childId of validatedArgs.child_card_ids) {
          try {
            await kaitenClient.addCardChild(validatedArgs.card_id, childId, signal);
            succeeded.push(childId);
          } catch (err) {
            failed.push({
              child_card_id: childId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        const result = {
          parent_card_id: validatedArgs.card_id,
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
        };
      }
```

- [ ] **Step 3: Build to verify it compiles**

Run: `npm run build`
Expected: TypeScript compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(tools): add kaiten_add_card_children tool"
```

---

## Task 6: `kaiten_remove_card_children` tool (batch, continue-on-error)

**Files:**
- Modify: `src/index.ts` — `tools` array, handler switch

- [ ] **Step 1: Add the tool definition**

In the `tools` array, after `kaiten_add_card_children`:

```typescript
  {
    name: 'kaiten_remove_card_children',
    description: `Detach one or more child cards (subtasks) from a parent card.

PURPOSE: Remove parent–child links. Accepts an array of child IDs; the server issues one API call per child and continues on individual failures. Detaches the relationship only — it does NOT delete the child cards.

PARAMETERS:
- card_id (required): Parent card ID. Positive integer.
- child_card_ids (required): Array of child card IDs to detach. At least one.

RETURNS: JSON summary { parent_card_id, succeeded: number[], failed: [{ child_card_id, error }], summary }.

RELATED TOOLS:
- kaiten_get_card_children: List current children to find IDs
- kaiten_add_card_children: Attach subtasks`,
    annotations: {
      readOnly: false,
      destructive: false,
      idempotent: true,
      openWorld: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        card_id: { type: 'number', description: 'Parent card ID' },
        child_card_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'IDs of child cards to detach',
        },
      },
      required: ['card_id', 'child_card_ids'],
    },
  },
```

- [ ] **Step 2: Add the handler**

In the `switch`, after the `kaiten_add_card_children` case:

```typescript
      case 'kaiten_remove_card_children': {
        const validatedArgs = RemoveCardChildrenSchema.parse(args);
        const succeeded: number[] = [];
        const failed: Array<{ child_card_id: number; error: string }> = [];
        for (const childId of validatedArgs.child_card_ids) {
          try {
            await kaitenClient.removeCardChild(validatedArgs.card_id, childId, signal);
            succeeded.push(childId);
          } catch (err) {
            failed.push({
              child_card_id: childId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        const result = {
          parent_card_id: validatedArgs.card_id,
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
        };
      }
```

- [ ] **Step 3: Build + full test suite**

Run: `npm run build && npm test`
Expected: Compiles clean; all tests pass (existing 98 + new client/schema tests).

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(tools): add kaiten_remove_card_children tool"
```

---

## Task 7: Documentation & version bump

**Files:**
- Modify: `package.json`, `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `ROADMAP_FEATURES.md`

- [ ] **Step 1: Bump version**

In `package.json`, change `"version": "3.0.0"` to `"version": "3.1.0"`.

- [ ] **Step 2: Update tool count and tool list in README.md**

- Change any "16 tools" reference to "19 tools".
- In the tools listing, add a "Подзадачи (Card Children)" section:
  ```markdown
  ### Подзадачи (Card Children)

  - `kaiten_get_card_children` - Получить дочерние карточки (подзадачи) **[verbosity: minimal/normal/detailed]**
  - `kaiten_add_card_children` - Привязать подзадачи (массив ID, continue-on-error)
  - `kaiten_remove_card_children` - Отвязать подзадачи (массив ID, continue-on-error)
  ```

- [ ] **Step 3: Update CLAUDE.md**

Change the tool count in the Project Overview ("provides 16 tools" → "provides 19 tools") and bump "Current Version" to 3.1.0.

- [ ] **Step 4: Update CHANGELOG.md**

Add a new entry at the top:

```markdown
## [3.1.0] - 2026-06-03

### Added
- `kaiten_get_card_children` — list child cards (subtasks) of a parent card, with verbosity control.
- `kaiten_add_card_children` — attach an array of child cards (one API call per ID, continue-on-error with summary).
- `kaiten_remove_card_children` — detach an array of child cards (one API call per ID, continue-on-error with summary).

Implements Phase 1 / item 1 (Card Children) of ROADMAP_FEATURES.md.
```

- [ ] **Step 5: Mark roadmap item done in ROADMAP_FEATURES.md**

In `ROADMAP_FEATURES.md`, in the "Фаза 1 — Core расширения" section, mark item 1 (Card Children) as done, e.g. prefix with `~~`/`✅`:

```markdown
1. ✅ **Card Children** — `kaiten_add_card_children`, `kaiten_remove_card_children`, `kaiten_get_card_children` (v3.1.0)
```

- [ ] **Step 6: Build to confirm nothing broke**

Run: `npm run build && npm test`
Expected: Compiles clean; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add package.json README.md CLAUDE.md CHANGELOG.md ROADMAP_FEATURES.md
git commit -m "docs: document card children tools, bump to v3.1.0"
```

---

## Verification (after all tasks)

- [ ] `npm run build` — clean compile.
- [ ] `npm test` — all tests green (existing 98 + 2 client tests + ~11 schema assertions).
- [ ] Optional manual check via `npm run inspector` or the connected `kaiten` MCP server: call `kaiten_get_card_children` on a card known to have subtasks; verify the array is returned.
- [ ] Confirm the tool count is exactly 19 across `package.json`/README/CLAUDE.md.
