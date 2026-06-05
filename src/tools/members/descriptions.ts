// Tool `description` template literals advertised to the MCP client.
// Trimmed for context economy (P0): each description is a short high-signal
// blurb (what + when + which tools it chains with); detailed param docs live in
// the Zod schema (.describe()) and cross-tool rules in the server instructions.
// Length is guarded by test/tools/description-budget.test.ts and the routing
// signals by test/eval/tool-quality.test.ts.

export const GET_CARD_MEMBERS_DESC = `Get the members of a card as a JSON array (id, full_name, …, type); [] if none. type 1 = participant, type 2 = responsible. Use to review who is assigned or to find user IDs before changing membership. Add participants with kaiten_add_card_members, remove members with kaiten_remove_card_members, and mark someone responsible with kaiten_set_card_responsible.`;

export const ADD_CARD_MEMBERS_DESC = `Add one or more participants to a card. Required: card_id and user_ids (array of user IDs, at least one). New members join as participants (type 1). The server makes one API call per user and continues on individual failures, returning { card_id, succeeded, failed, summary }. Idempotent — re-adding an existing member creates no duplicates. Find user IDs via kaiten_list_users; see current members via kaiten_get_card_members.`;

export const REMOVE_CARD_MEMBERS_DESC = `Remove one or more members from a card. Required: card_id and user_ids (array of user IDs, at least one). Issues one API call per user and continues on individual failures, returning { card_id, succeeded, failed, summary }. This is also the only way to unassign a responsible user — it removes them from the card entirely. Find current member IDs via kaiten_get_card_members; add participants with kaiten_add_card_members.`;

export const SET_CARD_RESPONSIBLE_DESC = `Mark a user as responsible (type 2) for a card. Required: card_id and user_id. If the user is not already a member they are added first, then promoted. Returns { card_id, user_id, type }. Additive — it does NOT demote existing responsible members (Kaiten allows several), and the API cannot demote a responsible back to a plain participant; to unassign, use kaiten_remove_card_members (removes them from the card entirely). Find user IDs via kaiten_list_users; see current roles via kaiten_get_card_members.`;
