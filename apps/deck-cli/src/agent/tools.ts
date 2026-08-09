import type { McpClient } from '../mcp/client';
import type { McpToolResult } from '../mcp/types';
import type { AgentToolDefinition } from '../providers/types';

export const AGENT_TOOLS: readonly AgentToolDefinition[] = [
  {
    name: 'search_cards',
    description:
      'Search Pokemon TCG cards by name, type, supertype, rarity, HP range, or set.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text search on card name or ID' },
        type: {
          type: 'string',
          description: 'Filter by Pokemon type (Fire, Water, etc.)'
        },
        supertype: {
          type: 'string',
          description: "Filter by supertype ('Pokémon', 'Trainer', 'Energy')"
        },
        rarity: { type: 'string', description: 'Filter by rarity' },
        set_id: { type: 'string', description: 'Filter by set ID' },
        hp_min: { type: 'integer', description: 'Minimum HP' },
        hp_max: { type: 'integer', description: 'Maximum HP' },
        limit: { type: 'integer', description: 'Max results (default 10, max 50)' },
        standard_only: {
          type: 'boolean',
          description: 'Restrict to Standard-legal cards (H/I/J marks). Default false.'
        },
        format: {
          type: 'string',
          description: 'Response format: "text" (default, markdown) or "json" (card objects).'
        }
      }
    }
  },
  {
    name: 'get_card_by_id',
    description: 'Get full details for a specific card by its ID (e.g. "sv3-125").',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Card ID' }
      }
    }
  },
  {
    name: 'compare_cards',
    description: 'Side-by-side comparison of two cards by ID.',
    parameters: {
      type: 'object',
      required: ['card_id_1', 'card_id_2'],
      properties: {
        card_id_1: { type: 'string' },
        card_id_2: { type: 'string' }
      }
    }
  },
  {
    name: 'analyze_deck_probability',
    description:
      'Compute hypergeometric opening-hand probabilities and prize risk for every card ' +
      'in a deck. Returns p(at least 1 in opening 7), p(prized), and a turn 1–4 draw curve ' +
      'per card. Use this when asked about consistency, copy counts, or singleton risk.',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the deck TOML or JSON file'
        },
        spotlight: {
          type: 'array',
          items: { type: 'string' },
          description: 'Card IDs to highlight in output'
        }
      }
    }
  },
  {
    name: 'validate_deck',
    description: 'Validate a deck file for Standard format legality.',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to deck TOML or JSON file'
        }
      }
    }
  }
];

export interface DispatchResult {
  readonly output: string;
  readonly isError: boolean;
}

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  mcp: McpClient
): Promise<DispatchResult> {
  try {
    const result = (await mcp.callTool(name, input)) as McpToolResult;
    const text = result.content.find((c) => c.type === 'text')?.text ?? '(no output)';
    return { output: text, isError: result.isError === true };
  } catch (err) {
    return {
      output: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
      isError: true
    };
  }
}
