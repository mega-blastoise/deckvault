export interface McpContent {
  readonly type: string;
  readonly text: string;
}

export interface McpToolResult {
  readonly content: readonly McpContent[];
  readonly isError: boolean | null;
}
