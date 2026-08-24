import { config } from './config.js';
import {
  KaitenCard,
  KaitenUser,
  KaitenSpace,
  KaitenComment,
  KaitenTag,
} from './kaiten-client.js';

// ============================================
// RESPONSE TRANSFORMERS (pure functions)
//
// These reduce Kaiten API responses to compact, human-readable shapes.
// Kept side-effect free and dependency-light so they can be unit tested
// in isolation from the MCP server bootstrap in index.ts.
// ============================================

const API_URL = config.KAITEN_API_URL;
const DEFAULT_SPACE_ID = config.KAITEN_DEFAULT_SPACE_ID;

/**
 * Deep-clone `value`, recursively dropping the two avatar URL fields Kaiten
 * embeds on every nested user (`owner`, `members`, `updater`, blockers, …).
 * Both carry a full `data:image/png;base64,…` payload (~2 KB each) that is
 * useless to a model yet dominates raw-card responses — a `detailed` search of
 * 10 cards ballooned to ~109 KB and overflowed the tool-result limit. Applied
 * to the raw-card paths (create/update responses, get_card json, search
 * detailed); the `normal`/`minimal` shapes already project these away via
 * simplifyCard. Pure and non-mutating so it stays unit-testable.
 */
const AVATAR_KEYS = new Set(['avatar_initials_url', 'avatar_uploaded_url']);

export function stripAvatars<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripAvatars(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (AVATAR_KEYS.has(key)) continue;
      out[key] = stripAvatars(val);
    }
    return out as T;
  }
  return value;
}

/** Build the public web URL for a card from its space + id. */
export function buildCardUrl(card: KaitenCard): string {
  const baseUrl = API_URL!.replace('/api/latest', '');
  const spaceId = card.space_id || card.board?.space_id || DEFAULT_SPACE_ID || '';
  return `${baseUrl}/space/${spaceId}/card/${card.id}`;
}

export function simplifyUser(user: KaitenUser) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    username: user.username,
    activated: user.activated,
  };
}

export function simplifySpace(space: KaitenSpace) {
  return {
    id: space.id,
    title: space.title,
    archived: space.archived,
    boards:
      space.boards?.map((b) => ({
        id: b.id,
        title: b.title,
      })) || [],
  };
}

export function simplifyComment(comment: KaitenComment) {
  return {
    id: comment.id,
    text: comment.text,
    created: comment.created,
    updated: comment.updated,
    author_id: comment.author?.id,
    author_name: comment.author?.full_name,
  };
}

export interface SimplifiedCard {
  id: number;
  title: string;
  url: string;
  description: string | null;
  created?: string;
  updated?: string;
  state?: number;
  owner_id: number | null;
  owner_name: string | null;
  board_id?: number;
  board_title: string | null;
  column_id?: number;
  column_title: string | null;
  lane_id?: number;
  lane_title: string | null;
  type_id?: number;
  type_name: string | null;
  comments_total: number;
  last_comment_date: string | null;
  tags: string[];
  members: string[];
  asap: boolean;
  blocked: boolean;
  block_reason: string | null;
  blocked_at: string | null;
  blocker_name: string | null;
  archived: boolean;
  size: number | null;
  due_date: string | null;
}

export function simplifyCard(card: KaitenCard): SimplifiedCard {
  const cardUrl = buildCardUrl(card);

  const blockInfo =
    card.blocked && card.blockers && card.blockers.length > 0
      ? {
          blocked: true,
          block_reason: card.blockers[0].reason || null,
          blocked_at: card.blockers[0].created || null,
          blocker_name: card.blockers[0].blocker?.full_name || null,
        }
      : { blocked: false, block_reason: null, blocked_at: null, blocker_name: null };

  const lastCommentDate = card.comment_last_added_at || null;

  return {
    id: card.id,
    title: card.title,
    url: cardUrl,
    description: card.description || null,
    created: card.created,
    updated: card.updated,
    state: card.state,
    owner_id: card.owner?.id || null,
    owner_name: card.owner?.full_name || null,
    board_id: card.board_id,
    board_title: card.board?.title || null,
    column_id: card.column_id,
    column_title: card.column?.title || null,
    lane_id: card.lane_id,
    lane_title: card.lane?.title || null,
    type_id: card.type_id,
    type_name: card.type?.name || null,
    comments_total: card.comments_total || 0,
    last_comment_date: lastCommentDate,
    tags: card.tags?.map((t) => t.name) || [],
    members: card.members?.map((m) => m.full_name) || [],
    asap: card.asap || false,
    ...blockInfo,
    archived: !!card.archived,
    size: card.size || null,
    due_date: card.due_date || null,
  };
}

/** Compact version for search results - only essential fields. */
export function simplifyCardCompact(card: KaitenCard) {
  return {
    id: card.id,
    title: card.title,
    url: buildCardUrl(card),
    board_title: card.board?.title || null,
    owner_name: card.owner?.full_name || null,
    updated: card.updated,
    asap: card.asap || false,
    blocked: !!card.blocked,
  };
}

/** Company tag reduced to the pair a caller routes on: id + name. */
export function simplifyTag(tag: KaitenTag): { id?: number; name: string } {
  return { id: tag.id, name: tag.name };
}
