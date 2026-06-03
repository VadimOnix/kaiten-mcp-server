import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ALL_TOOLS } from './index.js';
import type { ServerContext } from './kit.js';

/**
 * Register every deep-module tool from {@link ALL_TOOLS} on the high-level
 * {@link McpServer}. The advertised JSON Schema for each tool is DERIVED from
 * its Zod schema (`def.schema.shape`) — a single source of truth that replaces
 * the ~2000-line hand-written `tools[]` array that used to live in server.ts.
 *
 * Two-stage validation, by design (see ADR docs/adr/0001):
 *   1. The SDK pre-validates the incoming args against a NON-strict
 *      `z.object(shape)` it builds from `def.schema.shape`. Unknown keys are
 *      silently stripped here (the accepted minor behaviour change vs. the old
 *      hand-written CallTool handler, which surfaced a VALIDATION_ERROR).
 *      Type/required errors are rejected at the protocol layer as -32602.
 *   2. `def.run()` then re-parses with the FULL `.strict()` schema, so
 *      `mapError`'s ZodError path stays authoritative for everything except the
 *      already-stripped unknown keys.
 *
 * The annotation key names are mapped from this project's `ToolAnnotations`
 * (`readOnly`/`destructive`/`idempotent`/`openWorld`) to the SDK's
 * `*Hint` names. `openWorldHint` defaults to `true` to match the SDK default.
 */
export function registerTools(server: McpServer, makeCtx: (signal?: AbortSignal) => ServerContext): void {
  for (const def of ALL_TOOLS) {
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.schema.shape,
        annotations: {
          readOnlyHint: def.annotations.readOnly,
          destructiveHint: def.annotations.destructive,
          idempotentHint: def.annotations.idempotent,
          openWorldHint: def.annotations.openWorld ?? true,
        },
      },
      // The SDK's ToolCallback passes (args, extra). `extra.signal` is the
      // per-call AbortSignal; forward it through makeCtx into the ServerContext.
      // `def.run` returns this project's ToolResult, which is structurally a
      // CallToolResult minus the SDK's `[x: string]: unknown` index signature;
      // the cast bridges that gap without changing the emitted envelope.
      async (args: unknown, extra: { signal?: AbortSignal }): Promise<CallToolResult> =>
        (await def.run(args, makeCtx(extra.signal))) as CallToolResult,
    );
  }
}
