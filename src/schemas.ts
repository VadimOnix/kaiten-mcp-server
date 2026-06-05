import { z } from 'zod';

// ============================================
// COMMON SCHEMAS
// ============================================

export const IdempotencyKeySchema = z.string().optional().describe(
  'Unique idempotency key to prevent duplicate operations. Use the same key for retries. Format: client-generated UUID or timestamp-based string.'
);

export const VerbosityEnum = z.enum(['minimal', 'normal', 'detailed'])
  .optional()
  .default('normal')
  .describe(
    'Response detail level: ' +
    'minimal (id + name/title only, for quick lists), ' +
    'normal (essential fields with human-readable info, default), ' +
    'detailed (full API response with all metadata)'
  );

export const ResponseFormatEnum = z.enum(['json', 'markdown'])
  .optional()
  .default('markdown')
  .describe(
    'Response format: ' +
    'json (structured data for programmatic use), ' +
    'markdown (human-readable formatted text, default)'
  );

// ============================================
// CARD SCHEMAS
// ============================================

export const GetCardSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the card to retrieve'),
  format: ResponseFormatEnum,
}).strict();

export const CreateCardSchema = z.object({
  title: z.string().min(1).max(500).describe('The title of the card'),
  board_id: z.number().positive().int().describe('The ID of the board where the card will be created'),
  column_id: z.number().positive().int().optional().describe('The ID of the column (optional)'),
  lane_id: z.number().positive().int().optional().describe('The ID of the lane (optional)'),
  description: z.string().optional().describe('The description of the card (optional)'),
  type_id: z.number().positive().int().optional().describe('The type ID of the card (optional)'),
  size: z.number().min(0).optional().describe('The size/estimate of the card (optional)'),
  asap: z.boolean().optional().describe('Mark as ASAP (optional)'),
  owner_id: z.number().positive().int().optional().describe('The ID of the card owner (optional)'),
  due_date: z.string().optional().describe('Due date in ISO format (optional)'),
  idempotency_key: IdempotencyKeySchema,
}).strict();

export const UpdateCardSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the card to update'),
  title: z.string().min(1).max(500).optional().describe('The new title (optional)'),
  description: z.string().optional().describe('The new description (optional)'),
  state: z.number().optional().describe('The new state (optional)'),
  column_id: z.number().positive().int().optional().describe('Move to this column ID (optional)'),
  lane_id: z.number().positive().int().optional().describe('Move to this lane ID (optional)'),
  type_id: z.number().positive().int().optional().describe('The new type ID (optional)'),
  size: z.number().min(0).optional().describe('The new size/estimate (optional)'),
  asap: z.boolean().optional().describe('Mark as ASAP (optional)'),
  owner_id: z.number().positive().int().optional().describe('The new owner ID (optional)'),
  due_date: z.string().optional().describe('New due date in ISO format (optional)'),
  idempotency_key: IdempotencyKeySchema,
}).strict();

export const DeleteCardSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the card to delete'),
}).strict();

export const GetCardChildrenSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the parent card'),
  verbosity: VerbosityEnum,
}).strict();

export const AddCardChildrenSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the parent card'),
  child_card_ids: z.array(z.number().positive().int()).min(1)
    .describe('IDs of child cards to attach as subtasks (one API call per ID)'),
}).strict();

export const RemoveCardChildrenSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the parent card'),
  child_card_ids: z.array(z.number().positive().int()).min(1)
    .describe('IDs of child cards to detach (one API call per ID)'),
}).strict();

export const GetCardParentsSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the child card'),
  verbosity: VerbosityEnum,
}).strict();

export const AddCardParentsSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the child card'),
  parent_card_ids: z.array(z.number().positive().int()).min(1)
    .describe('IDs of parent cards to attach (one API call per ID)'),
}).strict();

export const RemoveCardParentsSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the child card'),
  parent_card_ids: z.array(z.number().positive().int()).min(1)
    .describe('IDs of parent cards to detach (one API call per ID)'),
}).strict();

export const GetCardMembersSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the card whose members to list'),
  verbosity: VerbosityEnum,
}).strict();

export const AddCardMembersSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the card to add members to'),
  user_ids: z.array(z.number().positive().int()).min(1)
    .describe('IDs of users to add as card members (one API call per ID)'),
}).strict();

export const RemoveCardMembersSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the card to remove members from'),
  user_ids: z.array(z.number().positive().int()).min(1)
    .describe('IDs of users to remove from the card (one API call per ID)'),
}).strict();

export const SetCardResponsibleSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the card'),
  user_id: z.number().positive().int()
    .describe('The ID of the user to mark responsible (auto-added as a member if not already one)'),
}).strict();

export const SearchCardsSchema = z.object({
  // Text search
  query: z.string().optional().describe('Partial case-insensitive match on title/description/comments'),

  // Basic filters
  space_id: z.number().optional().describe('Space ID; omit for default space, 0 = all spaces'),
  board_id: z.number().positive().int().optional().describe('Board ID (recommended, keeps results small)'),
  column_id: z.number().positive().int().optional().describe('Column ID'),
  lane_id: z.number().positive().int().optional().describe('Lane ID'),
  title: z.string().optional().describe('Title filter'),
  state: z.number().optional().describe('State: 1=queued, 2=inProgress, 3=done'),
  owner_id: z.number().positive().int().optional().describe('Owner user ID'),
  type_id: z.number().positive().int().optional().describe('Card type ID'),
  condition: z.number().min(1).max(2).optional().describe('1=active (default), 2=archived'),

  // Date filters (ISO 8601)
  created_before: z.string().optional().describe('Created before (ISO 8601)'),
  created_after: z.string().optional().describe('Created after (ISO 8601)'),
  updated_before: z.string().optional().describe('Updated before (ISO 8601)'),
  updated_after: z.string().optional().describe('Updated after (ISO 8601)'),
  due_date_before: z.string().optional().describe('Due before (ISO 8601)'),
  due_date_after: z.string().optional().describe('Due after (ISO 8601)'),

  // Boolean flags
  asap: z.boolean().optional().describe('Only ASAP cards'),
  overdue: z.boolean().optional().describe('Only overdue cards'),

  // Multiple IDs (comma-separated)
  owner_ids: z.string().optional().describe('Owner IDs, comma-separated (e.g. "123,456")'),
  member_ids: z.string().optional().describe('Member IDs, comma-separated'),
  tag_ids: z.string().optional().describe('Tag IDs, comma-separated'),

  // Sorting and pagination
  sort_by: z.enum(['created', 'updated', 'title']).optional().describe('Sort field (default: created)'),
  sort_direction: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
  limit: z.number().positive().int().max(20).optional().describe('Max cards (default 10, max 20)'),
  skip: z.number().min(0).int().optional().describe('Skip N for pagination (default 0)'),

  // Response control
  verbosity: VerbosityEnum,
}).strict();

// ============================================
// COMMENT SCHEMAS
// ============================================

export const GetCardCommentsSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the card'),
  limit: z.number().int().positive().max(100).optional().default(50)
    .describe('Max comments to return — the most recent ones (default 50, max 100). Protects context on long threads.'),
  offset: z.number().int().min(0).optional().default(0)
    .describe('Skip this many of the most recent comments to page into older history (default 0).'),
  verbosity: VerbosityEnum,
}).strict();

export const CreateCommentSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the card'),
  text: z.string().min(1).describe('The comment text'),
  idempotency_key: IdempotencyKeySchema,
}).strict();

export const UpdateCommentSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the card'),
  comment_id: z.number().positive().int().describe('The ID of the comment to update'),
  text: z.string().min(1).describe('The new comment text'),
  idempotency_key: IdempotencyKeySchema,
}).strict();

export const DeleteCommentSchema = z.object({
  card_id: z.number().positive().int().describe('The ID of the card'),
  comment_id: z.number().positive().int().describe('The ID of the comment to delete'),
}).strict();

// ============================================
// BOARD SCHEMAS
// ============================================

export const ListBoardsSchema = z.object({
  space_id: z.number().positive().int().optional().describe('Filter by space ID (optional)'),
  verbosity: VerbosityEnum,
}).strict();

// ============================================
// BOARD REFERENCE DATA (COLUMNS, LANES, TYPES)
// ============================================

export const ListColumnsSchema = z.object({
  board_id: z.number().positive().int().describe('The ID of the board'),
}).strict();

export const ListLanesSchema = z.object({
  board_id: z.number().positive().int().describe('The ID of the board'),
}).strict();

export const ListTypesSchema = z.object({
  board_id: z.number().positive().int().describe('The ID of the board'),
}).strict();

// ============================================
// USER SCHEMAS
// ============================================

export const ListUsersSchema = z.object({
  query: z.string().optional().describe('Search query to filter users by email and full_name (server-side filtering)'),
  limit: z.number().positive().int().max(100).optional().describe('Maximum number of users to return (default: 100)'),
  offset: z.number().min(0).int().optional().describe('Number of records to skip for pagination (default: 0)'),
  verbosity: VerbosityEnum,
}).strict();

// GetCurrentUser has no parameters, so no schema needed

// ============================================
// TYPES FOR VALIDATED DATA
// ============================================

export type GetCardArgs = z.infer<typeof GetCardSchema>;
export type CreateCardArgs = z.infer<typeof CreateCardSchema>;
export type UpdateCardArgs = z.infer<typeof UpdateCardSchema>;
export type DeleteCardArgs = z.infer<typeof DeleteCardSchema>;
export type GetCardChildrenArgs = z.infer<typeof GetCardChildrenSchema>;
export type AddCardChildrenArgs = z.infer<typeof AddCardChildrenSchema>;
export type RemoveCardChildrenArgs = z.infer<typeof RemoveCardChildrenSchema>;
export type GetCardParentsArgs = z.infer<typeof GetCardParentsSchema>;
export type AddCardParentsArgs = z.infer<typeof AddCardParentsSchema>;
export type RemoveCardParentsArgs = z.infer<typeof RemoveCardParentsSchema>;
export type SearchCardsArgs = z.infer<typeof SearchCardsSchema>;
export type GetCardCommentsArgs = z.infer<typeof GetCardCommentsSchema>;
export type CreateCommentArgs = z.infer<typeof CreateCommentSchema>;
export type UpdateCommentArgs = z.infer<typeof UpdateCommentSchema>;
export type DeleteCommentArgs = z.infer<typeof DeleteCommentSchema>;
export type ListBoardsArgs = z.infer<typeof ListBoardsSchema>;
export type ListColumnsArgs = z.infer<typeof ListColumnsSchema>;
export type ListLanesArgs = z.infer<typeof ListLanesSchema>;
export type ListTypesArgs = z.infer<typeof ListTypesSchema>;
export type ListUsersArgs = z.infer<typeof ListUsersSchema>;
export type GetCardMembersArgs = z.infer<typeof GetCardMembersSchema>;
export type AddCardMembersArgs = z.infer<typeof AddCardMembersSchema>;
export type RemoveCardMembersArgs = z.infer<typeof RemoveCardMembersSchema>;
export type SetCardResponsibleArgs = z.infer<typeof SetCardResponsibleSchema>;
