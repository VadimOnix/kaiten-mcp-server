/**
 * Tool-quality eval harness (deterministic, no LLM, CI-runnable).
 *
 * Three regression guards that protect the qualities this server is optimized
 * for. They turn "did we just re-bloat the context / break tool routing /
 * un-cap a response" into a red test instead of a silent regression noticed in
 * production months later.
 *
 *   1. ADVERTISED FOOTPRINT BUDGET — every client pays the full listTools()
 *      payload + server instructions on connect. We measure exactly what a
 *      connected client receives and assert it stays under a ceiling. The
 *      ceilings are RATCHETS: tighten them when the surface shrinks; raise one
 *      ONLY with an explicit justification in the diff.
 *   2. TOOL ROUTING SIGNALS — a description that drops its chaining keyword
 *      (e.g. get_card no longer mentions kaiten_search_cards) silently degrades
 *      the agent's ability to pick + sequence tools. We pin the high-value
 *      signals so a future "trim" can't accidentally remove them.
 *   3. RESPONSE SIZE CAPS — the anti-context-flood guarantees (comment
 *      pagination, search limit, the hard truncation backstop) must hold even
 *      when the upstream API returns a huge payload.
 *
 * Future extension (NOT here, deliberately): an LLM-in-the-loop eval that gives
 * Claude a task and checks it picks the right tool. That needs API access, is
 * non-deterministic, and costs tokens — out of scope for a committed unit test.
 */
import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/server.js';
import { ALL_TOOLS } from '../../src/tools/index.js';
import { getCardComments } from '../../src/tools/comments/get-card-comments.js';
import { searchCards } from '../../src/tools/cards/search-cards.js';
import { listUsers } from '../../src/tools/users/list-users.js';

// ---------------------------------------------------------------------------
// Connect an in-memory client — this is what a real MCP client receives.
// ---------------------------------------------------------------------------
async function connect(): Promise<Client> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  const client = new Client({ name: 'eval', version: '1.0' }, { capabilities: {} });
  await server.connect(serverT);
  await client.connect(clientT);
  return client;
}

interface Footprint {
  toolCount: number;
  instructionsChars: number;
  descTotal: number;
  schemaTotal: number;
  wireChars: number;
  outputSchemaTotal: number;
  toolsWithOutputSchema: number;
  perTool: Array<{ name: string; desc: number; schema: number; output: number; total: number }>;
}

async function measureFootprint(): Promise<Footprint> {
  const client = await connect();
  const { tools } = await client.listTools();
  const instructions = client.getInstructions() ?? '';
  let descTotal = 0;
  let schemaTotal = 0;
  let outputSchemaTotal = 0;
  let toolsWithOutputSchema = 0;
  const perTool = tools.map((t) => {
    const desc = (t.description ?? '').length;
    const schema = JSON.stringify(t.inputSchema ?? {}).length;
    const output = t.outputSchema ? JSON.stringify(t.outputSchema).length : 0;
    descTotal += desc;
    schemaTotal += schema;
    outputSchemaTotal += output;
    if (t.outputSchema) toolsWithOutputSchema += 1;
    return { name: t.name, desc, schema, output, total: desc + schema + output };
  });
  perTool.sort((a, b) => b.total - a.total);
  return {
    toolCount: tools.length,
    instructionsChars: instructions.length,
    descTotal,
    schemaTotal,
    wireChars: JSON.stringify(tools).length,
    outputSchemaTotal,
    toolsWithOutputSchema,
    perTool,
  };
}

// A throwaway ServerContext for direct handler calls (response-size section).
const fakeCtx = (over: Record<string, unknown> = {}) =>
  ({
    client: {},
    cache: { getUsers: () => undefined, setUsers: () => {} },
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

// ===========================================================================
// 1. ADVERTISED FOOTPRINT BUDGET (ratchets — tighten as the surface shrinks)
// ===========================================================================
describe('eval: advertised footprint budget', () => {
  // Measured baselines (chars), captured 2026-07-10 with all 28 tools (MCP spec
  // 2025-11-25): wire=40,015 desc=11,921 inputSchema=15,355 outputSchema=7,707
  // instr=1,137.
  //
  // JUSTIFIED CEILING RAISE: two card-tag tools (kaiten_add_card_tags /
  // kaiten_remove_card_tags) were added, taking the toolset 26 → 28. Each carries
  // a concise description, a small { card_id, tag_names[] } input schema, and the
  // shared lean TagBatchOutput — together ~+2.75k wire chars over the 26-tool
  // baseline. The schemas stay LEAN (key fields only, optional + passthrough);
  // the ceilings below are re-baselined to the new measured totals + small
  // headroom. RATCHET DOWN when a surface shrinks; raise ONLY with a written
  // justification (like this one).
  const WIRE_CEILING = 40_400;
  const SCHEMA_TOTAL_CEILING = 15_600; // inputSchema only
  const OUTPUT_SCHEMA_TOTAL_CEILING = 8_000;
  const DESC_TOTAL_CEILING = 12_200;
  const INSTRUCTIONS_CEILING = 1_600;
  const PER_TOOL_CEILING = 3_600; // search_cards (heaviest) = desc+input+output

  it('reports the footprint breakdown and stays under the wire ceiling', async () => {
    const fp = await measureFootprint();
    // Visibility: a one-line summary in the test log (tests may write to stderr;
    // the stdout-only rule applies to the MCP server runtime, not the test run).
    console.error(
      `[eval/footprint] tools=${fp.toolCount} wire=${fp.wireChars} ` +
        `desc=${fp.descTotal} inputSchema=${fp.schemaTotal} outputSchema=${fp.outputSchemaTotal} ` +
        `instr=${fp.instructionsChars} heaviest=${fp.perTool[0].name}(${fp.perTool[0].total})`,
    );
    expect(fp.wireChars).toBeLessThanOrEqual(WIRE_CEILING);
  });

  it('keeps the aggregate input-schema + description footprint bounded', async () => {
    const fp = await measureFootprint();
    expect(fp.schemaTotal).toBeLessThanOrEqual(SCHEMA_TOTAL_CEILING);
    expect(fp.descTotal).toBeLessThanOrEqual(DESC_TOTAL_CEILING);
  });

  it('keeps the advertised outputSchema footprint lean (all 28 tools, key fields only)', async () => {
    const fp = await measureFootprint();
    expect(fp.toolsWithOutputSchema).toBe(28);
    expect(fp.outputSchemaTotal).toBeLessThanOrEqual(OUTPUT_SCHEMA_TOTAL_CEILING);
  });

  it('keeps the server instructions concise', async () => {
    const fp = await measureFootprint();
    expect(fp.instructionsChars).toBeLessThanOrEqual(INSTRUCTIONS_CEILING);
    expect(fp.instructionsChars).toBeGreaterThan(0);
  });

  it('no single tool dominates the surface (catches a heavy new tool / re-bloat)', async () => {
    const fp = await measureFootprint();
    const over = fp.perTool.filter((t) => t.total > PER_TOOL_CEILING);
    expect(over, `tools over ${PER_TOOL_CEILING} chars: ${JSON.stringify(over)}`).toEqual([]);
  });
});

// ===========================================================================
// 2. TOOL ROUTING SIGNALS — pin the chaining keywords an agent needs
// ===========================================================================
describe('eval: tool routing signals', () => {
  // tool name -> substrings its description MUST contain (case-insensitive) so
  // an agent can pick it and chain to the right sibling. Verified present today.
  const SIGNALS: Record<string, string[]> = {
    kaiten_get_card: ['kaiten_search_cards', 'subtask'],
    kaiten_search_cards: ['board'],
    kaiten_create_card: ['board_id'],
    kaiten_update_card: ['kaiten_get_card'],
    kaiten_delete_card: ['archiv'],
    kaiten_delete_comment: ['kaiten_update_comment'],
    kaiten_update_comment: ['replace'],
    kaiten_list_boards: ['space'],
    kaiten_list_columns: ['board_id'],
    kaiten_list_lanes: ['board_id'],
    kaiten_list_users: ['query'],
    kaiten_add_card_members: ['kaiten_list_users'],
    kaiten_set_card_responsible: ['responsible'],
    kaiten_get_card_parents: ['parent'],
    kaiten_get_card_children: ['child'],
  };

  const byName = new Map(ALL_TOOLS.map((t) => [t.name, t]));

  for (const [name, signals] of Object.entries(SIGNALS)) {
    it(`${name} carries its routing signals: ${signals.join(', ')}`, () => {
      const tool = byName.get(name);
      expect(tool, `${name} should exist in ALL_TOOLS`).toBeDefined();
      const desc = tool!.description.toLowerCase();
      for (const sig of signals) {
        expect(desc, `${name} description must mention "${sig}"`).toContain(sig.toLowerCase());
      }
    });
  }

  it('every tool description is a concise high-signal blurb (no embedded manuals)', () => {
    for (const tool of ALL_TOOLS) {
      for (const marker of ['PARAMETERS:', 'USAGE EXAMPLES:', 'ERRORS:', 'RELATED TOOLS:']) {
        expect(tool.description, `${tool.name} should not embed "${marker}"`).not.toContain(marker);
      }
    }
  });
});

// ===========================================================================
// 3. RESPONSE SIZE CAPS — anti-context-flood guarantees hold under big payloads
// ===========================================================================
describe('eval: response size caps', () => {
  const HARD_BACKSTOP = 100_000; // truncateResponse MAX_RESPONSE_LENGTH

  const bigThread = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      text: `comment ${i + 1} `.repeat(20),
      created: `2025-01-${String((i % 27) + 1).padStart(2, '0')}T00:00:00Z`,
      author: { id: 9, full_name: 'A' },
    }));

  it('get_card_comments paginates a huge thread to the default window (50), not all', async () => {
    const res = await getCardComments.run(
      { card_id: 5 },
      fakeCtx({ client: { getCardComments: () => Promise.resolve(bigThread(300)) } }),
    );
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveLength(50);
    expect(res.content[0].text.length).toBeLessThan(HARD_BACKSTOP);
  });

  it('get_card_comments caps an explicit limit at the schema max (100), not the full thread', async () => {
    const res = await getCardComments.run(
      { card_id: 5, limit: 100 },
      fakeCtx({ client: { getCardComments: () => Promise.resolve(bigThread(300)) } }),
    );
    expect(JSON.parse(res.content[0].text)).toHaveLength(100);
  });

  it('get_card_comments rejects a limit above the schema max (context economy is enforced)', async () => {
    const res = await getCardComments.run(
      { card_id: 5, limit: 101 },
      fakeCtx({ client: { getCardComments: () => Promise.resolve(bigThread(300)) } }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('search_cards rejects limit > 20 at the schema (bounded result set)', async () => {
    const res = await searchCards.run(
      { limit: 21 },
      fakeCtx({ client: { searchCards: () => Promise.resolve([]) } }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('search_cards keeps a full 20-card result under the hard backstop', async () => {
    const cards = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      title: `Card ${i + 1} `.repeat(10),
      description: 'x'.repeat(500),
      board: { title: 'Board A' },
    }));
    const res = await searchCards.run(
      { board_id: 3, verbosity: 'detailed' },
      fakeCtx({ client: { searchCards: () => Promise.resolve(cards) } }),
    );
    expect(res.content[0].text.length).toBeLessThan(HARD_BACKSTOP);
  });

  it('list_users truncates a huge unfiltered list to the hard backstop', async () => {
    const users = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      full_name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      username: `user${i + 1}`,
      activated: true,
      bio: 'x'.repeat(2000),
    }));
    const res = await listUsers.run(
      {},
      fakeCtx({
        cache: { getUsers: () => undefined, setUsers: () => {} },
        client: { getUsers: () => Promise.resolve(users) },
      }),
    );
    expect(res.content[0].text.length).toBeLessThanOrEqual(HARD_BACKSTOP);
  });
});
