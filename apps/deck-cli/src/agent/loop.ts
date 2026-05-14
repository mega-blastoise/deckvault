import Anthropic from '@anthropic-ai/sdk';

import type { McpClient } from '../mcp/client';
import { AGENT_TOOLS, dispatchTool } from './tools';

const MODEL = 'claude-sonnet-4-6';
const MAX_TURNS = 50;

export async function runAgentTurn(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
  systemPrompt: string,
  mcp: McpClient
): Promise<Anthropic.MessageParam[]> {
  const updated = [...messages];
  let turns = 0;

  while (true) {
    if (turns >= MAX_TURNS) {
      process.stderr.write(`Warning: agent reached maximum turn limit (${MAX_TURNS}). Ending session.\n`);
      break;
    }
    turns++;

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: AGENT_TOOLS as Anthropic.Tool[],
      messages: updated,
    });

    process.stdout.write('\n');

    let final: Anthropic.Message;
    try {
      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          process.stdout.write(event.delta.text);
        }
      }
      final = await stream.finalMessage();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Stream error: ${message}. Session may be incomplete.\n`);
      throw err;
    }
    updated.push({ role: 'assistant', content: final.content });

    if (final.stop_reason !== 'tool_use') {
      process.stdout.write('\n');
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type !== 'tool_use') continue;
      process.stdout.write(`\n[tool: ${block.name}]\n`);
      if (typeof block.input !== 'object' || block.input === null) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Tool error: invalid input shape from model (expected object, got ${block.input === null ? 'null' : typeof block.input})`,
        });
        continue;
      }
      const output = await dispatchTool(
        block.name,
        block.input as Record<string, unknown>,
        mcp
      );
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: output,
      });
    }

    updated.push({ role: 'user', content: toolResults });
  }

  return updated;
}
