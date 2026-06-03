import { describe, it, expect } from 'vitest';
import {
  truncateResponse,
  applyCardVerbosity,
  applyCardVerbosityMinimal,
  applyUserVerbosity,
  applyBoardVerbosity,
} from '../src/utils';
import type { KaitenCard, KaitenUser, KaitenBoard } from '../src/kaiten-client';

describe('truncateResponse', () => {
  it('returns the text unchanged when within the limit', () => {
    const text = 'short';
    expect(truncateResponse(text, 100)).toBe('short');
  });

  it('returns text unchanged exactly at the limit', () => {
    const text = 'x'.repeat(50);
    expect(truncateResponse(text, 50)).toBe(text);
  });

  it('truncates and appends a warning when over the limit', () => {
    const text = 'y'.repeat(120);
    const result = truncateResponse(text, 50);
    expect(result.startsWith('y'.repeat(50))).toBe(true);
    expect(result).toContain('RESPONSE TRUNCATED');
    expect(result).toContain('Original length: 120');
  });
});

describe('applyCardVerbosity', () => {
  const cards: KaitenCard[] = [
    { id: 1, title: 'A', board_id: 10, owner: { id: 1, full_name: 'Owner A' } } as KaitenCard,
    { id: 2, title: 'B', board_id: 20 } as KaitenCard,
  ];
  const simplify = (c: KaitenCard) => ({ id: c.id, marker: 'normal' });

  it('minimal returns id/title/board_id/owner_name only', () => {
    const out = applyCardVerbosity(cards, 'minimal', simplify);
    expect(out).toEqual([
      { id: 1, title: 'A', board_id: 10, owner_name: 'Owner A' },
      { id: 2, title: 'B', board_id: 20, owner_name: null },
    ]);
  });

  it('normal delegates to the provided simplify function', () => {
    const out = applyCardVerbosity(cards, 'normal', simplify);
    expect(out).toEqual([
      { id: 1, marker: 'normal' },
      { id: 2, marker: 'normal' },
    ]);
  });

  it('detailed returns the raw cards untouched', () => {
    const out = applyCardVerbosity(cards, 'detailed', simplify);
    expect(out).toBe(cards);
  });

  it('defaults to normal when verbosity is omitted', () => {
    const out = applyCardVerbosity(cards, undefined as any, simplify);
    expect(out[0]).toEqual({ id: 1, marker: 'normal' });
  });

  it('applyCardVerbosityMinimal handles a missing owner', () => {
    expect(applyCardVerbosityMinimal([{ id: 9, title: 'X', board_id: 1 } as KaitenCard])).toEqual([
      { id: 9, title: 'X', board_id: 1, owner_name: null },
    ]);
  });
});

describe('applyUserVerbosity', () => {
  const users: KaitenUser[] = [
    { id: 1, full_name: 'User One', email: 'one@x.io', username: 'one', activated: true },
  ];

  it('minimal returns id + full_name only', () => {
    expect(applyUserVerbosity(users, 'minimal')).toEqual([{ id: 1, full_name: 'User One' }]);
  });

  it('normal returns the whitelisted profile fields', () => {
    expect(applyUserVerbosity(users, 'normal')).toEqual([
      { id: 1, full_name: 'User One', email: 'one@x.io', username: 'one', activated: true },
    ]);
  });

  it('detailed returns the raw users', () => {
    expect(applyUserVerbosity(users, 'detailed')).toBe(users);
  });
});

describe('applyBoardVerbosity', () => {
  const boards: KaitenBoard[] = [{ id: 1, title: 'Board', space_id: 5, archived: false }];

  it('minimal returns id + title only', () => {
    expect(applyBoardVerbosity(boards, 'minimal')).toEqual([{ id: 1, title: 'Board' }]);
  });

  it('normal includes space_id and archived', () => {
    expect(applyBoardVerbosity(boards, 'normal')).toEqual([
      { id: 1, title: 'Board', space_id: 5, archived: false },
    ]);
  });

  it('detailed returns the raw boards', () => {
    expect(applyBoardVerbosity(boards, 'detailed')).toBe(boards);
  });
});
