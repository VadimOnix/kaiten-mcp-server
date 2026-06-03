// AUTO-EXTRACTED VERBATIM from src/server.ts tools[] entries during the Task 9
// reference migration. These are the exact `description` template literals the
// hand-written server advertised; kept byte-identical so the advertised tool
// contract is unchanged. Do not reflow.

export const LIST_SPACES_DESC = `List all Kaiten spaces (workspaces) accessible to your API token. Top-level organization structure.

PURPOSE: Discover available spaces to get space_id for board operations. Spaces are top-level containers that group boards, users, and projects. Use this for workspace discovery, especially when KAITEN_DEFAULT_SPACE_ID is not set or working with multiple spaces.

PARAMETERS: None

RETURNS: Simplified JSON array of space objects:
- id: Space ID (use for space_id in other operations)
- title: Space name/title
- description: Space description (if set)
- archived: Boolean, true if space is archived
- boards: Array of board objects in this space (basic info only)

Cached for 300 seconds (5 minutes) for performance; the cache expires automatically.

USAGE EXAMPLES:
✅ DO: Discover spaces on first run:
  kaiten_list_spaces() → find your workspace space_id

✅ DO: Verify KAITEN_DEFAULT_SPACE_ID is correct:
  kaiten_list_spaces() → check if default space_id exists in list

✅ DO: Multi-workspace operations:
  1. kaiten_list_spaces() → get all space_ids
  2. Loop: kaiten_list_boards(space_id) for each space

✅ DO: Find space by name:
  kaiten_list_spaces() → filter by title to find space_id

❌ DON'T: Call repeatedly within 5 minutes - results are cached
❌ DON'T: Expect detailed board data - use kaiten_list_boards(space_id) for full board info
❌ DON'T: Assume single space - organizations may have multiple spaces

ERRORS:
- AUTH_ERROR (403): API token lacks permission to list spaces
  Solution: Check token has read access, verify in Kaiten admin settings

- Empty array []: No spaces accessible or all archived
  Solution: Verify API token is valid, check space permissions in Kaiten

SPACE HIERARCHY:
Kaiten organization structure:
1. **Organization** (top level, not in API)
2. **Spaces** (workspaces) ← this tool lists these
3. **Boards** (projects/teams) ← use kaiten_list_boards
4. **Cards** (tasks) ← use kaiten_search_cards

SPACES vs BOARDS:
- **Space**: High-level workspace container, groups boards by department/project
- **Board**: Kanban board within space, contains cards
- Example structure:
  - Space: "Engineering Department"
    - Board: "Backend Team"
    - Board: "Frontend Team"
  - Space: "Marketing"
    - Board: "Content Calendar"
    - Board: "Campaign Tracker"

CACHING:
- Spaces list cached for 300 seconds (5 min) after first fetch
- Reduces API calls, improves performance
- Auto-expires after TTL (no manual refresh needed)

DEFAULT SPACE BEHAVIOR:
- If KAITEN_DEFAULT_SPACE_ID set: Most operations default to that space
- If not set: Must provide space_id explicitly
- Recommendation: Set default space if working primarily in one space
- Override default: Pass space_id=0 to kaiten_search_cards for all spaces

COMMON WORKFLOWS:

Initial setup:
  kaiten_list_spaces() → find your space_id
  → Set KAITEN_DEFAULT_SPACE_ID in .env
  → Restart server

Discover workspace structure:
  1. kaiten_list_spaces() → list all spaces
  2. For each space: kaiten_list_boards(space_id) → get boards
  3. For each board: kaiten_list_columns(board_id) → get structure

Multi-workspace search:
  1. kaiten_list_spaces() → get all space_ids
  2. Loop through spaces:
     kaiten_search_cards({space_id, query: "bug"})
  3. Aggregate results from all spaces

RELATED TOOLS:
- kaiten_list_boards: List boards within a space (next step after list_spaces)
- kaiten_search_cards: Set space_id=0 to search all spaces`;

export const LIST_BOARDS_DESC = `List all boards in a space. Essential discovery tool for finding board_id before card operations.

PURPOSE: Discover available boards in your workspace to get board_id for creating/searching cards. First step in board structure discovery workflow. Uses cached results (5 min TTL) for performance.

PARAMETERS:
- space_id (optional): Space ID to filter boards. If omitted, uses KAITEN_DEFAULT_SPACE_ID from environment.
  How to find: Use kaiten_list_spaces to discover space_id
- verbosity (optional): Response detail level - 'minimal', 'normal' (default), 'detailed'
  • Use 'minimal' when: Quick list, just need ID+title for reference
  • Use 'normal' when: Standard list with space_id, archived status - DEFAULT
  • Use 'detailed' when: Need all board metadata from API

RETURNS: JSON array of board objects (verbosity-controlled) with:
- id: Board ID (use for board_id in card operations)
- title: Board name/title
- space_id: Parent space ID
- archived: Boolean indicating if board is archived

Cached for 300 seconds (5 minutes) for performance; the cache expires automatically.

USAGE EXAMPLES:
✅ DO: List boards in default space: kaiten_list_boards() (no params)
✅ DO: List boards in specific space: kaiten_list_boards({space_id: 12345})
✅ DO: Use this before creating cards to find correct board_id
✅ DO: Discovery workflow:
  1. kaiten_list_boards() → find board_id
  2. kaiten_list_columns(board_id) → get columns
  3. kaiten_create_card({board_id, ...})

❌ DON'T: Hardcode board_id - boards can be renamed/archived, always discover first
❌ DON'T: Skip this step before create_card - will cause 404 errors
❌ DON'T: Call repeatedly within 5 minutes - results are cached

ERRORS:
- NOT_FOUND (404): space_id doesn't exist or is archived
  Solution: Verify space_id with kaiten_list_spaces

- AUTH_ERROR (403): No permission to view boards in this space
  Solution: Check API token has read access to the space

- MISSING_SPACE_ID: No space_id provided and KAITEN_DEFAULT_SPACE_ID not set
  Solution: Set KAITEN_DEFAULT_SPACE_ID in .env or pass space_id parameter

CACHING:
- Boards list is cached for 300 seconds (5 min) after first fetch
- Reduces API calls and improves performance
- Cache auto-expires after TTL (no manual refresh needed)

BOARD STRUCTURE DISCOVERY WORKFLOW:
This is typically the first step in working with cards:

1. **Find boards**: kaiten_list_boards() → get board_id
2. **Explore board**: kaiten_list_columns(board_id) → get stages
3. **Optional**: kaiten_list_lanes(board_id) → get swimlanes
4. **Optional**: kaiten_list_types(board_id) → get card types
5. **Create/search cards**: Use discovered board_id

RELATED TOOLS:
- kaiten_list_spaces: Find space_id if not using default space
- kaiten_list_columns: Get board columns (stages) for card placement
- kaiten_list_lanes: Get board lanes (swimlanes)
- kaiten_list_types: Get card types available on board
- kaiten_search_cards: Search cards on specific board`;

export const LIST_COLUMNS_DESC = `List all columns (workflow stages) for a board. Required before creating/moving cards to get valid column_id.

PURPOSE: Discover board columns (stages like "Backlog", "In Progress", "Done") to place cards correctly. Columns represent workflow stages and are required for precise card placement. Use before kaiten_create_card or kaiten_update_card with column_id.

PARAMETERS:
- board_id (required): Board ID to get columns from. Positive integer.
  How to find: Use kaiten_list_boards to discover board_id

RETURNS: JSON array of column objects with:
- id: Column ID (use for column_id in card operations)
- title: Column name (e.g., "Backlog", "In Progress", "Testing", "Done")
- Order: Columns returned in board display order (left to right)

Not cached - fetches fresh data on every call.

USAGE EXAMPLES:
✅ DO: Get columns before creating card:
  1. kaiten_list_boards() → get board_id
  2. kaiten_list_columns(board_id) → find column_id
  3. kaiten_create_card({board_id, column_id, ...})

✅ DO: Get columns before moving card:
  1. kaiten_list_columns(board_id) → find "Code Review" column
  2. kaiten_update_card({card_id: 12345, column_id: <review_column_id>})

✅ DO: Find default/starting column (usually first or "Backlog")
✅ DO: Map column titles to IDs for user-friendly references

❌ DON'T: Hardcode column_id - columns can be reordered/renamed/deleted
❌ DON'T: Use column_id from different board - causes validation error
❌ DON'T: Skip this step when user specifies column by name - must translate to ID

ERRORS:
- NOT_FOUND (404): board_id doesn't exist or is archived
  Solution: Verify board_id with kaiten_list_boards

- AUTH_ERROR (403): No permission to view board structure
  Solution: Check API token has read access to the board's space

COLUMN BEHAVIOR:
- Columns represent horizontal workflow stages on Kanban boards
- Typical workflow: Backlog → In Progress → Review → Testing → Done
- Order returned matches visual order on board (left to right)
- First column often default for new cards
- Some boards have many columns (10+), others few (3-5)

COLUMN VS STATE:
Don't confuse with card state (1=queued, 2=in progress, 3=done):
- **column_id**: Physical position on board, board-specific stages
- **state**: Logical workflow state (1/2/3), consistent across all boards
- Cards can have any state in any column (board config dependent)
- Example: "Testing" column might have cards in state 2 (in progress)

BOARD STRUCTURE DISCOVERY WORKFLOW:
Typical sequence for creating cards with full placement:

1. kaiten_list_boards() → get board_id
2. **kaiten_list_columns(board_id)** → get column_id (stages)
3. kaiten_list_lanes(board_id) → get lane_id (swimlanes, optional)
4. kaiten_list_types(board_id) → get type_id (card types, optional)
5. kaiten_create_card({board_id, column_id, lane_id, type_id, ...})

COMMON COLUMN NAMES:
Typical column titles you'll encounter:
- Backlog, To Do, Queue
- In Progress, Doing, Work in Progress
- Code Review, Review, QA
- Testing, QA Testing
- Done, Completed, Closed
- Deployed, Released

RELATED TOOLS:
- kaiten_list_boards: Find board_id before listing columns
- kaiten_list_lanes: Get swimlanes (vertical grouping)
- kaiten_list_types: Get card types for the board
- kaiten_create_card: Create card in specific column
- kaiten_update_card: Move card to different column
- kaiten_search_cards: Filter cards by column_id`;

export const LIST_LANES_DESC = `List board lanes (swimlanes) for vertical card grouping. Optional but useful for complex board organization.

PURPOSE: Discover lane IDs for creating/moving cards with vertical categorization. Lanes (swimlanes) provide secondary grouping orthogonal to columns, useful for team separation, priority levels, or project phases. Not all boards use lanes.

PARAMETERS:
- board_id (required): Board ID to get lanes from. Positive integer.
  How to find: Use kaiten_list_boards to discover board_id

RETURNS: JSON array of lane objects with:
- id: Lane ID (use for lane_id in card operations)
- title: Lane name (e.g., "High Priority", "Team A", "Backend")
- Order: Lanes returned in board display order (top to bottom)

Empty array [] if board has no lanes configured. Not cached - fetches fresh data.

USAGE EXAMPLES:
✅ DO: Get lanes before creating card with lane placement:
  1. kaiten_list_boards() → get board_id
  2. kaiten_list_columns(board_id) → get column_id
  3. kaiten_list_lanes(board_id) → get lane_id
  4. kaiten_create_card({board_id, column_id, lane_id, ...})

✅ DO: Check if board uses lanes:
  kaiten_list_lanes(board_id) → if empty array, board doesn't use lanes

✅ DO: Find lane by name:
  kaiten_list_lanes(board_id) → filter by title to get lane_id

✅ DO: Move card between lanes:
  kaiten_update_card({card_id: 12345, lane_id: <new_lane_id>})

❌ DON'T: Assume all boards have lanes - many don't, will return []
❌ DON'T: Use lane_id from different board - causes validation error
❌ DON'T: Require lane_id for card creation - it's always optional

ERRORS:
- NOT_FOUND (404): board_id doesn't exist or is archived
  Solution: Verify board_id with kaiten_list_boards

- AUTH_ERROR (403): No permission to view board structure
  Solution: Check API token has read access to the board's space

SWIMLANES CONCEPT:
Lanes provide VERTICAL organization on Kanban boards:
- **Columns**: Horizontal workflow stages (Backlog → In Progress → Done)
- **Lanes**: Vertical groupings (teams, priorities, categories)
- Cards positioned at intersection of column and lane

Visualization (Board Layout):
           Backlog  | In Progress | Done
High Pri   [Card A] | [Card B]    | [Card C]
Low Pri    [Card D] | [Card E]    | [Card F]
           ↑ lane      ↑ column

COMMON LANE USES:
**By Team:**
- Frontend Team
- Backend Team
- QA Team
- Design Team

**By Priority:**
- Critical
- High
- Normal
- Low

**By Product:**
- Product A
- Product B
- Infrastructure
- Shared

**By Work Type:**
- Feature Development
- Bug Fixes
- Technical Debt
- Research

LANE_ID OPTIONAL:
- Creating card: lane_id is optional parameter
- If omitted: Card goes to board's default lane
- Some boards have no lanes: lane_id not applicable
- Moving cards: Can change lane_id or omit to keep current

BOARDS WITHOUT LANES:
Many boards don't use swimlanes:
- kaiten_list_lanes returns empty array []
- Don't provide lane_id for these boards
- Cards still work fine without lane assignment
- Simpler board layout, single horizontal workflow

LANE vs COLUMN:
Don't confuse lanes with columns:
- **Columns** (required): Workflow stages, horizontal movement, all boards have them
- **Lanes** (optional): Categorization, vertical grouping, not all boards use them
- Cards have both: position = (column_id, lane_id)
- Example: Card in "In Progress" column + "Backend Team" lane

BOARD STRUCTURE DISCOVERY:
Complete workflow for card placement:

1. kaiten_list_boards() → get board_id
2. kaiten_list_columns(board_id) → get column_id (required)
3. **kaiten_list_lanes(board_id)** → get lane_id (optional, check if empty)
4. kaiten_list_types(board_id) → get type_id (optional)
5. kaiten_create_card({board_id, column_id, lane_id?, type_id?, ...})

RELATED TOOLS:
- kaiten_list_boards: Find board_id before listing lanes
- kaiten_list_columns: Get columns (required, use first for lanes)
- kaiten_list_types: Get card types for the board
- kaiten_create_card: Create card with optional lane_id
- kaiten_update_card: Move card to different lane
- kaiten_search_cards: Filter cards by lane_id`;

export const LIST_TYPES_DESC = `List card types available on a board. Types categorize cards by nature of work (Task, Bug, Feature, etc.).

PURPOSE: Discover valid type_id values for creating/updating cards. Card types categorize work by nature (implementation task, bug fix, feature request, etc.), help with filtering and reporting. Each board has its own type configuration.

PARAMETERS:
- board_id (required): Board ID to get card types from. Positive integer.
  How to find: Use kaiten_list_boards to discover board_id

RETURNS: JSON array of card type objects with:
- id: Type ID (use for type_id in card operations)
- name: Type name (e.g., "Task", "Bug", "Feature", "Story")
- Order: Types may be returned in priority or alphabetical order

Not cached - fetches fresh data on every call.

USAGE EXAMPLES:
✅ DO: Get types before creating card with specific type:
  1. kaiten_list_boards() → get board_id
  2. kaiten_list_types(board_id) → find "Bug" type_id
  3. kaiten_create_card({board_id, type_id: <bug_type_id>, title: "Fix login error"})

✅ DO: Find type by name:
  kaiten_list_types(board_id) → filter by name to get type_id for "Feature"

✅ DO: Change card type:
  1. kaiten_list_types(board_id) → get new type_id
  2. kaiten_update_card({card_id: 12345, type_id: <new_type_id>})

✅ DO: List available work types for user guidance:
  kaiten_list_types(board_id) → show user "Available types: Task, Bug, Feature"

❌ DON'T: Assume standard types exist - each board configures its own
❌ DON'T: Use type_id from different board - causes validation error
❌ DON'T: Hardcode type names - types vary by board and organization

ERRORS:
- NOT_FOUND (404): board_id doesn't exist or is archived
  Solution: Verify board_id with kaiten_list_boards

- AUTH_ERROR (403): No permission to view board structure
  Solution: Check API token has read access to the board's space

CARD TYPES CONCEPT:
Types categorize cards by work nature:
- **Task**: General implementation work
- **Bug**: Defect/issue that needs fixing
- **Feature**: New functionality request
- **Story**: User story (Agile/Scrum)
- **Epic**: Large initiative spanning multiple stories
- **Spike**: Research/investigation work
- **Technical Debt**: Code improvement/refactoring

Benefits:
- Better organization and filtering
- Visual distinction (types often have colors in UI)
- Reporting by work type
- Workflow customization per type

COMMON TYPE NAMES:
**Software Development:**
- Task, Bug, Feature, Story, Epic, Spike, Technical Debt, Improvement

**Project Management:**
- Action Item, Decision, Risk, Issue, Milestone

**Support/Service:**
- Ticket, Incident, Request, Question, Problem

**Marketing/Content:**
- Campaign, Content Piece, Design Asset, Review

TYPE_ID OPTIONAL:
- Creating card: type_id is optional parameter
- If omitted: Board uses default type (usually first or "Task")
- Updating card: Can change type_id or omit to keep current
- Filtering: type_id useful for search_cards to find specific work types

BOARD-SPECIFIC CONFIGURATION:
Each board has independent type configuration:
- Board A might have: Task, Bug, Feature
- Board B might have: Story, Epic, Spike, Bug
- No universal type list across all boards
- Always fetch types for specific board_id

TYPE vs STATE vs COLUMN:
Don't confuse different classification systems:
- **Type** (type_id): WHAT kind of work (Bug, Feature, Task)
- **State** (1/2/3): WORKFLOW position (Queued, In Progress, Done)
- **Column** (column_id): BOARD position (Backlog, Review, Testing)

Example: Bug (type) in In Progress (state) in Testing column (column_id)

FILTERING BY TYPE:
Use types for targeted searches:

Find all bugs:
  1. kaiten_list_types(board_id) → get bug type_id
  2. kaiten_search_cards({board_id, type_id: <bug_type_id>})

Find unresolved bugs:
  1. kaiten_list_types(board_id) → get bug type_id
  2. kaiten_search_cards({board_id, type_id: <bug_type_id>, state: 1 or 2})

BOARD STRUCTURE DISCOVERY:
Complete workflow for card creation:

1. kaiten_list_boards() → get board_id
2. kaiten_list_columns(board_id) → get column_id
3. kaiten_list_lanes(board_id) → get lane_id (if used)
4. **kaiten_list_types(board_id)** → get type_id (optional)
5. kaiten_create_card({board_id, column_id, type_id, ...})

RELATED TOOLS:
- kaiten_list_boards: Find board_id before listing types
- kaiten_list_columns: Get columns for complete board structure
- kaiten_list_lanes: Get lanes for complete board structure
- kaiten_create_card: Create card with specific type_id
- kaiten_update_card: Change card type
- kaiten_search_cards: Filter cards by type_id`;
