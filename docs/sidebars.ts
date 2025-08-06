import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  // Main documentation sidebar following docs-spec.md structure
  docsSidebar: [
    {
      type: 'category',
      label: 'Introduction',
      link: {
        type: 'doc',
        id: 'introduction/index',
      },
      collapsed: false,
      items: [
        'introduction/what-is-xec',
        'introduction/quick-start',
        'introduction/when-to-use',
        'introduction/philosophy',
        'introduction/ecosystem',
      ],
    },
    {
      type: 'category',
      label: 'Execution Engine',
      link: {
        type: 'doc',
        id: 'core/execution-engine/overview',
      },
      items: [
        'core/execution-engine/template-literals',
        {
          type: 'category',
          label: 'Adapters',
          items: [
            'core/execution-engine/adapters/concept',
            'core/execution-engine/adapters/local-adapter',
            'core/execution-engine/adapters/ssh-adapter',
            'core/execution-engine/adapters/docker-adapter',
            'core/execution-engine/adapters/k8s-adapter',
          ],
        },
        {
          type: 'category',
          label: 'Features',
          items: [
            'core/execution-engine/features/connection-pooling',
            'core/execution-engine/features/error-handling',
            'core/execution-engine/features/streaming',
            'core/execution-engine/features/file-operations',
            'core/execution-engine/features/port-forwarding',
          ],
        },
        {
          type: 'category',
          label: 'API',
          items: [
            'core/execution-engine/api/execution-api',
            'core/execution-engine/api/chaining',
            'core/execution-engine/api/composition',
            'core/execution-engine/api/extensions',
          ],
        },
        {
          type: 'category',
          label: 'Performance',
          items: [
            'core/execution-engine/performance/optimization',
            'core/execution-engine/performance/connection-reuse',
            'core/execution-engine/performance/parallel-execution',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Environments',
      link: {
        type: 'doc',
        id: 'environments/overview',
      },
      items: [
        {
          type: 'category',
          label: 'Local',
          items: [
            'environments/local/setup',
            'environments/local/shell-config',
            'environments/local/debugging',
          ],
        },
        {
          type: 'category',
          label: 'SSH',
          items: [
            'environments/ssh/setup',
            'environments/ssh/authentication',
            'environments/ssh/sudo-security',
            'environments/ssh/tunneling',
            'environments/ssh/batch-operations',
            'environments/ssh/connection-mgmt',
          ],
        },
        {
          type: 'category',
          label: 'Docker',
          items: [
            'environments/docker/setup',
            'environments/docker/lifecycle',
            'environments/docker/compose',
            'environments/docker/volumes',
            'environments/docker/networking',
          ],
        },
        {
          type: 'category',
          label: 'Kubernetes',
          items: [
            'environments/kubernetes/setup',
            'environments/kubernetes/pod-execution',
            'environments/kubernetes/multi-container',
            'environments/kubernetes/port-forwarding',
            'environments/kubernetes/log-streaming',
          ],
        },
        {
          type: 'category',
          label: 'Hybrid',
          items: [
            'environments/hybrid/multi-target',
            'environments/hybrid/failover',
            'environments/hybrid/orchestration',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Scripting',
      items: [
        {
          type: 'category',
          label: 'Basics',
          items: [
            'scripting/basics/first-script',
            'scripting/basics/execution-context',
            'scripting/basics/command-execution',
            'scripting/basics/typescript-setup',
          ],
        },
        {
          type: 'category',
          label: 'Patterns',
          items: [
            'scripting/patterns/error-handling',
            'scripting/patterns/async-patterns',
            'scripting/patterns/streaming',
            'scripting/patterns/chaining',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Commands',
      link: {
        type: 'doc',
        id: 'commands/overview',
      },
      items: [
        'commands/cli-reference',
        {
          type: 'category',
          label: 'Built-in Commands',
          items: [
            'commands/built-in/copy',
            'commands/built-in/forward',
            'commands/built-in/in',
            'commands/built-in/on',
            'commands/built-in/logs',
            'commands/built-in/new',
            'commands/built-in/watch',
            'commands/built-in/run',
            'commands/built-in/secrets',
            'commands/built-in/inspect',
            'commands/built-in/config',
          ],
        },
        {
          type: 'category',
          label: 'Custom Commands',
          items: [
            'commands/custom/creating-commands',
            'commands/custom/command-structure',
            'commands/custom/command-testing',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Configuration',
      link: {
        type: 'doc',
        id: 'configuration/overview',
      },
      items: [
        'configuration/config-file',
        {
          type: 'category',
          label: 'Targets',
          items: [
            'configuration/targets/overview',
            'configuration/targets/ssh-targets',
            'configuration/targets/docker-targets',
            'configuration/targets/kubernetes-targets',
          ],
        },
        {
          type: 'category',
          label: 'Tasks',
          items: [
            'configuration/tasks/overview',
            'configuration/tasks/simple-tasks',
            'configuration/tasks/multi-step-tasks',
          ],
        },
        {
          type: 'category',
          label: 'Profiles',
          items: [
            'configuration/profiles/overview',
          ],
        },
        {
          type: 'category',
          label: 'Variables',
          items: [
            'configuration/variables/overview',
            'configuration/variables/environment',
          ],
        },
        {
          type: 'category',
          label: 'Commands',
          items: [
            'configuration/commands/defaults',
          ],
        },
        {
          type: 'category',
          label: 'Advanced',
          items: [
            'configuration/advanced/validation',
            'configuration/advanced/best-practices',
            'configuration/advanced/troubleshooting',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        {
          type: 'category',
          label: 'Automation',
          items: [
            'guides/automation/first-automation',
            'guides/automation/ci-cd-pipelines',
            'guides/automation/deployment',
            'guides/automation/testing',
          ],
        },
        {
          type: 'category',
          label: 'Infrastructure',
          items: [
            'guides/infrastructure/server-management',
            'guides/infrastructure/container-orchestration',
          ],
        },
        {
          type: 'category',
          label: 'Development',
          items: [
            'guides/development/dev-environments',
            'guides/development/debugging',
          ],
        },
        {
          type: 'category',
          label: 'Advanced',
          items: [
            'guides/advanced/error-handling',
            'guides/advanced/security',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Targets',
      items: [
        {
          type: 'category',
          label: 'Local',
          items: [
            'targets/local/overview',
            'targets/local/shell-config',
            'targets/local/troubleshooting',
          ],
        },
        {
          type: 'category',
          label: 'SSH',
          items: [
            'targets/ssh/overview',
            'targets/ssh/connection-config',
            'targets/ssh/authentication',
            'targets/ssh/tunneling',
            'targets/ssh/batch-operations',
          ],
        },
        {
          type: 'category',
          label: 'Docker',
          items: [
            'targets/docker/overview',
            'targets/docker/container-lifecycle',
            'targets/docker/compose-integration',
            'targets/docker/volume-management',
            'targets/docker/networking',
          ],
        },
        {
          type: 'category',
          label: 'Kubernetes',
          items: [
            'targets/kubernetes/overview',
            'targets/kubernetes/pod-execution',
            'targets/kubernetes/port-forwarding',
            'targets/kubernetes/log-streaming',
            'targets/kubernetes/file-operations',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Recipes',
      link: {
        type: 'doc',
        id: 'recipes/index',
      },
      items: [
        {
          type: 'category',
          label: 'Deployment',
          items: [
            'recipes/deployment/node-app-deploy',
            'recipes/deployment/static-site-deploy',
            'recipes/deployment/docker-deploy',
            'recipes/deployment/k8s-deploy',
          ],
        },
        {
          type: 'category',
          label: 'Maintenance',
          items: [
            'recipes/maintenance/log-aggregation',
            'recipes/maintenance/backup-restore',
            'recipes/maintenance/health-checks',
            'recipes/maintenance/certificate-renewal',
          ],
        },
        {
          type: 'category',
          label: 'Development',
          items: [
            'recipes/development/database-setup',
            'recipes/development/api-mocking',
            'recipes/development/test-data',
            'recipes/development/hot-reload',
          ],
        },
        {
          type: 'category',
          label: 'Integration',
          items: [
            'recipes/integration/github-actions',
            'recipes/integration/gitlab-ci',
            'recipes/integration/jenkins',
            'recipes/integration/aws-integration',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Migration',
      items: [
        'migration/from-npm-scripts',
        'migration/from-make',
        'migration/from-gulp-grunt',
        'migration/from-shell-scripts',
        'migration/from-zx',
        'migration/from-webpack',
      ],
    },
    {
      type: 'category',
      label: 'Changelog',
      items: [
        'changelog/index',
      ],
    },
  ],
};

export default sidebars;