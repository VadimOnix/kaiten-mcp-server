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

export const ADD_CARD_MEMBERS_DESC = `Add one or more participants (участники) to a card.

PURPOSE: Attach existing users as card members. Accepts an array of user IDs; the server issues one API call per user and continues on individual failures. New members join as participants (type 1).

PARAMETERS:
- card_id (required): Card ID. Positive integer.
- user_ids (required): Array of user IDs to add. At least one.

RETURNS: JSON summary { card_id, succeeded: number[], failed: [{ user_id, error }], summary }.

NOTE: Adding is idempotent — re-adding an existing member does not create duplicates.

RELATED TOOLS:
- kaiten_get_card_members: List current members
- kaiten_set_card_responsible: Mark a member responsible
- kaiten_remove_card_members: Remove members`;

export const REMOVE_CARD_MEMBERS_DESC = `Remove one or more members from a card.

PURPOSE: Detach users from a card. Accepts an array of user IDs; the server issues one API call per user and continues on individual failures. This is also the only way to unassign a responsible user (it removes them from the card entirely).

PARAMETERS:
- card_id (required): Card ID. Positive integer.
- user_ids (required): Array of user IDs to remove. At least one.

RETURNS: JSON summary { card_id, succeeded: number[], failed: [{ user_id, error }], summary }.

RELATED TOOLS:
- kaiten_get_card_members: List current members to find IDs
- kaiten_add_card_members: Add participants`;

export const SET_CARD_RESPONSIBLE_DESC = `Mark a user as responsible (ответственный) for a card.

PURPOSE: Make a user the responsible person on a card. If they are not already a member they are added automatically first, then promoted to responsible (type 2).

PARAMETERS:
- card_id (required): Card ID. Positive integer.
- user_id (required): User ID to mark responsible.

RETURNS: JSON { card_id, user_id, type } with type 2 (responsible).

NOTE: This is additive — it does NOT demote any existing responsible member (Kaiten allows several). The Kaiten API cannot demote a responsible back to a plain participant; to unassign, use kaiten_remove_card_members (removes them from the card entirely).

RELATED TOOLS:
- kaiten_get_card_members: See who is responsible (type 2)
- kaiten_add_card_members: Add participants
- kaiten_remove_card_members: Remove a member / unassign responsible`;
