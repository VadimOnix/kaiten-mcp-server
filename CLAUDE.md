# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server for Kaiten API integration. It provides 26 tools for managing Kaiten cards, comments, spaces, and boards directly from Claude Desktop. The server is production-ready with comprehensive logging, caching, retry logic, and concurrency control.

The toolset was deliberately trimmed from 26 to 16: the cache-invalidation tools, runtime diagnostics/log-level tools, redundant card listings (`get_space_cards`/`get_board_cards`, superseded by `search_cards`), and detail getters (`get_space`/`get_board`) were removed. Logging is now configured only via environment variables, and the cache relies on automatic TTL expiry. Pure response-shaping helpers live in `src/transformers.ts`; the test suite (Vitest) lives in `test/` and is run with `npm test`.

**Current Version:** 3.2.0

## Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript to dist/
npm run build

# Run in development mode with tsx
npm run dev

# Watch mode (rebuild on changes)
npm run watch

# Start compiled server
npm start

# Run the unit test suite (Vitest)
npm test

# Watch tests during TDD
npm run test:watch

# Test with MCP Inspector
npm run inspector
```

## Testing

Unit tests live in `test/` and run on [Vitest](https://vitest.dev) via `npm test`.
Required ENV vars are injected by `vitest.config.ts`, so no real `.env` is needed.

Coverage targets the pure, deterministic layers that back the 26 tools:
- `test/schemas.test.ts` — Zod input validation for every tool
- `test/transformers.test.ts` — `src/transformers.ts` response simplifiers
- `test/utils.test.ts` — verbosity control + response truncation
- `test/cache.test.ts` — LRU cache get/set/TTL/invalidation
- `test/config.test.ts` — `redactSecrets` + config loading
- `test/kaiten-client.test.ts` — API client endpoints (global fetch mocked, p-queue real)

When adding or changing a tool, follow TDD: write/adjust the test first, watch it
fail, then implement. Keep response-shaping logic in `src/transformers.ts` (not
inline in `src/index.ts`) so it stays unit-testable.

## MCP I/O Protocol Requirements

**CRITICAL:** MCP uses stdio-transport for client-server communication:
- **stdout** - ONLY JSON-RPC protocol messages (must stay clean)
- **stderr** - All logs, debug info, errors

**Never use `console.log()` in this codebase** - it breaks the protocol. Always use:
- `safeLog.info()`, `safeLog.error()`, `safeLog.warn()`, `safeLog.debug()` from `src/config.ts`
- These wrappers redirect to stderr and include automatic token redaction

Reference: src/config.ts:126-152 implements the `safeLog` wrapper.

## Architecture Overview

### Core Components

1. **src/index.ts** (thin entrypoint)
   - Connects the stdio transport to the server built by `createServer()`
   - No tool/handler logic lives here anymore

2. **src/server.ts** (`createServer()`)
   - Builds a high-level `McpServer` (SDK `server/mcp.js`) over stdio
   - Registers the 26 tools via `registerTools()` (see `src/tools/registry.ts`);
     each tool's advertised JSON Schema is **derived from its Zod schema**
     (`def.schema.shape`) — there is NO hand-written `tools[]` JSON-Schema array
   - Attaches the MCP Resources (`kaiten-card:///`, `kaiten-space:///`,
     `kaiten-board:///{id}/cards`, opaque `kaiten-current-user:`) and the server
     prompt as custom handlers on the wrapped low-level `server.server`
   - See `docs/adr/0001-defer-tool-middleware.md` for the design and spike findings

3. **src/tools/** (deep-module tools — the single source of truth)
   - One file per tool (`src/tools/<group>/<tool>.ts`), built with `defineTool({
     name, description, schema, annotations, handler })` from `src/tools/kit.ts`
   - Every handler is `(args, ctx)` with **zero module globals**; dependencies
     arrive via an injected `ServerContext` from `src/container.ts#makeCtx`
   - `ALL_TOOLS`/`TOOL_MAP` in `src/tools/index.ts`; `mapError` (kit.ts) is the
     single error funnel; group descriptions live in each group's `descriptions.ts`

4. **src/kaiten-client.ts** (API client)
   - Native fetch HTTP client with manual retry logic (3 retries with exponential backoff)
   - p-queue for concurrency control (default: 5 concurrent requests)
   - Enhanced error handling with KaitenError class (categorized error types)
   - Idempotency key support for safe retries on mutations
   - Logging middleware integration for request/response tracking

5. **src/config.ts** (configuration & validation)
   - Zod-based runtime validation for all ENV variables
   - Validates API_URL format (must end with `/api/latest`)
   - Validates API_TOKEN length (min 20 chars)
   - `redactSecrets()` function - masks tokens in logs/errors
   - `safeLog` wrapper - stderr-safe logging that never touches stdout

6. **src/cache.ts** (LRU cache)
   - LRU cache with TTL for spaces, boards, users
   - Default: 100 items per cache type, 300s TTL
   - Automatic expiration checks
   - Cache statistics via `getStats()`

7. **src/schemas.ts** (Zod validation schemas)
   - 15+ Zod schemas for all tool parameters — the single source of truth for
     BOTH runtime validation AND the advertised JSON Schema (derived via `.shape`)
   - VerbosityEnum: minimal | normal | detailed
   - Idempotency key validation
   - Structured error responses

8. **src/logging/** (v2.3.0 logging system)
   - **logger.ts** - Unified singleton logger
   - **file-logger.ts** - Pino JSON file logging with secret redaction
   - **mcp-logger.ts** - MCP notifications/message logger
   - **metrics.ts** - Performance metrics collector (latency, success rate, cache hits)
   - **types.ts** - RFC 5424 log levels + TypeScript types

9. **src/middleware/logging-middleware.ts**
   - Logging helpers for HTTP request/response (called from the fetch wrapper)
   - Automatic metrics recording for all API calls

### Key Design Patterns

**Default Space ID Pattern:**
- All card operations default to `KAITEN_DEFAULT_SPACE_ID` if set
- User must explicitly ask to search "in all spaces" to override
- See DEFAULT_SPACE_GUIDE.md for details

**Verbosity Control Pattern:**
- All read tools support `verbosity` parameter:
  - `minimal` - Only id + name/title (for lists)
  - `normal` - Simplified/essential fields (default)
  - `detailed` - Full API response with all metadata
- Applied via `applyCardVerbosity()` helper in src/utils.ts

**Idempotency Pattern:**
- Mutations (create_card, update_card, create_comment, update_comment) support `idempotency_key` parameter
- Client sends `Idempotency-Key` header to Kaiten API
- Prevents duplicate operations on retry

**Error Handling Pattern:**
- `KaitenError` class with categorized types: AUTH_ERROR, RATE_LIMITED, NOT_FOUND, TIMEOUT, VALIDATION_ERROR, API_ERROR, NETWORK_ERROR
- Each error includes `hint` field with actionable guidance
- All errors are JSON-serializable via `toJSON()`

**Helper Functions Pattern:**
- `simplifyUser()`, `simplifySpace()`, `simplifyCard()`, `simplifyComment()` in src/transformers.ts
- Reduce response sizes by 92-96% (removes base64 avatars, permissions, UI metadata)
- Enhanced `simplifyCard()` adds human-readable fields: board_title, column_title, owner_name, members

## Configuration

Required ENV variables (see .env.example):
```env
KAITEN_API_URL=https://your-domain.kaiten.ru/api/latest  # Must end with /api/latest
KAITEN_API_TOKEN=your_token_here                         # Min 20 chars
KAITEN_DEFAULT_SPACE_ID=12345                            # Optional, recommended
```

Optional performance tuning:
```env
KAITEN_MAX_CONCURRENT_REQUESTS=5    # 1-20, default: 5
KAITEN_CACHE_TTL_SECONDS=300        # 0 to disable, default: 300
KAITEN_REQUEST_TIMEOUT_MS=10000     # 1-60000, default: 10000
KAITEN_INSECURE_SSL=true           # Disable SSL verification (unable to get local issuer certificate)
```

Logging configuration (v2.3.0):
```env
KAITEN_LOG_ENABLED=true                          # Master switch
KAITEN_LOG_LEVEL=error                           # debug|info|notice|warning|error|critical|alert|emergency
KAITEN_LOG_MCP_ENABLED=false                     # Send logs to MCP client
KAITEN_LOG_FILE_ENABLED=false                    # Write to logs/kaiten-mcp.log
KAITEN_LOG_FILE_PATH=./logs/kaiten-mcp.log       # Log file location
KAITEN_LOG_REQUESTS=false                        # Log all HTTP requests
KAITEN_LOG_METRICS=false                         # Collect performance metrics
```

**Ready-made profiles** (see README.md line 362-386):
- Production: errors only, no files
- Development: info level, files + metrics
- Debug: full logging (debug + MCP + files + requests + metrics)

## Adding New Tools

Tools are **deep modules**: one file per tool under `src/tools/<group>/<tool>.ts`,
built with `defineTool` and registered from `ALL_TOOLS`. The advertised JSON Schema
is derived from the tool's Zod schema, so you never hand-write JSON Schema. Follow TDD.

1. **Define the Zod schema** in `src/schemas.ts` (give every field a `.describe()` —
   the text flows into the advertised schema). Keep `.strict()`.
   ```typescript
   export const MyToolSchema = z.object({
     param: z.number().int().positive().describe("Parameter description"),
   }).strict();
   ```

2. **Add the client method** (if a new API call is needed) in `src/kaiten-client.ts`.
   Accept the per-call `AbortSignal` so the tool can forward `ctx.signal`:
   ```typescript
   async myMethod(param: number, signal?: AbortSignal): Promise<Result> {
     return this.queuedRequest<Result>('/endpoint', { method: 'POST', data: { param }, signal });
   }
   ```

3. **Write the tool module** `src/tools/<group>/my-tool.ts` with `defineTool`. Put the
   description in the group's `descriptions.ts`. The handler is `(args, ctx)` and uses
   `ctx.*` (`client`, `cache`, `config`, `log`, `signal`) — **never module globals**.
   Return a plain value (auto-serialized to pretty JSON), `text(s)` for a pre-rendered
   string (markdown), or a raw `ToolResult` for full control. `defineTool` validates
   args and funnels thrown errors through `mapError`.
   ```typescript
   import { defineTool } from '../kit.js';
   import { MyToolSchema } from '../../schemas.js';
   import { MY_TOOL_DESC } from './descriptions.js';

   export const myTool = defineTool({
     name: 'kaiten_my_tool',
     description: MY_TOOL_DESC,
     schema: MyToolSchema,
     annotations: { readOnly: true }, // or destructive / idempotent / openWorld
     handler: async ({ param }, ctx) => ctx.client.myMethod(param, ctx.signal),
   });
   ```

4. **Register it**: import the tool in `src/tools/index.ts` and add it to `ALL_TOOLS`.
   `registerTools()` (src/tools/registry.ts) advertises it automatically — no change to
   `src/server.ts` needed.

5. **Write a unit test** against a fake `ServerContext` (call `myTool.run(args, fakeCtx)`
   and assert the returned `ToolResult`), plus a happy-path characterization snapshot in
   `test/server.test.ts` if it merits end-to-end coverage.

6. **Update documentation**: increment the tool count in package.json, README.md,
   CHANGELOG.md, and add to TOOLS.md if it exists.

## Testing with MCP Inspector

```bash
npm run build
npm run inspector
```

MCP Inspector provides:
- Tool testing UI
- Request/response inspection
- Resource browser
- Prompt testing

## Common Pitfalls

1. **Never write to stdout directly** - Use safeLog.* functions
2. **Always simplify responses** - Use helper functions to avoid "Tool result is too large"
3. **Default space ID** - Remember all operations default to KAITEN_DEFAULT_SPACE_ID
4. **Condition parameter** - Cards default to condition=1 (active), user must explicitly request condition=2 (archived)
5. **Board справочники** - Use kaiten_list_columns/lanes/types to get valid IDs before creating/updating cards
6. **Secrets in logs** - All token redaction is automatic via `redactSecrets()` in config.ts

## Deployment to Claude Desktop

### Option A: Local (node)

1. Build: `npm run build`
2. Configure Claude Desktop's `claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "kaiten": {
         "command": "node",
         "args": ["/full/path/to/MCP Kaiten/dist/index.js"],
         "cwd": "/full/path/to/MCP Kaiten"
       }
     }
   }
   ```
3. Restart Claude Desktop completely (⌘+Q / Alt+F4)

### Option B: Docker (no local build)

1. Build: `docker build -t mcp-kaiten .` (or `npm run docker:build`)
2. Configure `claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "kaiten": {
         "command": "docker",
         "args": ["run", "--rm", "-i", "-e", "KAITEN_API_URL=...", "-e", "KAITEN_API_TOKEN=...", "-e", "KAITEN_DEFAULT_SPACE_ID=...", "mcp-kaiten"]
       }
     }
   }
   ```
3. Restart Claude Desktop

## Key Files Reference

- **CHANGELOG.md** - Complete version history with detailed changes
- **TOOLS.md** - Full reference for all tools
- **DEFAULT_SPACE_GUIDE.md** - Default space behavior documentation
- **LOGGING_IMPLEMENTATION_PLAN.md** - v2.3.0 logging architecture
- **.env.example** - All ENV variables with profiles
