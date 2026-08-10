import { resolve } from 'node:path';

import type { McpClient } from '../mcp/client';
import type { McpToolResult } from '../mcp/types';
import { EnrichedDeckSchema, type EnrichedDeck } from './types';

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

  // Validated rather than cast: this is the one place untrusted-shaped JSON
  // crosses from the Rust server into typed TypeScript, and a blind cast turns
  // a server-side shape change into an undefined-property crash somewhere far
  // away from the cause.
  const parsed = EnrichedDeckSchema.safeParse(JSON.parse(textContent.text));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`load_deck returned an unexpected shape for ${deckPath}:\n${issues}`);
  }
  return parsed.data;
}
