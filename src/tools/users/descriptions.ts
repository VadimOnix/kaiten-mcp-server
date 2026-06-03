// AUTO-EXTRACTED VERBATIM from src/server.ts tools[] entries during the Task 10
// users migration. These are the exact `description` template literals the
// hand-written server advertised; kept byte-identical so the advertised tool
// contract is unchanged. Do not reflow.

export const GET_CURRENT_USER_DESC = `Get information about the currently authenticated user (you) based on the API token.

PURPOSE: Verify API token is working, check your permissions, get your user_id for filtering "my cards", or confirm account details. Quick health check for API authentication.

PARAMETERS: None

RETURNS: Simplified JSON with your user information:
- id: Your user ID (use for owner_id filters, etc.)
- full_name: Your display name (Latin characters)
- email: Your email address
- username: Your login username
- activated: Account activation status (boolean true/false)

USAGE EXAMPLES:
✅ DO: Verify API token on startup:
  kaiten_get_current_user() → check if returns valid user data

✅ DO: Get your user_id for filtering:
  1. kaiten_get_current_user() → get your id
  2. kaiten_search_cards({owner_id: <your_id>}) → find "my cards"

✅ DO: Check account activation:
  kaiten_get_current_user() → verify activated: true

✅ DO: Confirm which account is authenticated:
  kaiten_get_current_user() → check full_name and email

❌ DON'T: Call repeatedly - user info rarely changes, cache the result
❌ DON'T: Use to search for other users - use kaiten_list_users instead
❌ DON'T: Expect team/organization info - returns only your user account

ERRORS:
- AUTH_ERROR (401): Invalid or expired API token
  Solution: Check KAITEN_API_TOKEN in .env file, regenerate if expired

- AUTH_ERROR (403): Token valid but lacks permissions
  Solution: Token may be restricted, check Kaiten admin settings

AUTHENTICATION:
- Uses KAITEN_API_TOKEN from environment
- Token must be active and not expired
- Tokens typically don't expire but can be revoked in Kaiten UI
- Each token belongs to one user account
- Token permissions determine API access level

RELATED TOOLS:
- kaiten_list_users: Search for other team members by name/email
- kaiten_search_cards: Filter by your owner_id to find "my cards"`;

export const LIST_USERS_DESC = `Search for Kaiten users by name or email with server-side filtering. CRITICAL: Kaiten stores names in LATIN characters only.

PURPOSE: Find user_id to assign cards, filter by owner, or search by member. Essential preprocessing step before any user-related operations. Server supports efficient server-side filtering via query parameter.

PARAMETERS:
- query (optional but STRONGLY RECOMMENDED): Search string for filtering by full_name and email.
  CRITICAL: Kaiten API stores LATIN names only! Examples:
    ✅ "Saranyuk" (Latin) - will find "Vladimir Saranyuk"
    ❌ "Саранюк" (Cyrillic) - will return empty, names not stored in Cyrillic
  Tips: Use partial names, Latin transliteration only
- limit (optional): Max users to return. Default: 100, max: 100. Lower if you know the user.
- offset (optional): Skip N users for pagination. Default: 0. Use for iterating through large user bases.
- verbosity (optional): Response detail level - 'minimal', 'normal' (default), 'detailed'
  • Use 'minimal' when: Just need ID+name for quick reference, listing many users
  • Use 'normal' when: Need email, username, activation status - DEFAULT
  • Use 'detailed' when: Need all user metadata from API

RETURNS: JSON array with user fields (verbosity-controlled):
- id: User ID (use for owner_id, filtering)
- full_name: User's display name (Latin only!)
- email: User email address
- username: Login username
- activated: Boolean, true if user account is active

USAGE EXAMPLES:
✅ DO: Search by Latin name: kaiten_list_users({query: "Vlad"}) or {query: "Saranyuk"}
✅ DO: Search by email: kaiten_list_users({query: "vladimir@company.com"})
✅ DO: Partial match works: {query: "Sar"} finds "Saranyuk", "Sarah", "Saratov"
✅ DO: Always provide query parameter for performance (avoids loading all users)
✅ DO: Use limit to reduce response size if looking for specific person: {query: "John", limit: 10}

❌ DON'T: Use Cyrillic names: {query: "Владимир"} returns empty - LATIN ONLY!
❌ DON'T: Call without query parameter - loads ALL users (100+), wastes tokens and slow
❌ DON'T: Forget to transliterate: "Саранюк" → use "Saranyuk" (Latin transliteration)
❌ DON'T: Assume name spelling - try shorter query if not found: "Vladimir" → try "Vlad"

NAME TRANSLITERATION GUIDE:
Cyrillic → Latin conversion examples:
- Владимир → Vladimir, Vlad
- Саранюк → Saranyuk
- Алексей → Aleksey, Alex
- Юлия → Yulia, Julia, Juli
- Сергей → Sergey, Sergei
When in doubt: use first few letters or email domain

ERRORS:
- NO_RESULTS: No users match query. Solutions:
  1. Try shorter/partial query: "Vladimir" → "Vlad" → "Vl"
  2. Check transliteration: Cyrillic → Latin
  3. Try email instead of name: {query: "user@domain.com"}
  4. Verify user exists and account is activated

- TOO_MANY_RESULTS: Called without query, returning 100 users
  Solution: Add query parameter to narrow search

PERFORMANCE CRITICAL:
- WITHOUT query: Fetches up to 100 users, ~50KB response, wastes context tokens
- WITH query: Filtered server-side, typically 1-10 users, ~2KB response
- ALWAYS use query parameter unless you truly need full user list

API BEHAVIOR:
- Server-side filtering via query param (efficient, fast)
- Case-insensitive partial matching
- Searches both full_name and email fields
- Returns max 100 users per request (API limit as of mid-2025)
- Pagination via offset if needed for large teams

WORKFLOW EXAMPLE:
1. User asks: "Assign bug to Vladimir"
2. kaiten_list_users({query: "Vladimir"}) → get user_id
3. kaiten_update_card({card_id: 12345, owner_id: <user_id>})

RELATED TOOLS:
- kaiten_get_current_user: Get authenticated user info (no search needed)
- kaiten_create_card: Assign owner with owner_id parameter
- kaiten_update_card: Change card owner with owner_id parameter
- kaiten_search_cards: Filter cards by owner_id after finding user`;
