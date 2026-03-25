export default {
  title: 'Development',
  description: 'Development workflow and local setup for DeckVault.',

  navigation: [
    { type: 'page', path: '/', title: 'Getting Started' },
    { type: 'page', path: '/local-dev', title: 'Local Development' },
    {
      type: 'group',
      title: 'Workflow',
      items: [
        { type: 'page', path: '/environment', title: 'Environment Variables' },
        { type: 'page', path: '/running', title: 'Running Services' },
        { type: 'page', path: '/building', title: 'Building' },
        { type: 'page', path: '/testing', title: 'Testing & Linting' }
      ]
    },
    {
      type: 'group',
      title: 'Guides',
      items: [
        { type: 'page', path: '/adding-migration', title: 'Adding a Migration' },
        { type: 'page', path: '/adding-route', title: 'Adding a REST Route' }
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
