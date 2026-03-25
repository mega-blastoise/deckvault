export default {
  title: 'Deployment',
  description: 'Deployment architecture and process for the DeckVault platform.',

  navigation: [
    { type: 'page', path: '/', title: 'Overview' },
    {
      type: 'group',
      title: 'Infrastructure',
      items: [
        { type: 'page', path: '/infrastructure', title: 'Infrastructure' },
        { type: 'page', path: '/containers', title: 'Containers & Services' },
        { type: 'page', path: '/nginx', title: 'Nginx Routing' },
        { type: 'page', path: '/waf', title: 'Security' }
      ]
    },
    {
      type: 'group',
      title: 'Processes',
      items: [
        { type: 'page', path: '/deploy', title: 'Deploying' },
        { type: 'page', path: '/rollout-services', title: 'Rolling Out a Service' },
        { type: 'page', path: '/rollout-sqlite', title: 'Rolling Out a New Card Set' },
        { type: 'page', path: '/migrations', title: 'Database Migrations' },
        { type: 'page', path: '/health', title: 'Health Checks' }
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
