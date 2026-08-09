import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import type {
  AgentMessage,
  AgentToolCall,
  AssistantTurn,
  Provider,
  ProviderName,
  SendParams
} from './types';
import { ProviderUnreachableError } from './types';

export interface OpenAiCompatOptions {
  readonly provider: ProviderName;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly maxTokens: number;
  readonly unreachableHint: string;
}

interface ToolCallAccumulator {
  id: string;
  name: string;
  args: string;
}

/**
 * Reasoning is not part of the OpenAI schema. Ollama surfaces it as `reasoning`
 * and llama.cpp as `reasoning_content`, both on the streaming delta, so read
 * whichever the endpoint happens to send.
 */
function readReasoningDelta(delta: Record<string, unknown>): string | undefined {
  const value = delta['reasoning'] ?? delta['reasoning_content'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function toApiMessages(
  system: string,
  messages: readonly AgentMessage[]
): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [{ role: 'system', content: system }];
  for (const message of messages) {
    if (message.role === 'user') {
      out.push({ role: 'user', content: message.content });
    } else if (message.role === 'assistant') {
      out.push(message.raw as ChatCompletionMessageParam);
    } else {
      for (const result of message.results) {
        out.push({ role: 'tool', tool_call_id: result.id, content: result.output });
      }
    }
  }
  return out;
}

export function createOpenAiCompatProvider(options: OpenAiCompatOptions): Provider {
  const client = new OpenAI({ apiKey: options.apiKey, baseURL: options.baseUrl });

  return {
    name: options.provider,
    model: options.model,
    endpoint: options.baseUrl,

    async send({ system, messages, tools, handlers }: SendParams): Promise<AssistantTurn> {
      let stream;
      try {
        stream = await client.chat.completions.create({
          model: options.model,
          max_completion_tokens: options.maxTokens,
          stream: true,
          messages: toApiMessages(system, messages),
          tools: tools.map((t) => ({
            type: 'function' as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters
            }
          }))
        });
      } catch (err) {
        if (err instanceof OpenAI.APIConnectionError) {
          throw new ProviderUnreachableError(
            options.provider,
            options.baseUrl,
            options.unreachableHint,
            err
          );
        }
        throw err;
      }

      let text = '';
      let reasoning = '';
      let reasoningOpen = false;
      let finishReason: string | null = null;
      const accumulators = new Map<number, ToolCallAccumulator>();

      try {
        for await (const chunk of stream) {
          const choice = chunk.choices[0];
          if (!choice) continue;
          if (choice.finish_reason) finishReason = choice.finish_reason;

          const delta = choice.delta as unknown as Record<string, unknown>;

          const reasoningDelta = readReasoningDelta(delta);
          if (reasoningDelta) {
            if (!reasoningOpen) {
              handlers.onReasoningStart();
              reasoningOpen = true;
            }
            reasoning += reasoningDelta;
            handlers.onReasoning(reasoningDelta);
          }

          if (typeof choice.delta.content === 'string' && choice.delta.content.length > 0) {
            if (reasoningOpen) {
              handlers.onReasoningEnd();
              reasoningOpen = false;
            }
            text += choice.delta.content;
            handlers.onText(choice.delta.content);
          }

          // Tool calls stream as fragments keyed by index: the id and name
          // arrive once, then arguments accumulate across many chunks.
          for (const part of choice.delta.tool_calls ?? []) {
            const existing = accumulators.get(part.index) ?? { id: '', name: '', args: '' };
            if (part.id) existing.id = part.id;
            if (part.function?.name) existing.name = part.function.name;
            if (part.function?.arguments) existing.args += part.function.arguments;
            accumulators.set(part.index, existing);
          }
        }
      } catch (err) {
        if (err instanceof OpenAI.APIConnectionError) {
          throw new ProviderUnreachableError(
            options.provider,
            options.baseUrl,
            options.unreachableHint,
            err
          );
        }
        throw err;
      } finally {
        if (reasoningOpen) handlers.onReasoningEnd();
      }

      const toolCalls: AgentToolCall[] = [];
      for (const acc of accumulators.values()) {
        if (!acc.name) continue;
        handlers.onToolCall(acc.name);
        let input: Record<string, unknown> = {};
        try {
          const parsed: unknown = JSON.parse(acc.args || '{}');
          if (typeof parsed === 'object' && parsed !== null) {
            input = parsed as Record<string, unknown>;
          }
        } catch {
          // Leave input empty; dispatchTool surfaces the resulting tool error
          // to the model, which is recoverable, unlike throwing here.
        }
        toolCalls.push({ id: acc.id, name: acc.name, input });
      }

      const raw: ChatCompletionMessageParam = {
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length > 0
          ? {
              tool_calls: toolCalls.map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: { name: c.name, arguments: JSON.stringify(c.input) }
              }))
            }
          : {})
      };

      return {
        text,
        reasoning: reasoning || null,
        toolCalls,
        stopReason: toolCalls.length > 0 || finishReason === 'tool_calls' ? 'tool_use' : 'end',
        raw
      };
    }
  };
}
