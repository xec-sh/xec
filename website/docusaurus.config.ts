import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

import { themes as prismThemes } from 'prism-react-renderer';

const config: Config = {
  title: 'Xec',
  tagline: 'One $ for every environment',

  // Rspack instead of Webpack, SWC instead of Babel and Terser, Lightning CSS
  // for minification. `v4` stays off — it is a separate opt-in and changes
  // routing behaviour; `ssgWorkerThreads` is the one sub-flag that needs it.
  future: {
    faster: {
      rspackBundler: true,
      rspackPersistentCache: true,
      swcJsLoader: true,
      swcJsMinimizer: true,
      swcHtmlMinimizer: true,
      lightningCssMinimizer: true,
      mdxCrossCompilerCache: true,
      ssgWorkerThreads: false,
    },
  },
  favicon: 'img/favicon.svg',

  headTags: [
    {
      tagName: 'link',
      attributes: {
        rel: 'alternate icon',
        type: 'image/x-icon',
        href: '/img/favicon.ico',
      },
    },
  ],

  // Production URL for GitHub Pages
  url: 'https://xec.sh',
  baseUrl: '/', // Use root path for custom domain

  scripts: [{ src: 'https://analytics.ry.ht/script.js', defer: true, 'data-website-id': 'f53a4e1e-5727-410b-b9ce-8baf228f0128' }],

  // GitHub pages deployment config
  organizationName: 'xec-js',
  projectName: 'xec',

  onBrokenLinks: 'warn',

  // i18n configuration
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
    localeConfigs: {
      en: {
        label: 'English',
        direction: 'ltr',
        htmlLang: 'en-US',
        calendar: 'gregory',
        path: 'en',
      },
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/xec-sh/xec/tree/main/docs/',
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
          versions: {
            current: {
              label: 'Current',
              path: '',
            },
          },
          remarkPlugins: [
            [require('remark-math'), { strict: false }],
          ],
          rehypePlugins: [
            [require('rehype-katex'), { strict: false }],
          ],
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          lastmod: 'date',
          changefreq: 'weekly',
          priority: 0.5,
          ignorePatterns: ['/tags/**'],
          filename: 'sitemap.xml',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: ['@docusaurus/theme-mermaid'],

  clientModules: [require.resolve('./src/theme/MermaidViewer.js')],

  plugins: [
    [
      '@docusaurus/plugin-ideal-image',
      {
        quality: 70,
        max: 1030,
        min: 640,
        steps: 2,
        disableInDev: false,
      },
    ],
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        language: ['en'],
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
        docsRouteBasePath: '/docs',
        indexDocs: true,
        indexBlog: false,
        indexPages: false,
        removeDefaultStopWordFilter: false,
        removeDefaultStemmer: false,
        searchResultLimits: 8,
        searchResultContextMaxLength: 50,
      },
    ],
  ],

  markdown: {
    mermaid: true,
    // `.md` is parsed as CommonMark, `.mdx` as MDX. Under the default, every
    // `${...}` in a documentation page is a JSX expression waiting to be
    // evaluated — and this is a shell-execution project, so template literals
    // are everywhere. One page with `` .pipe`${dynamicPart}` `` in it failed
    // the whole build with "dynamicPart is not defined". No page here uses
    // MDX features, so nothing is given up.
    format: 'detect',
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  themeConfig: {
    // Social card
    image: 'img/xec-social-card.png',

    // Theme customization
    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },

    // Announcement bar
    announcementBar: {
      id: 'alpha_version',
      content: '🚧 Xec is currently in alpha. APIs may change.',
      backgroundColor: '#3F2B9C',
      textColor: '#E0D9FF',
      isCloseable: true,
    },

    // Meta tags
    metadata: [
      { name: 'keywords', content: 'xec, universal execution, typescript, ssh, docker, kubernetes, command execution, automation, devops' },
      { name: 'description', content: 'TypeScript command execution across local, SSH, Docker and Kubernetes — one $ API, typed results, connection pooling.' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Xec' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],

    // Navigation
    navbar: {
      title: 'Xec',
      logo: {
        alt: 'Xec Logo',
        src: 'img/logo.svg',
        srcDark: 'img/logo-dark.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/xec-sh/xec',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub repository',
        },
      ],
    },

    // Footer
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/introduction',
            },
            {
              label: 'Execution Engine',
              to: '/docs/core/execution-engine/overview',
            },
            {
              label: 'Commands',
              to: '/docs/commands/overview',
            },
            {
              label: 'Configuration',
              to: '/docs/configuration/overview',
            },
          ],
        },
        {
          title: 'Resources',
          items: [
            {
              label: 'Recipes',
              to: '/docs/recipes',
            },
            {
              label: 'Guides',
              to: '/docs/guides/automation/first-automation',
            },
            {
              label: 'Migration',
              to: '/docs/migration/from-npm-scripts',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/xec-sh/xec',
            },
            {
              label: 'Discussions',
              href: 'https://github.com/xec-sh/xec/discussions',
            },
            {
              label: 'Issues',
              href: 'https://github.com/xec-sh/xec/issues',
            },
            {
              label: 'Contributing',
              href: 'https://github.com/xec-sh/xec/blob/main/CONTRIBUTING.md',
            },
          ],
        },
        {
          title: 'Project',
          items: [
            {
              label: 'Roadmap',
              href: 'https://github.com/xec-sh/xec/projects',
            },
            {
              label: 'Changelog',
              href: 'https://github.com/xec-sh/xec/blob/main/CHANGELOG.md',
            },
            {
              label: 'License',
              href: 'https://github.com/xec-sh/xec/blob/main/LICENSE',
            },
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} Xec.`,
    },

    // Prism code highlighting
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'yaml', 'typescript', 'javascript', 'diff'],
    },

    mermaid: {
      // Follows the site's light/dark toggle rather than picking one and
      // leaving half the readers with a diagram that fights the page.
      theme: { light: 'neutral', dark: 'dark' },
      options: {
        flowchart: {
          curve: 'basis',
          padding: 15,
          nodeSpacing: 50,
          rankSpacing: 55,
          defaultRenderer: 'dagre-wrapper',
          htmlLabels: true,
        },
        sequence: {
          actorMargin: 40,
          boxMargin: 10,
          mirrorActors: false,
        },
        themeVariables: {
          nodeBorder: '1px',
          clusterBorder: '1px',
          fontFamily: 'var(--ifm-font-family-base)',
          fontSize: '14px',
        },
      },
    },

    // Search configuration
    // algolia: {
    //   appId: 'YOUR_APP_ID', // We'll set this up later
    //   apiKey: 'YOUR_SEARCH_API_KEY',
    //   indexName: 'xec',
    //   contextualSearch: true,
    //   searchPagePath: 'search',
    // },
  } satisfies Preset.ThemeConfig,
};

export default config;