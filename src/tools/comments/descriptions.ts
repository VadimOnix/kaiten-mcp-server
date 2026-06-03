// AUTO-EXTRACTED VERBATIM from src/server.ts tools[] entries during the Task 7
// comments migration. These are the exact `description` template literals the
// hand-written server advertised; kept byte-identical so the advertised tool
// contract is unchanged. Do not reflow.

export const GET_CARD_COMMENTS_DESC = `Get all comments for a card, including author info and timestamps. Returns complete comment thread.

PURPOSE: Retrieve full comment history and discussion thread for a card. Use to review feedback, track decisions, or analyze communication. Comments appear in Kaiten card history and support markdown formatting.

PARAMETERS:
- card_id (required): Card ID to get comments from. Positive integer.
  How to find: Use kaiten_search_cards or kaiten_get_card

RETURNS: Simplified JSON array of comment objects, ordered chronologically:
- id: Comment ID (use for update/delete operations)
- text: Comment content (supports markdown)
- created: Comment creation timestamp (ISO 8601)
- updated: Last update timestamp if edited (ISO 8601)
- author_id: User ID of comment author
- author_name: Full name of author

Empty array [] if card has no comments.

USAGE EXAMPLES:
✅ DO: Review discussion before taking action:
  1. kaiten_search_cards({query: "bug report"}) → find card
  2. kaiten_get_card_comments({card_id: 12345}) → read discussion
  3. Take informed action based on comments

✅ DO: Check latest feedback: Sort by created timestamp, read most recent
✅ DO: Find specific comment to update/delete: Match by text or author
✅ DO: Analyze card communication patterns: Count comments, check authors

❌ DON'T: Poll repeatedly for new comments - not a real-time API, use webhooks if available
❌ DON'T: Expect comments to include card changes - only user comments, not system events
❌ DON'T: Assume chronological display - client may reorder, use created timestamp

ERRORS:
- NOT_FOUND (404): Card doesn't exist or was deleted
  Solution: Verify card_id with kaiten_search_cards

- AUTH_ERROR (403): No permission to view card/comments
  Solution: Check API token has read access to the card's space

COMMENT CONTENT:
- Supports markdown formatting: **bold**, *italic*, links, lists
- Can include mentions (@username), though API returns plain text
- May contain code blocks, images (as markdown), links
- Text length typically under 5000 characters per comment
- Rendered markdown display only in Kaiten UI, API returns raw markdown

PERFORMANCE:
- Not cached - fetches fresh data on every call
- Typical response: 1-50 comments per card (under 20KB)
- Large threads (100+ comments) may take 1-2 seconds
- No pagination - returns all comments at once

COMMON WORKFLOWS:

Read discussion before replying:
  kaiten_get_card_comments({card_id: 12345}) → review thread
  kaiten_create_comment({card_id: 12345, text: "..."}) → add reply

Find comment to update:
  kaiten_get_card_comments({card_id: 12345}) → find comment by text/author
  kaiten_update_comment({card_id: 12345, comment_id: 789, text: "..."})

Analyze communication:
  kaiten_get_card_comments({card_id: 12345}) → count comments
  Group by author_name → identify most active participants

COMMENT vs CARD INFO:
- kaiten_get_card shows comments_total count + last_comment_date
- kaiten_get_card_comments shows full comment text + authors
- Use kaiten_get_card first to check if comments exist (comments_total > 0)
- Fetch full thread only when needed to save API calls

RELATED TOOLS:
- kaiten_get_card: Check comments_total before fetching full thread
- kaiten_create_comment: Add new comment to card
- kaiten_update_comment: Edit existing comment
- kaiten_delete_comment: Remove comment
- kaiten_search_cards: Find cards before getting comments`;

export const CREATE_COMMENT_DESC = `Add a new comment to a card. Supports markdown formatting and appears in card activity history. Supports idempotency.

PURPOSE: Post feedback, ask questions, provide updates, or document decisions on a card. Comments are visible to all card participants and appear in Kaiten card history chronologically. Essential for team communication and documentation.

REQUIRED PARAMETERS:
- card_id (required): Card to add comment to. Positive integer.
  How to find: Use kaiten_search_cards or kaiten_get_card
- text (required): Comment content. Supports markdown formatting. Minimum 1 character.
  Examples: "Looks good!", "# Next Steps\n- Test on staging\n- Deploy Friday"

OPTIONAL PARAMETERS:
- idempotency_key (optional): Unique key for safe retries. Auto-generated if omitted.
  Format: UUID or timestamp string

RETURNS: Full comment object as JSON with:
- id: New comment ID (use for update/delete)
- text: Comment content as posted
- created: Creation timestamp
- updated: Initially same as created
- author_id: Your user ID (from API token)
- author_name: Your full name
- card_id: Parent card ID

USAGE EXAMPLES:
✅ DO: Simple text comment:
  kaiten_create_comment({
    card_id: 12345,
    text: "Completed testing, ready for deploy"
  })

✅ DO: Markdown formatted comment:
  kaiten_create_comment({
    card_id: 12345,
    text: "# Testing Results\\n**Status**: All tests passed ✅\\n**Issues found**: None\\n**Next step**: Deploy to production"
  })

✅ DO: Multi-line comment with code:
  kaiten_create_comment({
    card_id: 12345,
    text: "Fixed the bug:\\n\\n\\\`\\\`\\\`js\\nif (user) {\\n  return user.name;\\n}\\n\\\`\\\`\\\`"
  })

✅ DO: Link to external resources:
  kaiten_create_comment({
    card_id: 12345,
    text: "PR merged: https://github.com/repo/pull/123"
  })

❌ DON'T: Post empty or whitespace-only comments - validation error
❌ DON'T: Include sensitive data (passwords, tokens) - comments are visible to all
❌ DON'T: Use for status updates - update card fields instead (state, owner_id, etc.)
❌ DON'T: Spam with duplicate comments - check existing thread first with kaiten_get_card_comments

ERRORS:
- NOT_FOUND (404): Card doesn't exist or was deleted
  Solution: Verify card_id with kaiten_search_cards

- VALIDATION_ERROR (422): Invalid text parameter
  Common causes:
  - Empty text or whitespace only
  - Text exceeds max length (typically 10000 characters)
  Solution: Provide meaningful comment text, check length

- AUTH_ERROR (403): No permission to comment on card
  Solution: Check API token has write access to card's space

IDEMPOTENCY:
- Prevents duplicate comments on network retry
- Same idempotency_key returns existing comment instead of creating duplicate
- Auto-generated if omitted (recommended for most cases)
- Useful when network is unreliable or you're retrying after errors
- Key format: UUID or timestamp-based string (e.g., "comment-2025-10-22-12345")

MARKDOWN SUPPORT:
Comments support full markdown syntax:
- **Bold text**, *italic text*, ~~strikethrough~~
- [Links](https://example.com)
- # Headers (H1-H6)
- - Bulleted lists
- 1. Numbered lists
- \`inline code\`, \`\`\`code blocks\`\`\`
- > Blockquotes
- Tables (limited support)
- Mentions (@username) - appear as plain text in API, clickable in UI

COMMENT VISIBILITY:
- Appears immediately in card activity history
- Visible to all users with card access
- Triggers notifications to card followers (if enabled in Kaiten)
- Cannot be made private or hidden
- Searchable via card query parameter in kaiten_search_cards

COMMON WORKFLOWS:

Add status update:
  kaiten_create_comment({
    card_id: 12345,
    text: "Status: Development complete, moved to Testing"
  })

Document decision:
  kaiten_create_comment({
    card_id: 12345,
    text: "Decision: Using PostgreSQL instead of MySQL based on team vote (5-2)"
  })

Request feedback:
  kaiten_create_comment({
    card_id: 12345,
    text: "@TeamLead Please review when ready. Priority: High"
  })

Link external resources:
  kaiten_create_comment({
    card_id: 12345,
    text: "Design mockups: https://figma.com/file/..."
  })

RELATED TOOLS:
- kaiten_get_card_comments: View existing comments before adding
- kaiten_update_comment: Edit your comment if needed
- kaiten_delete_comment: Remove comment if posted by mistake
- kaiten_get_card: Check comments_total to see discussion activity
- kaiten_search_cards: Find cards before commenting`;

export const UPDATE_COMMENT_DESC = `Edit an existing comment on a card. Supports markdown. Can only edit your own comments. Supports idempotency.

PURPOSE: Fix typos, add information, or clarify existing comments. Preserves comment ID and creation date, updates modified timestamp. Essential for maintaining accurate discussion threads. Supports full markdown formatting.

REQUIRED PARAMETERS:
- card_id (required): Card containing the comment. Positive integer.
  How to find: Use kaiten_search_cards or kaiten_get_card
- comment_id (required): Comment ID to update. Positive integer.
  How to find: Use kaiten_get_card_comments to get comment IDs
- text (required): New comment content. Minimum 1 character. Supports markdown.
  Note: Completely replaces old text (not append/prepend)

OPTIONAL PARAMETERS:
- idempotency_key (optional): Unique key for safe retries. Auto-generated if omitted.

RETURNS: Updated comment object as JSON with:
- id: Comment ID (unchanged)
- text: New comment content
- created: Original creation timestamp (unchanged)
- updated: New update timestamp
- author_id: Author ID (unchanged)
- author_name: Author name (unchanged)
- card_id: Parent card ID (unchanged)

USAGE EXAMPLES:
✅ DO: Fix typo in your comment:
  1. kaiten_get_card_comments({card_id: 12345}) → find comment_id
  2. kaiten_update_comment({
       card_id: 12345,
       comment_id: 789,
       text: "Fixed typo: complEted testing"
     })

✅ DO: Add information to existing comment:
  1. Get current comment text from kaiten_get_card_comments
  2. Append new info: original_text + "\\n\\nUpdate: Also tested on Firefox"
  3. kaiten_update_comment with combined text

✅ DO: Improve formatting:
  kaiten_update_comment({
    card_id: 12345,
    comment_id: 789,
    text: "# Test Results\\n**Passed**: 10\\n**Failed**: 0"
  })

❌ DON'T: Try to edit other users' comments - will fail with 403
❌ DON'T: Update with empty text - validation error
❌ DON'T: Forget this replaces entire text - not incremental update
❌ DON'T: Update comments to remove important information without team agreement

PERMISSIONS:
- Can ONLY edit your own comments (author_id matches your user_id)
- Cannot edit comments by other team members
- Admin/owner permissions don't override this restriction
- Attempting to edit others' comments returns AUTH_ERROR (403)

WHO CAN EDIT:
- Your comments only: kaiten_get_current_user() → get your user_id
- Check comment author: kaiten_get_card_comments() → compare author_id
- If author_id != your user_id: Cannot edit, will get 403 error

ERRORS:
- NOT_FOUND (404): Card or comment doesn't exist
  Solution: Verify card_id and comment_id with kaiten_get_card_comments

- AUTH_ERROR (403): Not your comment or no edit permissions
  Common cause: Trying to edit someone else's comment
  Solution: Only edit comments where author_id matches your user_id

- VALIDATION_ERROR (422): Invalid text parameter
  Common causes:
  - Empty text or whitespace only
  - Text exceeds max length (typically 10000 characters)
  Solution: Provide meaningful text, check length

IDEMPOTENCY:
- Prevents duplicate updates on network retry
- Same idempotency_key with same text returns success without re-applying
- Auto-generated if omitted (recommended)
- Format: UUID or timestamp-based string

TEXT REPLACEMENT BEHAVIOR:
- REPLACES entire comment text (not partial update)
- To append: Fetch current text first, then update with old + new
- To prepend: Fetch current text first, then update with new + old
- Cannot delete comment via empty text - use kaiten_delete_comment instead

MARKDOWN SUPPORT:
Full markdown syntax supported (same as kaiten_create_comment):
- **Bold**, *italic*, ~~strikethrough~~
- [Links](https://example.com)
- # Headers, lists, code blocks
- @mentions (appear as plain text in API)

EDIT HISTORY:
- Updated timestamp changes to current time
- Original created timestamp preserved
- Kaiten UI shows "edited" indicator
- No version history - only current text visible
- Consider adding "EDIT: [reason]" at end for transparency

COMMON WORKFLOWS:

Fix typo:
  1. kaiten_get_card_comments({card_id: 12345})
  2. Find your comment by author_id
  3. kaiten_update_comment({card_id, comment_id, text: "corrected text"})

Add update to existing comment:
  1. kaiten_get_card_comments({card_id: 12345}) → get current text
  2. Combine: current_text + "\\n\\nEDIT: Additional info here"
  3. kaiten_update_comment({card_id, comment_id, text: combined})

Improve clarity:
  1. Review comment in kaiten_get_card_comments
  2. Rewrite for better clarity
  3. kaiten_update_comment with improved text
  4. Optional: Add "EDIT: Clarified for better understanding"

ALTERNATIVE: DELETE AND RECREATE:
If you want to completely replace comment (new creation timestamp):
  1. kaiten_delete_comment({card_id, comment_id})
  2. kaiten_create_comment({card_id, text: "new text"})
Note: Loses comment_id, appears as new comment in thread

RELATED TOOLS:
- kaiten_get_card_comments: Find comment_id and current text before updating
- kaiten_create_comment: Add new comment instead of editing
- kaiten_delete_comment: Remove comment entirely if needed
- kaiten_get_current_user: Verify your user_id to check if you can edit`;

export const DELETE_COMMENT_DESC = 'Delete comment';
