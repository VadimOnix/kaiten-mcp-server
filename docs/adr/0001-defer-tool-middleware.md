# 0001 — Defer tool middleware; deep-module tools + a minimal `defineTool` seam

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

The Kaiten MCP server exposes 22 tools. Before this refactor they lived as a giant
`switch`/dispatch inside `src/index.ts`/`src/server.ts`, with module-level globals
(client, cache, config, logger) and a hand-written `tools[]` array (~2000 lines) of
JSON Schema that had to be maintained in lock-step with the Zod validation schemas in
`src/schemas.ts`. That duplication was the main source of drift and of the
pre-existing `tsc` errors (the array used `readOnly`/`destructive` annotation keys
that the SDK rejects, plus a CallTool return-type gap).

The refactor (Tasks 1–12) turned each tool into a self-contained deep module under
`src/tools/**`, registered in `ALL_TOOLS`/`TOOL_MAP`, behind a minimal `defineTool`
seam (`src/tools/kit.ts`). Each handler is `(args, ctx)` with **zero module globals**;
dependencies arrive via an injected `ServerContext` built by `container.makeCtx`.
`mapError` is the single error funnel. Task 12 (this ADR) finished the job: the
low-level `Server` was swapped for the high-level `McpServer`, tools are registered via
`McpServer.registerTool` with their JSON Schema **derived from each tool's Zod schema**
(`def.schema.shape`), and the hand-written `tools[]` array was deleted.

## Decision

1. **Keep the tool subsystem as deep modules behind a minimal `defineTool` seam.**
   The seam owns the per-call lifecycle: validate raw args (Zod `.parse`, which throws
   on bad input) → invoke the handler → wrap the return in a `ToolResult` envelope →
   funnel any thrown error through `mapError`. Handlers return a plain value
   (auto-JSON), a `text()` marker (passed through verbatim), or a raw `ToolResult`.

2. **Register tools on `McpServer` and derive the advertised JSON Schema from Zod.**
   `src/tools/registry.ts#registerTools(server, makeCtx)` iterates `ALL_TOOLS` and calls
   `server.registerTool(name, { description, inputSchema: def.schema.shape, annotations },
   handler)`. The Zod schema is now the **single source of truth** for both runtime
   validation and the advertised schema. Resources and the server prompt are kept on
   thin custom handlers attached to `server.server` (the wrapped low-level Server),
   preserving their original bespoke behaviour.

3. **Deliberately NOT built (deferred):** three richer capabilities were considered and
   explicitly left out to avoid speculative generality:
   - **Composable per-tool middleware** (a pipeline of wrappers around `run`). The two
     cross-cutting concerns we actually have — error mapping and arg validation — are
     already centralised in the seam; a middleware stack would add indirection without a
     present second consumer.
   - **Dynamic enable/disable gates** (feature-flagging tools at runtime). `McpServer`'s
     `RegisteredTool` exposes `enable()/disable()`, so the extension point exists if a
     need arises; we register all 22 unconditionally today.
   - **`outputSchema` / structured content.** Tools return text/JSON envelopes today;
     adding output schemas would change the result contract and is unnecessary for the
     current clients.

4. **Extension points going forward** are `ServerContext` (add a dependency by adding a
   field to the interface + `container.makeCtx`, never a module global) and the registry
   (`ALL_TOOLS` + `registerTools`). New tools follow the `defineTool` flow documented in
   `CLAUDE.md`.

## Spike findings (SDK `@modelcontextprotocol/sdk@1.29.0`, `zod@3.25.76`)

Empirically probed via an in-memory client listing/calling tools registered with
`McpServer.registerTool({ inputSchema: schema.shape })`:

- **`McpServer` API confirmed:** exported from `@modelcontextprotocol/sdk/server/mcp.js`
  with `.registerTool`, `.registerResource`, `.registerPrompt`, `.connect`, `.close`,
  and a `.server` getter exposing the wrapped low-level `Server`.
- **`.describe()` IS preserved** — Zod field descriptions flow through into the advertised
  JSON Schema `properties.<field>.description`. **This is the Phase-2 win:** descriptions
  are now single-sourced from Zod instead of being hand-maintained in a parallel array.
- **`additionalProperties: false` IS present** in the advertised schema. The SDK wraps the
  raw shape in `z.object(shape)` and converts it to a *closed* JSON Schema by default —
  this holds even for `.passthrough()` / non-`.strict()` shapes (the closed-ness is the
  SDK/zod-to-json-schema default, not a reflection of the source schema's strictness).
  So the advertised schemas are at least as strict as the old hand-written ones.
- **The `required` set is derived correctly** (fields with a Zod default or `.optional()`
  are not required; e.g. `kaiten_get_card` advertises `required: ['card_id']` because
  `format` carries a default).

### Accepted minor behaviour change (unknown extra keys)

The SDK pre-validates incoming args against a **non-strict** `z.object(shape)` it builds
from `def.schema.shape`, which **silently strips unknown keys** before the handler runs.
`def.run()` then re-parses with the original `.strict()` schema — but the unknown key is
already gone, so the re-parse passes. Net effect:

- **Before:** an unknown/extra arg key → `mapError` `VALIDATION_ERROR` (`isError: true`).
- **After:** an unknown/extra arg key is **silently stripped and the call succeeds**.

This is accepted: the advertised schema still declares `additionalProperties: false`
(so well-behaved clients are told extra keys are disallowed), and **type errors and
missing-required-field errors are still rejected** — at the protocol layer as JSON-RPC
`-32602` (`isError: true`). Runtime validation of the *declared* fields is unchanged
because `def.run` still re-parses with the full `.strict()` schema, keeping `mapError`'s
`ZodError` path authoritative for type/shape problems. The 22 result-characterization
snapshots use only valid args and are unaffected.

### Unknown-tool behaviour

`McpServer` rejects an unadvertised tool at the protocol layer (`-32602: Tool <name>
not found`), surfaced to the client as an error result (`isError: true`). This replaces
the old hand-written CallTool default branch, which produced a `mapError`
`UNKNOWN_ERROR` JSON envelope — functionally equivalent (still `isError: true`).

### Resources / prompts

The resource URIs do not all map cleanly onto `registerResource`: `ListResources` does a
*dynamic* default-space card enumeration (not a static template), and
`kaiten-current-user:` is an **opaque URI with no path** that does not express as a
`ResourceTemplate`. We therefore kept resources and the prompt on thin custom
`server.server.setRequestHandler(...)` blocks (`ListResources`, `ReadResource`,
`ListResourceTemplates`, `ListPrompts`, `GetPrompt`), reproducing the original logic
verbatim (including `simplifyCard`/`simplifyUser`). `McpServer` only claims those
handler slots when `registerResource`/`registerPrompt` are called — which we do not —
so the custom handlers coexist with it without collision. A new test block in
`test/server.test.ts` guards this migration.

## Consequences

- `src/index.ts` is a thin entrypoint; `createServer()` builds an `McpServer`, registers
  the 22 deep-module tools, and attaches the resource/prompt handlers.
- The ~2000-line hand-written JSON-Schema `tools[]` array is gone; Zod is the single
  source of truth for tool schemas.
- `tsc --noEmit` is clean (was 16 pre-existing errors, almost all in that array).
- The one behaviour change (silently stripping unknown extra arg keys) is documented
  above and judged acceptable.
- The advertised `resources` capability changed from `{ templates: true, subscribe: false }`
  to `{ subscribe: false }`. `McpServer` types the resources capability as
  `{ subscribe?, listChanged? }` and does not accept the non-standard `templates` flag
  the old low-level `Server` passed through. Resource templates remain fully functional
  (handled via `resources/templates/list` and advertised through the standard `resources`
  capability); only the non-standard advisory flag is gone.
