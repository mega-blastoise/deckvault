import { resolve } from 'node:path';

import type { McpClient } from '../mcp/client';
import type { McpToolResult } from '../mcp/types';
import type { EnrichedDeck } from './types';

export async function loadAndEnrichDeck(
  deckPath: string,
  mcp: McpClient
): Promise<EnrichedDeck> {
  const absolutePath = resolve(deckPath);
  const result = (await mcp.callTool('load_deck', { path: absolutePath })) as McpToolResult;

  if (result.isError) {
    throw new Error(`MCP load_deck failed for ${deckPath}`);
  }

  const textContent = result.content.find((c) => c.type === 'text');
  if (!textContent) {
    throw new Error('load_deck returned no text content');
  }

  return JSON.parse(textContent.text) as EnrichedDeck;
}
