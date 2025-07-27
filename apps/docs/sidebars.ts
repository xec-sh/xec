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
        {
          type: 'category',
          label: 'Getting Started',
          items: [
            'projects/core/getting-started/installation',
            'projects/core/getting-started/basic-concepts',
            'projects/core/getting-started/first-steps',
          ],
        },
        {
          type: 'category',
          label: 'Core Features',
          items: [
            'projects/core/core-features/command-execution',
            'projects/core/core-features/template-literals',
            'projects/core/core-features/process-promise',
            'projects/core/core-features/configuration',
          ],
        },
        {
          type: 'category',
          label: 'Execution Adapters',
          items: [
            'projects/core/adapters/local',
            'projects/core/adapters/ssh',
            'projects/core/adapters/docker',
            'projects/core/adapters/kubernetes',
            'projects/core/adapters/remote-docker',
          ],
        },
        {
          type: 'category',
          label: 'Advanced Features',
          items: [
            'projects/core/advanced/parallel-execution',
            'projects/core/advanced/streaming',
            'projects/core/advanced/error-handling',
            'projects/core/advanced/retry-logic',
            'projects/core/advanced/event-system',
            'projects/core/advanced/caching',
            'projects/core/advanced/connection-pooling',
            'projects/core/advanced/progress-tracking',
          ],
        },
        {
          type: 'category',
          label: 'Utilities',
          items: [
            'projects/core/utilities/temp-files',
            'projects/core/utilities/file-transfer',
            'projects/core/utilities/shell-escaping',
            'projects/core/utilities/secure-passwords',
            'projects/core/utilities/interactive-prompts',
          ],
        },
        {
          type: 'category',
          label: 'API Reference',
          items: [
            'projects/core/api-reference/execution-engine',
            'projects/core/api-reference/process-promise',
            'projects/core/api-reference/adapters',
            'projects/core/api-reference/events',
            'projects/core/api-reference/types',
          ],
        },
        {
          type: 'category',
          label: 'Examples',
          link: {
            type: 'doc',
            id: 'projects/core/examples/index',
          },
          items: [],
        },
      ],
    },
  ],
};

export default sidebars;