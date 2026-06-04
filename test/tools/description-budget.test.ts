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
// Floor: a description must carry real signal (what + when + how to chain).
// Guards against the opposite failure mode — a stub like "Delete comment" that
// tells an agent nothing about required args, irreversibility, or related tools.
const MIN_DESCRIPTION_CHARS = 60;

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

  it(`keeps every advertised description above ${MIN_DESCRIPTION_CHARS} chars (no low-signal stubs)`, () => {
    const stubs = ALL_TOOLS.map((t) => ({ name: t.name, len: t.description.length }))
      .filter((t) => t.len < MIN_DESCRIPTION_CHARS)
      .sort((a, b) => a.len - b.len);

    expect(
      stubs,
      `under-floor descriptions (floor ${MIN_DESCRIPTION_CHARS}):\n${JSON.stringify(stubs, null, 2)}`,
    ).toEqual([]);
  });
});
