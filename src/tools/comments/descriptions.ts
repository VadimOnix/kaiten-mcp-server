// Tool `description` template literals advertised to the MCP client.
// Trimmed for context economy (P0): each description is a short high-signal
// blurb (what + when + which tools it chains with); detailed param docs live in
// the Zod schema (.describe()) and cross-tool rules in the server instructions.
// Length is guarded by test/tools/description-budget.test.ts (≤700).

export const GET_CARD_COMMENTS_DESC = `Get all comments on a card as a chronological JSON array (id, text, created, updated, author_id, author_name); [] if none. Comments support markdown. Check kaiten_get_card's comments_total first to avoid fetching a long thread you don't need (not cached, no pagination — returns everything). Find the card via kaiten_search_cards. The id values here feed kaiten_update_comment / kaiten_delete_comment.`;

export const CREATE_COMMENT_DESC = `Add a comment to a card. Required: card_id and text (markdown supported, min 1 char). Optional idempotency_key for safe retries. Comments are visible to all card participants, appear in card history, and notify followers — never post secrets. For status changes update card fields (state/owner) instead of commenting. Returns the new comment (id, text, created, author). Find the card via kaiten_search_cards; read the existing thread with kaiten_get_card_comments.`;

export const UPDATE_COMMENT_DESC = `Edit an existing comment; the new text fully REPLACES the old (not append/prepend), so to add to it, fetch the current text first and resend combined. Required: card_id, comment_id, text (markdown). Optional idempotency_key. You can edit ONLY your own comments — editing another user's returns 403 (find comment_id and author_id via kaiten_get_card_comments; your own id via kaiten_get_current_user). Preserves id and created, bumps the updated timestamp. Returns the updated comment.`;

export const DELETE_COMMENT_DESC = 'Delete comment';
