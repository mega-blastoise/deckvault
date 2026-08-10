import Anthropic from '@anthropic-ai/sdk';

import type {
  AgentMessage,
  AgentToolCall,
  AssistantTurn,
  Provider,
  SendParams
} from './types';
import { ProviderUnreachableError } from './types';

export interface AnthropicProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly effort: string;
  readonly maxTokens: number;
}

function toApiMessages(messages: readonly AgentMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      out.push({ role: 'user', content: message.content });
    } else if (message.role === 'assistant') {
      if (message.producedBy === 'anthropic') {
        // Echo the original content blocks verbatim: thinking blocks carry
        // signatures the API rejects if modified, and every tool_result must
        // reference a tool_use id that actually appears here.
        out.push({ role: 'assistant', content: message.raw as Anthropic.ContentBlockParam[] });
      } else {
        // History from another provider — rebuild from canonical fields.
        // Reasoning is dropped: thinking blocks are only valid when produced by
        // this model, and tool_use ids are preserved so tool_results still pair.
        const blocks: Anthropic.ContentBlockParam[] = [];
        if (message.text) blocks.push({ type: 'text', text: message.text });
        for (const call of message.toolCalls) {
          blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
        }
        if (blocks.length > 0) out.push({ role: 'assistant', content: blocks });
      }
    } else {
      out.push({
        role: 'user',
        content: message.results.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.id,
          content: r.output,
          is_error: r.isError
        }))
      });
    }
  }
  return out;
}

export function createAnthropicProvider(options: AnthropicProviderOptions): Provider {
  const client = new Anthropic({ apiKey: options.apiKey });

  return {
    name: 'anthropic',
    model: options.model,
    endpoint: 'https://api.anthropic.com',

    async send({ system, messages, tools, handlers }: SendParams): Promise<AssistantTurn> {
      const stream = client.messages.stream({
        model: options.model,
        max_tokens: options.maxTokens,
        system,
        // budget_tokens was removed on Sonnet 5 and returns a 400; adaptive is
        // the only on-mode. display defaults to "omitted", which emits thinking
        // blocks with empty text — summarized is required to surface anything.
        thinking: { type: 'adaptive', display: 'summarized' },
        output_config: { effort: options.effort },
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters as Anthropic.Tool.InputSchema
        })),
        messages: toApiMessages(messages)
      } as Anthropic.MessageStreamParams);

      let reasoningOpen = false;
      try {
        for await (const event of stream) {
          if (event.type !== 'content_block_delta') continue;
          if (event.delta.type === 'text_delta') {
            if (reasoningOpen) {
              handlers.onReasoningEnd();
              reasoningOpen = false;
            }
            handlers.onText(event.delta.text);
          } else if (event.delta.type === 'thinking_delta') {
            if (!reasoningOpen) {
              handlers.onReasoningStart();
              reasoningOpen = true;
            }
            handlers.onReasoning(event.delta.thinking);
          }
        }
      } catch (err) {
        if (err instanceof Anthropic.APIConnectionError) {
          throw new ProviderUnreachableError(
            'anthropic',
            'https://api.anthropic.com',
            'Check network connectivity, then run `johto doctor`.',
            err
          );
        }
        throw err;
      } finally {
        if (reasoningOpen) handlers.onReasoningEnd();
      }

      const final = await stream.finalMessage();

      let text = '';
      let reasoning = '';
      const toolCalls: AgentToolCall[] = [];
      for (const block of final.content) {
        if (block.type === 'text') text += block.text;
        else if (block.type === 'thinking') reasoning += block.thinking;
        else if (block.type === 'tool_use') {
          handlers.onToolCall(block.name);
          toolCalls.push({
            id: block.id,
            name: block.name,
            input:
              typeof block.input === 'object' && block.input !== null
                ? (block.input as Record<string, unknown>)
                : {}
          });
        }
      }

      return {
        text,
        reasoning: reasoning || null,
        toolCalls,
        stopReason: final.stop_reason === 'tool_use' ? 'tool_use' : 'end',
        raw: final.content,
        producedBy: 'anthropic'
      };
    }
  };
}
