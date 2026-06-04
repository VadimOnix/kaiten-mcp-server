import { describe, it, expect } from 'vitest';
import { ALL_TOOLS } from '../../src/tools/index.js';

// P0 context-footprint guard (see memory: context-footprint-audit).
//
// Every tool description is advertised to the MCP client on connect, so each
// one must stay a short high-signal blurb — what the tool does + when to use it
// + which tools it chains with. Detailed param docs live in the Zod schema
// (.describe()); cross-tool rules live in the server `instructions`. This guard
// is the ceiling that prevents descriptions from regrowing into manuals.
//
// Ceiling = 700 chars (so the already-compact relations/members tools pass
// without churn); the craft target when trimming is ~300-500 (see the trimmed
// kaiten_get_card / kaiten_delete_card as the reference shape). Per-tool
// "keeps the routing signal" assertions live in the individual tool tests.
const MAX_DESCRIPTION_CHARS = 700;

describe('tool description budget', () => {
  it(`keeps every advertised description within ${MAX_DESCRIPTION_CHARS} chars`, () => {
    const offenders = ALL_TOOLS.map((t) => ({ name: t.name, len: t.description.length }))
      .filter((t) => t.len > MAX_DESCRIPTION_CHARS)
      .sort((a, b) => b.len - a.len);

    expect(
      offenders,
      `over-budget descriptions (ceiling ${MAX_DESCRIPTION_CHARS}):\n${JSON.stringify(offenders, null, 2)}`,
    ).toEqual([]);
  });
});
