// AUTO-EXTRACTED VERBATIM from src/server.ts tools[] entries during the Task 8
// relations migration. These are the exact `description` template literals the
// hand-written server advertised; kept byte-identical so the advertised tool
// contract is unchanged. Do not reflow.

export const GET_CARD_CHILDREN_DESC = `Get the child cards (subtasks) of a parent card.

PURPOSE: List the subtasks linked under a parent card. Use to review breakdown, check progress, or find child IDs before detaching.

PARAMETERS:
- card_id (required): Parent card ID. Positive integer.
- verbosity (optional): minimal | normal (default) | detailed.

RETURNS: JSON array of child cards (id, title, board, owner, url, ...). Empty array [] if the card has no children.

RELATED TOOLS:
- kaiten_add_card_children: Attach subtasks
- kaiten_remove_card_children: Detach subtasks
- kaiten_get_card: Check children_count before fetching`;

export const ADD_CARD_CHILDREN_DESC = `Attach one or more child cards (subtasks) to a parent card.

PURPOSE: Link existing cards as subtasks under a parent. Accepts an array of child IDs; the server issues one API call per child and continues on individual failures.

PARAMETERS:
- card_id (required): Parent card ID. Positive integer.
- child_card_ids (required): Array of child card IDs to attach. At least one.

RETURNS: JSON summary { parent_card_id, succeeded: number[], failed: [{ child_card_id, error }], summary }.

NOTE: Attaching is idempotent — re-attaching an existing child does not create duplicates.

RELATED TOOLS:
- kaiten_get_card_children: List current children
- kaiten_remove_card_children: Detach subtasks`;

export const REMOVE_CARD_CHILDREN_DESC = `Detach one or more child cards (subtasks) from a parent card.

PURPOSE: Remove parent–child links. Accepts an array of child IDs; the server issues one API call per child and continues on individual failures. Detaches the relationship only — it does NOT delete the child cards.

PARAMETERS:
- card_id (required): Parent card ID. Positive integer.
- child_card_ids (required): Array of child card IDs to detach. At least one.

RETURNS: JSON summary { parent_card_id, succeeded: number[], failed: [{ child_card_id, error }], summary }.

RELATED TOOLS:
- kaiten_get_card_children: List current children to find IDs
- kaiten_add_card_children: Attach subtasks`;

export const GET_CARD_PARENTS_DESC = `Get the parent cards of a card.

PURPOSE: List the parent cards this card is a subtask of. Use to understand where a card sits in the hierarchy or to find parent IDs before detaching.

PARAMETERS:
- card_id (required): The child card ID. Positive integer.
- verbosity (optional): minimal | normal (default) | detailed.

RETURNS: JSON array of parent cards (id, title, board, owner, url, ...). Empty array [] if the card has no parents.

RELATED TOOLS:
- kaiten_add_card_parents: Attach parents
- kaiten_remove_card_parents: Detach parents
- kaiten_get_card_children: The inverse (subtasks of a card)`;

export const ADD_CARD_PARENTS_DESC = `Attach one or more parent cards to a card (makes this card their subtask).

PURPOSE: Link a card under existing parent cards. Accepts an array of parent IDs; the server issues one API call per parent and continues on individual failures.

PARAMETERS:
- card_id (required): The child card ID. Positive integer.
- parent_card_ids (required): Array of parent card IDs to attach. At least one.

RETURNS: JSON summary { child_card_id, succeeded: number[], failed: [{ parent_card_id, error }], summary }.

NOTE: Attaching is idempotent — re-attaching an existing parent does not create duplicates.

RELATED TOOLS:
- kaiten_get_card_parents: List current parents
- kaiten_remove_card_parents: Detach parents`;

export const REMOVE_CARD_PARENTS_DESC = `Detach one or more parent cards from a card.

PURPOSE: Remove parent links. Accepts an array of parent IDs; the server issues one API call per parent and continues on individual failures. Detaches the relationship only — it does NOT delete the parent cards.

PARAMETERS:
- card_id (required): The child card ID. Positive integer.
- parent_card_ids (required): Array of parent card IDs to detach. At least one.

RETURNS: JSON summary { child_card_id, succeeded: number[], failed: [{ parent_card_id, error }], summary }.

RELATED TOOLS:
- kaiten_get_card_parents: List current parents to find IDs
- kaiten_add_card_parents: Attach parents`;
