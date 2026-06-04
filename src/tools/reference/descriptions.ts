// Tool `description` template literals advertised to the MCP client.
// Trimmed for context economy (P0): each description is a short high-signal
// blurb (what + when + which tools it chains with); detailed param docs live in
// the Zod schema (.describe()) and cross-tool rules in the server instructions.
// Length is guarded by test/tools/description-budget.test.ts (≤700).

export const LIST_SPACES_DESC = `List the Kaiten spaces (top-level workspaces) your token can access: id, title, description, archived, and basic boards. Use to discover a space_id when KAITEN_DEFAULT_SPACE_ID is unset or you work across multiple spaces. Cached ~5 min (auto-expiring). Next step: kaiten_list_boards(space_id).`;

export const LIST_BOARDS_DESC = `List boards in a space: id, title, space_id, archived. Pass space_id, or omit to use KAITEN_DEFAULT_SPACE_ID. This is the first discovery step before creating/searching cards — always look up board_id here rather than hardcoding it. Optional verbosity minimal|normal|detailed. Cached ~5 min (auto-expiring). Then drill in via kaiten_list_columns / kaiten_list_lanes / kaiten_list_types.`;

export const LIST_COLUMNS_DESC = `List a board's columns (workflow stages, e.g. Backlog / In Progress / Done) left-to-right: id, title. Required: board_id (from kaiten_list_boards). Use it to get a valid column_id before kaiten_create_card or before moving a card with kaiten_update_card. Note: a column (board position) is distinct from state (1/2/3 workflow). Column IDs are board-specific — don't reuse them across boards. Not cached.`;

export const LIST_LANES_DESC = `List a board's lanes (horizontal swimlanes for secondary grouping by team/priority/etc.) top-to-bottom: id, title; returns [] if the board has none. Required: board_id (from kaiten_list_boards). lane_id is always optional when creating/moving cards — omit it to use the board's default lane. Lane IDs are board-specific. Columns (kaiten_list_columns) are the required placement axis; lanes are optional. Not cached.`;

export const LIST_TYPES_DESC = `List the card types configured on a board (e.g. Task, Bug, Feature): id, name. Required: board_id (from kaiten_list_boards). Use it to get a valid type_id before kaiten_create_card / kaiten_update_card, or to filter kaiten_search_cards by type_id. Types are board-specific and configurable — don't assume a standard set or reuse IDs across boards. type_id is optional when creating (the board default applies). Not cached.`;
