import { simplifyCard } from '../transformers.js';
import type { ServerContext } from './kit.js';

/**
 * Render the full markdown "card sheet" for a single card.
 *
 * Ported VERBATIM from the `kaiten_get_card` case in src/server.ts (the ~90-line
 * markdown builder that runs when `format === 'markdown'`). Once Task 8 routes
 * get_card through this function, the characterization snapshot in
 * test/server.test.ts MUST stay byte-identical, so every string template, emoji,
 * field order, separator and trailing newline mirrors the live handler exactly.
 *
 * Two deliberate substitutions vs. the original (functionally identical):
 *   - the module global `API_URL` -> `ctx.config.KAITEN_API_URL`
 *   - the module global `DEFAULT_SPACE_ID` -> `ctx.config.KAITEN_DEFAULT_SPACE_ID`
 *   - `kaitenClient.*` -> `ctx.client.*`, with `ctx.signal` forwarded
 *
 * Logging now goes through `ctx.log.warning` (injected context logger) rather than
 * the module-global `safeLog`. It is a stderr-only side-effect (per the MCP I/O
 * rule) and never touches the returned markdown string, so it does not affect
 * byte-stability.
 */
export async function renderCardMarkdown(card: any, ctx: ServerContext): Promise<string> {
  const API_URL = ctx.config.KAITEN_API_URL;
  const DEFAULT_SPACE_ID = ctx.config.KAITEN_DEFAULT_SPACE_ID;
  const simplified = simplifyCard(card);

  // Markdown format (default)
  let output = `# ${simplified.title}\n\n`;
  output += `🔗 ${simplified.url}\n`;
  output += `📋 Board: ${simplified.board_title || 'N/A'}`;
  if (simplified.column_title) output += ` › ${simplified.column_title}`;
  if (simplified.lane_title) output += ` (${simplified.lane_title})`;
  output += `\n`;
  output += `👤 Owner: ${simplified.owner_name || 'Unassigned'}\n`;
  if (simplified.type_name) output += `🏷️ Type: ${simplified.type_name}\n`;
  if (simplified.size) output += `📊 Size: ${simplified.size}\n`;
  if (simplified.due_date) output += `📅 Due: ${simplified.due_date}\n`;
  if (simplified.asap) output += `⚡ ASAP\n`;
  if (simplified.blocked) {
    output += `🚫 BLOCKED`;
    if (simplified.block_reason) output += `: ${simplified.block_reason}`;
    output += `\n`;
    if (simplified.blocker_name) output += `   Blocker: ${simplified.blocker_name}\n`;
  }
  if (simplified.tags.length > 0) output += `🏷️ Tags: ${simplified.tags.join(', ')}\n`;
  if (simplified.members.length > 0) output += `👥 Members: ${simplified.members.join(', ')}\n`;
  output += `💬 Comments: ${simplified.comments_total}`;
  if (simplified.last_comment_date) output += ` (last: ${simplified.last_comment_date})`;
  output += `\n`;
  output += `🕐 Created: ${simplified.created || 'N/A'} | Updated: ${simplified.updated || 'N/A'}\n`;

  // Add card relationships info (from API counts)
  const hasParents = card.parents_count && card.parents_count > 0;
  const hasChildren = card.children_count && card.children_count > 0;

  if (hasParents || hasChildren) {
    output += `\n## 🔗 Related Cards\n`;

    if (hasParents) {
      output += `📌 Parent cards: ${card.parents_count}\n`;
    }

    if (hasChildren) {
      const doneCount = card.children_done || 0;
      const totalCount = card.children_count || 0;
      const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
      output += `📋 Subtasks: ${doneCount}/${totalCount} done (${progress}%)\n\n`;

      // Fetch children cards to show detailed list
      try {
        const children = await ctx.client.getCardChildren(card.id, ctx.signal);
        if (children && children.length > 0) {
          // Fetch full details for blocked cards (to get blocking reason)
          const childrenWithBlockingDetails = await Promise.all(
            children.map(async (child) => {
              if (child.blocked) {
                try {
                  const fullCard = await ctx.client.getCard(child.id, ctx.signal);
                  return fullCard;
                } catch (error) {
                  ctx.log.warning(`Failed to fetch blocking details for card ${child.id}: ${error}`);
                  return child;
                }
              }
              return child;
            })
          );

          childrenWithBlockingDetails.forEach((child, index) => {
            const baseUrl = API_URL!.replace('/api/latest', '');
            const childSpaceId = child.space_id || child.board?.space_id || DEFAULT_SPACE_ID || '';
            const childUrl = `${baseUrl}/space/${childSpaceId}/card/${child.id}`;

            // State icons: 1=queued (⏳), 2=in progress (🔄), 3=done (✅)
            const stateIcon = child.state === 3 ? '✅' : child.state === 2 ? '🔄' : '⏳';
            const ownerInfo = child.owner?.full_name ? ` · ${child.owner.full_name}` : '';

            // Blocking info
            const blockIcon = child.blocked ? ' 🚫' : '';

            output += `${index + 1}. ${stateIcon} [#${child.id}] ${child.title}${blockIcon}${ownerInfo}\n`;

            if (child.blocked && child.blockers && child.blockers.length > 0 && child.blockers[0].reason) {
              output += `   🚫 ${child.blockers[0].reason}\n`;
            }

            output += `   ${childUrl}\n`;
          });
        }
      } catch (error) {
        ctx.log.warning(`Failed to fetch children cards: ${error}`);
        output += `\nℹ️ Unable to load child cards details. Use kaiten_search_cards to find them.\n`;
      }
    }

    if (hasParents) {
      output += `\nℹ️ To view parent card details, search by parent card ID in Kaiten.\n`;
    }
  }

  if (simplified.description) {
    output += `\n## Description\n${simplified.description}\n`;
  }

  return output;
}

/**
 * Render the human-readable numbered summary for a card search.
 *
 * Ported VERBATIM from the `kaiten_search_cards` case in src/server.ts (the
 * summary-building block). This returns the summary string BEFORE
 * `truncateResponse()` is applied — truncation stays in the handler/tool so this
 * renderer is pure and deterministic (no I/O, no logging).
 *
 * @param cards     the raw cards array from the client (only `.length` is read)
 * @param processed the verbosity-processed cards used for the per-card lines
 * @param args      the validated search args (query, board_id, verbosity)
 * @param params    the built search params (only `.space_id` is read)
 */
export function renderSearchSummary(
  cards: any[],
  processed: any[],
  args: any,
  params: Record<string, unknown>,
): string {
  const verbosity = args.verbosity || 'normal';

  // Create human-readable summary
  let summary = `Found ${cards.length} card(s)`;
  if (args.query) summary += ` matching "${args.query}"`;
  if (params.space_id) summary += ` in space ${params.space_id}`;
  if (args.board_id) summary += ` on board ${args.board_id}`;
  summary += `\nVerbosity: ${verbosity}\n\n`;

  // Format based on verbosity
  if (verbosity === 'minimal') {
    // Minimal: just ID, title, board
    processed.forEach((card, index) => {
      summary += `${index + 1}. [${card.id}] ${card.title}\n`;
    });
  } else {
    // Normal/detailed: include more details.
    //
    // `normal` verbosity passes SIMPLIFIED cards (carrying the derived
    // board_title/owner_name/url). `detailed` verbosity passes RAW API cards
    // (nested board/owner objects, no derived fields, no url). Read both shapes
    // so detailed no longer renders "N/A"/"Unassigned"/"🔗 undefined"; for
    // simplified cards the `??` fallbacks never trigger and the `url` is always
    // present, so the normal output stays byte-identical.
    processed.forEach((card, index) => {
      const boardTitle = card.board_title ?? card.board?.title;
      const ownerName = card.owner_name ?? card.owner?.full_name;
      const url = card.url;
      summary += `${index + 1}. ${card.title}\n`;
      summary += `   📋 Board: ${boardTitle || 'N/A'}\n`;
      summary += `   👤 Owner: ${ownerName || 'Unassigned'}\n`;
      if (card.asap) summary += `   ⚡ ASAP\n`;
      if (card.blocked) summary += `   🚫 BLOCKED\n`;
      if (url) summary += `   🔗 ${url}\n`;
      summary += `   🕐 Updated: ${card.updated || 'N/A'}\n\n`;
    });
  }

  summary += `\nℹ️ Use kaiten_get_card with card ID for full details.`;

  return summary;
}
