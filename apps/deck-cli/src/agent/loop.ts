import type { McpClient } from '../mcp/client';
import type { AgentMessage, AgentToolResult, Provider, StreamHandlers } from '../providers/types';
import { AGENT_TOOLS, dispatchTool } from './tools';

const MAX_TURNS = 50;

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export interface AgentTurnOptions {
  readonly showReasoning: boolean;
}

function createHandlers(options: AgentTurnOptions): StreamHandlers {
  let indicatorShown = false;
  return {
    onReasoningStart() {
      if (options.showReasoning) {
        process.stdout.write(`\n${DIM}[reasoning]${RESET}\n${DIM}`);
      } else if (!indicatorShown) {
        process.stdout.write(`${DIM}thinking…${RESET}`);
        indicatorShown = true;
      }
    },
    onReasoning(delta) {
      if (options.showReasoning) process.stdout.write(delta);
    },
    onReasoningEnd() {
      if (options.showReasoning) {
        process.stdout.write(`${RESET}\n`);
      } else if (indicatorShown) {
        // Erase the placeholder so the answer starts on a clean line.
        process.stdout.write('\r' + ' '.repeat(10) + '\r');
        indicatorShown = false;
      }
    },
    onText(delta) {
      process.stdout.write(delta);
    },
    onToolCall(name) {
      process.stdout.write(`\n${DIM}[tool: ${name}]${RESET}\n`);
    }
  };
}

export async function runAgentTurn(
  provider: Provider,
  messages: readonly AgentMessage[],
  systemPrompt: string,
  mcp: McpClient,
  options: AgentTurnOptions
): Promise<AgentMessage[]> {
  const updated: AgentMessage[] = [...messages];
  let turns = 0;

  while (true) {
    if (turns >= MAX_TURNS) {
      process.stderr.write(
        `Warning: agent reached maximum turn limit (${MAX_TURNS}). Ending session.\n`
      );
      break;
    }
    turns++;

    process.stdout.write('\n');

    const turn = await provider.send({
      system: systemPrompt,
      messages: updated,
      tools: AGENT_TOOLS,
      handlers: createHandlers(options)
    });

    updated.push({ role: 'assistant', ...turn });

    if (turn.stopReason !== 'tool_use') {
      process.stdout.write('\n');
      break;
    }

    const results: AgentToolResult[] = [];
    for (const call of turn.toolCalls) {
      const { output, isError } = await dispatchTool(call.name, call.input, mcp);
      results.push({ id: call.id, name: call.name, output, isError });
    }

    updated.push({ role: 'tool', results });
  }

  return updated;
}
