import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ResourceTemplate,
  Prompt,
} from '@modelcontextprotocol/sdk/types.js';
import { config, safeLog } from './config.js';
import { client as kaitenClient, makeCtx } from './container.js';
import { logger } from './logging/index.js';
import { registerTools } from './tools/registry.js';
import {
  simplifyUser,
  simplifyCard,
} from './transformers.js';
import { VERSION } from './version.js';

// Config is loaded and validated in config.ts. The KaitenClient is built once
// in container.ts; here we only need the default-space id for resource listing.
const DEFAULT_SPACE_ID = config.KAITEN_DEFAULT_SPACE_ID;

if (DEFAULT_SPACE_ID) {
  safeLog.info(`Using default space ID: ${DEFAULT_SPACE_ID}`);
}

// Initialize MCP logger (will be set when server is ready)
const mcpLogger = logger.getMCPLogger();

// ============================================
// RESOURCE TEMPLATES
// ============================================

const resourceTemplates: ResourceTemplate[] = [
  {
    uriTemplate: "kaiten-card:///{cardId}",
    name: "Kaiten Card",
    description: "A Kaiten card with its details, comments, and metadata. Use this to fetch detailed information about a specific card.",
    mimeType: "application/json"
  },
  {
    uriTemplate: "kaiten-space:///{spaceId}",
    name: "Kaiten Space",
    description: "Details about a Kaiten space including its boards and settings.",
    mimeType: "application/json"
  },
  {
    uriTemplate: "kaiten-board:///{boardId}/cards",
    name: "Board Cards",
    description: "All active cards belonging to a specific Kaiten board.",
    mimeType: "application/json"
  },
  {
    uriTemplate: "kaiten-current-user:",
    name: "Current User",
    description: "Information about the authenticated user associated with the API token.",
    mimeType: "application/json"
  }
];

// ============================================
// SERVER PROMPT
// ============================================

const kaitenServerPrompt: Prompt = {
  name: "kaiten-server-prompt",
  description: "Instructions for using the Kaiten MCP server effectively",
  arguments: [],
};

// Cross-tool usage rules, consolidated ONCE here (P0 context-footprint fix).
// Advertised via the server `instructions` (sent at initialize, so every client
// sees them) AND reused as the prompt body. This is the single home for the
// functional Cyrillic the per-tool descriptions used to duplicate: the Russian
// root-word search rule and the Cyrillic→Latin user-name transliteration table.
const kaitenServerInstructions = `Kaiten MCP server — manage cards, comments, spaces, boards, and card members.

Default space: most operations use KAITEN_DEFAULT_SPACE_ID automatically. Pass space_id only to override; space_id=0 means ALL spaces (slow).

Searching cards (kaiten_search_cards):
• Narrow with board_id (or rely on the default space) and keep limit ≤20 to protect context.
• Russian card text is inflected — search by WORD ROOT, not the full form: "болгар" matches "Болгарии"/"болгарский"; "валют" matches "валюты"/"валютный".
• condition: 1=active (default), 2=archived (only when asked). Returns compact rows — use kaiten_get_card for full detail.

Finding users (kaiten_list_users): ALWAYS pass query — never call it bare (it dumps up to 100 users). Kaiten stores names in LATIN only, so transliterate Cyrillic first: Владимир→Vladimir/Vlad, Саранюк→Saranyuk, Алексей→Aleksey/Alex, Сергей→Sergey/Sergei, Юлия→Yulia/Julia.

Cards: create needs title + board_id (discover IDs via kaiten_list_boards/columns/lanes/types); update only the fields you change; assign by passing the user's id as owner_id. Comments support markdown and are visible to everyone.`;


// ============================================
// SERVER SETUP
// ============================================

export function createServer(): McpServer {
  // High-level McpServer owns ListTools + CallTool. The tool subsystem is
  // registered from the deep modules in ALL_TOOLS via registerTools(); each
  // tool's advertised JSON Schema is DERIVED from its Zod schema (the
  // single source of truth), replacing the ~2000-line hand-written tools[]
  // array that used to live here. Name/version/capabilities are unchanged.
  const server = new McpServer(
    {
      name: 'kaiten-mcp-server',
      version: VERSION,
    },
    {
      // Cross-tool usage rules are sent to the client at initialize, so they
      // no longer need to be duplicated inside every tool description.
      instructions: kaitenServerInstructions,
      capabilities: {
        tools: {},
        resources: {
          subscribe: false,
        },
        prompts: {},
        logging: {}, // Add logging capability
      },
    }
  );

  // Set MCP server for logger. The MCPLogger calls server.notification(), which
  // lives on the underlying low-level Server, exposed by McpServer as `.server`.
  mcpLogger.setServer(server.server);

  // ============================================
  // TOOLS — registered from ALL_TOOLS (Zod-derived schemas)
  // ============================================

  registerTools(server, makeCtx);

  // ============================================
  // RESOURCES + PROMPTS HANDLERS
  // ============================================
  // These keep the original bespoke behaviour (dynamic default-space card
  // listing, multi-protocol URI parsing incl. the OPAQUE `kaiten-current-user:`
  // URI, and the prompt) and are attached to the wrapped low-level Server via
  // `server.server`. McpServer only claims the resource/prompt request-handler
  // slots when registerResource/registerPrompt are called — which we do not —
  // so these custom handlers do not collide with it.

  server.server.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      if (!DEFAULT_SPACE_ID) {
        return { resources: [] };
      }

      // Reduced from 50 to 10 for faster startup (60-70% performance improvement)
      const cards = await kaitenClient.getCardsFromSpace(DEFAULT_SPACE_ID, 10);
      const resources = cards.map(card => ({
        uri: `kaiten-card:///${card.id}`,
        mimeType: "application/json" as const,
        name: card.title,
        description: `Card #${card.id}: ${card.title}`,
      }));

      return { resources };
    } catch (error) {
      console.error('[Kaiten MCP] Error listing resources:', error);
      return { resources: [] };
    }
  });

  server.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    try {
      const url = new URL(uri);
      const protocol = url.protocol.replace(':', '');
      const pathParts = url.pathname.replace(/^\/+/, '').split('/');

      if (protocol === 'kaiten-card') {
        const cardId = parseInt(pathParts[0]);
        if (isNaN(cardId)) {
          throw new Error(`Invalid card ID: ${pathParts[0]}`);
        }

        const card = await kaitenClient.getCard(cardId);
        const simplified = simplifyCard(card);

        return {
          contents: [{
            uri: uri,
            mimeType: "application/json",
            text: JSON.stringify(simplified, null, 2)
          }]
        };
      }

      if (protocol === 'kaiten-space') {
        const spaceId = parseInt(pathParts[0]);
        if (isNaN(spaceId)) {
          throw new Error(`Invalid space ID: ${pathParts[0]}`);
        }

        const space = await kaitenClient.getSpace(spaceId);

        return {
          contents: [{
            uri: uri,
            mimeType: "application/json",
            text: JSON.stringify(space, null, 2)
          }]
        };
      }

      if (protocol === 'kaiten-board') {
        const boardId = parseInt(pathParts[0]);
        if (isNaN(boardId)) {
          throw new Error(`Invalid board ID: ${pathParts[0]}`);
        }

        const cards = await kaitenClient.getCardsFromBoard(boardId, 50);
        const simplified = cards.map(simplifyCard);

        return {
          contents: [{
            uri: uri,
            mimeType: "application/json",
            text: JSON.stringify(simplified, null, 2)
          }]
        };
      }

      if (protocol === 'kaiten-current-user') {
        const user = await kaitenClient.getCurrentUser();

        return {
          contents: [{
            uri: uri,
            mimeType: "application/json",
            text: JSON.stringify(simplifyUser(user), null, 2)
          }]
        };
      }

      throw new Error(`Unsupported resource URI protocol: ${protocol}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read resource ${uri}: ${errorMessage}`);
    }
  });

  server.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    return { resourceTemplates };
  });

  // ============================================
  // PROMPTS HANDLERS
  // ============================================

  server.server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [kaitenServerPrompt]
    };
  });

  server.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name === kaitenServerPrompt.name) {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: kaitenServerInstructions
            }
          }
        ]
      };
    }
    throw new Error(`Prompt not found: ${request.params.name}`);
  });

  return server;
}
