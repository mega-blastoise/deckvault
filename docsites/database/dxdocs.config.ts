export default {
  title: 'Database',
  description: 'Database architecture and schema reference for DeckVault.',

  navigation: [
    { type: 'page', path: '/', title: 'Overview' },
    {
      type: 'group',
      title: 'Databases',
      items: [
        { type: 'page', path: '/sqlite', title: 'SQLite (Pokemon Data)' },
        { type: 'page', path: '/postgres', title: 'PostgreSQL (User Data)' }
      ]
    },
    {
      type: 'group',
      title: 'Migrations',
      items: [
        { type: 'page', path: '/migrations', title: 'Migration System' },
        { type: 'page', path: '/schema', title: 'Schema Reference' }
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
