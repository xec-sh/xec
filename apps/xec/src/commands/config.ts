import chalk from 'chalk';
import { kit } from '@xec-sh/kit';

import { sortConfigKeys } from '../config/defaults.js';
import { ConfigurationManager } from '../config/configuration-manager.js';

import type { PodConfig, HostConfig, ContainerConfig } from '../config/types.js';

/**
 * Enhanced config management using @xec-sh/kit reactive forms
 * This module provides advanced configuration management features when kit is enabled
 */

export interface ConfigFormData {
  name?: string;
  description?: string;
  targets?: {
    ssh?: Record<string, HostConfig>;
    docker?: Record<string, ContainerConfig>;
    k8s?: Record<string, PodConfig>;
  };
  vars?: Record<string, string>;
  tasks?: Record<string, any>;
  defaults?: any;
}

/**
 * Type-safe wizard result for add target wizard
 */
interface AddTargetWizardResult {
  type: 'ssh' | 'docker' | 'k8s';
  name: string;
  config: any;
  confirm: boolean;
}

/**
 * Type-safe wizard result for create task wizard
 */
interface CreateTaskWizardResult {
  basics: {
    name: string;
    description?: string;
    type: 'command' | 'script' | 'composite';
  };
  details: any;
}

/**
 * Create a target management component for the form
 */
export async function createTargetManager(currentTargets: any) {
  const targets = currentTargets || {};

  const result = await kit.form({
    title: '🎯 Target Management',
    sections: [
      {
        title: 'SSH Hosts',
        fields: Object.entries(targets.hosts || {}).map(([name, host]: [string, any]) => ({
          name: `ssh_${name}`,
          type: 'group',
          message: `${name} (${host.host})`,
          fields: [
            {
              name: 'host',
              type: 'text',
              message: 'Hostname',
              default: host.host,
              validate: (v: string) => v ? undefined : 'Host is required'
            },
            {
              name: 'port',
              type: 'number',
              message: 'Port',
              default: host.port || 22,
              min: 1,
              max: 65535
            },
            {
              name: 'username',
              type: 'text',
              message: 'Username',
              default: host.username,
              validate: (v: string) => v ? undefined : 'Username is required'
            },
            {
              name: 'privateKey',
              type: 'text',
              message: 'Private Key Path',
              default: host.privateKey || '~/.ssh/id_rsa'
            }
          ]
        }))
      },
      {
        title: 'Docker Containers',
        fields: Object.entries(targets.containers || {}).map(([name, container]: [string, any]) => ({
          name: `docker_${name}`,
          type: 'group',
          message: name,
          fields: [
            {
              name: 'useExisting',
              type: 'confirm',
              message: 'Use existing container?',
              default: !!container.container
            },
            {
              name: 'container',
              type: 'text',
              message: 'Container name/ID',
              default: container.container,
              when: (answers: any) => answers.useExisting
            },
            {
              name: 'image',
              type: 'text',
              message: 'Docker image',
              default: container.image,
              when: (answers: any) => !answers.useExisting
            },
            {
              name: 'workdir',
              type: 'text',
              message: 'Working directory',
              default: container.workdir || '/app'
            }
          ]
        }))
      },
      {
        title: 'Kubernetes Pods',
        fields: Object.entries(targets.pods || {}).map(([name, pod]: [string, any]) => ({
          name: `k8s_${name}`,
          type: 'group',
          message: `${name} (${pod.namespace}/${pod.pod})`,
          fields: [
            {
              name: 'pod',
              type: 'text',
              message: 'Pod name',
              default: pod.pod,
              validate: (v: string) => v ? undefined : 'Pod name is required'
            },
            {
              name: 'namespace',
              type: 'text',
              message: 'Namespace',
              default: pod.namespace || 'default'
            },
            {
              name: 'container',
              type: 'text',
              message: 'Container (for multi-container pods)',
              default: pod.container
            },
            {
              name: 'context',
              type: 'text',
              message: 'Kubernetes context',
              default: pod.context
            }
          ]
        }))
      }
    ]
  });

  return result;
}

/**
 * Interactive configuration with reactive forms
 */
export async function interactiveConfigWithForms(configManager: ConfigurationManager) {
  const config = await configManager.load();

  const result = await kit.form({
    title: '🔧 Xec Configuration',
    sections: [
      {
        title: 'General Settings',
        fields: [
          {
            name: 'name',
            type: 'text',
            message: 'Project name',
            default: config.name,
            validate: (v: string) => {
              if (!v) return 'Project name is required';
              if (!/^[a-z0-9-]+$/.test(v)) return 'Use lowercase letters, numbers, and hyphens only';
              return undefined;
            },
            transform: (v: string) => v.toLowerCase().replace(/\s+/g, '-')
          },
          {
            name: 'description',
            type: 'text',
            message: 'Project description',
            default: config.description,
            multiline: true
          },
          {
            name: 'defaultShell',
            type: 'select',
            message: 'Default shell',
            options: [
              { value: '/bin/bash', label: 'Bash' },
              { value: '/bin/zsh', label: 'Zsh' },
              { value: '/bin/sh', label: 'Shell' }
            ],
            default: config.targets?.defaults?.shell || '/bin/bash'
          },
          {
            name: 'timeout',
            type: 'number',
            message: 'Default command timeout (seconds)',
            min: 0,
            max: 3600,
            default: config.targets?.defaults?.timeout || 300
          }
        ]
      },
      {
        title: 'Targets',
        fields: [
          {
            name: 'manageTargets',
            type: 'custom',
            message: 'Manage targets',
            component: () => createTargetManager(config.targets)
          }
        ]
      },
      {
        title: 'Variables',
        fields: [
          {
            name: 'vars',
            type: 'keyvalue',
            message: 'Environment variables',
            default: config.vars || {},
            addLabel: 'Add Variable',
            keyPlaceholder: 'VARIABLE_NAME',
            valuePlaceholder: 'value',
            validateKey: (key: string) => {
              if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
                return 'Variable names should be UPPER_SNAKE_CASE';
              }
              return undefined;
            }
          }
        ]
      }
    ],
    validate: async (values) => {
      // Cross-field validation
      const errors: Record<string, string> = {};

      if (values.timeout === 0 && values.enableTimeouts) {
        errors['timeout'] = 'Timeout cannot be 0 when timeouts are enabled';
      }

      return Object.keys(errors).length > 0 ? errors : undefined;
    },
    onSubmit: async (values) => {
      // Transform and save the configuration
      const updatedConfig = {
        ...config,
        name: values.name,
        description: values.description,
        targets: {
          ...config.targets,
          defaults: {
            ...config.targets?.defaults,
            shell: values.defaultShell,
            timeout: values.timeout
          }
        },
        vars: values.vars
      };

      // Save configuration
      await saveConfig(updatedConfig, configManager);
      kit.log.success('Configuration saved successfully');
    }
  });

  return result;
}

/**
 * Add target wizard
 */
export async function addTargetWizard(configManager: ConfigurationManager): Promise<void> {
  const result = await kit.wizard({
    title: '🎯 Add New Target',
    steps: [
      {
        id: 'type',
        title: 'Target Type',
        component: async () => await kit.select({
          message: 'What type of target would you like to add?',
          options: [
            {
              value: 'ssh',
              label: '🖥️  SSH Host',
              hint: 'Connect to remote servers via SSH'
            },
            {
              value: 'docker',
              label: '🐳 Docker Container',
              hint: 'Execute commands in Docker containers'
            },
            {
              value: 'k8s',
              label: '☸️  Kubernetes Pod',
              hint: 'Run commands in Kubernetes pods'
            }
          ],
          preview: (option) => {
            const previews: Record<string, string> = {
              ssh: '# SSH Host Configuration\nConnect to remote servers using SSH protocol.\n\nRequired: hostname, username\nOptional: port, privateKey, passphrase',
              docker: '# Docker Container Configuration\nExecute commands inside Docker containers.\n\nOptions:\n- Use existing container\n- Create from image',
              k8s: '# Kubernetes Pod Configuration\nRun commands in Kubernetes pods.\n\nRequired: pod name, namespace\nOptional: container, context'
            };
            return previews[option.value] || '';
          }
        })
      },
      {
        id: 'name',
        title: 'Target Name',
        component: async () => await kit.text({
          message: 'Target name (unique identifier)',
          placeholder: 'my-target',
          validate: (value) => {
            if (!value) return 'Name is required';
            if (!/^[a-z0-9-]+$/.test(value)) {
              return 'Use lowercase letters, numbers, and hyphens only';
            }
            return undefined;
          },
          transform: (v) => v.toLowerCase().replace(/\s+/g, '-')
        })
      },
      {
        id: 'config',
        title: 'Target Configuration',
        component: async (context) => {
          switch (context['type']) {
            case 'ssh':
              return await kit.form({
                fields: [
                  {
                    name: 'host',
                    type: 'text',
                    message: 'SSH hostname or IP',
                    placeholder: 'example.com',
                    validate: (v) => v ? undefined : 'Host is required'
                  },
                  {
                    name: 'port',
                    type: 'number',
                    message: 'SSH port',
                    default: 22,
                    min: 1,
                    max: 65535
                  },
                  {
                    name: 'username',
                    type: 'text',
                    message: 'SSH username',
                    placeholder: 'user',
                    validate: (v) => v ? undefined : 'Username is required'
                  },
                  {
                    name: 'authMethod',
                    type: 'select',
                    message: 'Authentication method',
                    options: [
                      { value: 'key', label: '🔑 SSH Key (recommended)' },
                      { value: 'password', label: '🔒 Password (use secrets)' }
                    ],
                    default: 'key'
                  },
                  {
                    name: 'privateKey',
                    type: 'text',
                    message: 'Path to SSH private key',
                    placeholder: '~/.ssh/id_rsa',
                    default: '~/.ssh/id_rsa',
                    when: (answers: any) => answers.authMethod === 'key'
                  }
                ]
              });

            case 'docker':
              return await kit.form({
                fields: [
                  {
                    name: 'useExisting',
                    type: 'confirm',
                    message: 'Use existing container?',
                    default: false
                  },
                  {
                    name: 'container',
                    type: 'text',
                    message: 'Container name or ID',
                    placeholder: 'my-container',
                    when: (answers: any) => answers.useExisting,
                    validate: (v) => v ? undefined : 'Container is required'
                  },
                  {
                    name: 'image',
                    type: 'text',
                    message: 'Docker image',
                    placeholder: 'ubuntu:latest',
                    when: (answers: any) => !answers.useExisting,
                    validate: (v) => v ? undefined : 'Image is required'
                  },
                  {
                    name: 'workdir',
                    type: 'text',
                    message: 'Working directory',
                    placeholder: '/app',
                    default: '/app'
                  },
                  {
                    name: 'user',
                    type: 'text',
                    message: 'User (optional)',
                    placeholder: 'root'
                  }
                ]
              });

            case 'k8s':
              return await kit.form({
                fields: [
                  {
                    name: 'pod',
                    type: 'text',
                    message: 'Pod name',
                    placeholder: 'my-pod',
                    validate: (v) => v ? undefined : 'Pod name is required'
                  },
                  {
                    name: 'namespace',
                    type: 'text',
                    message: 'Namespace',
                    placeholder: 'default',
                    default: 'default'
                  },
                  {
                    name: 'container',
                    type: 'text',
                    message: 'Container name (for multi-container pods)',
                    placeholder: 'main'
                  },
                  {
                    name: 'context',
                    type: 'text',
                    message: 'Kubernetes context (optional)',
                    placeholder: 'default'
                  }
                ]
              });

            default:
              return {};
          }
        }
      },
      {
        id: 'confirm',
        title: 'Review & Confirm',
        component: async (context) => {
          // Display summary
          const summary = formatTargetSummary(context);
          kit.log.info('Target Configuration Summary:');
          console.log(summary);

          return await kit.confirm({
            message: 'Add this target to configuration?',
            default: true
          });
        }
      }
    ],
    onStepComplete: async (step, value, context) => {
      // Save progress for recovery
      await kit.saveState('.xec-target-wizard', { step, context });
    },
    allowBack: true,
    allowSkip: false,
    showProgress: true
  });

  // Check if user cancelled the wizard
  if (kit.isCancel(result)) {
    kit.log.info('Target creation cancelled');
    return;
  }

  // Type-safe result access
  const wizardResult = result as AddTargetWizardResult;

  // Check if user confirmed
  if (wizardResult.confirm === true) {
    // Add target to configuration
    const config = await configManager.load();
    if (!config.targets) config.targets = {};

    // eslint-disable-next-line default-case
    switch (wizardResult.type) {
      case 'ssh':
        if (!config.targets.hosts) config.targets.hosts = {};
        config.targets.hosts[wizardResult.name] = {
          type: 'ssh',
          ...wizardResult.config
        };
        break;
      case 'docker':
        if (!config.targets.containers) config.targets.containers = {};
        config.targets.containers[wizardResult.name] = {
          type: 'docker',
          ...wizardResult.config
        };
        break;
      case 'k8s':
        if (!config.targets.pods) config.targets.pods = {};
        config.targets.pods[wizardResult.name] = {
          type: 'k8s',
          ...wizardResult.config
        };
        break;
    }

    await saveConfig(config, configManager);
    kit.log.success(`Target '${wizardResult.name}' added successfully`);
  } else {
    kit.log.info('Target creation skipped');
  }
}

/**
 * Variable management with table view
 */
export async function manageVariablesWithTable(configManager: ConfigurationManager) {
  const config = await configManager.load();
  const vars = config.vars || {};

  const variables = Object.entries(vars).map(([key, value]) => ({
    name: key,
    value: typeof value === 'string' && value.startsWith('$secret:')
      ? '🔒 [secret]'
      : value,
    type: typeof value === 'string' && value.startsWith('$secret:')
      ? 'secret'
      : 'plain'
  }));

  await kit.table({
    message: '📝 Environment Variables',
    data: variables,
    columns: [
      { key: 'name', label: 'Variable', width: 30 },
      { key: 'value', label: 'Value', width: 40 },
      { key: 'type', label: 'Type', width: 15 }
    ],
    onSelect: async (variable) => {
      const action = await kit.select({
        message: `Action for ${variable.name}`,
        options: [
          { value: 'edit', label: '✏️  Edit' },
          { value: 'delete', label: '🗑️  Delete' },
          { value: 'cancel', label: '❌ Cancel' }
        ]
      });

      if (action === 'edit') {
        const newValue = await kit.text({
          message: 'New value',
          default: variable.type === 'secret' ? '' : variable.value,
          placeholder: variable.type === 'secret' ? 'Enter new value' : undefined
        });

        if (newValue) {
          config.vars![variable.name] = newValue;
          await saveConfig(config, configManager);
          kit.log.success(`Variable '${variable.name}' updated`);
        }
      } else if (action === 'delete') {
        const confirm = await kit.confirm({
          message: `Delete variable '${variable.name}'?`,
          default: false
        });

        if (confirm) {
          delete config.vars![variable.name];
          await saveConfig(config, configManager);
          kit.log.success(`Variable '${variable.name}' deleted`);
        }
      }
    }
  });
}

/**
 * Task management with dependency visualization
 */
export async function manageTasksWithVisualization(configManager: ConfigurationManager) {
  const config = await configManager.load();
  const tasks = config.tasks || {};

  const taskList = Object.entries(tasks).map(([name, task]: [string, any]) => ({
    id: name,
    title: task.description || name,
    dependencies: task.depends || [],
    run: async (context: any) => {
      // Task execution logic would go here
      kit.log.info(`Executing task: ${name}`);
      return { success: true };
    }
  }));

  // Create progress instance
  const progressBar = kit.progress({
    title: 'Executing tasks',
    total: taskList.length
  });
  progressBar.start();

  const runner = await kit.taskRunner({
    tasks: taskList,
    visualization: 'tree',
    parallel: true,
    onTaskStart: (task) => {
      kit.log.info(`Starting: ${task.title}`);
    },
    onTaskComplete: (task, result) => {
      if (result.success) {
        kit.log.success(`✓ ${task.title}`);
      } else {
        kit.log.error(`✗ ${task.title}: ${result.error}`);
      }
    },
    onProgress: (completed, total) => {
      progressBar.update(completed);
    }
  });

  // Show task selection and management options
  const action = await kit.commandPalette({
    commands: [
      {
        id: 'run',
        title: 'Run Task',
        icon: '▶️',
        shortcut: 'r',
        action: async () => {
          const selected = await selectTask(tasks);
          if (selected) {
            await runner.run();
            progressBar.complete();
          }
        }
      },
      {
        id: 'create',
        title: 'Create Task',
        icon: '➕',
        shortcut: 'c',
        action: async () => {
          await createTaskWizard(configManager);
        }
      },
      {
        id: 'edit',
        title: 'Edit Task',
        icon: '✏️',
        shortcut: 'e',
        action: async () => {
          const selected = await selectTask(tasks);
          if (selected) {
            await editTask(selected, configManager);
          }
        }
      },
      {
        id: 'delete',
        title: 'Delete Task',
        icon: '🗑️',
        shortcut: 'd',
        action: async () => {
          const selected = await selectTask(tasks);
          if (selected) {
            await deleteTask(selected, configManager);
          }
        }
      },
      {
        id: 'visualize',
        title: 'Visualize Dependencies',
        icon: '🔗',
        shortcut: 'v',
        action: async () => {
          // Show dependency graph
          kit.log.info('Task dependency visualization:');
          // Visualize task dependencies manually
          for (const task of taskList) {
            const deps = task.dependencies.length > 0
              ? `→ depends on: ${task.dependencies.join(', ')}`
              : '→ no dependencies';
            kit.log.info(`  ${task.title} ${deps}`);
          }
        }
      }
    ],
    placeholder: 'Select task operation...'
  });
}

// Helper functions

function formatTargetSummary(context: any): string {
  const { type, name, config } = context;

  let summary = chalk.bold(`Target: ${name}\n`);
  summary += chalk.gray(`Type: ${type}\n\n`);

  // eslint-disable-next-line default-case
  switch (type) {
    case 'ssh':
      summary += `Host: ${config.host}\n`;
      summary += `Port: ${config.port}\n`;
      summary += `Username: ${config.username}\n`;
      summary += `Auth: ${config.authMethod === 'key' ? 'SSH Key' : 'Password'}\n`;
      if (config.privateKey) {
        summary += `Key: ${config.privateKey}\n`;
      }
      break;

    case 'docker':
      if (config.useExisting) {
        summary += `Container: ${config.container}\n`;
      } else {
        summary += `Image: ${config.image}\n`;
      }
      summary += `Workdir: ${config.workdir}\n`;
      if (config.user) {
        summary += `User: ${config.user}\n`;
      }
      break;

    case 'k8s':
      summary += `Pod: ${config.pod}\n`;
      summary += `Namespace: ${config.namespace}\n`;
      if (config.container) {
        summary += `Container: ${config.container}\n`;
      }
      if (config.context) {
        summary += `Context: ${config.context}\n`;
      }
      break;
  }

  return summary;
}

async function saveConfig(config: any, configManager: ConfigurationManager): Promise<void> {
  const sorted = sortConfigKeys(config);
  await configManager.save(sorted);
}

async function selectTask(tasks: any): Promise<string | null> {
  const taskOptions = Object.entries(tasks).map(([name, task]: [string, any]) => ({
    value: name,
    label: name,
    hint: task.description || 'No description'
  }));

  const selected = await kit.select({
    message: 'Select task',
    options: taskOptions,
    search: true
  });

  return selected as string;
}

async function createTaskWizard(configManager: ConfigurationManager): Promise<void> {
  const result = await kit.wizard({
    title: '⚡ Create New Task',
    steps: [
      {
        id: 'basics',
        title: 'Basic Information',
        component: async () => await kit.form({
          fields: [
            {
              name: 'name',
              type: 'text',
              message: 'Task name',
              placeholder: 'my-task',
              validate: (v) => {
                if (!v) return 'Name is required';
                if (!/^[a-z][a-z0-9-]*$/.test(v)) {
                  return 'Use lowercase letters, numbers, and hyphens';
                }
                return undefined;
              }
            },
            {
              name: 'description',
              type: 'text',
              message: 'Description',
              placeholder: 'What does this task do?'
            },
            {
              name: 'type',
              type: 'select',
              message: 'Task type',
              options: [
                { value: 'command', label: 'Shell command' },
                { value: 'script', label: 'Script file' },
                { value: 'composite', label: 'Multiple steps' }
              ]
            }
          ]
        })
      },
      {
        id: 'details',
        title: 'Task Details',
        component: async (context) => {
          switch (context['basics']['type']) {
            case 'command':
              return await kit.text({
                message: 'Command to run',
                placeholder: 'echo "Hello, World!"',
                validate: (v) => v ? undefined : 'Command is required'
              });

            case 'script':
              return await kit.text({
                message: 'Script file path',
                placeholder: './scripts/my-script.sh',
                validate: (v) => v ? undefined : 'Script path is required'
              });

            case 'composite':
              return await kit.form({
                fields: [
                  {
                    name: 'steps',
                    type: 'list',
                    message: 'Task steps',
                    addLabel: 'Add Step',
                    itemFields: [
                      {
                        name: 'name',
                        type: 'text',
                        message: 'Step name'
                      },
                      {
                        name: 'command',
                        type: 'text',
                        message: 'Command'
                      }
                    ]
                  }
                ]
              });

            default:
              return {};
          }
        }
      }
    ],
    allowBack: true,
    showProgress: true
  });

  // Check if user cancelled the wizard
  if (kit.isCancel(result)) {
    kit.log.info('Task creation cancelled');
    return;
  }

  // Type-safe result access
  const wizardResult = result as CreateTaskWizardResult;

  const config = await configManager.load();
  if (!config.tasks) config.tasks = {};

  const task: any = {
    description: wizardResult.basics.description
  };

  // eslint-disable-next-line default-case
  switch (wizardResult.basics.type) {
    case 'command':
      task.steps = [{ command: wizardResult.details }];
      break;
    case 'script':
      task.steps = [{ script: wizardResult.details }];
      break;
    case 'composite':
      task.steps = wizardResult.details.steps;
      break;
  }

  config.tasks[wizardResult.basics.name] = task;
  await saveConfig(config, configManager);
  kit.log.success(`Task '${wizardResult.basics.name}' created successfully`);
}

async function editTask(taskName: string, configManager: ConfigurationManager): Promise<void> {
  // Implementation for editing tasks
  kit.log.info(`Editing task: ${taskName}`);
  // Would implement full edit flow here
}

async function deleteTask(taskName: string, configManager: ConfigurationManager): Promise<void> {
  const confirm = await kit.confirm({
    message: `Delete task '${taskName}'?`,
    default: false
  });

  if (confirm) {
    const config = await configManager.load();
    if (config.tasks && config.tasks[taskName]) {
      delete config.tasks[taskName];
      await saveConfig(config, configManager);
      kit.log.success(`Task '${taskName}' deleted`);
    }
  }
}