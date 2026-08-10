import OpenAI from 'openai';

import type {
  AgentMessage,
  AgentToolCall,
  AssistantTurn,
  Provider,
  SendParams
} from './types';
import { ProviderUnreachableError } from './types';

export interface OpenAiResponsesOptions {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly effort: string;
  readonly maxTokens: number;
}

/** Output items the API returns and accepts back as conversation history. */
type OutputItem = Record<string, unknown> & { type?: string };

/**
 * The Responses API is the only OpenAI surface where function tools and
 * reasoning coexist — /v1/chat/completions rejects the combination on
 * gpt-5.6-terra with "use /v1/responses or set reasoning_effort to 'none'".
 */
function toInput(messages: readonly AgentMessage[]): OutputItem[] {
  const input: OutputItem[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      input.push({ role: 'user', content: message.content });
    } else if (message.role === 'assistant') {
      if (message.producedBy === 'openai' && Array.isArray(message.raw)) {
        // Echo the original items: reasoning items carry ids the API pairs
        // against later turns, and every function_call_output must reference a
        // call_id that appears here.
        input.push(...(message.raw as OutputItem[]));
      } else {
        // History from another provider — rebuild from canonical fields.
        if (message.text) {
          input.push({
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: message.text }]
          });
        }
        for (const call of message.toolCalls) {
          input.push({
            type: 'function_call',
            call_id: call.id,
            name: call.name,
            arguments: JSON.stringify(call.input)
          });
        }
      }
    } else {
      for (const result of message.results) {
        input.push({
          type: 'function_call_output',
          call_id: result.id,
          output: result.output
        });
      }
    }
  }
  return input;
}

export function createOpenAiResponsesProvider(options: OpenAiResponsesOptions): Provider {
  const client = new OpenAI({ apiKey: options.apiKey, baseURL: options.baseUrl });

  return {
    name: 'openai',
    model: options.model,
    endpoint: options.baseUrl,

    async send({ system, messages, tools, handlers }: SendParams): Promise<AssistantTurn> {
      let stream;
      try {
        stream = await client.responses.create({
          model: options.model,
          instructions: system,
          input: toInput(messages) as never,
          max_output_tokens: options.maxTokens,
          // "auto" is required to get any reasoning text back; without it the
          // reasoning items arrive with empty summaries.
          reasoning: { effort: options.effort as never, summary: 'auto' },
          tools: tools.map((t) => ({
            type: 'function' as const,
            name: t.name,
            description: t.description,
            parameters: t.parameters,
            strict: false
          })),
          stream: true
        });
      } catch (err) {
        if (err instanceof OpenAI.APIConnectionError) {
          throw new ProviderUnreachableError(
            'openai',
            options.baseUrl,
            'Check network connectivity, then run `johto doctor`.',
            err
          );
        }
        throw err;
      }

      let text = '';
      let reasoning = '';
      let reasoningOpen = false;
      let output: OutputItem[] = [];

      try {
        for await (const event of stream as AsyncIterable<Record<string, unknown>>) {
          const type = event['type'] as string | undefined;
          switch (type) {
            case 'response.reasoning_summary_part.added':
              if (!reasoningOpen) {
                handlers.onReasoningStart();
                reasoningOpen = true;
              }
              break;
            case 'response.reasoning_summary_text.delta': {
              const delta = String(event['delta'] ?? '');
              if (!reasoningOpen) {
                handlers.onReasoningStart();
                reasoningOpen = true;
              }
              reasoning += delta;
              handlers.onReasoning(delta);
              break;
            }
            case 'response.output_text.delta': {
              if (reasoningOpen) {
                handlers.onReasoningEnd();
                reasoningOpen = false;
              }
              const delta = String(event['delta'] ?? '');
              text += delta;
              handlers.onText(delta);
              break;
            }
            case 'response.completed': {
              const response = event['response'] as { output?: OutputItem[] } | undefined;
              output = response?.output ?? [];
              break;
            }
            default:
              break;
          }
        }
      } catch (err) {
        if (err instanceof OpenAI.APIConnectionError) {
          throw new ProviderUnreachableError(
            'openai',
            options.baseUrl,
            'Check network connectivity, then run `johto doctor`.',
            err
          );
        }
        throw err;
      } finally {
        if (reasoningOpen) handlers.onReasoningEnd();
      }

      const toolCalls: AgentToolCall[] = [];
      for (const item of output) {
        if (item['type'] !== 'function_call') continue;
        const name = String(item['name'] ?? '');
        if (!name) continue;
        handlers.onToolCall(name);
        let input: Record<string, unknown> = {};
        try {
          const parsed: unknown = JSON.parse(String(item['arguments'] ?? '{}'));
          if (typeof parsed === 'object' && parsed !== null) {
            input = parsed as Record<string, unknown>;
          }
        } catch {
          // Leave empty; dispatchTool reports the resulting error to the model.
        }
        toolCalls.push({ id: String(item['call_id'] ?? ''), name, input });
      }

      return {
        text,
        reasoning: reasoning || null,
        toolCalls,
        stopReason: toolCalls.length > 0 ? 'tool_use' : 'end',
        raw: output,
        producedBy: 'openai'
      };
    }
  };
}
