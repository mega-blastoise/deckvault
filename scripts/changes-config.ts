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
  /**
   * Repo-only work that ships in no package: build scripts, turbo config, CI,
   * docs, developer tooling. Filing these under `cli` was the only option and
   * bumped five published packages for a change none of them contain.
   *
   * An empty package list is meaningful, not a placeholder — `release` records
   * the entry in CHANGELOG.md and clears it from `.changes/`, but publishes and
   * bumps nothing.
   */
  internal: {
    packages: [],
    versioning: 'none',
  },
} as const;
