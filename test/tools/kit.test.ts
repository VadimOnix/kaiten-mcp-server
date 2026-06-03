import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  defineTool,
  mapError,
  text,
  type ServerContext,
  type ToolResult,
} from '../../src/tools/kit.js';
import { KaitenError, KaitenErrorType } from '../../src/kaiten-client.js';

// A throwaway ServerContext: defineTool's run() never touches these in the
// wrap-logic tests (the handlers ignore ctx), so undefineds cast through `as`
// are safe here. The seam's contract under test is validation + envelope +
// error mapping, not the dependencies themselves.
const ctx = {} as unknown as ServerContext;

describe('text() marker', () => {
  it('produces a value that defineTool passes through without JSON.stringify', async () => {
    const tool = defineTool({
      name: 'kaiten_text_tool',
      description: 'returns pre-rendered markdown',
      schema: z.object({}),
      handler: () => text('# Already rendered\n\nbody'),
    });
    const res = await tool.run({}, ctx);
    expect(res).toEqual({
      content: [{ type: 'text', text: '# Already rendered\n\nbody' }],
    });
    // No surrounding quotes / escaping => not JSON.stringify'd.
    expect(res.content[0].text).toBe('# Already rendered\n\nbody');
    expect(res.isError).toBeUndefined();
  });
});

describe('defineTool wrap logic', () => {
  it('defaults annotations to {} when omitted', () => {
    const tool = defineTool({
      name: 'kaiten_noann',
      description: 'no annotations',
      schema: z.object({}),
      handler: () => ({}),
    });
    expect(tool.annotations).toEqual({});
  });

  it('preserves provided annotations', () => {
    const tool = defineTool({
      name: 'kaiten_ann',
      description: 'has annotations',
      schema: z.object({}),
      annotations: { readOnly: true, idempotent: true },
      handler: () => ({}),
    });
    expect(tool.annotations).toEqual({ readOnly: true, idempotent: true });
  });

  it('exposes name, description and schema on the definition', () => {
    const schema = z.object({ id: z.number() });
    const tool = defineTool({
      name: 'kaiten_meta',
      description: 'metadata test',
      schema,
      handler: () => ({}),
    });
    expect(tool.name).toBe('kaiten_meta');
    expect(tool.description).toBe('metadata test');
    expect(tool.schema).toBe(schema);
  });

  it('validates rawArgs through the schema before invoking the handler', async () => {
    let seen: unknown;
    const tool = defineTool({
      name: 'kaiten_coerce',
      description: 'parses args',
      schema: z.object({ id: z.number(), keep: z.string().default('def') }),
      handler: (args) => {
        seen = args;
        return args;
      },
    });
    await tool.run({ id: 7 }, ctx);
    // Zod fills the default => the handler sees parsed (not raw) args.
    expect(seen).toEqual({ id: 7, keep: 'def' });
  });

  it('wraps a plain object return value as pretty-printed JSON', async () => {
    const tool = defineTool({
      name: 'kaiten_obj',
      description: 'returns an object',
      schema: z.object({}),
      handler: () => ({ id: 9, title: 'New Card', board_id: 3 }),
    });
    const res = await tool.run({}, ctx);
    expect(res).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ id: 9, title: 'New Card', board_id: 3 }, null, 2),
        },
      ],
    });
  });

  it('passes a raw ToolResult through unchanged', async () => {
    const raw: ToolResult = {
      content: [{ type: 'text', text: 'Card 5 deleted successfully' }],
    };
    const tool = defineTool({
      name: 'kaiten_raw',
      description: 'returns a ToolResult',
      schema: z.object({}),
      handler: () => raw,
    });
    const res = await tool.run({}, ctx);
    expect(res).toBe(raw);
  });

  it('preserves isError on a raw ToolResult passthrough', async () => {
    const raw: ToolResult = {
      content: [{ type: 'text', text: 'boom' }],
      isError: true,
    };
    const tool = defineTool({
      name: 'kaiten_raw_err',
      description: 'returns an error ToolResult',
      schema: z.object({}),
      handler: () => raw,
    });
    const res = await tool.run({}, ctx);
    expect(res).toBe(raw);
    expect(res.isError).toBe(true);
  });

  it('awaits async handlers', async () => {
    const tool = defineTool({
      name: 'kaiten_async',
      description: 'async handler',
      schema: z.object({}),
      handler: async () => ({ ok: true }),
    });
    const res = await tool.run({}, ctx);
    expect(res.content[0].text).toBe(JSON.stringify({ ok: true }, null, 2));
  });

  it('routes a ZodError from schema.parse through mapError', async () => {
    const tool = defineTool({
      name: 'kaiten_validate',
      description: 'requires a number',
      schema: z.object({ card_id: z.number() }),
      handler: () => ({}),
    });
    const res = await tool.run({ card_id: 'not-a-number' }, ctx);
    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error.type).toBe('VALIDATION_ERROR');
  });

  it('handler returning undefined produces text: "null" (Fix I2 — JSON.stringify(undefined) guard)', async () => {
    const tool = defineTool({
      name: 'kaiten_undef',
      description: 'returns undefined',
      schema: z.object({}),
      // TypeScript doesn't allow returning undefined directly from a typed
      // handler, so we cast to sneak it past the type-checker deliberately.
      handler: () => undefined as unknown as void,
    });
    const res = await tool.run({}, ctx);
    expect(res.isError).toBeFalsy();
    expect(res.content).toHaveLength(1);
    expect(res.content[0].type).toBe('text');
    // Must be the string 'null', not JS undefined (which would break the MCP envelope).
    expect(res.content[0].text).toBe('null');
  });

  it('plain object with a non-MCP content array is JSON-stringified, not passed through (Fix I1 — isToolResult tightening)', async () => {
    // This object has a `content` array, but its items are numbers, not MCP
    // content items. Before the fix, isToolResult() would have accepted it and
    // returned { content: [1, 2, 3] } — an invalid ToolResult.
    const dataWithContent = { content: [1, 2, 3] };
    const tool = defineTool({
      name: 'kaiten_fakeresult',
      description: 'returns a data object that looks like a ToolResult',
      schema: z.object({}),
      handler: () => dataWithContent,
    });
    const res = await tool.run({}, ctx);
    expect(res.isError).toBeFalsy();
    // The whole object must be JSON-stringified and placed in a single text item.
    expect(res.content).toHaveLength(1);
    expect(res.content[0].type).toBe('text');
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({ content: [1, 2, 3] });
  });

  it('genuine raw ToolResult (non-empty content) passes through unchanged', async () => {
    const raw: ToolResult = {
      content: [{ type: 'text', text: 'already rendered' }],
    };
    const tool = defineTool({
      name: 'kaiten_genuine_raw',
      description: 'returns a genuine ToolResult',
      schema: z.object({}),
      handler: () => raw,
    });
    const res = await tool.run({}, ctx);
    expect(res).toBe(raw);
  });

  it('ToolResult with empty content array passes through as a ToolResult (Fix I1 — empty is valid)', async () => {
    const raw: ToolResult = { content: [] };
    const tool = defineTool({
      name: 'kaiten_empty_content',
      description: 'returns a ToolResult with empty content',
      schema: z.object({}),
      handler: () => raw,
    });
    const res = await tool.run({}, ctx);
    expect(res).toBe(raw);
    expect(res.content).toHaveLength(0);
  });

  it('routes a thrown handler error through mapError', async () => {
    const tool = defineTool({
      name: 'kaiten_throws',
      description: 'always throws',
      schema: z.object({}),
      handler: () => {
        throw new KaitenError(KaitenErrorType.NOT_FOUND, 'Resource not found', 404, {}, 'hint');
      },
    });
    const res = await tool.run({}, ctx);
    // KaitenError is neither a ZodError nor has .response => UNKNOWN_ERROR branch.
    expect(res).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { error: { type: 'UNKNOWN_ERROR', message: 'Resource not found' } },
            null,
            2,
          ),
        },
      ],
      isError: true,
    });
  });
});

// =============================================================================
// mapError must be BYTE-IDENTICAL to the live CallTool catch block in
// src/server.ts (lines 3124-3185 at the time of writing). The three branches,
// in order, are: ZodError -> VALIDATION_ERROR, error.response -> API_ERROR,
// else -> UNKNOWN_ERROR. Each returns { content:[{type:'text', text:
// JSON.stringify(<nested error>, null, 2)}], isError:true }.
// =============================================================================
describe('mapError parity with the real CallTool catch block', () => {
  it('ZodError -> nested VALIDATION_ERROR with formatted details (matches server.ts)', () => {
    let zodErr: z.ZodError;
    try {
      z.object({ card_id: z.number() }).parse({ card_id: 'oops' });
      throw new Error('schema should have rejected');
    } catch (e) {
      zodErr = e as z.ZodError;
    }

    const res = mapError(zodErr);

    // Reproduce the server.ts formatting verbatim.
    const formattedErrors = zodErr.errors.map((err) => ({
      path: err.path.join('.'),
      message: err.message,
      code: err.code,
    }));
    const expectedText = JSON.stringify(
      {
        error: {
          type: 'VALIDATION_ERROR',
          message: 'Invalid request parameters',
          details: formattedErrors,
        },
      },
      null,
      2,
    );

    expect(res).toEqual({
      content: [{ type: 'text', text: expectedText }],
      isError: true,
    });
  });

  it('axios-style error with .response -> nested API_ERROR with status + details', () => {
    const axiosErr: any = {
      message: 'Request failed with status code 500',
      response: { status: 500, data: { reason: 'boom' } },
    };

    const res = mapError(axiosErr);

    const expectedText = JSON.stringify(
      {
        error: {
          type: 'API_ERROR',
          message: 'Request failed with status code 500',
          status: 500,
          details: { reason: 'boom' },
        },
      },
      null,
      2,
    );

    expect(res).toEqual({
      content: [{ type: 'text', text: expectedText }],
      isError: true,
    });
  });

  it('axios-style error with .response but no .message -> falls back to default message', () => {
    const axiosErr: any = { response: { status: 422, data: { invalid: true } } };
    const res = mapError(axiosErr);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error.type).toBe('API_ERROR');
    expect(parsed.error.message).toBe('Kaiten API error');
    expect(parsed.error.status).toBe(422);
    expect(parsed.error.details).toEqual({ invalid: true });
  });

  it('KaitenError -> UNKNOWN_ERROR branch (NOT the toJSON flat shape the plan assumed)', () => {
    const err = new KaitenError(
      KaitenErrorType.NOT_FOUND,
      'Resource not found',
      404,
      {},
      'Check that the card_id, board_id, space_id, or other resource ID is correct',
    );

    const res = mapError(err);

    // Real catch block: KaitenError has no .response and is not a ZodError, so
    // it lands in UNKNOWN_ERROR with ONLY { type, message }. No status, no
    // hint, no details, and crucially NOT a flat { error: 'NOT_FOUND' }.
    expect(res).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { error: { type: 'UNKNOWN_ERROR', message: 'Resource not found' } },
            null,
            2,
          ),
        },
      ],
      isError: true,
    });

    // Guard the byte-stability snapshot expectation in test/server.test.ts,
    // which asserts /NOT_FOUND|not found/i against this exact text.
    expect(res.content[0].text).toMatch(/NOT_FOUND|not found/i);
    // And explicitly: the result is NOT the flat toJSON shape.
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error.type).toBe('UNKNOWN_ERROR');
    expect(parsed.error.hint).toBeUndefined();
    expect(parsed.error.status).toBeUndefined();
  });

  it('plain Error -> UNKNOWN_ERROR using error.message', () => {
    const res = mapError(new Error('something broke'));
    expect(res).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { error: { type: 'UNKNOWN_ERROR', message: 'something broke' } },
            null,
            2,
          ),
        },
      ],
      isError: true,
    });
  });

  it('non-Error throwable (no .message) -> UNKNOWN_ERROR using String(err)', () => {
    const res = mapError('just a string');
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error.type).toBe('UNKNOWN_ERROR');
    expect(parsed.error.message).toBe('just a string');
    expect(res.isError).toBe(true);
  });
});
