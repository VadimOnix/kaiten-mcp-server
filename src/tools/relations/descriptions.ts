// Tool `description` template literals advertised to the MCP client.
// Trimmed for context economy (P0): each description is a short high-signal
// blurb (what + when + which tools it chains with); detailed param docs live in
// the Zod schema (.describe()) and cross-tool rules in the server instructions.
// Length is guarded by test/tools/description-budget.test.ts and the routing
// signals by test/eval/tool-quality.test.ts.

export const GET_CARD_CHILDREN_DESC = `Get the child cards (subtasks) linked under a parent card as a JSON array (id, title, board, owner, url, …); [] if none. Use to review the breakdown, check progress, or find child IDs before detaching. Attach new subtasks with kaiten_add_card_children and detach with kaiten_remove_card_children; check a card's children_count first via kaiten_get_card.`;

export const ADD_CARD_CHILDREN_DESC = `Attach one or more existing cards as child subtasks under a parent card. Required: card_id (the parent) and child_card_ids (array, at least one). Issues one API call per child and continues on individual failures, returning a summary { succeeded, failed }. Idempotent — re-attaching an existing child creates no duplicates. List current children with kaiten_get_card_children; detach with kaiten_remove_card_children.`;

export const REMOVE_CARD_CHILDREN_DESC = `Detach one or more child cards (subtasks) from a parent card. Required: card_id (the parent) and child_card_ids (array, at least one). Removes the parent–child link only — it does NOT delete the child cards. Issues one API call per child and continues on failures, returning { succeeded, failed }. Find current child IDs via kaiten_get_card_children; re-attach with kaiten_add_card_children.`;

export const GET_CARD_PARENTS_DESC = `Get the parent cards this card is a subtask of, as a JSON array (id, title, board, owner, url, …); [] if none. Use to see where a card sits in the hierarchy or to find parent IDs before detaching. Attach parents with kaiten_add_card_parents and detach with kaiten_remove_card_parents; for the inverse (a card's own subtasks) use kaiten_get_card_children.`;

export const ADD_CARD_PARENTS_DESC = `Attach one or more parent cards to a card, making this card their subtask. Required: card_id (the child) and parent_card_ids (array, at least one). Issues one API call per parent and continues on individual failures, returning a summary { succeeded, failed }. Idempotent — re-attaching an existing parent creates no duplicates. List current parents with kaiten_get_card_parents; detach with kaiten_remove_card_parents.`;

export const REMOVE_CARD_PARENTS_DESC = `Detach one or more parent cards from a card. Required: card_id (the child) and parent_card_ids (array, at least one). Removes the link only — it does NOT delete the parent cards. Issues one API call per parent and continues on failures, returning { succeeded, failed }. Find current parent IDs via kaiten_get_card_parents; re-attach with kaiten_add_card_parents.`;
