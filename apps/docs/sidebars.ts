import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  // Main documentation sidebar
  docsSidebar: [
    {
      type: 'category',
      label: 'Getting Started',
      link: {
        type: 'generated-index',
        description: 'Learn about Xec Platform and get up and running in minutes',
      },
      collapsed: false,
      items: [
        'intro',
        'documentation-index',
        'getting-started/installation',
        'getting-started/quick-start',
        'getting-started/first-project',
      ],
    },
    {
      type: 'category',
      label: 'CLI Reference',
      link: {
        type: 'doc',
        id: 'projects/cli/index',
      },
      items: [
        'projects/cli/commands',
      ],
    },
    {
      type: 'category',
      label: 'Core Framework',
      link: {
        type: 'doc',
        id: 'projects/core/index',
      },
      items: [
        'projects/core/getting-started/basic-concepts',
        {
          type: 'category',
          label: 'Examples',
          link: {
            type: 'doc',
            id: 'projects/core/examples/index',
          },
          items: [],
        },
        'projects/core/api-reference',
      ],
    },
  ],
};

export default sidebars;