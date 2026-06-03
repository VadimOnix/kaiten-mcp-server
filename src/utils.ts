import { KaitenCard, KaitenUser, KaitenBoard } from './kaiten-client.js';

// ============================================
// CHARACTER TRUNCATION
// ============================================

const MAX_RESPONSE_LENGTH = 100000; // ~25k tokens (4 chars per token average)

export function truncateResponse(
  text: string,
  maxLength: number = MAX_RESPONSE_LENGTH
): string {
  if (text.length <= maxLength) {
    return text;
  }

  const truncated = text.slice(0, maxLength);
  const originalLength = text.length;
  const truncatedChars = originalLength - maxLength;

  return (
    truncated +
    '\n\n' +
    '─────────────────────────────────────────\n' +
    `⚠️  RESPONSE TRUNCATED\n` +
    `Original length: ${originalLength.toLocaleString()} characters\n` +
    `Truncated: ${truncatedChars.toLocaleString()} characters\n` +
    `Showing: ${maxLength.toLocaleString()} characters (~${Math.round(maxLength / 4).toLocaleString()} tokens)\n\n` +
    `💡 To reduce response size:\n` +
    `   • Use more specific filters (board_id, space_id, column_id)\n` +
    `   • Reduce the limit parameter (current results may exceed limit)\n` +
    `   • Use verbosity: 'minimal' for compact output\n` +
    `   • Search in smaller time ranges (created_after, updated_after)\n` +
    '─────────────────────────────────────────'
  );
}

// ============================================
// VERBOSITY CONTROL
// ============================================

type VerbosityLevel = 'minimal' | 'normal' | 'detailed';

// Minimal verbosity for cards - just ID and title
export function applyCardVerbosityMinimal(cards: KaitenCard[]): any[] {
  return cards.map((card) => ({
    id: card.id,
    title: card.title,
    board_id: card.board_id,
    owner_name: card.owner?.full_name || null,
  }));
}

// Normal verbosity - simplified card (existing logic)
export function applyCardVerbosityNormal(
  cards: KaitenCard[],
  simplifyFn: (card: KaitenCard) => any
): any[] {
  return cards.map(simplifyFn);
}

// Detailed verbosity - full API response
export function applyCardVerbosityDetailed(cards: KaitenCard[]): any[] {
  return cards; // Return as-is from API
}

// Main verbosity application function
export function applyCardVerbosity(
  cards: KaitenCard[],
  verbosity: VerbosityLevel = 'normal',
  simplifyFn: (card: KaitenCard) => any
): any[] {
  switch (verbosity) {
    case 'minimal':
      return applyCardVerbosityMinimal(cards);
    case 'detailed':
      return applyCardVerbosityDetailed(cards);
    case 'normal':
    default:
      return applyCardVerbosityNormal(cards, simplifyFn);
  }
}

// User verbosity
export function applyUserVerbosity(
  users: KaitenUser[],
  verbosity: VerbosityLevel = 'normal'
): any[] {
  switch (verbosity) {
    case 'minimal':
      return users.map((u) => ({ id: u.id, full_name: u.full_name }));
    case 'detailed':
      return users;
    case 'normal':
    default:
      return users.map((u) => ({
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        username: u.username,
        activated: u.activated,
      }));
  }
}

// Board verbosity
export function applyBoardVerbosity(
  boards: KaitenBoard[],
  verbosity: VerbosityLevel = 'normal'
): any[] {
  switch (verbosity) {
    case 'minimal':
      return boards.map((b) => ({ id: b.id, title: b.title }));
    case 'detailed':
      return boards;
    case 'normal':
    default:
      return boards.map((b) => ({
        id: b.id,
        title: b.title,
        space_id: b.space_id,
        archived: b.archived,
      }));
  }
}

