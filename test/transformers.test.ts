import { describe, it, expect } from 'vitest';
import {
  buildCardUrl,
  simplifyUser,
  simplifySpace,
  simplifyComment,
  simplifyCard,
  simplifyCardCompact,
  stripAvatars,
} from '../src/transformers';
import type { KaitenCard } from '../src/kaiten-client';

// These run against the test config injected by vitest.config.ts:
//   KAITEN_API_URL = https://test.kaiten.ru/api/latest  -> base https://test.kaiten.ru
//   KAITEN_DEFAULT_SPACE_ID = 42

describe('buildCardUrl', () => {
  it('uses the card.space_id when present', () => {
    expect(buildCardUrl({ id: 5, title: 't', space_id: 7 } as KaitenCard)).toBe(
      'https://test.kaiten.ru/space/7/card/5'
    );
  });

  it("falls back to the board's space_id", () => {
    const card = { id: 8, title: 't', board: { id: 1, title: 'B', space_id: 99 } } as KaitenCard;
    expect(buildCardUrl(card)).toBe('https://test.kaiten.ru/space/99/card/8');
  });

  it('falls back to the default space id when no space is known', () => {
    expect(buildCardUrl({ id: 3, title: 't' } as KaitenCard)).toBe(
      'https://test.kaiten.ru/space/42/card/3'
    );
  });
});

describe('simplifyUser', () => {
  it('keeps only the whitelisted fields', () => {
    const result = simplifyUser({
      id: 1,
      full_name: 'Ivan Ivanov',
      email: 'ivan@example.com',
      username: 'ivan',
      activated: true,
      // @ts-expect-error extra API noise that must be dropped
      avatar: 'data:image/png;base64,AAAA',
    });
    expect(result).toEqual({
      id: 1,
      full_name: 'Ivan Ivanov',
      email: 'ivan@example.com',
      username: 'ivan',
      activated: true,
    });
    expect(result).not.toHaveProperty('avatar');
  });
});

describe('simplifySpace', () => {
  it('reduces boards to id + title and defaults missing boards to []', () => {
    expect(
      simplifySpace({
        id: 10,
        title: 'Space',
        archived: false,
        boards: [{ id: 1, title: 'Board A', space_id: 10, archived: false }],
      })
    ).toEqual({
      id: 10,
      title: 'Space',
      archived: false,
      boards: [{ id: 1, title: 'Board A' }],
    });
  });

  it('returns an empty boards array when none are provided', () => {
    expect(simplifySpace({ id: 11, title: 'Empty' }).boards).toEqual([]);
  });
});

describe('simplifyComment', () => {
  it('flattens the author into id + name', () => {
    expect(
      simplifyComment({
        id: 1,
        card_id: 50,
        text: 'hello',
        created: '2026-01-01T00:00:00Z',
        updated: '2026-01-02T00:00:00Z',
        author: { id: 9, full_name: 'Author Name' },
      })
    ).toEqual({
      id: 1,
      text: 'hello',
      created: '2026-01-01T00:00:00Z',
      updated: '2026-01-02T00:00:00Z',
      author_id: 9,
      author_name: 'Author Name',
    });
  });

  it('tolerates a missing author', () => {
    const result = simplifyComment({ id: 2, card_id: 1, text: 'x', created: 'now' });
    expect(result.author_id).toBeUndefined();
    expect(result.author_name).toBeUndefined();
  });
});

describe('simplifyCard', () => {
  const fullCard: KaitenCard = {
    id: 100,
    title: 'Implement feature',
    description: 'Details here',
    state: 2,
    space_id: 5,
    board_id: 1,
    column_id: 2,
    lane_id: 3,
    type_id: 4,
    size: 8,
    asap: true,
    created: '2026-01-01',
    updated: '2026-01-05',
    comments_total: 4,
    comment_last_added_at: '2026-01-05T10:00:00Z',
    owner: { id: 9, full_name: 'Owner Name' },
    board: { id: 1, title: 'Board', space_id: 5 },
    column: { id: 2, title: 'In Progress' },
    lane: { id: 3, title: 'Lane 1' },
    type: { id: 4, name: 'Task' },
    tags: [{ name: 'urgent' }, { name: 'backend' }],
    members: [{ id: 1, full_name: 'Member One' }],
  };

  it('produces human-readable derived fields', () => {
    const s = simplifyCard(fullCard);
    expect(s.url).toBe('https://test.kaiten.ru/space/5/card/100');
    expect(s.owner_name).toBe('Owner Name');
    expect(s.board_title).toBe('Board');
    expect(s.column_title).toBe('In Progress');
    expect(s.lane_title).toBe('Lane 1');
    expect(s.type_name).toBe('Task');
    expect(s.tags).toEqual(['urgent', 'backend']);
    expect(s.members).toEqual(['Member One']);
    expect(s.asap).toBe(true);
    expect(s.last_comment_date).toBe('2026-01-05T10:00:00Z');
  });

  it('reports an unblocked card with null block fields', () => {
    const s = simplifyCard(fullCard);
    expect(s.blocked).toBe(false);
    expect(s.block_reason).toBeNull();
    expect(s.blocker_name).toBeNull();
  });

  it('extracts blocking details from the first blocker', () => {
    const blocked: KaitenCard = {
      ...fullCard,
      blocked: true,
      blockers: [
        { reason: 'waiting on API', created: '2026-01-03', blocker: { id: 1, full_name: 'Blocker Bob' } as any },
      ],
    };
    const s = simplifyCard(blocked);
    expect(s.blocked).toBe(true);
    expect(s.block_reason).toBe('waiting on API');
    expect(s.blocked_at).toBe('2026-01-03');
    expect(s.blocker_name).toBe('Blocker Bob');
  });

  it('applies safe defaults for a sparse card', () => {
    const s = simplifyCard({ id: 1, title: 'Bare' } as KaitenCard);
    expect(s.description).toBeNull();
    expect(s.owner_id).toBeNull();
    expect(s.owner_name).toBeNull();
    expect(s.board_title).toBeNull();
    expect(s.comments_total).toBe(0);
    expect(s.tags).toEqual([]);
    expect(s.members).toEqual([]);
    expect(s.asap).toBe(false);
    expect(s.size).toBeNull();
  });
});

describe('stripAvatars', () => {
  it('removes avatar_initials_url and avatar_uploaded_url from a nested user', () => {
    const card = {
      id: 1,
      title: 'T',
      owner: {
        id: 9,
        full_name: 'Owner',
        avatar_initials_url: 'data:image/png;base64,AAAA',
        avatar_uploaded_url: 'data:image/png;base64,BBBB',
      },
    };
    const out = stripAvatars(card) as any;
    expect(out.owner).toEqual({ id: 9, full_name: 'Owner' });
    expect(out.id).toBe(1);
    expect(out.title).toBe('T');
  });

  it('strips avatar fields inside arrays of users', () => {
    const card = {
      id: 2,
      members: [
        { id: 1, full_name: 'A', avatar_initials_url: 'data:...' },
        { id: 2, full_name: 'B', avatar_uploaded_url: 'data:...' },
      ],
    };
    const out = stripAvatars(card) as any;
    expect(out.members).toEqual([
      { id: 1, full_name: 'A' },
      { id: 2, full_name: 'B' },
    ]);
  });

  it('does not mutate the input object', () => {
    const card = { owner: { id: 1, avatar_initials_url: 'data:...' } };
    stripAvatars(card);
    expect(card.owner.avatar_initials_url).toBe('data:...');
  });

  it('returns primitives, null and undefined unchanged', () => {
    expect(stripAvatars(null)).toBeNull();
    expect(stripAvatars(undefined)).toBeUndefined();
    expect(stripAvatars(5 as any)).toBe(5);
    expect(stripAvatars('x' as any)).toBe('x');
  });

  it('preserves an avatar-free object structurally', () => {
    const card = { id: 5, title: 'Demo', board_id: 3, owner: { id: 9, full_name: 'O' } };
    expect(stripAvatars(card)).toEqual(card);
  });
});

describe('simplifyCardCompact', () => {
  it('keeps only the fields needed for list rendering', () => {
    const card = {
      id: 7,
      title: 'Compact',
      space_id: 5,
      updated: '2026-02-01',
      asap: false,
      blocked: true,
      board: { id: 1, title: 'Board', space_id: 5 },
      owner: { id: 2, full_name: 'Owner' },
      description: 'should be dropped',
    } as KaitenCard;
    const c = simplifyCardCompact(card);
    expect(c).toEqual({
      id: 7,
      title: 'Compact',
      url: 'https://test.kaiten.ru/space/5/card/7',
      board_title: 'Board',
      owner_name: 'Owner',
      updated: '2026-02-01',
      asap: false,
      blocked: true,
    });
    expect(c).not.toHaveProperty('description');
  });
});
