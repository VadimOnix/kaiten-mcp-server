import { defineTool } from '../kit.js';
import { GetCardMembersSchema } from '../../schemas.js';
import { MemberListOutput } from '../../output-schemas.js';
import { applyMemberVerbosity } from '../../utils.js';
import { GET_CARD_MEMBERS_DESC } from './descriptions.js';

/**
 * kaiten_get_card_members — read tool. Fetches the card's members and runs them
 * through applyMemberVerbosity (default 'normal'), preserving the `type` field
 * (1 = participant, 2 = responsible) at every verbosity level.
 */
export const getCardMembers = defineTool({
  name: 'kaiten_get_card_members',
  description: GET_CARD_MEMBERS_DESC,
  schema: GetCardMembersSchema,
  outputSchema: MemberListOutput,
  annotations: { readOnly: true },
  handler: async ({ card_id, verbosity }, ctx) => {
    const members = await ctx.client.getCardMembers(card_id, ctx.signal);
    return applyMemberVerbosity(members, verbosity ?? 'normal');
  },
});
