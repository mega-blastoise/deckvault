import Anthropic from '@anthropic-ai/sdk';

import type { McpClient } from '../mcp/client';
import { AGENT_TOOLS, dispatchTool } from './tools';

const MODEL = 'claude-sonnet-4-6';

export async function runAgentTurn(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
  systemPrompt: string,
  mcp: McpClient
): Promise<Anthropic.MessageParam[]> {
  const updated = [...messages];

  while (true) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: AGENT_TOOLS as Anthropic.Tool[],
      messages: updated,
    });

    process.stdout.write('\n');

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        process.stdout.write(event.delta.text);
      }
    }

    const final = await stream.finalMessage();
    updated.push({ role: 'assistant', content: final.content });

    if (final.stop_reason !== 'tool_use') {
      process.stdout.write('\n');
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type !== 'tool_use') continue;
      process.stdout.write(`\n[tool: ${block.name}]\n`);
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
