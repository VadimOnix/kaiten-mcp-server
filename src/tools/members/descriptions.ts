export const GET_CARD_MEMBERS_DESC = `Get the members (участники) of a card, including who is responsible.

PURPOSE: List everyone attached to a card and their role. Use to review assignments or find user IDs before changing membership.

PARAMETERS:
- card_id (required): Card ID. Positive integer.
- verbosity (optional): minimal | normal (default) | detailed.

RETURNS: JSON array of members (id, full_name, ..., type). type 1 = participant (участник), type 2 = responsible (ответственный). Empty array [] if the card has no members.

RELATED TOOLS:
- kaiten_add_card_members: Add participants
- kaiten_remove_card_members: Remove members
- kaiten_set_card_responsible: Mark a member responsible`;

export const ADD_CARD_MEMBERS_DESC = `Add one or more participants to a card. Required: card_id and user_ids (array of user IDs, at least one). New members join as participants (type 1). The server makes one API call per user and continues on individual failures, returning { card_id, succeeded, failed, summary }. Idempotent — re-adding an existing member creates no duplicates. Find user IDs via kaiten_list_users; see current members via kaiten_get_card_members.`;

export const REMOVE_CARD_MEMBERS_DESC = `Remove one or more members from a card.

PURPOSE: Detach users from a card. Accepts an array of user IDs; the server issues one API call per user and continues on individual failures. This is also the only way to unassign a responsible user (it removes them from the card entirely).

PARAMETERS:
- card_id (required): Card ID. Positive integer.
- user_ids (required): Array of user IDs to remove. At least one.

RETURNS: JSON summary { card_id, succeeded: number[], failed: [{ user_id, error }], summary }.

RELATED TOOLS:
- kaiten_get_card_members: List current members to find IDs
- kaiten_add_card_members: Add participants`;

export const SET_CARD_RESPONSIBLE_DESC = `Mark a user as responsible (type 2) for a card. Required: card_id and user_id. If the user is not already a member they are added first, then promoted. Returns { card_id, user_id, type }. Additive — it does NOT demote existing responsible members (Kaiten allows several), and the API cannot demote a responsible back to a plain participant; to unassign, use kaiten_remove_card_members (removes them from the card entirely). Find user IDs via kaiten_list_users; see current roles via kaiten_get_card_members.`;
