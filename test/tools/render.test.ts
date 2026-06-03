import { describe, it, expect, vi } from 'vitest';
import { config } from '../../src/config.js';
import type { ServerContext } from '../../src/tools/kit.js';
import { renderCardMarkdown, renderSearchSummary } from '../../src/tools/render.js';
import { buildSearchParams } from '../../src/tools/helpers.js';
import { simplifyCardCompact } from '../../src/transformers.js';
import { applyCardVerbosity } from '../../src/utils.js';

// A ctx whose client throws if touched — the minimal-card happy path must NOT
// fetch children (the snapshot card has no children_count), so the client must
// stay untouched. config is the REAL EnvConfig (vitest injects
// KAITEN_API_URL=https://test.kaiten.ru/api/latest, KAITEN_DEFAULT_SPACE_ID=42).
function makeCtx(overrides: Partial<ServerContext> = {}): ServerContext {
  return {
    client: {
      getCard: vi.fn(),
      getCardChildren: vi.fn(),
    } as any,
    cache: {} as any,
    config,
    log: {} as any,
    ...overrides,
  } as ServerContext;
}

describe('renderCardMarkdown', () => {
  it('reproduces the kaiten_get_card snapshot for a minimal card', async () => {
    const ctx = makeCtx();
    const out = await renderCardMarkdown({ id: 5, title: 'Demo Card' }, ctx);
    // Byte-for-byte equal to the Task 1 characterization snapshot in
    // test/server.test.ts (kaiten_get_card, card_id 5).
    expect(out).toBe(
      '# Demo Card\n\n' +
        '🔗 https://test.kaiten.ru/space/42/card/5\n' +
        '📋 Board: N/A\n' +
        '👤 Owner: Unassigned\n' +
        '💬 Comments: 0\n' +
        '🕐 Created: N/A | Updated: N/A\n',
    );
  });

  it('does not fetch children for a card without children_count', async () => {
    const ctx = makeCtx();
    await renderCardMarkdown({ id: 5, title: 'Demo Card' }, ctx);
    expect(ctx.client.getCardChildren).not.toHaveBeenCalled();
  });

  it('renders the description section when present', async () => {
    const ctx = makeCtx();
    const out = await renderCardMarkdown(
      { id: 5, title: 'Demo Card', description: 'Hello body' },
      ctx,
    );
    expect(out).toContain('\n## Description\nHello body\n');
  });

  it('fetches and lists children when children_count > 0', async () => {
    const getCardChildren = vi
      .fn()
      .mockResolvedValue([{ id: 42, title: 'Subtask', state: 3 }]);
    const ctx = makeCtx({
      client: { getCardChildren, getCard: vi.fn() } as any,
    });
    const out = await renderCardMarkdown(
      { id: 5, title: 'Demo Card', children_count: 1, children_done: 1 },
      ctx,
    );
    expect(getCardChildren).toHaveBeenCalledWith(5, undefined);
    expect(out).toContain('## 🔗 Related Cards');
    expect(out).toContain('📋 Subtasks: 1/1 done (100%)');
    expect(out).toContain('1. ✅ [#42] Subtask');
    expect(out).toContain('https://test.kaiten.ru/space/42/card/42');
  });

  it('forwards ctx.signal to the children fetch', async () => {
    const ac = new AbortController();
    const getCardChildren = vi.fn().mockResolvedValue([]);
    const ctx = makeCtx({
      client: { getCardChildren, getCard: vi.fn() } as any,
      signal: ac.signal,
    });
    await renderCardMarkdown(
      { id: 5, title: 'Demo Card', children_count: 1 },
      ctx,
    );
    expect(getCardChildren).toHaveBeenCalledWith(5, ac.signal);
  });
});

describe('renderSearchSummary', () => {
  it('reproduces the kaiten_search_cards snapshot body (normal verbosity)', () => {
    const cards = [{ id: 7, title: 'Found Card', board: { title: 'Board A' } }] as any[];
    const args = { query: 'Found', board_id: 3 } as any;
    const params = buildSearchParams(args, config.KAITEN_DEFAULT_SPACE_ID);
    const processed = applyCardVerbosity(cards as any, 'normal', simplifyCardCompact);
    const out = renderSearchSummary(cards, processed, args, params);
    expect(out).toBe(
      'Found 1 card(s) matching "Found" in space 42 on board 3\n' +
        'Verbosity: normal\n\n' +
        '1. Found Card\n' +
        '   📋 Board: Board A\n' +
        '   👤 Owner: Unassigned\n' +
        '   🔗 https://test.kaiten.ru/space/42/card/7\n' +
        '   🕐 Updated: N/A\n\n' +
        '\nℹ️ Use kaiten_get_card with card ID for full details.',
    );
  });

  it('renders the minimal verbosity bullet format', () => {
    const cards = [{ id: 7, title: 'Found Card' }] as any[];
    const args = { verbosity: 'minimal' } as any;
    const processed = applyCardVerbosity(cards as any, 'minimal', simplifyCardCompact);
    const out = renderSearchSummary(cards, processed, args, {});
    expect(out).toBe(
      'Found 1 card(s)\n' +
        'Verbosity: minimal\n\n' +
        '1. [7] Found Card\n' +
        '\nℹ️ Use kaiten_get_card with card ID for full details.',
    );
  });
});

