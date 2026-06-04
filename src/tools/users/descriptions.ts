// Tool `description` template literals advertised to the MCP client.
// Trimmed for context economy (P0): each description is a short high-signal
// blurb (what + when + which tools it chains with); detailed param docs live in
// the Zod schema (.describe()) and cross-tool rules (incl. the Cyrillic→Latin
// name transliteration table) in the server instructions. Length is guarded by
// test/tools/description-budget.test.ts (≤700).

export const GET_CURRENT_USER_DESC = `Get the user account tied to your API token: id, full_name, email, username, activated. Use it to verify the token works, confirm which account is authenticated, or grab your own user_id to filter "my cards" via kaiten_search_cards(owner_id). For other people, use kaiten_list_users instead.`;

export const LIST_USERS_DESC = `Find users by name or email (server-side, case-insensitive partial match): id, full_name, email, username, activated. CRITICAL: Kaiten stores names in LATIN only — search "Saranyuk", never Cyrillic ("Владимир" returns empty; transliterate first — table in the server instructions). ALWAYS pass query: calling it bare returns up to 100 users and wastes context; if nothing matches, try a shorter prefix or the email. Optional limit (≤100), offset, verbosity. Use the resulting id as owner_id in kaiten_create_card / kaiten_update_card.`;
