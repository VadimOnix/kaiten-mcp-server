// AUTO-EXTRACTED VERBATIM from src/server.ts tools[] entries during the Task 6
// cards migration. These are the exact `description` template literals the
// hand-written server advertised; kept byte-identical so the advertised tool
// contract is unchanged. Do not reflow.

export const GET_CARD_DESC = `Retrieve complete information about a Kaiten card by its ID, including subtasks, blocking status, and relationships.

PURPOSE: Get comprehensive card details after discovering the card via kaiten_search_cards or from a URL. Use this when you need full information including description, owner, board location, blocking reasons, subtasks with progress, parent/child relationships, and comment counts.

PARAMETERS:
- card_id (required): Numeric card ID. Positive integer.
  Examples: 12345, 67890
  How to find: Use kaiten_search_cards, or extract from URL like "https://domain.kaiten.ru/space/123/card/456" where card_id=456
- format (optional): Response format - 'json' or 'markdown' (default)
  • Use 'json' when: Need structured data for programmatic processing, integrations, parsing
  • Use 'markdown' when: Human-readable display with formatting, showing to user - DEFAULT

RETURNS:
- With format='markdown' (default): Human-readable markdown format with:
- With format='json': Full card object as JSON with all fields

Markdown format includes:
- Title, clickable URL, board/column/lane location
- Owner name, members list
- Card type, size estimate, due date
- ASAP flag (⚡) if marked urgent
- BLOCKED status (🚫) with blocking reason, blocker name, and date if applicable
- Tags list
- Comments count and last comment timestamp
- Created/updated timestamps
- Parent/child card relationships section if present:
  - Parent cards count with info message
  - Detailed subtasks list with progress percentage
  - Each subtask shows: state icon (✅ done, 🔄 in progress, ⏳ queued), card ID, title, blocking status, owner, URL
  - Blocking reasons displayed for blocked subtasks
- Full description at the end

USAGE EXAMPLES:
✅ DO: After search to get full details: kaiten_search_cards({query: "payment"}) → kaiten_get_card({card_id: 12345})
✅ DO: Before updating card to see current state: kaiten_get_card({card_id: 12345}) → kaiten_update_card(...)
✅ DO: Extract card_id from Kaiten URLs: "space/123/card/456" → card_id=456
✅ DO: Check subtask progress before marking parent as done
✅ DO: View blocking reasons before unblocking cards
❌ DON'T: Use for bulk operations - use kaiten_search_cards instead for finding multiple cards
❌ DON'T: Repeatedly fetch same card within 5-10 minutes - data doesn't change that frequently
❌ DON'T: Use when you only need card list - use kaiten_search_cards (more efficient)

ERRORS:
- NOT_FOUND (404): Card doesn't exist or was deleted. Verify card_id is correct. Check if card was archived (use kaiten_search_cards with condition=2).
- AUTH_ERROR (403): No permission to view this card. Your API token doesn't have access to this space. Check KAITEN_API_TOKEN has correct permissions.
- TIMEOUT: Rare, occurs with cards having 100+ subtasks. Contact support if persists. Workaround: Use kaiten_search_cards to find child cards separately.

SUBTASKS FEATURE:
- Automatically loads and displays child cards with detailed progress
- Shows completion percentage (e.g., "15/20 done (75%)")
- Displays blocking information for each subtask
- Each subtask includes direct URL for quick access
- State icons: ✅ = done (state 3), 🔄 = in progress (state 2), ⏳ = queued (state 1)

RELATED TOOLS:
- kaiten_search_cards: Find cards before getting details (primary discovery tool)
- kaiten_get_card_comments: Get full comment thread separately if needed
- kaiten_update_card: Modify card after reviewing current state`;

export const CREATE_CARD_DESC = `Create a new card on a Kaiten board with specified properties. Supports idempotency for safe retries.

PURPOSE: Create new task cards with title, description, owner, due date, and board placement. Use after discovering board structure via kaiten_list_boards, kaiten_list_columns, kaiten_list_lanes, and kaiten_list_types to get valid IDs.

REQUIRED PARAMETERS:
- title (required): Card title, 1-500 characters.
  Examples: "Fix payment gateway bug", "Design new homepage layout"
- board_id (required): Board where card will be created. Positive integer.
  How to find: Use kaiten_list_boards to get board_id from your space

OPTIONAL PARAMETERS:
- column_id (optional): Column (stage) ID. Get from kaiten_list_columns(board_id). If omitted, card goes to first/default column.
- lane_id (optional): Lane (swimlane) ID. Get from kaiten_list_lanes(board_id). If omitted, uses default lane.
- description (optional): Markdown-formatted card description. Can include formatting, lists, links.
- type_id (optional): Card type ID. Get from kaiten_list_types(board_id). Examples: "Task", "Bug", "Feature".
- size (optional): Story points or time estimate. Non-negative number. Examples: 3, 5, 8 (Fibonacci), or hours.
- asap (optional): Mark as urgent/ASAP. Boolean true/false.
- owner_id (optional): Assign to user. Get user_id from kaiten_list_users(query="name").
- due_date (optional): Due date in ISO 8601 format. Example: "2025-11-01T23:59:59Z"
- idempotency_key (optional): Unique key for safe retries. Auto-generated if omitted. Format: UUID or timestamp string.

RETURNS: Full card object as JSON with all fields including:
- id: Newly created card ID
- title, description, board_id, column_id, lane_id
- owner, type, size, asap, due_date
- created, updated timestamps
- URL to access card in Kaiten

USAGE EXAMPLES:
✅ DO: Get board structure first:
  1. kaiten_list_boards() → find board_id
  2. kaiten_list_columns(board_id) → find column_id
  3. kaiten_list_users(query="John") → find owner_id
  4. kaiten_create_card({title: "...", board_id, column_id, owner_id})

✅ DO: Minimal creation: kaiten_create_card({title: "Quick task", board_id: 12345})
✅ DO: Full-featured card:
  {
    title: "Implement user auth",
    board_id: 12345,
    column_id: 67890,
    description: "# Requirements\n- OAuth2\n- JWT tokens",
    type_id: 111,
    size: 8,
    owner_id: 222,
    due_date: "2025-11-15T17:00:00Z",
    asap: true
  }

✅ DO: Use idempotency_key for retry safety if making same request multiple times
❌ DON'T: Create card without checking board exists first - will fail with 404
❌ DON'T: Use invalid column_id/lane_id from different board - causes validation error
❌ DON'T: Assign to non-existent user - verify user_id with kaiten_list_users first
❌ DON'T: Use relative dates like "tomorrow" - must be ISO 8601 format

ERRORS:
- VALIDATION_ERROR (422): Invalid parameters. Common causes:
  - column_id/lane_id/type_id don't exist on this board
  - owner_id doesn't exist or user is deactivated
  - title exceeds 500 characters
  - due_date format invalid (must be ISO 8601)
  Solution: Verify all IDs with kaiten_list_* tools first

- NOT_FOUND (404): board_id doesn't exist or is archived
  Solution: Use kaiten_list_boards to verify board_id

- AUTH_ERROR (403): No permission to create cards in this board
  Solution: Check API token has write access to the space

IDEMPOTENCY:
- Server supports idempotency keys to prevent duplicate cards
- If you retry with same idempotency_key, returns existing card instead of creating duplicate
- Automatically generated if omitted (recommended for most cases)
- Useful when network is unreliable or you're retrying after errors

BOARD STRUCTURE DISCOVERY WORKFLOW:
1. kaiten_list_spaces() - find your space
2. kaiten_list_boards(space_id) - find board_id
3. kaiten_list_columns(board_id) - get column IDs (stages)
4. kaiten_list_lanes(board_id) - get lane IDs (swimlanes)
5. kaiten_list_types(board_id) - get type IDs (Task/Bug/Feature)
6. kaiten_list_users(query="name") - find assignee
7. kaiten_create_card({...all IDs...})

RELATED TOOLS:
- kaiten_list_boards: Find board_id for your space
- kaiten_list_columns: Get valid column_id values
- kaiten_list_lanes: Get valid lane_id values
- kaiten_list_types: Get valid type_id values
- kaiten_list_users: Find owner_id by name
- kaiten_update_card: Modify card after creation if needed`;

export const UPDATE_CARD_DESC = `Update existing card fields. Only modifies specified fields, leaving others unchanged. Supports idempotency.

PURPOSE: Modify card properties including title, description, state, board position (column/lane), assignment, dates, and flags. Use kaiten_get_card first to see current state before updating.

REQUIRED PARAMETERS:
- card_id (required): Card ID to update. Positive integer.
  How to find: Use kaiten_search_cards or kaiten_get_card

OPTIONAL PARAMETERS (at least one required):
- title (optional): New card title, 1-500 characters
- description (optional): New markdown description. Pass empty string "" to clear.
- state (optional): Card state. 1=queued, 2=in progress, 3=done
- column_id (optional): Move to column. Get from kaiten_list_columns(board_id).
- lane_id (optional): Move to lane. Get from kaiten_list_lanes(board_id).
- type_id (optional): Change card type. Get from kaiten_list_types(board_id).
- size (optional): Update estimate/story points. Non-negative number.
- asap (optional): Mark/unmark as urgent. Boolean true/false.
- owner_id (optional): Reassign card. Get from kaiten_list_users(query="name"). Pass null to unassign.
- due_date (optional): Set/update due date. ISO 8601 format: "2025-11-01T23:59:59Z". Pass empty string "" to clear.
- idempotency_key (optional): Unique key for safe retries. Auto-generated if omitted.

RETURNS: Updated full card object as JSON with all current field values

USAGE EXAMPLES:
✅ DO: Check current state first:
  1. kaiten_get_card({card_id: 12345}) → review current values
  2. kaiten_update_card({card_id: 12345, state: 3}) → mark as done

✅ DO: Update single field: {card_id: 12345, title: "New title"}
✅ DO: Update multiple fields:
  {
    card_id: 12345,
    state: 2,
    owner_id: 67890,
    due_date: "2025-11-15T23:59:59Z",
    asap: true
  }

✅ DO: Move card to different column:
  1. kaiten_list_columns(board_id) → find new column_id
  2. kaiten_update_card({card_id: 12345, column_id: 99999})

✅ DO: Reassign card:
  1. kaiten_list_users({query: "Maria"}) → get user_id
  2. kaiten_update_card({card_id: 12345, owner_id: <user_id>})

✅ DO: Clear due date: {card_id: 12345, due_date: ""}
✅ DO: Unassign card: {card_id: 12345, owner_id: null}

❌ DON'T: Update without checking current state - may overwrite important changes
❌ DON'T: Move card to column from different board - validation error
❌ DON'T: Set invalid state (not 1, 2, or 3) - validation error
❌ DON'T: Use relative dates - must be ISO 8601 format
❌ DON'T: Forget to verify column_id/lane_id/type_id with kaiten_list_* tools first

PARTIAL UPDATES:
- Only specified fields are modified
- Omitted fields remain unchanged
- Example: {card_id: 12345, title: "New"} only changes title, everything else stays same
- To clear optional fields: use empty string "" (due_date, description) or null (owner_id)

ERRORS:
- NOT_FOUND (404): Card doesn't exist or is deleted
  Solution: Verify card_id with kaiten_search_cards

- VALIDATION_ERROR (422): Invalid parameter values. Common causes:
  - column_id/lane_id/type_id don't belong to card's board
  - owner_id doesn't exist
  - state not 1, 2, or 3
  - title too long (>500 chars)
  - due_date format invalid
  Solution: Verify IDs with kaiten_list_* tools, check format

- AUTH_ERROR (403): No write permission
  Solution: Check API token has edit access to this space

- CONFLICT (409): Card was modified by another user (rare with idempotency)
  Solution: Fetch fresh state with kaiten_get_card, then retry update

IDEMPOTENCY:
- Prevents duplicate updates on network retry
- Same idempotency_key returns same result without re-applying changes
- Auto-generated if omitted (recommended)

STATE MANAGEMENT:
State values represent workflow stages:
- 1 = Queued (backlog, not started)
- 2 = In Progress (active work)
- 3 = Done (completed)

Moving cards through workflow:
1. Create: state defaults to 1 (queued)
2. Start work: update state to 2
3. Complete: update state to 3
Optional: Move between columns to reflect board stages

COMMON WORKFLOWS:

Assign and start work:
  kaiten_update_card({card_id: 12345, owner_id: <user_id>, state: 2})

Mark urgent and set deadline:
  kaiten_update_card({card_id: 12345, asap: true, due_date: "2025-11-01T17:00:00Z"})

Complete card:
  kaiten_update_card({card_id: 12345, state: 3})

Move to different stage:
  kaiten_list_columns(board_id) → find "Code Review" column_id
  kaiten_update_card({card_id: 12345, column_id: <column_id>})

RELATED TOOLS:
- kaiten_get_card: Check current state before updating
- kaiten_list_columns: Find column_id for moves
- kaiten_list_lanes: Find lane_id
- kaiten_list_types: Find type_id
- kaiten_list_users: Find owner_id for reassignment
- kaiten_create_card: Create new cards instead of updating`;

export const DELETE_CARD_DESC = `⚠️ DESTRUCTIVE: Permanently delete a card. Cannot be undone. Use with extreme caution.

PURPOSE: Permanently remove a card from Kaiten. This is an irreversible operation - once deleted, the card and all its data (comments, history, attachments, relationships) are gone forever. Consider archiving (condition=2) as safer alternative.

PARAMETERS:
- card_id (required): Card ID to delete. Positive integer.
  How to find: Use kaiten_search_cards or kaiten_get_card
  ⚠️ VERIFY CAREFULLY: Deleting wrong card cannot be undone!

RETURNS: Empty response on success (HTTP 204 No Content)

⚠️ CRITICAL WARNINGS:
- IRREVERSIBLE: Deleted cards CANNOT be recovered
- ALL DATA LOST: Comments, attachments, history, relationships gone
- BREAKS REFERENCES: Parent/child relationships broken permanently
- NO UNDO: No trash/recycle bin, no recovery mechanism
- TEAM IMPACT: Other team members lose access to card immediately

SAFER ALTERNATIVES:
Instead of deleting, consider:
1. Archive card: kaiten_update_card({card_id, state: 2}) - preserves data
2. Move to "Deleted" board: kaiten_update_card({card_id, board_id: <deleted_board_id>})
3. Mark as cancelled: Add comment "CANCELLED: [reason]" and archive
4. Hide from view: Use Kaiten UI filters to hide specific cards

USAGE EXAMPLES:
✅ DO: Verify card before deletion:
  1. kaiten_get_card({card_id: 12345}) → review card details, check subtasks
  2. Confirm with user: "Delete card #12345 'Title'? This cannot be undone."
  3. kaiten_delete_card({card_id: 12345}) → only after confirmation

✅ DO: Check for dependencies first:
  1. kaiten_get_card({card_id: 12345}) → check children_count, parents_count
  2. If children_count > 0: Warn "Has N subtasks, delete those first?"
  3. Consider archiving instead if card has subtasks

❌ DON'T: Delete without user confirmation - too risky
❌ DON'T: Delete cards with subtasks - breaks parent-child relationships
❌ DON'T: Use for "cleanup" - archive instead (safer, reversible)
❌ DON'T: Delete cards with active discussions (comments_total > 0) without review
❌ DON'T: Batch delete multiple cards without individual verification

WHEN TO USE DELETE vs ARCHIVE:
**Use DELETE only for:**
- Spam cards created by mistake
- Test/demo cards in non-production environments
- Duplicate cards with no meaningful data
- Cards created seconds ago with no activity

**Use ARCHIVE (preferred) for:**
- Completed work (preserves history)
- Cancelled projects (keeps documentation)
- Old cards with discussions (maintains context)
- Anything you might reference later

ERRORS:
- NOT_FOUND (404): Card doesn't exist or already deleted
  Solution: Verify card_id with kaiten_search_cards

- AUTH_ERROR (403): No permission to delete cards
  Solution: Check API token has delete permissions in this space

- CONFLICT (409): Card has dependencies preventing deletion (rare)
  Solution: Remove blocking relationships first, or archive instead

DELETION WORKFLOW:
Safe deletion procedure:

1. **Verify card exists:**
   kaiten_get_card({card_id: 12345}) → confirm correct card

2. **Check for dependencies:**
   - children_count > 0? → Has subtasks
   - comments_total > 0? → Has discussion
   - Blocked/blocking other cards? → Active relationships

3. **Get user confirmation:**
   Show card details and ask: "Delete this card? Cannot be undone."

4. **Consider alternatives:**
   Suggest archive if card has data worth preserving

5. **Delete if confirmed:**
   kaiten_delete_card({card_id: 12345})

6. **Confirm success:**
   Notify user: "Card #12345 deleted permanently"

ARCHIVING AS ALTERNATIVE:
Archive preserves all data but hides card from active view:
\`\`\`javascript
// Archive instead of delete
kaiten_update_card({
  card_id: 12345,
  state: 3,  // Mark as done
  // Then search with condition=2 to find archived cards
})
\`\`\`

Search archived cards later:
\`\`\`javascript
kaiten_search_cards({
  board_id: 12345,
  condition: 2  // condition=2 means archived
})
\`\`\`

RELATED TOOLS:
- kaiten_get_card: Verify card details before deletion
- kaiten_update_card: Archive card instead (safer alternative)
- kaiten_search_cards: Find cards before deletion, verify correct card_id`;

export const SEARCH_CARDS_DESC = `Search for Kaiten cards with flexible filtering and pagination. Returns compact format optimized for context economy.

PURPOSE: Find cards matching specific criteria across boards and spaces. Use this as your primary discovery tool before performing operations on cards. Searches default space by default with limit of 10 cards, sorted by newest first.

PARAMETERS:
- query (optional): Text search across card titles, descriptions, and comments. Supports partial matching. For Russian text, use root words for inflected forms (e.g., "валют" matches "валюты", "валютный").
- space_id (optional): Filter by space. Omit to use default space from KAITEN_DEFAULT_SPACE_ID. Set to 0 to search ALL spaces (slower, use sparingly).
- board_id (optional, RECOMMENDED): Filter by board ID. Highly recommended to avoid large result sets and timeouts.
- column_id, lane_id, state, type_id (optional): Filter by board position or card type.
- condition (optional): 1=active (default), 2=archived. Only set to 2 when explicitly searching archived cards.
- Date filters: created_before/after, updated_before/after, due_date_before/after in ISO 8601 format (e.g., "2025-10-22T00:00:00Z")
- Boolean flags: asap (urgent cards), overdue, done_on_time, archived, with_due_date
- Multiple IDs: owner_ids, member_ids, column_ids, type_ids, tag_ids as comma-separated strings (e.g., "123,456,789")
- Exclude filters: exclude_board_ids, exclude_owner_ids, exclude_card_ids
- sort_by (optional): "created" (default), "updated", "title"
- sort_direction (optional): "desc" (default), "asc"
- limit (optional): Max cards to return. Default: 10, max: 20 for context economy
- skip (optional): Skip N cards for pagination. Default: 0
- verbosity (optional): Response detail level - 'minimal', 'normal' (default), 'detailed'
  • Use 'minimal' when: Listing many cards (>10), need just IDs/titles, preserving context budget
  • Use 'normal' when: Standard search, need essential info (owner, board, status) - DEFAULT
  • Use 'detailed' when: Debugging, need full API response with all metadata

RETURNS: Human-readable markdown summary with compact card info (verbosity-controlled):
- id, title, URL
- board_title, owner_name
- updated timestamp
- ASAP and BLOCKED flags
Each card is numbered for easy reference. Ends with instruction to use kaiten_get_card for full details.

USAGE EXAMPLES:
✅ DO: Search within a specific board: {board_id: 12345, query: "payment"}
✅ DO: Find ASAP cards: {board_id: 12345, asap: true, limit: 20}
✅ DO: Find cards by owner: {board_id: 12345, owner_id: 67890}
✅ DO: Use root words for Russian search: {query: "болгар"} matches "Болгарии", "болгарский"
✅ DO: Keep limit ≤ 20 to preserve context budget
❌ DON'T: Search all spaces without filters (space_id: 0, no board_id) - causes timeouts
❌ DON'T: Use large limits (>20) without space_id or board_id - wastes context
❌ DON'T: Use exact inflected forms for Russian (query: "валюты") - may miss "валют", "валютный"
❌ DON'T: Forget to set condition=2 when searching for archived cards

ERRORS:
- TIMEOUT: Query too broad (no space_id/board_id filter). Solution: Add board_id or reduce scope.
- NO_RESULTS: No matches found. Try broader query (root words), check filters, verify space_id is correct.
- VALIDATION_ERROR: Invalid parameter format. Check date formats are ISO 8601, IDs are positive integers.

PERFORMANCE TIPS:
- ALWAYS include board_id when possible (60-80% faster)
- For user search, use kaiten_list_users(query="name") to get user_id first, then search by owner_id
- Keep limit ≤ 20 unless pagination is essential
- Default space search (omit space_id) is fastest

RELATED TOOLS:
- kaiten_get_card: Get full details for a specific card after finding it
- kaiten_list_users: Find user_id before filtering by owner_id
- kaiten_list_boards: Discover board_id for your space`;

