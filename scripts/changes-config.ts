export const COHORTS = {
  cli: {
    packages: [
      '@johto/cli',
      '@johto/cli-linux-x64',
      '@johto/cli-linux-arm64',
      '@johto/cli-darwin-x64',
      '@johto/cli-darwin-arm64',
    ],
    versioning: 'lockstep',
  },
  mcpServer: {
    packages: [
      '@johto/mcp-server-linux-x64',
      '@johto/mcp-server-linux-arm64',
      '@johto/mcp-server-darwin-x64',
      '@johto/mcp-server-darwin-arm64',
    ],
    versioning: 'lockstep',
  },
  cardData: {
    packages: ['@johto/card-data'],
    versioning: 'independent',
  },
} as const;
