import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
import { installFetchMock, jsonResponse } from './helpers/fetch-mock';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { cache } from '../src/cache.js';
import { ALL_TOOLS } from '../src/tools/index.js';

let fetchMock: ReturnType<typeof installFetchMock>;

async function connect(): Promise<Client> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  const client = new Client({ name: 'test', version: '1.0' }, { capabilities: {} });
  await server.connect(serverT);
  await client.connect(clientT);
  return client;
}

/** Convenience: call a tool and return the first content block's text. */
async function callText(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const res = await client.callTool({ name, arguments: args });
  return (res.content as any[])[0].text as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = installFetchMock();
  // The LRU cache is a shared singleton imported by server.ts. list_spaces,
  // list_boards and parameterless list_users cache their results, so we clear
  // it between tests to keep every snapshot self-contained and deterministic.
  cache.invalidateAll();
});

describe('protocol contract', () => {
  it('lists all 26 tools with non-empty descriptions and object input schemas', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(26);
    for (const t of tools) {
      expect(t.name).toMatch(/^kaiten_/);
      expect((t.description ?? '').length).toBeGreaterThan(0);
      expect(t.inputSchema.type).toBe('object');
    }
  });

  it('ALL_TOOLS has exactly 26 entries and covers every advertised tool name', async () => {
    expect(ALL_TOOLS.length).toBe(26);
    const client = await connect();
    const { tools } = await client.listTools();
    const names = new Set(ALL_TOOLS.map(d => d.name));
    for (const t of tools) {
      expect(names.has(t.name), `ALL_TOOLS missing entry for ${t.name}`).toBe(true);
    }
  });

  it('advertises the package.json version (no hardcoded version drift)', async () => {
    const pkg = createRequire(import.meta.url)('../package.json') as { version: string };
    const client = await connect();
    expect(client.getServerVersion()).toMatchObject({
      name: 'kaiten-mcp-server',
      version: pkg.version,
    });
  });

  // P0 context-footprint fix: cross-tool usage rules (default space, Russian
  // root-word search, LATIN-only user names) are consolidated ONCE into the
  // server `instructions` (sent at initialize) instead of being duplicated
  // across the per-tool descriptions. The client exposes them via getInstructions().
  it('advertises server instructions carrying the key usage rules', async () => {
    const client = await connect();
    const instructions = client.getInstructions() ?? '';
    expect(instructions.length).toBeGreaterThan(0);
    expect(instructions).toMatch(/LATIN/i);          // user-name transliteration rule
    expect(instructions.toLowerCase()).toContain('root'); // Russian root-word search rule
  });

  // Schema-fidelity guard for the Zod -> JSON-Schema derivation done by
  // McpServer.registerTool (Task 12). Asserts the properties the SPIKE confirmed
  // the SDK (v1.29.0) actually produces from a tool's `schema.shape`:
  //   - inputSchema.type === 'object'
  //   - field `.describe()` text flows through to the advertised schema (the
  //     Phase-2 win: descriptions are single-sourced from Zod)
  //   - the `required` array matches the schema's required fields (card_id is
  //     required; format has a default, so it is NOT required)
  //   - additionalProperties === false survives the derivation (the SDK wraps
  //     the raw shape in z.object(shape) whose JSON Schema is closed by default)
  it('advertises kaiten_get_card with a Zod-derived schema (descriptions, required, closed object)', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const getCard = tools.find((t) => t.name === 'kaiten_get_card');
    expect(getCard, 'kaiten_get_card should be advertised').toBeDefined();

    const schema = getCard!.inputSchema as {
      type: string;
      properties: Record<string, { description?: string }>;
      required?: string[];
      additionalProperties?: unknown;
    };

    expect(schema.type).toBe('object');
    // Phase-2 win: the field description is carried from the Zod `.describe()`.
    expect(schema.properties.card_id?.description ?? '').toBeTruthy();
    // Required set: card_id only (format has a Zod default -> optional).
    expect(schema.required).toEqual(['card_id']);
    // Closed object survives the .shape -> z.object(shape) derivation.
    expect(schema.additionalProperties).toBe(false);
  });

  // Unknown-tool behaviour under McpServer (Task 12): the high-level server
  // rejects an unadvertised tool at the protocol layer (JSON-RPC -32602). The
  // client surfaces this as an error result (isError:true) rather than a throw.
  // This replaces the old hand-written CallTool default branch, which produced
  // an UNKNOWN_ERROR JSON envelope. How an unknown tool is surfaced depends on the
  // installed SDK: newer @modelcontextprotocol/sdk (>=1.29) returns an isError result,
  // while older versions (e.g. 1.20, the pinned version) reject with a JSON-RPC
  // -32602 "not found" error. Accept either — both mean "unknown tool -> error".
  it('an unknown tool is surfaced as an error (reject or isError, per SDK version)', async () => {
    const client = await connect();
    try {
      const res = await client.callTool({ name: 'kaiten_does_not_exist', arguments: {} });
      // Newer SDK: error-result envelope
      expect(res.isError).toBe(true);
      expect((res.content as any[])[0].text).toMatch(/not found/i);
    } catch (err: any) {
      // Older SDK (pinned 1.20): rejects with McpError -32602 "... not found"
      expect(String(err?.message ?? err)).toMatch(/not found/i);
    }
  });

  it('get_card returns the markdown card sheet for a known card', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 5, title: 'Demo' }));
    const client = await connect();
    const res = await client.callTool({ name: 'kaiten_get_card', arguments: { card_id: 5 } });
    expect(res.isError).toBeFalsy();
    expect((res.content as any[])[0].text).toContain('# Demo');
  });

  // structuredContent (MCP spec 2025-11-25) must survive the SDK round-trip to a
  // connected client. We advertise NO outputSchema, so the SDK forwards it
  // unvalidated (mcp.js validateToolOutput early-returns when outputSchema is
  // absent) — confirming the machine-readable mirror reaches real clients.
  it('forwards structuredContent on a read-only tool to the connected client', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 5, title: 'Demo' }));
    const client = await connect();
    const res = await client.callTool({ name: 'kaiten_get_card', arguments: { card_id: 5 } });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toMatchObject({ id: 5, title: 'Demo' });
  });

  it('maps a Kaiten 404 to an error result mentioning not found', async () => {
    // The live client maps a 404 Response into a KaitenError(NOT_FOUND).
    fetchMock.mockResolvedValueOnce(jsonResponse({}, { status: 404 }));
    const client = await connect();
    const res = await client.callTool({ name: 'kaiten_get_card', arguments: { card_id: 999999 } });
    expect(res.isError).toBe(true);
    expect((res.content as any[])[0].text).toMatch(/NOT_FOUND|not found/i);
  });

  // Characterizes client-side abort only: the MCP client's pending call rejects when aborted.
  // Server-side extra.signal propagation is wired in Task 4, which will strengthen this test.
  it('client-side abort: an aborted MCP call rejects on the caller side', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {})); // never resolves
    const client = await connect();
    const ac = new AbortController();
    const p = client.callTool(
      { name: 'kaiten_get_card', arguments: { card_id: 5 } },
      undefined,
      { signal: ac.signal },
    );
    ac.abort();
    await expect(p).rejects.toBeDefined();
  });
});

// =============================================================================
// Resources + prompts migration guard (Task 12).
//
// Task 12 swapped the low-level Server for McpServer. Tools moved onto
// McpServer.registerTool, but resources and the server prompt were kept as
// custom handlers attached to the wrapped low-level Server (server.server),
// preserving their original bespoke behaviour (dynamic default-space card
// listing, multi-protocol URI parsing incl. the OPAQUE `kaiten-current-user:`
// URI). These tests guard that the migration kept them functional.
// =============================================================================
describe('resources + prompts (migrated to McpServer.server handlers)', () => {
  it('lists the 4 resource templates including the opaque kaiten-current-user URI', async () => {
    const client = await connect();
    const { resourceTemplates } = await client.listResourceTemplates();
    const uris = resourceTemplates.map((t) => t.uriTemplate).sort();
    expect(uris).toEqual(
      [
        'kaiten-board:///{boardId}/cards',
        'kaiten-card:///{cardId}',
        'kaiten-current-user:',
        'kaiten-space:///{spaceId}',
      ].sort(),
    );
  });

  it('reads the opaque kaiten-current-user: resource and returns simplified user JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 1, full_name: 'Me', email: 'me@example.com', username: 'me', activated: true }),
    );
    const client = await connect();
    const res = await client.readResource({ uri: 'kaiten-current-user:' });
    expect(res.contents[0].mimeType).toBe('application/json');
    expect(JSON.parse(res.contents[0].text as string)).toMatchObject({ id: 1, full_name: 'Me' });
  });

  it('reads a kaiten-card:/// resource and returns simplified card JSON', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 5, title: 'Demo' }));
    const client = await connect();
    const res = await client.readResource({ uri: 'kaiten-card:///5' });
    expect(res.contents[0].uri).toBe('kaiten-card:///5');
    expect(JSON.parse(res.contents[0].text as string)).toMatchObject({ id: 5, title: 'Demo' });
  });

  it('lists the server prompt and returns its instruction message', async () => {
    const client = await connect();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain('kaiten-server-prompt');

    const got = await client.getPrompt({ name: 'kaiten-server-prompt' });
    expect(got.messages[0].role).toBe('user');
    // The prompt body reuses the consolidated server instructions (single source),
    // so it carries the cross-tool rules rather than the old standalone blurb.
    const text = (got.messages[0].content as { text: string }).text;
    expect(text).toMatch(/Kaiten MCP server/);
    expect(text).toContain('kaiten_search_cards');
    expect(text).toMatch(/LATIN/i);
  });
});

// =============================================================================
// Per-tool happy-path characterization snapshots.
//
// One snapshot per tool locks the exact content[0].text the current server
// emits for a minimal successful response. These are the byte-stability guard
// for later refactor phases: any change to a tool's output will fail its
// snapshot. Mocks mirror the verb + minimal response shape each tool's client
// method needs (see src/kaiten-client.ts). Env (vitest.config.ts) injects
// KAITEN_API_URL=https://test.kaiten.ru and KAITEN_DEFAULT_SPACE_ID=42, so
// generated card URLs are deterministic.
// =============================================================================
describe('tool happy-path characterization snapshots', () => {
  it('kaiten_get_card', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 5, title: 'Demo Card' }));
    const client = await connect();
    expect(await callText(client, 'kaiten_get_card', { card_id: 5 })).toMatchInlineSnapshot(`
      "# Demo Card

      🔗 https://test.kaiten.ru/space/42/card/5
      📋 Board: N/A
      👤 Owner: Unassigned
      💬 Comments: 0
      🕐 Created: N/A | Updated: N/A
      "
    `);
  });

  it('kaiten_create_card', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 9, title: 'New Card', board_id: 3 }));
    const client = await connect();
    expect(await callText(client, 'kaiten_create_card', { title: 'New Card', board_id: 3 }))
      .toMatchInlineSnapshot(`
        "{
          "id": 9,
          "title": "New Card",
          "board_id": 3
        }"
      `);
  });

  it('kaiten_update_card', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 5, title: 'Updated Card' }));
    const client = await connect();
    expect(await callText(client, 'kaiten_update_card', { card_id: 5, title: 'Updated Card' }))
      .toMatchInlineSnapshot(`
        "{
          "id": 5,
          "title": "Updated Card"
        }"
      `);
  });

  it('kaiten_delete_card', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(undefined));
    const client = await connect();
    expect(await callText(client, 'kaiten_delete_card', { card_id: 5 }))
      .toMatchInlineSnapshot(`"Card 5 deleted successfully"`);
  });

  it('kaiten_search_cards', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ id: 7, title: 'Found Card', board: { title: 'Board A' } }]),
    );
    const client = await connect();
    expect(await callText(client, 'kaiten_search_cards', { query: 'Found', board_id: 3 }))
      .toMatchInlineSnapshot(`
        "Found 1 card(s) matching "Found" in space 42 on board 3
        Verbosity: normal

        1. Found Card
           📋 Board: Board A
           👤 Owner: Unassigned
           🔗 https://test.kaiten.ru/space/42/card/7
           🕐 Updated: N/A


        ℹ️ Use kaiten_get_card with card ID for full details."
      `);
  });

  it('kaiten_get_card_comments', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { id: 1, text: 'first comment', created: '2025-01-01T00:00:00Z', author: { id: 2, full_name: 'Alice' } },
      ]),
    );
    const client = await connect();
    expect(await callText(client, 'kaiten_get_card_comments', { card_id: 5 }))
      .toMatchInlineSnapshot(`
        "[
          {
            "id": 1,
            "text": "first comment",
            "created": "2025-01-01T00:00:00Z",
            "author_id": 2,
            "author_name": "Alice"
          }
        ]"
      `);
  });

  it('kaiten_create_comment', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 11, text: 'hello', card_id: 5 }),
    );
    const client = await connect();
    expect(await callText(client, 'kaiten_create_comment', { card_id: 5, text: 'hello' }))
      .toMatchInlineSnapshot(`
        "{
          "id": 11,
          "text": "hello",
          "card_id": 5
        }"
      `);
  });

  it('kaiten_update_comment', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 11, text: 'edited', card_id: 5 }),
    );
    const client = await connect();
    expect(await callText(client, 'kaiten_update_comment', { card_id: 5, comment_id: 11, text: 'edited' }))
      .toMatchInlineSnapshot(`
        "{
          "id": 11,
          "text": "edited",
          "card_id": 5
        }"
      `);
  });

  it('kaiten_delete_comment', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(undefined));
    const client = await connect();
    expect(await callText(client, 'kaiten_delete_comment', { card_id: 5, comment_id: 11 }))
      .toMatchInlineSnapshot(`"Comment 11 deleted successfully"`);
  });

  it('kaiten_get_card_children', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ id: 42, title: 'Subtask', board: { title: 'Board A' } }]),
    );
    const client = await connect();
    expect(await callText(client, 'kaiten_get_card_children', { card_id: 5 }))
      .toMatchInlineSnapshot(`
        "[
          {
            "id": 42,
            "title": "Subtask",
            "url": "https://test.kaiten.ru/space/42/card/42",
            "board_title": "Board A",
            "owner_name": null,
            "asap": false,
            "blocked": false
          }
        ]"
      `);
  });

  it('kaiten_add_card_children', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 5, title: 'Parent' }));
    const client = await connect();
    expect(await callText(client, 'kaiten_add_card_children', { card_id: 5, child_card_ids: [42] }))
      .toMatchInlineSnapshot(`
        "{
          "parent_card_id": 5,
          "succeeded": [
            42
          ],
          "failed": [],
          "summary": "1 added, 0 failed"
        }"
      `);
  });

  it('kaiten_remove_card_children', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 5 }));
    const client = await connect();
    expect(await callText(client, 'kaiten_remove_card_children', { card_id: 5, child_card_ids: [42] }))
      .toMatchInlineSnapshot(`
        "{
          "parent_card_id": 5,
          "succeeded": [
            42
          ],
          "failed": [],
          "summary": "1 removed, 0 failed"
        }"
      `);
  });

  it('kaiten_get_card_parents', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ id: 70, title: 'Parent Card', board: { title: 'Board A' } }]),
    );
    const client = await connect();
    expect(await callText(client, 'kaiten_get_card_parents', { card_id: 5 }))
      .toMatchInlineSnapshot(`
        "[
          {
            "id": 70,
            "title": "Parent Card",
            "url": "https://test.kaiten.ru/space/42/card/70",
            "board_title": "Board A",
            "owner_name": null,
            "asap": false,
            "blocked": false
          }
        ]"
      `);
  });

  it('kaiten_add_card_parents', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 5, title: 'Child' }));
    const client = await connect();
    expect(await callText(client, 'kaiten_add_card_parents', { card_id: 5, parent_card_ids: [70] }))
      .toMatchInlineSnapshot(`
        "{
          "child_card_id": 5,
          "succeeded": [
            70
          ],
          "failed": [],
          "summary": "1 added, 0 failed"
        }"
      `);
  });

  it('kaiten_remove_card_parents', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 5 }));
    const client = await connect();
    expect(await callText(client, 'kaiten_remove_card_parents', { card_id: 5, parent_card_ids: [70] }))
      .toMatchInlineSnapshot(`
        "{
          "child_card_id": 5,
          "succeeded": [
            70
          ],
          "failed": [],
          "summary": "1 removed, 0 failed"
        }"
      `);
  });

  it('kaiten_list_spaces', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ id: 1, title: 'Space One', archived: false, boards: [{ id: 10, title: 'Board A' }] }]),
    );
    const client = await connect();
    expect(await callText(client, 'kaiten_list_spaces', {})).toMatchInlineSnapshot(`
      "Found 1 space(s):

      1. Space One (ID: 1)
         📋 Boards (1): Board A

      "
    `);
  });

  it('kaiten_list_boards', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ id: 10, title: 'Board A', space_id: 42, archived: false }]),
    );
    const client = await connect();
    expect(await callText(client, 'kaiten_list_boards', { space_id: 42 })).toMatchInlineSnapshot(`
      "[
        {
          "id": 10,
          "title": "Board A",
          "space_id": 42,
          "archived": false
        }
      ]"
    `);
  });

  it('kaiten_list_columns', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ id: 100, title: 'Backlog' }]),
    );
    const client = await connect();
    expect(await callText(client, 'kaiten_list_columns', { board_id: 10 })).toMatchInlineSnapshot(`
      "[
        {
          "id": 100,
          "title": "Backlog"
        }
      ]"
    `);
  });

  it('kaiten_list_lanes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ id: 200, title: 'High Priority' }]),
    );
    const client = await connect();
    expect(await callText(client, 'kaiten_list_lanes', { board_id: 10 })).toMatchInlineSnapshot(`
      "[
        {
          "id": 200,
          "title": "High Priority"
        }
      ]"
    `);
  });

  it('kaiten_list_types', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ id: 300, name: 'Bug' }]),
    );
    const client = await connect();
    expect(await callText(client, 'kaiten_list_types', { board_id: 10 })).toMatchInlineSnapshot(`
      "[
        {
          "id": 300,
          "name": "Bug"
        }
      ]"
    `);
  });

  it('kaiten_get_current_user', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 1, full_name: 'Me', email: 'me@example.com', username: 'me', activated: true }),
    );
    const client = await connect();
    expect(await callText(client, 'kaiten_get_current_user', {})).toMatchInlineSnapshot(`
      "{
        "id": 1,
        "full_name": "Me",
        "email": "me@example.com",
        "username": "me",
        "activated": true
      }"
    `);
  });

  it('kaiten_list_users', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ id: 2, full_name: 'Alice', email: 'alice@example.com', username: 'alice', activated: true }]),
    );
    const client = await connect();
    expect(await callText(client, 'kaiten_list_users', { query: 'Alice' })).toMatchInlineSnapshot(`
      "[
        {
          "id": 2,
          "full_name": "Alice",
          "email": "alice@example.com",
          "username": "alice",
          "activated": true
        }
      ]"
    `);
  });
});
