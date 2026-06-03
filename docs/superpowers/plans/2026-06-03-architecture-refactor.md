# Tool Module Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn each of the 22 MCP tools into a *deep module* (one file co-locating name + description + Zod schema + behaviour), delete the 700-line `switch` dispatch and the ~2000-line hand-written JSON-Schema array, and inject dependencies through one `ServerContext` seam — without changing the protocol contract clients depend on.

**Architecture:** A `defineTool({ name, description, schema, handler })` factory produces a `ToolDefinition` whose `run()` owns validation, the response envelope, error mapping, and `AbortSignal` plumbing. A registry collects all tools; handlers receive a `ServerContext { client, cache, config, log, signal }` instead of importing module globals. Migration is **incremental in two phases on a safety net of characterization tests**: Phase 1 wires the registry into the *existing* low-level `Server` (a `Map` shadows the `switch`, tools move into files one group at a time); Phase 2 swaps `Server`→`McpServer.registerTool`, derives JSON Schema from Zod, and deletes the hand-written schema array. Cross-cutting concerns (error mapping, verbosity, batch loops, markdown rendering) collapse into one shared seam + pure helper functions.

**Tech Stack:** TypeScript (ESM, `node>=20`), `@modelcontextprotocol/sdk ^1.20`, `zod ^3.25` (v3 — raw-shape `inputSchema`, **no** Standard-Schema/v4 path), Vitest. **Dependency versions are NOT bumped in this plan.**

**Base:** `main` at v3.2.0, **22 tools**, `src/index.ts` ≈ 3213 lines. Architecture review report: `/tmp/claude-503/architecture-review-20260603-172522.html`.

---

## Locked design decisions (do not re-litigate)

1. **Spine = minimal interface** (`defineTool` + registry). Two grafts from the "common-case" design: named pure helpers for the ~7 complex tools, and a `text()` marker for hand-built markdown.
2. **Versions frozen** — Zod v3.25, SDK ^1.20. `inputSchema` is passed as `Schema.shape` (a `ZodRawShape`) in Phase 2.
3. **`.strict()` stays on every schema.** Advertised JSON Schema carries `additionalProperties:false`; the SDK's runtime validation strips (not rejects) extra keys. This is an accepted, minor behaviour change. A test asserts the advertised schema stays strict.
4. **Validation ownership:** the seam's `run()` calls `schema.parse()` once (Phase 1). In Phase 2 the SDK validates field-level; the seam keeps owning envelope + error mapping + signal. No double-validation.
5. **Return convention:** a handler returns a plain value (seam does `JSON.stringify(v, null, 2)`), or `text(s)` for markdown, or a raw `ToolResult` for full control (only `search_cards` needs this).
6. **`ServerContext` is the only injection seam.** Built once in `src/container.ts`; `signal` re-stamped per call. Forward-compatible with any later DI container — only `container.ts` changes.
7. **Migration order of execution** (priority `#4→#1+#2→#3→#5` from the report, woven for execution): **#3 (context seam) is laid in the foundation, not last; #5 (render extraction) happens while migrating the complex tools, not as a trailing phase.**
8. **Deferred (record as ADR in Task 12, do NOT build):** middleware composition, dynamic `enabledWhen`/gates, `outputSchema`/structured content.
9. **Tool _results_ (text content) must stay byte-identical** across Phases 1–2 for the same input — Phase 1/3 are pure refactors. The Task 1 characterization tests are the guard. Advertised _schemas_ are checked semantically (field names, types, `required`, descriptions present), not by exact JSON equality.

## Vocabulary (use consistently in code and commits)

- **tool module** — one file = one tool (name + description + schema + behaviour).
- **context seam** — `ServerContext`, the single injection point for `client`/`cache`/`config`/`log`/`signal`.
- **the seam / `runTool`** — `defineTool().run()`: hidden machinery (validate, envelope, error map, signal).
- **registry** — `ALL_TOOLS` array + the function that wires it into the server.

---

## File Structure

| File | Change |
|------|--------|
| `src/tools/kit.ts` | **Create.** `ServerContext`, `ToolResult`, `text()`, `ToolDefinition`, `defineTool()`, `mapError()`. The seam. |
| `src/tools/helpers.ts` | **Create.** Pure helpers shared by complex tools: `buildSearchParams`, `batchPerItem`, `getCachedList`. |
| `src/tools/render.ts` | **Create.** Pure renderers (#5): `renderCardMarkdown`, `renderSearchSummary`. |
| `src/tools/index.ts` | **Create.** The registry: `ALL_TOOLS` array (grows as tools migrate). |
| `src/tools/registry.ts` | **Create.** Phase 1: `installToolMap()` (Map over the low-level `Server`). Phase 2: `registerTools()` (`McpServer.registerTool` loop). |
| `src/tools/cards/*.ts` | **Create.** `get-card.ts`, `create-card.ts`, `update-card.ts`, `delete-card.ts`, `search-cards.ts`. |
| `src/tools/comments/*.ts` | **Create.** `get-card-comments.ts`, `create-comment.ts`, `update-comment.ts`, `delete-comment.ts`. |
| `src/tools/relations/*.ts` | **Create.** `get-card-children.ts`, `add-card-children.ts`, `remove-card-children.ts`, `get-card-parents.ts`, `add-card-parents.ts`, `remove-card-parents.ts`. |
| `src/tools/reference/*.ts` | **Create.** `list-spaces.ts`, `list-boards.ts`, `list-columns.ts`, `list-lanes.ts`, `list-types.ts`. |
| `src/tools/users/*.ts` | **Create.** `get-current-user.ts`, `list-users.ts`. |
| `src/container.ts` | **Create.** Constructs `KaitenClient` + `makeCtx(signal)`. |
| `src/server.ts` | **Create.** `createServer()` factory (build + configure, no transport connect). |
| `src/index.ts` | **Modify heavily.** Phase 1: add Map check + `extra` param to CallTool, remove migrated cases. Phase 2: shrink to a thin entrypoint calling `createServer()` + connecting stdio; delete `tools[]` array + `switch`. |
| `test/server.test.ts` | **Create.** Characterization tests (InMemoryTransport) — the safety net. |
| `test/tools/*.test.ts` | **Create.** Per-tool unit tests against a fake `ServerContext`. |
| `test/tools/helpers.test.ts` | **Create.** Unit tests for `buildSearchParams`, `batchPerItem`, `getCachedList`. |
| `test/tools/render.test.ts` | **Create.** Unit tests for `renderCardMarkdown`, `renderSearchSummary`. |
| `package.json`, `README.md`, `CLAUDE.md`, `CHANGELOG.md` | **Modify** in Task 12 (architecture notes; no version bump unless desired). |
| `docs/adr/0001-defer-tool-middleware.md` | **Create** in Task 12. |

---

# PHASE 0 — Safety net

## Task 1: Extract `createServer()` and build the characterization net

**Files:**
- Create: `src/server.ts`
- Modify: `src/index.ts` (move everything except the stdio connect into `createServer`)
- Create: `test/server.test.ts`

- [ ] **Step 1: Extract `createServer()` (pure structural move, no behaviour change)**

Create `src/server.ts`. Move the body that builds the server, registers all handlers (ListTools/CallTool/Resources/Prompts), and calls `mcpLogger.setServer(server)` out of `index.ts` into an exported factory. It must NOT connect a transport.

```typescript
// src/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// ...move the existing handler imports + `tools` array + helpers here, OR
// keep them in index.ts and import; simplest: move the server-construction block.

export function createServer(): Server {
  const server = new Server(
    { name: 'kaiten-mcp-server', version: '3.2.0' },
    { capabilities: { tools: {}, resources: { templates: true, subscribe: false }, prompts: {}, logging: {} } },
  );
  mcpLogger.setServer(server);
  // ... all existing server.setRequestHandler(...) blocks, verbatim ...
  return server;
}
```

`src/index.ts` keeps only:

```typescript
// src/index.ts (after this step)
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { safeLog } from './config.js';

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  safeLog.info('Kaiten MCP server running on stdio');
}
main().catch((e) => { safeLog.error(`Fatal: ${e}`); process.exit(1); });
```

- [ ] **Step 2: Run the existing suite to prove the move was behaviour-neutral**

Run: `npm test`
Expected: PASS (same green as before the move).

- [ ] **Step 3: Write the characterization test harness (failing)**

Create `test/server.test.ts`. Mock axios at the module boundary exactly like `test/kaiten-client.test.ts` does, then drive the real server through an in-memory client.

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockAxiosInstance = {
  get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
};
vi.mock('axios', () => ({
  default: { create: vi.fn(() => mockAxiosInstance) },
  create: vi.fn(() => mockAxiosInstance),
}));
vi.mock('axios-retry', () => ({ default: vi.fn() }));

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

async function connect() {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  const client = new Client({ name: 'test', version: '1.0' }, { capabilities: {} });
  await server.connect(serverT);
  await client.connect(clientT);
  return client;
}

describe('protocol contract', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('lists all 22 tools with non-empty descriptions and object input schemas', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(22);
    for (const t of tools) {
      expect(t.name).toMatch(/^kaiten_/);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.inputSchema.type).toBe('object');
    }
  });

  it('get_card returns the markdown card sheet for a known card', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({ data: { id: 5, title: 'Demo', /* minimal card */ } });
    const client = await connect();
    const res = await client.callTool({ name: 'kaiten_get_card', arguments: { card_id: 5 } });
    expect(res.isError).toBeFalsy();
    expect((res.content[0] as any).text).toContain('# Demo');
  });

  it('maps a Kaiten 404 to a NOT_FOUND error result with a hint', async () => {
    mockAxiosInstance.get.mockRejectedValueOnce({ response: { status: 404, data: {} } });
    const client = await connect();
    const res = await client.callTool({ name: 'kaiten_get_card', arguments: { card_id: 999999 } });
    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toMatch(/NOT_FOUND|not found/i);
  });

  it('propagates cancellation: an aborted call rejects', async () => {
    mockAxiosInstance.get.mockImplementation(() => new Promise(() => {})); // never resolves
    const client = await connect();
    const ac = new AbortController();
    const p = client.callTool({ name: 'kaiten_get_card', arguments: { card_id: 5 } }, undefined, { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toBeDefined();
  });
});
```

- [ ] **Step 4: Run the harness to verify it passes against the CURRENT implementation**

Run: `npm test -- test/server.test.ts`
Expected: PASS. (If the cancellation test fails, that confirms the `_meta.signal` hack does not wire abort today — mark it `it.skip` with a `// FIXME: re-enable after Task 4 wires extra.signal` note; Task 4 must un-skip it.)

- [ ] **Step 5: Add a characterization snapshot for every tool's happy path**

For each of the 22 tools, add one `it(...)` that mocks the client response and asserts the returned `content[0].text` via `toMatchInlineSnapshot()`. Use the tool reference table in Task 5 for the client method each tool calls. These snapshots are the byte-stability guard for Phases 1–3.

Run: `npm test -- test/server.test.ts`
Expected: PASS (snapshots written on first run).

- [ ] **Step 6: Commit**

```bash
git add src/server.ts src/index.ts test/server.test.ts
git commit -m "test: characterization net for MCP protocol contract via InMemoryTransport"
```

---

# PHASE 1 — Foundation + incremental tool migration (on the existing low-level Server)

## Task 2: The seam — `kit.ts` (`defineTool`, `ServerContext`, `mapError`)

**Files:**
- Create: `src/tools/kit.ts`
- Create: `test/tools/kit.test.ts`

- [ ] **Step 1: Write failing tests for the seam**

```typescript
// test/tools/kit.test.ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineTool, text, mapError } from '../../src/tools/kit.js';
import { KaitenError, KaitenErrorType } from '../../src/kaiten-client.js';

const ctx = {} as any;

describe('defineTool.run', () => {
  it('wraps a plain value as pretty JSON text content', async () => {
    const t = defineTool({ name: 'x', description: 'd', schema: z.object({ a: z.number() }).strict(),
      handler: (args) => ({ got: args.a }) });
    const res = await t.run({ a: 1 }, ctx);
    expect(res.content[0]).toEqual({ type: 'text', text: JSON.stringify({ got: 1 }, null, 2) });
    expect(res.isError).toBeFalsy();
  });

  it('passes text() markers through unstringified', async () => {
    const t = defineTool({ name: 'x', description: 'd', schema: z.object({}).strict(),
      handler: () => text('# Hi') });
    const res = await t.run({}, ctx);
    expect(res.content[0]).toEqual({ type: 'text', text: '# Hi' });
  });

  it('passes a raw ToolResult straight through', async () => {
    const raw = { content: [{ type: 'text' as const, text: 'raw' }] };
    const t = defineTool({ name: 'x', description: 'd', schema: z.object({}).strict(), handler: () => raw });
    expect(await t.run({}, ctx)).toBe(raw);
  });

  it('maps a ZodError to VALIDATION_ERROR with isError', async () => {
    const t = defineTool({ name: 'x', description: 'd', schema: z.object({ a: z.number() }).strict(),
      handler: () => 1 });
    const res = await t.run({ a: 'nope' }, ctx);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('maps a thrown KaitenError via toJSON()', async () => {
    const t = defineTool({ name: 'x', description: 'd', schema: z.object({}).strict(),
      handler: () => { throw new KaitenError(KaitenErrorType.NOT_FOUND, 'gone', 404, undefined, 'check id'); } });
    const res = await t.run({}, ctx);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('NOT_FOUND');
    expect(res.content[0].text).toContain('check id');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- test/tools/kit.test.ts`
Expected: FAIL — cannot find `../../src/tools/kit.js`.

- [ ] **Step 3: Implement `kit.ts`**

```typescript
// src/tools/kit.ts
import { z } from 'zod';
import { KaitenError } from '../kaiten-client.js';
import type { KaitenClient } from '../kaiten-client.js';
import type { KaitenCache } from '../cache.js';
import type { EnvConfig } from '../config.js';
import type { logger } from '../logging/index.js';

export interface ServerContext {
  readonly client: KaitenClient;
  readonly cache: KaitenCache;
  readonly config: EnvConfig;
  readonly log: typeof logger;
  readonly signal?: AbortSignal;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

const TEXT = Symbol('kaiten.text');
type TextMarker = { [TEXT]: true; text: string };
export function text(s: string): TextMarker { return { [TEXT]: true, text: s }; }
const isText = (v: unknown): v is TextMarker =>
  typeof v === 'object' && v !== null && (v as Record<symbol, unknown>)[TEXT] === true;
const isToolResult = (v: unknown): v is ToolResult =>
  typeof v === 'object' && v !== null && Array.isArray((v as { content?: unknown }).content);

export interface ToolAnnotations { readOnly?: boolean; destructive?: boolean; idempotent?: boolean; openWorld?: boolean; }

export type ToolHandler<S extends z.ZodTypeAny> =
  (args: z.infer<S>, ctx: ServerContext) => Promise<unknown> | unknown;

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodObject<z.ZodRawShape>;
  readonly annotations: ToolAnnotations;
  run(rawArgs: unknown, ctx: ServerContext): Promise<ToolResult>;
}

export function defineTool<S extends z.ZodObject<z.ZodRawShape>>(spec: {
  name: string; description: string; schema: S;
  annotations?: ToolAnnotations; handler: ToolHandler<S>;
}): ToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    schema: spec.schema,
    annotations: spec.annotations ?? {},
    async run(rawArgs, ctx) {
      try {
        const args = spec.schema.parse(rawArgs) as z.infer<S>;
        const out = await spec.handler(args, ctx);
        if (isToolResult(out)) return out;
        if (isText(out)) return { content: [{ type: 'text', text: out.text }] };
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
      } catch (err) {
        return mapError(err);
      }
    },
  };
}

// IMPORTANT: this MUST reproduce the existing catch block at src/index.ts:3128-3190
// verbatim (same JSON keys, same shape) so the Task 1 characterization tests pass.
// Copy the three branches (ZodError / KaitenError / axios-response / unknown) from there.
export function mapError(err: unknown): ToolResult {
  if (err instanceof z.ZodError) {
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({
      error: 'VALIDATION_ERROR',
      details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message, code: e.code })),
    }, null, 2) }] };
  }
  if (err instanceof KaitenError) {
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(err.toJSON(), null, 2) }] };
  }
  const e = err as { response?: { status?: number; data?: unknown } };
  if (e?.response) {
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({
      error: 'API_ERROR', status: e.response.status, details: e.response.data,
    }, null, 2) }] };
  }
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({
    error: 'UNKNOWN_ERROR', message: err instanceof Error ? err.message : String(err),
  }, null, 2) }] };
}
```

> Before finishing this step, open `src/index.ts:3128-3190` and reconcile `mapError`'s JSON keys with the real catch block. If they differ, **match the existing block** — the characterization snapshots are authoritative.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- test/tools/kit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/kit.ts test/tools/kit.test.ts
git commit -m "feat(tools): add defineTool seam + ServerContext + mapError"
```

## Task 3: The context seam construction — `container.ts`

**Files:**
- Create: `src/container.ts`
- Modify: `src/server.ts` (stop constructing `KaitenClient` inline; import from container)

- [ ] **Step 1: Implement `container.ts`**

```typescript
// src/container.ts
import { KaitenClient } from './kaiten-client.js';
import { cache } from './cache.js';
import { config } from './config.js';
import { logger } from './logging/index.js';
import type { ServerContext } from './tools/kit.js';

export const client = new KaitenClient(config.KAITEN_API_URL, config.KAITEN_API_TOKEN);
const base = { client, cache, config, log: logger } as const;

export function makeCtx(signal?: AbortSignal): ServerContext {
  return { ...base, signal };
}
```

- [ ] **Step 2: Point `server.ts` at the shared client**

In `src/server.ts`, replace the inline `new KaitenClient(...)` with `import { client as kaitenClient, makeCtx } from './container.js';`. The existing `switch` handlers keep using `kaitenClient` for now.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS (the characterization net + existing tests stay green — this is a pure wiring move).

- [ ] **Step 4: Commit**

```bash
git add src/container.ts src/server.ts
git commit -m "feat: introduce ServerContext seam via container.makeCtx"
```

## Task 4: Registry over the existing Server (Map shadows the switch) + signal fix

**Files:**
- Create: `src/tools/index.ts`
- Create: `src/tools/registry.ts`
- Modify: `src/server.ts` (CallTool handler: add `extra`, check the Map first)

- [ ] **Step 1: Create the (empty) registry**

```typescript
// src/tools/index.ts
import type { ToolDefinition } from './kit.js';
// Imports are added group-by-group in Tasks 5-9.
export const ALL_TOOLS: ToolDefinition[] = [];
export const TOOL_MAP = new Map<string, ToolDefinition>(ALL_TOOLS.map((t) => [t.name, t]));
```

- [ ] **Step 2: Wire the Map into the existing CallTool handler**

In `src/server.ts`, change the CallTool handler signature to accept `extra`, and at the very top of the handler body insert the Map shortcut. This routes any migrated tool through the seam and leaves the `switch` to handle the rest.

```typescript
// inside createServer(), the CallTool handler
import { TOOL_MAP } from './tools/index.js';
import { makeCtx } from './container.js';

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const migrated = TOOL_MAP.get(request.params.name);
  if (migrated) {
    return migrated.run(request.params.arguments ?? {}, makeCtx(extra?.signal));
  }
  const { name, arguments: args } = request.params;
  const signal = extra?.signal; // replaces the (request as any)._meta?.signal hack
  // ... existing switch(name) untouched ...
});
```

Delete the `const signal = (request as any)._meta?.signal;` line (now sourced from `extra.signal`).

- [ ] **Step 3: Run the suite + un-skip the cancellation test**

Run: `npm test -- test/server.test.ts`
Expected: PASS. If you skipped the cancellation test in Task 1 Step 4, un-skip it now — `extra.signal` wires real abort.

- [ ] **Step 4: Commit**

```bash
git add src/tools/index.ts src/tools/registry.ts src/server.ts
git commit -m "feat(tools): registry Map shadows the switch; wire extra.signal"
```

## Task 5: Pure helpers + renderers (`helpers.ts`, `render.ts`)

**Files:**
- Create: `src/tools/helpers.ts`, `src/tools/render.ts`
- Create: `test/tools/helpers.test.ts`, `test/tools/render.test.ts`

These extract the irreducible logic of the complex tools so handlers stay thin and the logic becomes unit-testable.

- [ ] **Step 1: Write failing tests for the helpers**

```typescript
// test/tools/helpers.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildSearchParams, batchPerItem } from '../../src/tools/helpers.js';

describe('buildSearchParams', () => {
  it('omits space_id when caller passes 0 (all spaces)', () => {
    expect(buildSearchParams({ space_id: 0 } as any, 77).space_id).toBeUndefined();
  });
  it('falls back to the default space when space_id is undefined', () => {
    expect(buildSearchParams({} as any, 77).space_id).toBe(77);
  });
  it('keeps an explicit space_id', () => {
    expect(buildSearchParams({ space_id: 5 } as any, 77).space_id).toBe(5);
  });
  it('defaults condition to 1 (active)', () => {
    expect(buildSearchParams({} as any, undefined).condition).toBe(1);
  });
});

describe('batchPerItem', () => {
  it('reports succeeded/failed and is NOT an error on partial success', async () => {
    const run = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('boom'));
    const res = await batchPerItem([1, 2], 9, 'children', run);
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('boom');
  });
  it('flags isError only when every item fails', async () => {
    const run = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await batchPerItem([1], 9, 'children', run);
    expect(res.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- test/tools/helpers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `helpers.ts`**

Port the `searchParams` mapping verbatim from the current `kaiten_search_cards` case (`src/index.ts` ≈ lines 2860–2900, the `if (validatedArgs.x) searchParams.x = ...` block) and the default-space rule. Port the batch loop from the children/parents cases (`src/index.ts` ≈ 2630–2790), **preserving the exact response body keys** so the Task 1 snapshots pass.

```typescript
// src/tools/helpers.ts
import { KaitenError } from '../kaiten-client.js';
import type { ServerContext, ToolResult } from './kit.js';
import type { SearchCardsArgs } from '../schemas.js';

export function buildSearchParams(a: SearchCardsArgs, defaultSpaceId?: number): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (a.space_id !== undefined && a.space_id !== null && a.space_id !== 0) p.space_id = a.space_id;
  else if (a.space_id === undefined && defaultSpaceId) p.space_id = defaultSpaceId;
  p.condition = a.condition !== undefined ? a.condition : 1;
  // ... port EVERY remaining `if (a.x) p.x = a.x` line from the current handler, verbatim ...
  return p;
}

// run(id) performs the single client call; this owns the loop + KaitenError formatting.
// Match the existing body keys in src/index.ts so characterization snapshots stay byte-stable.
export async function batchPerItem(
  ids: number[], parentCardId: number, relation: 'children' | 'parents',
  run: (id: number) => Promise<unknown>,
): Promise<ToolResult> {
  const succeeded: number[] = [];
  const failed: Array<{ card_id: number; error: string }> = [];
  for (const id of ids) {
    try { await run(id); succeeded.push(id); }
    catch (err) {
      failed.push({ card_id: id, error: err instanceof KaitenError
        ? `${err.message}${err.hint ? ` — ${err.hint}` : ''}`
        : err instanceof Error ? err.message : String(err) });
    }
  }
  const body = { parent_card_id: parentCardId, succeeded, failed,
    summary: `${succeeded.length} succeeded, ${failed.length} failed` };
  return {
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
    ...(succeeded.length === 0 ? { isError: true } : {}),
  };
}
```

> Reconcile `batchPerItem`'s `body` keys and `buildSearchParams`'s fields with the real handlers before moving on. The characterization snapshots are authoritative — adjust here, not there.

- [ ] **Step 4: Implement `render.ts`** — move the markdown builders out of the handlers (this is refactor #5).

```typescript
// src/tools/render.ts
import { simplifyCard, simplifyCardCompact } from '../transformers.js';
import type { ServerContext } from './kit.js';

// Port the ~90-line markdown block from the current kaiten_get_card case
// (src/index.ts ≈ 2417-2530), reading config.KAITEN_API_URL via ctx and
// fetching children via ctx.client.getCardChildren when needed.
export async function renderCardMarkdown(card: any, ctx: ServerContext): Promise<string> { /* ported */ }

// Port the numbered summary from the current kaiten_search_cards case.
export function renderSearchSummary(cards: any[], processed: any[], args: any, params: Record<string, unknown>): string { /* ported */ }
```

- [ ] **Step 5: Write render tests, run all helper/render tests**

Add `test/tools/render.test.ts` asserting `renderCardMarkdown` produces the same header line as the Task 1 snapshot for a fixture card. Run:

Run: `npm test -- test/tools/helpers.test.ts test/tools/render.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/helpers.ts src/tools/render.ts test/tools/helpers.test.ts test/tools/render.test.ts
git commit -m "feat(tools): extract pure helpers + renderers from the switch"
```

---

## Tasks 6–10: Migrate the 22 tools by group (PARALLELIZABLE)

> **Dispatch note for the orchestrator:** Tasks 6–10 are independent and can run as concurrent subagents — the foundation (Tasks 1–5) gives them a stable seam and helpers, and each group writes only its own files plus appends imports to `src/tools/index.ts`. The only shared file is `src/tools/index.ts` (append-only import + array entry) and `src/server.ts` (delete the migrated `case` blocks). Resolve those two by group order on merge. Each group task ends green and is independently committable.

### Tool → archetype reference table

| Tool | Group | Archetype | Schema | Client call | Notes |
|------|-------|-----------|--------|-------------|-------|
| `kaiten_get_card` | cards | **markdown-card** | `GetCardSchema` | `getCard(id, signal)` | `format:'json'`→return card; else `text(renderCardMarkdown)` |
| `kaiten_create_card` | cards | thin-json | `CreateCardSchema` | `createCard(params, signal)` | strip `idempotency_key` from `...params` if handled separately |
| `kaiten_update_card` | cards | thin-json | `UpdateCardSchema` | `updateCard(id, params, signal)` | build params (port conditional assigns) |
| `kaiten_delete_card` | cards | thin-text | `DeleteCardSchema` | `deleteCard(id, signal)` | return `text('Card N deleted successfully')` — match current string |
| `kaiten_search_cards` | cards | **search** | `SearchCardsSchema` | `searchCards(params, signal)` | raw `ToolResult`: `buildSearchParams`+`applyCardVerbosity`+`renderSearchSummary`+`truncateResponse` |
| `kaiten_get_card_comments` | comments | thin-json | `GetCardCommentsSchema` | `getCardComments(id, signal)` | `.map(simplifyComment)` |
| `kaiten_create_comment` | comments | thin-json | `CreateCommentSchema` | `createComment(card_id, text, idempotency_key, signal)` | |
| `kaiten_update_comment` | comments | thin-json | `UpdateCommentSchema` | `updateComment(card_id, comment_id, text, idempotency_key, signal)` | |
| `kaiten_delete_comment` | comments | thin-text | `DeleteCommentSchema` | `deleteComment(card_id, comment_id, signal)` | match current string |
| `kaiten_get_card_children` | relations | read-relation | `GetCardChildrenSchema` | `getCardChildren(id, signal)` | `applyCardVerbosity(rows, verbosity, simplifyCardCompact)` |
| `kaiten_add_card_children` | relations | **batch-relation** | `AddCardChildrenSchema` | `addCardChild(card_id, childId, signal)` | `batchPerItem(child_card_ids, card_id, 'children', ...)` |
| `kaiten_remove_card_children` | relations | batch-relation | `RemoveCardChildrenSchema` | `removeCardChild(card_id, childId, signal)` | `batchPerItem(...)` |
| `kaiten_get_card_parents` | relations | read-relation | `GetCardParentsSchema` | `getCardParents(id, signal)` | as children |
| `kaiten_add_card_parents` | relations | batch-relation | `AddCardParentsSchema` | `addCardParent(card_id, parentId, signal)` | `batchPerItem(parent_card_ids, card_id, 'parents', ...)` |
| `kaiten_remove_card_parents` | relations | batch-relation | `RemoveCardParentsSchema` | `removeCardParent(card_id, parentId, signal)` | `batchPerItem(...)` |
| `kaiten_list_spaces` | reference | cached-list | (no input / `z.object({}).strict()`) | `getSpaces(signal)` | `getCachedList` on `cache.getSpaces/setSpaces`; `.map(simplifySpace)` |
| `kaiten_list_boards` | reference | cached-list | `ListBoardsSchema` | `getBoards(spaceId, signal)` | default space; `cache.getBoards(id)/setBoards(d,id)`; `applyBoardVerbosity` |
| `kaiten_list_columns` | reference | thin-json | `ListColumnsSchema` | `getColumns(board_id, signal)` | |
| `kaiten_list_lanes` | reference | thin-json | `ListLanesSchema` | `getLanes(board_id, signal)` | |
| `kaiten_list_types` | reference | thin-json | `ListTypesSchema` | `getTypes(board_id, signal)` | |
| `kaiten_get_current_user` | users | thin-json | (no input) | `getCurrentUser(signal)` | `simplifyUser` |
| `kaiten_list_users` | users | cached-list | `ListUsersSchema` | `getUsers(params, signal)` | two paths: query→server filter; else cached-all; `applyUserVerbosity` |

### Archetype templates (copy, then specialize per the table)

**thin-json** (one file, ~12 lines):
```typescript
// src/tools/reference/list-columns.ts
import { defineTool } from '../kit.js';
import { ListColumnsSchema } from '../../schemas.js';
const DESC = `...long description, moved verbatim from the tools[] entry in index.ts...`;
export const listColumns = defineTool({
  name: 'kaiten_list_columns', description: DESC, schema: ListColumnsSchema,
  annotations: { readOnly: true },
  handler: ({ board_id }, ctx) => ctx.client.getColumns(board_id, ctx.signal),
});
```

**thin-text**:
```typescript
import { defineTool, text } from '../kit.js';
import { DeleteCardSchema } from '../../schemas.js';
export const deleteCard = defineTool({
  name: 'kaiten_delete_card', description: DESC, schema: DeleteCardSchema,
  annotations: { destructive: true },
  handler: async ({ card_id }, ctx) => {
    await ctx.client.deleteCard(card_id, ctx.signal);
    return text(`Card ${card_id} deleted successfully`); // MATCH current exact string
  },
});
```

**markdown-card** (`get_card`):
```typescript
import { defineTool, text } from '../kit.js';
import { GetCardSchema } from '../../schemas.js';
import { renderCardMarkdown } from '../render.js';
export const getCard = defineTool({
  name: 'kaiten_get_card', description: DESC, schema: GetCardSchema,
  annotations: { readOnly: true, idempotent: true },
  handler: async ({ card_id, format }, ctx) => {
    const card = await ctx.client.getCard(card_id, ctx.signal);
    if (format === 'json') return card;
    return text(await renderCardMarkdown(card, ctx));
  },
});
```

**search** (`search_cards`, raw result):
```typescript
import { defineTool } from '../kit.js';
import { SearchCardsSchema } from '../../schemas.js';
import { buildSearchParams } from '../helpers.js';
import { renderSearchSummary } from '../render.js';
import { applyCardVerbosity, truncateResponse } from '../../utils.js';
import { simplifyCardCompact } from '../../transformers.js';
export const searchCards = defineTool({
  name: 'kaiten_search_cards', description: DESC, schema: SearchCardsSchema,
  annotations: { readOnly: true, openWorld: true },
  handler: async (args, ctx) => {
    const params = buildSearchParams(args, ctx.config.KAITEN_DEFAULT_SPACE_ID);
    const cards = await ctx.client.searchCards(params, ctx.signal);
    const verbosity = args.verbosity ?? 'normal';
    const rows = applyCardVerbosity(cards, verbosity, simplifyCardCompact);
    if ((args.limit ?? 10) > 20 && !params.space_id)
      ctx.log.warning('Large search without space_id may overflow context', undefined, 'search');
    const out = truncateResponse(renderSearchSummary(cards, rows, args, params));
    return { content: [{ type: 'text', text: out }] };
  },
});
```

**read-relation** (`get_card_children` / `get_card_parents`):
```typescript
import { defineTool } from '../kit.js';
import { GetCardChildrenSchema } from '../../schemas.js';
import { applyCardVerbosity } from '../../utils.js';
import { simplifyCardCompact } from '../../transformers.js';
export const getCardChildren = defineTool({
  name: 'kaiten_get_card_children', description: DESC, schema: GetCardChildrenSchema,
  annotations: { readOnly: true },
  handler: async ({ card_id, verbosity }, ctx) => {
    const rows = await ctx.client.getCardChildren(card_id, ctx.signal);
    return applyCardVerbosity(rows, verbosity ?? 'normal', simplifyCardCompact);
  },
});
```

**batch-relation** (the four add/remove tools):
```typescript
import { defineTool } from '../kit.js';
import { AddCardChildrenSchema } from '../../schemas.js';
import { batchPerItem } from '../helpers.js';
export const addCardChildren = defineTool({
  name: 'kaiten_add_card_children', description: DESC, schema: AddCardChildrenSchema,
  annotations: { idempotent: true },
  handler: ({ card_id, child_card_ids }, ctx) =>
    batchPerItem(child_card_ids, card_id, 'children', (id) => ctx.client.addCardChild(card_id, id, ctx.signal)),
});
```

**cached-list** (`list_boards`; `list_spaces`/`list_users` analogous — see `getCachedList`):
```typescript
import { defineTool } from '../kit.js';
import { ListBoardsSchema } from '../../schemas.js';
import { applyBoardVerbosity, truncateResponse } from '../../utils.js';
import { KaitenError, KaitenErrorType } from '../../kaiten-client.js';
export const listBoards = defineTool({
  name: 'kaiten_list_boards', description: DESC, schema: ListBoardsSchema,
  annotations: { readOnly: true },
  handler: async ({ space_id, verbosity }, ctx) => {
    const id = space_id ?? ctx.config.KAITEN_DEFAULT_SPACE_ID;
    if (!id) throw new KaitenError(KaitenErrorType.VALIDATION_ERROR, 'space_id is required', 400,
      undefined, 'Set KAITEN_DEFAULT_SPACE_ID or pass space_id.');
    let boards = ctx.cache.getBoards(id);
    if (!boards) { boards = await ctx.client.getBoards(id, ctx.signal); ctx.cache.setBoards(boards, id); }
    return truncateResponse(JSON.stringify(applyBoardVerbosity(boards, verbosity ?? 'normal'), null, 2));
  },
});
```
> If `list_spaces`/`list_boards`/`list_users` share the cache-or-fetch shape, add a `getCachedList(bucket, fetch)` helper to `helpers.ts` (write its test first) and use it in all three. Otherwise keep the inline `if (!cached)` shown above.

### Per-group task shape (apply identically to Tasks 6–10)

Each group task = these steps:

- [ ] **Step 1: Write the per-tool unit tests first** — one `test/tools/<group>/<tool>.test.ts` per tool, calling `tool.run(args, fakeCtx)` where `fakeCtx` stubs only the client methods that tool uses (see the fake-ctx pattern below). Assert the returned `content[0].text` and `isError`.
- [ ] **Step 2: Run them — expect FAIL** (module not found).
- [ ] **Step 3: Create each tool file** from its archetype template + the reference-table row. **Move the long `description` string verbatim** from the matching `tools[]` entry in `src/index.ts`.
- [ ] **Step 4: Register the group** — append imports + array entries to `src/tools/index.ts`, and rebuild `TOOL_MAP` (it is derived from `ALL_TOOLS`, so just adding to the array suffices).
- [ ] **Step 5: Delete the migrated `case` blocks** from the `switch` in `src/server.ts` (the Map now serves them).
- [ ] **Step 6: Run the full suite** — `npm test`. Expected: PASS, including the Task 1 characterization snapshots for these tools (byte-stable proof).
- [ ] **Step 7: Commit** — `git commit -m "refactor(tools): migrate <group> tools to deep modules"`.

**Fake-ctx pattern for unit tests:**
```typescript
const fakeCtx = (over: Partial<any> = {}) => ({
  client: {}, cache: {}, config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
  log: { warning: () => {}, info: () => {}, error: () => {} }, signal: undefined, ...over,
} as any);
```

- [ ] **Task 6 — cards group** (`get_card`, `create_card`, `update_card`, `delete_card`, `search_cards`). Uses markdown-card + thin-json + thin-text + search archetypes.
- [ ] **Task 7 — comments group** (`get_card_comments`, `create_comment`, `update_comment`, `delete_comment`).
- [ ] **Task 8 — relations group** (`get/add/remove_card_children`, `get/add/remove_card_parents`).
- [ ] **Task 9 — reference group** (`list_spaces`, `list_boards`, `list_columns`, `list_lanes`, `list_types`).
- [ ] **Task 10 — users group** (`get_current_user`, `list_users`).

### Task 11: Confirm the switch is empty

- [ ] **Step 1:** Verify `TOOL_MAP.size === 22` and that the `switch` in `src/server.ts` has no remaining tool cases (only the default/unknown branch, which can now be removed since the Map handles dispatch and unknown names fall to `mapError`).
- [ ] **Step 2:** Delete the now-dead `switch` body and the standalone catch block (its logic lives in `mapError`). Keep the resources/prompts handlers untouched.
- [ ] **Step 3:** `npm test` → PASS.
- [ ] **Step 4:** Commit — `git commit -m "refactor: remove the CallTool switch; Map dispatch only"`.

---

# PHASE 2 — Swap to McpServer + Zod as single source of truth (#2)

## Task 12: McpServer.registerTool loop, delete hand-written JSON Schema, migrate resources/prompts

**Files:**
- Modify: `src/tools/registry.ts` (add `registerTools(mcpServer, makeCtx)`)
- Modify: `src/server.ts` (`Server`→`McpServer`; delete `tools[]`; migrate resources/prompts)
- Create: `docs/adr/0001-defer-tool-middleware.md`
- Modify: `package.json`, `README.md`, `CLAUDE.md`, `CHANGELOG.md`

- [ ] **Step 1: SPIKE — verify the SDK surface on the installed version (timeboxed, no commit)**

Run a throwaway script (`npx tsx -e "..."`) to confirm, on the installed `@modelcontextprotocol/sdk`:
1. `McpServer` is exported from `@modelcontextprotocol/sdk/server/mcp.js` and has `registerTool`.
2. `registerTool(name, { description, inputSchema, annotations }, cb)` accepts `inputSchema` as a `ZodRawShape` (i.e. `MySchema.shape`) and the derived JSON Schema preserves field `.describe()` text.
3. The four resource URIs map to `ResourceTemplate`: `kaiten-card:///{cardId}`, `kaiten-space:///{spaceId}`, `kaiten-board:///{boardId}/cards`, and the opaque `kaiten-current-user:`.

Record findings in the ADR (Step 6). **If `kaiten-current-user:` cannot be expressed as a `ResourceTemplate`**, keep resources on a thin custom `setRequestHandler(ReadResourceRequestSchema)` on `mcpServer.server` (allowed — see fallback in Step 4).

- [ ] **Step 2: Add a failing schema-fidelity test**

```typescript
// test/server.test.ts — add
it('advertised input schemas preserve field descriptions and stay strict', async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  const getCard = tools.find((t) => t.name === 'kaiten_get_card')!;
  expect(getCard.inputSchema.properties?.card_id?.description).toBeTruthy();
  expect(getCard.inputSchema.additionalProperties).toBe(false); // .strict() survives
});
```

Run: `npm test -- test/server.test.ts -t "preserve field descriptions"`
Expected: FAIL (current hand-written schema may differ; this drives the Zod-derived swap).

- [ ] **Step 3: Implement `registerTools(mcpServer, makeCtx)`**

```typescript
// src/tools/registry.ts — Phase 2 addition
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ALL_TOOLS } from './index.js';
import type { ServerContext } from './kit.js';

export function registerTools(server: McpServer, makeCtx: (s?: AbortSignal) => ServerContext): void {
  for (const def of ALL_TOOLS) {
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.schema.shape, // Zod raw shape → SDK derives JSON Schema with .describe()
        annotations: {
          readOnlyHint: def.annotations.readOnly,
          destructiveHint: def.annotations.destructive,
          idempotentHint: def.annotations.idempotent,
          openWorldHint: def.annotations.openWorld ?? true,
        },
      },
      async (args: unknown, extra: { signal?: AbortSignal }) => def.run(args, makeCtx(extra?.signal)),
    );
  }
}
```

> Note: the SDK validates args against `def.schema.shape` (lenient `z.object`); `def.run` then re-parses with the full `.strict()` schema. The double parse is cheap and keeps `mapError`'s `ZodError` path authoritative. If the SDK rejects before `run`, mirror its error shape in a test.

- [ ] **Step 4: Rewrite `createServer()` to use `McpServer`**

```typescript
// src/server.ts (Phase 2)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools/registry.js';
import { makeCtx } from './container.js';
import { logger } from './logging/index.js';

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'kaiten-mcp-server', version: '3.2.0' },
    { capabilities: { tools: {}, resources: { templates: true, subscribe: false }, prompts: {}, logging: {} } },
  );
  logger.getMCPLogger().setServer(server.server); // McpServer wraps the low-level Server
  registerTools(server, makeCtx);
  registerResources(server);  // migrate the 4 ReadResource branches to server.registerResource,
  registerPrompts(server);    // OR the custom-handler fallback from Step 1
  return server;
}
```

Delete the entire `const tools: Tool[] = [...]` array (~2000 lines) and the `ListToolsRequestSchema`/`CallToolRequestSchema` `setRequestHandler` blocks — `McpServer` owns ListTools/CallTool. Migrate the 4 resources and the prompt to `server.registerResource(...)` / `server.registerPrompt(...)` (or the Step-1 fallback for `kaiten-current-user:`).

`src/index.ts` connects stdio to the `McpServer` exactly as before (`McpServer` also has `.connect`).

- [ ] **Step 5: Run the entire suite**

Run: `npm test`
Expected: PASS — including the schema-fidelity test and all Task 1 characterization snapshots (tool *results* unchanged; *schemas* now Zod-derived but semantically equal). Investigate any snapshot diff: a changed tool result is a regression; a changed advertised-schema shape is expected and the assertion should be the semantic one from Step 2.

- [ ] **Step 6: Write the ADR for deferred capability**

```markdown
<!-- docs/adr/0001-defer-tool-middleware.md -->
# ADR 0001: Tool modules over middleware/gates/output-schema (for now)

## Status
Accepted — 2026-06-03

## Context
The tool subsystem was refactored from a switch into deep tool modules. Three richer
capabilities were proposed (composable middleware, dynamic enable/disable gates, outputSchema/
structured content) and deliberately NOT built.

## Decision
Ship the minimal `defineTool` interface. Cross-cutting concerns live in the seam + pure helpers,
not middleware. No dynamic gating, no outputSchema, for a 22-tool server.

## Consequences
- Adding a tool = one file + one registry entry. Lowest possible interface to learn.
- If/when tools need auth-gating, per-tool caching policy, or structured content, revisit —
  the `ServerContext` seam and registry are the extension points. SDK footguns to recheck then:
  Zod v4 `.describe()` (#1143), root `z.discriminatedUnion()` dropped (#1643).
```

- [ ] **Step 7: Update docs**

Update `CLAUDE.md` "Adding New Tools" to the new flow (write a `src/tools/<group>/<tool>.ts` with `defineTool`, add to `ALL_TOOLS`, write a unit test; the rule: start with `handler`+`schema`, reach for `text()`/raw/`render` only when a default fails a test). Note the new architecture in `README.md`/`CHANGELOG.md`. **Do not bump the version** (no tool added/removed) unless desired.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: McpServer.registerTool + Zod-derived schemas; delete hand-written JSON Schema"
```

---

## Definition of Done

- [ ] `src/index.ts` is a thin entrypoint (≈15 lines); no `tools[]` array, no `switch`.
- [ ] 22 tool files under `src/tools/**`, each ≤ ~40 lines (complex ones lean on `helpers.ts`/`render.ts`).
- [ ] Every tool handler takes `(args, ctx)`; **zero** handler imports `config`/`cache`/`logger`/`kaitenClient` as a module global.
- [ ] `npm test` green; characterization snapshots unchanged for tool results; schema-fidelity test passing.
- [ ] `mapError` is the single error funnel; the old catch block is deleted.
- [ ] ADR 0001 recorded; `CLAUDE.md` "Adding New Tools" updated.

## Self-review notes (author)

- **Spec coverage:** #4 = Task 1; #3 = Tasks 2–4 (seam laid in foundation); #1 = Tasks 4–11 (registry + per-group migration); #5 = Task 5 (render extraction, applied during Task 6); #2 = Task 12.
- **Byte-stability risk** concentrated in `mapError`, `batchPerItem`, `buildSearchParams`, and the renderers — every one carries an explicit "reconcile against current / snapshots are authoritative" instruction.
- **Signal:** the `_meta.signal` hack is replaced by `extra.signal` in Task 4; the cancellation characterization test guards it.
- **Resource URI footgun** (`kaiten-current-user:`) is a Task 12 spike with a defined fallback — not assumed away.
