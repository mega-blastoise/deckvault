export default {
  title: 'Architecture',
  description: 'System architecture of the DeckVault Pokemon TCG platform.',

  navigation: [
    { type: 'page', path: '/', title: 'Overview' },
    {
      type: 'group',
      title: 'Applications',
      items: [
        { type: 'page', path: '/frontend', title: 'Frontend (apps/web)' },
        { type: 'page', path: '/rest-api', title: 'REST API (apps/rest-api)' },
        { type: 'page', path: '/graphql-api', title: 'GraphQL API (apps/graphql-api)' }
      ]
    },
    {
      type: 'group',
      title: 'Data',
      items: [
        { type: 'page', path: '/databases', title: 'Databases' },
        { type: 'page', path: '/monorepo', title: 'Monorepo Structure' }
      ]
    }
  ],

  theme: {
    accentColor: '#7c3aed',
    darkMode: 'media'
  },

  output: {
    outDir: './site'
  }
};
