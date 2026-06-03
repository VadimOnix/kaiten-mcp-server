import type { ToolDefinition } from './kit.js';
// Imports are added group-by-group in Tasks 6-10.
import { getCard } from './cards/get-card.js';
import { createCard } from './cards/create-card.js';
import { updateCard } from './cards/update-card.js';
import { deleteCard } from './cards/delete-card.js';
import { searchCards } from './cards/search-cards.js';

export const ALL_TOOLS: ToolDefinition[] = [
  getCard,
  createCard,
  updateCard,
  deleteCard,
  searchCards,
];
export const TOOL_MAP = new Map<string, ToolDefinition>(ALL_TOOLS.map((t) => [t.name, t]));
