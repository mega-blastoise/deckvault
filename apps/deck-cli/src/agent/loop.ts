import type { McpClient } from '../mcp/client';
import type { AgentMessage, AgentToolResult, Provider, StreamHandlers } from '../providers/types';
import type { Renderer } from '../render/types';
import { AGENT_TOOLS, dispatchTool } from './tools';

const MAX_TURNS = 50;

function createHandlers(renderer: Renderer): StreamHandlers {
  return {
    onReasoningStart: () => renderer.emit({ type: 'reasoning-start' }),
    onReasoning: (text) => renderer.emit({ type: 'reasoning-delta', text }),
    onReasoningEnd: () => renderer.emit({ type: 'reasoning-end' }),
    onText: (text) => renderer.emit({ type: 'text-delta', text }),
    onToolCall: (name) => renderer.emit({ type: 'tool-call', name })
  };
}

export async function runAgentTurn(
  provider: Provider,
  messages: readonly AgentMessage[],
  systemPrompt: string,
  mcp: McpClient,
  renderer: Renderer
): Promise<AgentMessage[]> {
  const updated: AgentMessage[] = [...messages];
  const handlers = createHandlers(renderer);
  let turns = 0;

  while (true) {
    if (turns >= MAX_TURNS) {
      renderer.emit({
        type: 'notice',
        text: `Warning: agent reached maximum turn limit (${MAX_TURNS}). Ending session.`
      });
      break;
    }
    turns++;

    renderer.emit({ type: 'turn-start' });

    const turn = await provider.send({
      system: systemPrompt,
      messages: updated,
      tools: AGENT_TOOLS,
      handlers
    });

    updated.push({ role: 'assistant', ...turn });

    if (turn.stopReason !== 'tool_use') {
      renderer.emit({ type: 'turn-end' });
      break;
    }

    const results: AgentToolResult[] = [];
    for (const call of turn.toolCalls) {
      const { output, isError } = await dispatchTool(call.name, call.input, mcp);
      renderer.emit({ type: 'tool-result', name: call.name, isError });
      results.push({ id: call.id, name: call.name, output, isError });
    }

    updated.push({ role: 'tool', results });
  }

  return updated;
}
