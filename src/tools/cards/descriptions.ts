// Tool `description` template literals advertised to the MCP client.
//
// Originally auto-extracted byte-identical from the hand-written src/server.ts
// tools[] during the Task 6 cards migration. They are now being trimmed for
// context economy (P0): a description is loaded into every client's context on
// connect, so it should be a short high-signal blurb — what the tool does + when
// to use it + which tools it chains with — NOT a manual that re-documents the
// Zod schema params (already advertised via each field's .describe()) or repeats
// the server-level instructions. GET_CARD_DESC is the trimmed pilot; the rest
// follow the same shape. The conciseness contract is guarded by unit tests.

export const GET_CARD_DESC = `Retrieve full details of one Kaiten card by ID: description, owner, board/column/lane, type, size, due date, ASAP/blocked status, tags, comment counts, and parent/child subtasks with progress. Use after kaiten_search_cards (or a card URL) to inspect a single card, and before kaiten_update_card to see its current state. To find or list multiple cards, use kaiten_search_cards instead.`;

export const CREATE_CARD_DESC = `Create a card on a board. Required: title (1-500 chars) and board_id. Optional: column_id, lane_id, type_id, owner_id, size, asap, due_date (ISO 8601), description (markdown), idempotency_key (safe retries). Discover valid IDs first via kaiten_list_boards / kaiten_list_columns / kaiten_list_lanes / kaiten_list_types, and the owner via kaiten_list_users; an omitted column/lane falls back to the board default. Returns the created card (id, fields, URL).`;

export const UPDATE_CARD_DESC = `Update fields on an existing card; only the fields you pass change, the rest stay as-is. Required: card_id plus at least one field. Fields: title, description ("" clears), state (1=queued, 2=in progress, 3=done), column_id, lane_id, type_id, size, asap, owner_id (null unassigns), due_date (ISO 8601, "" clears), idempotency_key. Verify board-specific IDs via kaiten_list_columns / kaiten_list_lanes / kaiten_list_types and owners via kaiten_list_users; check the current state first with kaiten_get_card. Returns the updated card.`;

export const DELETE_CARD_DESC = `⚠️ Permanently delete a Kaiten card by ID. IRREVERSIBLE — there is no undo or trash; the card and all its comments, history, attachments and parent/child links are lost, and other team members lose access immediately. Prefer archiving instead (kaiten_update_card to state=3 / move off the active board) whenever the data might be needed later. Before deleting, verify the card with kaiten_get_card and confirm with the user. Use delete only for spam, duplicates, or test cards with no real data.`;

export const SEARCH_CARDS_DESC = `Primary discovery tool: find cards by text and filters, newest first, in a compact context-friendly format. Searches the default space (limit 10) unless you pass space_id (0 = ALL spaces, slow) or board_id (recommended, to keep results small and fast). query is a partial match on title/description/comments — for Russian text search by WORD ROOT, not the inflected form (see server instructions). Filters: column/lane/state/type, owner/member IDs, ISO-8601 date ranges, asap/overdue/archived flags, condition (1=active default, 2=archived). limit ≤20, skip paginates, verbosity minimal|normal|detailed. Returns compact rows — use kaiten_get_card for full detail.`;

