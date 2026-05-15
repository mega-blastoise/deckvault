export default {
  title: 'johto',
  description: 'Competitive Pokémon TCG deck refinement CLI with Anthropic agent loop and browser mode.',

  navigation: [
    { type: 'page', path: '/', title: 'Overview' },
    {
      type: 'group',
      title: 'Getting Started',
      items: [
        { type: 'page', path: '/install', title: 'Install' },
        { type: 'page', path: '/quickstart', title: 'Quickstart' },
        { type: 'page', path: '/deck-format', title: 'Deck File Format' },
      ]
    },
    {
      type: 'group',
      title: 'Modes',
      items: [
        { type: 'page', path: '/agent-session', title: 'Agent Session (REPL)' },
        { type: 'page', path: '/browser-mode', title: 'Browser Mode' },
      ]
    },
    {
      type: 'group',
      title: 'Guides',
      items: [
        { type: 'page', path: '/strategy-guide', title: 'Strategy Guide' },
        { type: 'page', path: '/probability', title: 'Probability Analysis' },
      ]
    },
    {
      type: 'group',
      title: 'Reference',
      items: [
        { type: 'page', path: '/cli-reference', title: 'CLI Reference' },
        { type: 'page', path: '/mcp-tools', title: 'MCP Tools' },
      ]
    },
    {
      type: 'group',
      title: 'Contributing',
      items: [
        { type: 'page', path: '/development', title: 'Developing Locally' },
      ]
    }
  ],

  headerLinks: [
    {
      label: 'GitHub',
      href: 'https://github.com/mega-blastoise',
      icon: 'github'
    }
  ],

  theme: {
    darkMode: 'media'
  },

  output: {
    outDir: './site'
  }
};
