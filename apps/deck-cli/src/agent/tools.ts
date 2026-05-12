import type Anthropic from '@anthropic-ai/sdk';

import type { McpClient } from '../mcp/client';
import type { McpToolResult } from '../mcp/types';

export type AnthropicTool = Anthropic.Tool;

export const AGENT_TOOLS: readonly AnthropicTool[] = [
  {
    name: 'search_cards',
    description:
      'Search Pokemon TCG cards by name, type, supertype, rarity, HP range, or set.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Text search on card name or ID' },
        type: {
          type: 'string',
          description: 'Filter by Pokemon type (Fire, Water, etc.)',
        },
        supertype: {
          type: 'string',
          description: "Filter by supertype ('Pokémon', 'Trainer', 'Energy')",
        },
        rarity: { type: 'string', description: 'Filter by rarity' },
        set_id: { type: 'string', description: 'Filter by set ID' },
        hp_min: { type: 'integer', description: 'Minimum HP' },
        hp_max: { type: 'integer', description: 'Maximum HP' },
        limit: { type: 'integer', description: 'Max results (default 10, max 50)' },
        standard_only: { type: 'boolean', description: 'Restrict to Standard-legal cards (H/I/J marks). Default false.' },
      },
    },
  },
  {
    name: 'get_card_by_id',
    description: 'Get full details for a specific card by its ID (e.g. "sv3-125").',
    input_schema: {
      type: 'object' as const,
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Card ID' },
      },
    },
  },
  {
    name: 'compare_cards',
    description: 'Side-by-side comparison of two cards by ID.',
    input_schema: {
      type: 'object' as const,
      required: ['card_id_1', 'card_id_2'],
      properties: {
        card_id_1: { type: 'string' },
        card_id_2: { type: 'string' },
      },
    },
  },
  {
    name: 'validate_deck',
    description: 'Validate a deck file for Standard format legality.',
    input_schema: {
      type: 'object' as const,
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to deck TOML or JSON file',
        },
      },
    },
  },
];

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  mcp: McpClient
): Promise<string> {
  try {
    const result = (await mcp.callTool(name, input)) as McpToolResult;
    return result.content.find((c) => c.type === 'text')?.text ?? '(no output)';
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
