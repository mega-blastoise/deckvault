export interface JohtoConfig {
  readonly anthropic?: {
    readonly api_key?: string;
    readonly model?: string;
  };
  readonly paths?: {
    readonly decks_dir?: string;
    readonly card_data?: string;
    readonly mcp_server?: string;
  };
  readonly defaults?: {
    readonly provider?: 'anthropic' | 'chrome';
  };
}
