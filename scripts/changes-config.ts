export const COHORTS = {
  cli: {
    packages: [
      '@johto-ai/cli',
      '@johto-ai/cli-linux-x64',
      '@johto-ai/cli-linux-arm64',
      '@johto-ai/cli-darwin-x64',
      '@johto-ai/cli-darwin-arm64',
    ],
    versioning: 'lockstep',
  },
  mcpServer: {
    packages: [
      '@johto-ai/mcp-server-linux-x64',
      '@johto-ai/mcp-server-linux-arm64',
      '@johto-ai/mcp-server-darwin-x64',
      '@johto-ai/mcp-server-darwin-arm64',
    ],
    versioning: 'lockstep',
  },
  cardData: {
    packages: ['@johto-ai/card-data'],
    versioning: 'independent',
  },
} as const;
