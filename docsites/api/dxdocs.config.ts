export default {
  title: 'API Reference',
  description: 'REST and GraphQL API reference for DeckVault.',

  navigation: [
    { type: 'page', path: '/', title: 'Overview' },
    {
      type: 'group',
      title: 'REST API',
      items: [
        { type: 'page', path: '/rest-auth', title: 'Auth' },
        { type: 'page', path: '/rest-cards', title: 'Cards & Sets' },
        { type: 'page', path: '/rest-decks', title: 'Decks' },
        { type: 'page', path: '/rest-collection', title: 'Collection' },
        { type: 'page', path: '/rest-meta', title: 'Meta & Local Meta' }
      ]
    },
    {
      type: 'group',
      title: 'GraphQL API',
      items: [
        { type: 'page', path: '/graphql', title: 'Schema & Queries' }
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
