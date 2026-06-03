import type { ToolDefinition } from './kit.js';
// Imports are added group-by-group in Tasks 6-10.
export const ALL_TOOLS: ToolDefinition[] = [];
export const TOOL_MAP = new Map<string, ToolDefinition>(ALL_TOOLS.map((t) => [t.name, t]));
