export const PROVIDERS = ['anthropic', 'openai', 'ollama', 'llamacpp'] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export function isProviderName(value: string): value is ProviderName {
  return (PROVIDERS as readonly string[]).includes(value);
}

export interface AgentToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

export interface AgentToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export interface AgentToolResult {
  readonly id: string;
  readonly name: string;
  readonly output: string;
  readonly isError: boolean;
}

/**
 * `raw` carries the provider's own wire representation of the turn. Anthropic
 * requires thinking blocks to be echoed back byte-identical across tool_result
 * turns, and OpenAI requires its own tool_calls shape, so neither can be
 * reconstructed losslessly from the canonical fields alone.
 */
export interface AssistantTurn {
  readonly text: string;
  readonly reasoning: string | null;
  readonly toolCalls: readonly AgentToolCall[];
  readonly stopReason: 'end' | 'tool_use';
  readonly raw: unknown;
}

export type AgentMessage =
  | { readonly role: 'user'; readonly content: string }
  | ({ readonly role: 'assistant' } & AssistantTurn)
  | { readonly role: 'tool'; readonly results: readonly AgentToolResult[] };

export interface StreamHandlers {
  readonly onText: (delta: string) => void;
  readonly onReasoningStart: () => void;
  readonly onReasoning: (delta: string) => void;
  readonly onReasoningEnd: () => void;
  readonly onToolCall: (name: string) => void;
}

export interface SendParams {
  readonly system: string;
  readonly messages: readonly AgentMessage[];
  readonly tools: readonly AgentToolDefinition[];
  readonly handlers: StreamHandlers;
}

export interface Provider {
  readonly name: ProviderName;
  readonly model: string;
  readonly endpoint: string;
  send(params: SendParams): Promise<AssistantTurn>;
}

export class ProviderUnreachableError extends Error {
  constructor(
    readonly provider: ProviderName,
    readonly endpoint: string,
    readonly hint: string,
    cause?: unknown
  ) {
    super(
      `Cannot reach ${provider} at ${endpoint}\n  → ${hint}` +
        (cause instanceof Error ? `\n  (${cause.message})` : '')
    );
    this.name = 'ProviderUnreachableError';
  }
}
