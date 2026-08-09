export default {
  title: 'DeckVault Web',
  description:
    'The SSR React frontend for deckvault.gg — Bun server, React 19, TanStack Query, and a Backend-for-Frontend layer over the REST and GraphQL services.',

  coverpage: {
    title: 'DeckVault Web',
    tagline: 'The deckvault.gg frontend',
    description:
      'A server-rendered React 19 application on the Bun runtime, fronting the Bun/TypeScript REST and GraphQL services through an aggregation + proxy BFF layer.',
    actions: [
      { label: 'Getting Started', href: '/getting-started', primary: true },
      { label: 'Architecture', href: '/architecture/request-lifecycle', primary: false }
    ],
    background: 'gradient'
  },

  navigation: [
    { type: 'page', path: '/', title: 'Overview' },
    {
      type: 'group',
      title: 'Getting Started',
      items: [
        { type: 'page', path: '/getting-started', title: 'Running Locally' },
        { type: 'page', path: '/project-structure', title: 'Project Structure' }
      ]
    },
    {
      type: 'group',
      title: 'Architecture',
      items: [
        { type: 'page', path: '/architecture/request-lifecycle', title: 'Request Lifecycle' },
        { type: 'page', path: '/architecture/ssr', title: 'SSR & Hydration' },
        { type: 'page', path: '/architecture/bff', title: 'The BFF Layer' },
        { type: 'page', path: '/architecture/circuit-breaker', title: 'Circuit Breaker' }
      ]
    },
    {
      type: 'group',
      title: 'Frontend',
      items: [
        { type: 'page', path: '/frontend/routing', title: 'Routing' },
        { type: 'page', path: '/frontend/data-fetching', title: 'Data Fetching' },
        { type: 'page', path: '/frontend/state', title: 'State & Contexts' },
        { type: 'page', path: '/frontend/components', title: 'Components & Storybook' }
      ]
    },
    {
      type: 'group',
      title: 'Reference',
      items: [
        { type: 'page', path: '/reference/configuration', title: 'Configuration' },
        { type: 'page', path: '/reference/bff-endpoints', title: 'BFF Endpoints' },
        { type: 'page', path: '/reference/adding-a-bff-endpoint', title: 'Adding a BFF Endpoint' },
        { type: 'page', path: '/reference/troubleshooting', title: 'Troubleshooting' }
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
    preset: 'catppuccin',
    darkMode: 'media'
  },

  codeTheme: 'github-dark-default',

  footer: {
    copyright: 'DeckVault — Project Johto · Internal Use Only'
  },

  output: {
    outDir: './site'
  }
};
