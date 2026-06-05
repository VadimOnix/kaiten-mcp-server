import { z } from 'zod';
import { KaitenError } from '../kaiten-client.js';
import type { KaitenClient } from '../kaiten-client.js';
import type { KaitenCache } from '../cache.js';
import type { EnvConfig } from '../config.js';
import type { logger } from '../logging/index.js';

/**
 * Dependency-injection bundle handed to every tool's handler. The live server
 * constructs one of these once and passes it into each `run()` call. Keeping it
 * an interface (not concrete globals) is what makes tools unit-testable.
 */
export interface ServerContext {
  readonly client: KaitenClient;
  readonly cache: KaitenCache;
  readonly config: EnvConfig;
  readonly log: typeof logger;
  /** Per-call AbortSignal, forwarded to the Kaiten client for cancellation. */
  readonly signal?: AbortSignal;
}

/** The MCP CallTool result envelope. `isError` toggles the protocol error flag. */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  /**
   * Machine-readable mirror of the text block (MCP spec 2025-11-25). Populated
   * automatically for read-only tools (see {@link defineTool}). We never
   * advertise an `outputSchema`, so this costs nothing on connect and the SDK
   * forwards it unvalidated — programmatic clients can consume it without
   * re-parsing the text JSON.
   */
  structuredContent?: { [key: string]: unknown };
  isError?: boolean;
}

// A private marker so a handler can return pre-rendered text (e.g. markdown)
// that the seam passes through verbatim, WITHOUT running it through
// JSON.stringify. The Symbol keeps the marker un-forgeable by accident and
// invisible to JSON serialization.
const TEXT = Symbol('kaiten.text');
type TextMarker = { [TEXT]: true; text: string };

/** Wrap a string so `defineTool` emits it as-is instead of JSON-stringifying. */
export function text(s: string): TextMarker {
  return { [TEXT]: true, text: s };
}

const isText = (v: unknown): v is TextMarker =>
  typeof v === 'object' && v !== null && (v as Record<symbol, unknown>)[TEXT] === true;

/**
 * Return pre-rendered `rendered` text (markdown or a human-readable summary)
 * PLUS a machine-readable `structuredContent` mirror of the underlying `data`
 * (MCP spec 2025-11-25). Use this from read-only tools whose text output is a
 * human-formatted view of structured data, so programmatic clients can consume
 * the data without scraping the prose. Arrays are wrapped as `{ items }` to
 * satisfy the object-typed field; non-object `data` yields no structuredContent.
 * The text block is whatever you pass — mirror only data the text already shows,
 * never more (so truncated/summarized payloads are NOT silently re-expanded).
 */
export function textWithData(rendered: string, data: unknown): ToolResult {
  const result: ToolResult = { content: [{ type: 'text', text: rendered }] };
  if (data !== null && typeof data === 'object') {
    result.structuredContent = Array.isArray(data)
      ? { items: data }
      : (data as Record<string, unknown>);
  }
  return result;
}

const isToolResult = (v: unknown): v is ToolResult => {
  if (typeof v !== 'object' || v === null) return false;
  const arr = (v as { content?: unknown }).content;
  if (!Array.isArray(arr)) return false;
  // empty content is a (rare but valid) ToolResult; a non-empty one must look like MCP content items
  return arr.length === 0 ||
    (typeof arr[0] === 'object' && arr[0] !== null && typeof (arr[0] as { type?: unknown }).type === 'string');
};

export interface ToolAnnotations {
  readOnly?: boolean;
  destructive?: boolean;
  idempotent?: boolean;
  openWorld?: boolean;
}

export type ToolHandler<S extends z.ZodTypeAny> = (
  args: z.infer<S>,
  ctx: ServerContext,
) => Promise<unknown> | unknown;

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodObject<z.ZodRawShape>;
  readonly annotations: ToolAnnotations;
  run(rawArgs: unknown, ctx: ServerContext): Promise<ToolResult>;
}

/**
 * Build a self-contained tool. `run()` owns the full per-call lifecycle:
 * validate raw args (Zod throws on bad input) -> invoke the handler -> wrap the
 * return into a {@link ToolResult} envelope -> map any thrown error via
 * {@link mapError}. Handlers may return a plain value (serialized to pretty
 * JSON), a {@link text} marker (passed through), or a raw {@link ToolResult}.
 */
export function defineTool<S extends z.ZodObject<z.ZodRawShape>>(spec: {
  name: string;
  description: string;
  schema: S;
  annotations?: ToolAnnotations;
  handler: ToolHandler<S>;
}): ToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    schema: spec.schema,
    annotations: spec.annotations ?? {},
    async run(rawArgs, ctx) {
      try {
        const args = spec.schema.parse(rawArgs);
        const out = await spec.handler(args, ctx);
        if (isToolResult(out)) return out;
        if (isText(out)) return { content: [{ type: 'text', text: out.text }] };
        const result: ToolResult = {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) ?? 'null' }],
        };
        // Read-only tools also expose a machine-readable mirror in
        // `structuredContent` (MCP spec 2025-11-25). The text block above is left
        // untouched (arrays stay bare arrays) so the envelope is non-breaking;
        // arrays are wrapped as `{ items }` here to satisfy the object-typed
        // field. No outputSchema is advertised, so this is free on connect.
        if (spec.annotations?.readOnly && out !== null && typeof out === 'object') {
          result.structuredContent = Array.isArray(out)
            ? { items: out }
            : (out as Record<string, unknown>);
        }
        return result;
      } catch (err) {
        return mapError(err);
      }
    },
  };
}

/**
 * Map a thrown error to the exact MCP error envelope the legacy CallTool
 * handler in `src/server.ts` produced. This is a faithful reproduction of that
 * catch block (lines 3124-3185 as of this writing) and MUST stay byte-identical
 * so the characterization snapshots in `test/server.test.ts` keep passing when
 * tools migrate onto this seam.
 *
 * Branch order:
 *   1. z.ZodError      -> VALIDATION_ERROR { message, details:[{path,message,code}] }
 *   2. KaitenError      -> rich envelope    { type, message, status, details, hint }
 *   3. err.response     -> API_ERROR        { message, status, details }
 *   4. anything else    -> UNKNOWN_ERROR    { message }
 *
 * A categorized {@link KaitenError} (thrown by the client's axios interceptor)
 * is surfaced via its `toJSON()` so the MCP client receives the error type, the
 * HTTP status and the actionable `hint` — instead of collapsing to a generic
 * UNKNOWN_ERROR that discards them. (Previously KaitenError carried neither a
 * `.response` nor was a ZodError, so it fell through to UNKNOWN_ERROR.) Every
 * branch emits `JSON.stringify(..., null, 2)` and sets `isError: true`.
 */
export function mapError(err: unknown): ToolResult {
  const error = err as any;

  // Handle Zod validation errors
  if (error instanceof z.ZodError) {
    const formattedErrors = error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
      code: e.code,
    }));

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: {
                type: 'VALIDATION_ERROR',
                message: 'Invalid request parameters',
                details: formattedErrors,
              },
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }

  // Handle categorized Kaiten client errors — surface the full envelope
  // (type/status/details/hint) via toJSON instead of a generic UNKNOWN_ERROR.
  if (error instanceof KaitenError) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: error.toJSON() }, null, 2),
        },
      ],
      isError: true,
    };
  }

  // Handle Axios/API errors
  if (error && error.response) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: {
                type: 'API_ERROR',
                message: error.message || 'Kaiten API error',
                status: error.response.status,
                details: error.response.data,
              },
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }

  // Handle unknown errors
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            error: {
              type: 'UNKNOWN_ERROR',
              message: (error && error.message) || String(error),
            },
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}
