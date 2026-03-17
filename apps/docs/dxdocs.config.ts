export default {
  title: 'Project Johto',
  description: 'Internal platform documentation for the Pokemon TCG monorepo',

  coverpage: {
    title: 'Project Johto',
    tagline: 'Pokemon TCG Platform',
    description:
      'Internal engineering documentation — architecture, data pipelines, and operational runbooks.',
    actions: [
      { label: 'Data Sync Pipeline', href: '/data-sync/overview', primary: true },
      { label: 'Running the Pipeline', href: '/data-sync/running', primary: false }
    ],
    background: 'gradient'
  },

  navigation: [
    { type: 'page', path: '/', title: 'Introduction' },
    {
      type: 'group',
      title: 'Data Sync Pipeline',
      items: [
        { type: 'page', path: '/data-sync/overview', title: 'Overview' },
        { type: 'page', path: '/data-sync/fork-sync', title: 'Stage 1: Fork → @pokemon-data' },
        {
          type: 'page',
          path: '/data-sync/database-sync',
          title: 'Stage 2: Live API → Postgres & Neo4j'
        },
        {
          type: 'page',
          path: '/data-sync/sqlite-replication',
          title: 'Stage 3: SQLite & Replication'
        },
        { type: 'page', path: '/data-sync/running', title: 'Running the Pipeline' }
      ]
    }
  ],

  theme: {
    preset: 'catppuccin',
    darkMode: 'media'
  },

  footer: {
    copyright: 'Project Johto — Internal Use Only'
  }
};
