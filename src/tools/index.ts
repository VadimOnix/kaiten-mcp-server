import type { ToolDefinition } from './kit.js';
// Imports are added group-by-group in Tasks 6-10.
import { getCard } from './cards/get-card.js';
import { createCard } from './cards/create-card.js';
import { updateCard } from './cards/update-card.js';
import { deleteCard } from './cards/delete-card.js';
import { addCardTags } from './cards/add-card-tags.js';
import { removeCardTags } from './cards/remove-card-tags.js';
import { searchCards } from './cards/search-cards.js';
import { getCardComments } from './comments/get-card-comments.js';
import { createComment } from './comments/create-comment.js';
import { updateComment } from './comments/update-comment.js';
import { deleteComment } from './comments/delete-comment.js';
import { getCardChildren } from './relations/get-card-children.js';
import { addCardChildren } from './relations/add-card-children.js';
import { removeCardChildren } from './relations/remove-card-children.js';
import { getCardParents } from './relations/get-card-parents.js';
import { addCardParents } from './relations/add-card-parents.js';
import { removeCardParents } from './relations/remove-card-parents.js';
import { getCardMembers } from './members/get-card-members.js';
import { addCardMembers } from './members/add-card-members.js';
import { removeCardMembers } from './members/remove-card-members.js';
import { setCardResponsible } from './members/set-card-responsible.js';
import { listSpaces } from './reference/list-spaces.js';
import { listBoards } from './reference/list-boards.js';
import { listColumns } from './reference/list-columns.js';
import { listLanes } from './reference/list-lanes.js';
import { listTypes } from './reference/list-types.js';
import { getCurrentUser } from './users/get-current-user.js';
import { listUsers } from './users/list-users.js';

export const ALL_TOOLS: ToolDefinition[] = [
  getCard,
  createCard,
  updateCard,
  deleteCard,
  addCardTags,
  removeCardTags,
  searchCards,
  getCardComments,
  createComment,
  updateComment,
  deleteComment,
  getCardChildren,
  addCardChildren,
  removeCardChildren,
  getCardParents,
  addCardParents,
  removeCardParents,
  getCardMembers,
  addCardMembers,
  removeCardMembers,
  setCardResponsible,
  listSpaces,
  listBoards,
  listColumns,
  listLanes,
  listTypes,
  getCurrentUser,
  listUsers,
];