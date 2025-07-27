import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

import { themes as prismThemes } from 'prism-react-renderer';

const config: Config = {
  title: 'Xec',
  tagline: 'Modern Infrastructure Automation',
  favicon: 'img/favicon.ico',

  // Production URL for GitHub Pages
  url: 'https://xec.sh',
  baseUrl: '/', // Use root path for custom domain

  // GitHub pages deployment config
  organizationName: 'xec-js',
  projectName: 'xec',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  // i18n configuration
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ru'],
    localeConfigs: {
      en: {
        label: 'English',
        direction: 'ltr',
        htmlLang: 'en-US',
        calendar: 'gregory',
        path: 'en',
      },
      ru: {
        label: 'Русский',
        direction: 'ltr',
        htmlLang: 'ru-RU',
        calendar: 'gregory',
        path: 'ru',
      },
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/xec-sh/xec/tree/main/apps/docs/',
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
        blog: {
          showReadingTime: true,
          editUrl: 'https://github.com/xec-sh/xec/tree/main/apps/docs/',
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
          remarkPlugins: [
            [require('remark-math'), { strict: false }],
          ],
          rehypePlugins: [
            [require('rehype-katex'), { strict: false }],
          ],
        },
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
  ],

  markdown: {
    mermaid: true,
  },

  themeConfig: {
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
      backgroundColor: '#fafbfc',
      textColor: '#091E42',
      isCloseable: true,
    },

    // Meta tags
    metadata: [
      { name: 'keywords', content: 'command execution, automation, devops, shell, typescript, xec' },
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
          to: '/blog',
          label: 'Blog',
          position: 'left',
        },
        {
          type: 'localeDropdown',
          position: 'right',
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
              to: '/docs/intro',
            },
            {
              label: 'CLI Reference',
              to: '/docs/projects/cli',
            },
            {
              label: 'Core Framework',
              to: '/docs/projects/core',
            },
          ],
        },
        {
          title: 'Resources',
          items: [
            {
              label: 'Examples',
              to: '/docs/projects/core/examples',
            },
            {
              label: 'API Reference',
              to: '/docs/projects/core/api-reference',
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
              label: 'Blog',
              to: '/blog',
            },
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