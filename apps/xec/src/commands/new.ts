import path from 'path';
import chalk from 'chalk';
import fs from 'fs-extra';
import jsYaml from 'js-yaml';
import { kit } from '@xec-sh/kit';

import { sortConfigKeys, getDefaultConfig } from '../config/defaults.js';

/**
 * Enhanced new command using @xec-sh/kit wizard
 * This module provides advanced project creation features when kit is enabled
 */

/**
 * Type-safe wizard result for new project wizard
 */
interface NewProjectWizardResult {
  type: string;
  name: string;
  description?: string;
  location: string;
  features?: string[];
  confirm?: boolean;
  [key: string]: any;
}

// Template registry with preview
const TEMPLATES = {
  project: {
    preview: `# 📦 Full Xec Project
Creates a complete Xec project with:
- Configuration file (.xec/config.yaml)
- Example scripts and tasks
- Environment variables setup
- Git initialization (optional)
- README with documentation`,
    files: {
      'README.md': (name: string, description: string) => `# ${name}

${description}

## Getting Started

\`\`\`bash
# Install dependencies
npm install

# Run a task
xec task build

# Execute a script
xec run scripts/deploy.js
\`\`\`

## Configuration

See \`.xec/config.yaml\` for project configuration.

## Available Tasks

- \`build\` - Build the project
- \`test\` - Run tests
- \`deploy\` - Deploy to production

## Scripts

- \`scripts/setup.js\` - Initial setup
- \`scripts/deploy.js\` - Deployment script
`,
      'scripts/setup.js': () => `#!/usr/bin/env xec

/**
 * Project setup script
 */

log.info('Setting up project...');

// Check dependencies
const hasNode = await $\`which node\`.quiet();
if (!hasNode) {
  log.error('Node.js is required');
  process.exit(1);
}

// Install dependencies
await $\`npm install\`;

log.success('Setup completed!');
`,
      'scripts/deploy.js': () => `#!/usr/bin/env xec

/**
 * Deployment script
 */

const target = argv.target || 'production';
log.info(\`Deploying to \${target}...\`);

// Build the project
await $\`npm run build\`;

// Run tests
await $\`npm test\`;

// Deploy based on target
switch (target) {
  case 'production':
    await $\`npm run deploy:prod\`;
    break;
  case 'staging':
    await $\`npm run deploy:staging\`;
    break;
  default:
    log.error(\`Unknown target: \${target}\`);
    process.exit(1);
}

log.success('Deployment completed!');
`
    }
  },
  script: {
    preview: `# 📝 Standalone Script
Creates a single executable script that can:
- Be run directly with xec
- Use all Xec APIs and globals
- Include TypeScript types (optional)
- Have command-line arguments`,
    template: {
      js: (name: string, description: string) => `#!/usr/bin/env xec

/**
 * ${description}
 * 
 * Usage: xec ${name}.js [options]
 */

// Parse command-line arguments
const { target, verbose } = argv;

if (verbose) {
  log.debug('Verbose mode enabled');
}

// Your script logic here
log.info('Running ${name} script...');

// Example: Run a command
const result = await $\`echo "Hello from ${name} script!"\`;
log.success(result.stdout);

// Example: Work with files
const files = await glob('**/*.js');
log.step(\`Found \${files.length} JavaScript files\`);

// Example: Interactive prompt
if (process.stdin.isTTY) {
  const answer = await question({
    message: 'Continue with the operation?',
    defaultValue: 'yes'
  });
  
  if (answer.toLowerCase() === 'yes') {
    log.success('Operation completed successfully!');
  } else {
    log.info('Operation cancelled');
  }
}
`,
      ts: (name: string, description: string, globalsPath: string) => `#!/usr/bin/env xec
/// <reference path="${globalsPath}" />

/**
 * ${description}
 * 
 * Usage: xec ${name}.ts [options]
 */

interface Options {
  target?: string;
  verbose?: boolean;
  dry?: boolean;
}

// Parse command-line arguments with types
const options = argv as Options;

if (options.verbose) {
  log.debug('Verbose mode enabled');
}

// Type-safe command execution
const result = await $\`echo "Hello from TypeScript!"\`;
log.success(result.stdout);

// Work with files using built-in fs
const files = await glob('**/*.ts');
log.step(\`Found \${files.length} TypeScript files\`);

// Interactive prompts with type inference
if (process.stdin.isTTY) {
  const name = await question({
    message: 'What is your name?',
    defaultValue: 'Developer'
  });
  
  // Use chalk for colored output
  log.info(chalk.blue(\`Hello, \${name}!\`));
}

// Example: Fetch data from API
interface GitHubRepo {
  name: string;
  description: string;
  stargazers_count: number;
}

try {
  const response = await fetch('https://api.github.com/repos/xec-sh/xec');
  const repo = await response.json() as GitHubRepo;
  log.info(\`Xec has \${repo.stargazers_count} stars!\`);
} catch (error) {
  log.error('Failed to fetch repo info:', error);
}
`
    }
  },
  task: {
    preview: `# ⚡ Reusable Task
Creates a task definition that can be:
- Referenced in config files
- Run with xec task <name>
- Composed with other tasks
- Have dependencies`,
    config: (name: string, description: string, details: any) => {
      const task: any = {
        description
      };

      if (details.dependencies && details.dependencies.length > 0) {
        task.depends = details.dependencies;
      }

      // eslint-disable-next-line default-case
      switch (details.type) {
        case 'command':
          task.steps = [{ command: details.command }];
          break;
        case 'script':
          task.steps = [{ script: details.script }];
          break;
        case 'composite':
          task.steps = details.steps;
          break;
      }

      if (details.vars) {
        task.vars = details.vars;
      }

      return task;
    }
  },
  profile: {
    preview: `# 👤 Configuration Profile
Creates a reusable configuration profile with:
- Pre-configured targets (SSH, Docker, K8s)
- Environment variables
- Default settings
- Task definitions`
  }
};

/**
 * Enhanced project creation wizard
 */
export async function createProjectWizard() {
  const result = await kit.wizard({
    title: '🚀 Create New Xec Project',
    steps: [
      {
        id: 'type',
        title: 'Project Type',
        component: async () => await kit.select({
          message: 'What would you like to create?',
          options: [
            {
              value: 'project',
              label: '📦 Project',
              hint: 'Full Xec project with configuration'
            },
            {
              value: 'script',
              label: '📝 Script',
              hint: 'Standalone executable script'
            },
            {
              value: 'task',
              label: '⚡ Task',
              hint: 'Reusable task definition'
            },
            {
              value: 'profile',
              label: '👤 Profile',
              hint: 'Configuration profile'
            },
          ],
          preview: (option) => TEMPLATES[option.value as keyof typeof TEMPLATES]?.preview || ''
        })
      },
      {
        id: 'details',
        title: 'Project Details',
        component: async (context) => await kit.form({
          fields: [
            {
              name: 'name',
              type: 'text',
              message: 'Project name',
              placeholder: context['type'] === 'project' ? 'my-xec-project' : `my-${context['type']}`,
              validate: validateProjectName,
              transform: (v) => v.toLowerCase().replace(/\s+/g, '-'),
            },
            {
              name: 'description',
              type: 'text',
              message: 'Description',
              placeholder: `A ${context['type']} created with Xec`,
              multiline: true,
            },
            {
              name: 'language',
              type: 'select',
              message: 'Language',
              options: [
                { value: 'typescript', label: 'TypeScript' },
                { value: 'javascript', label: 'JavaScript' }
              ],
              default: 'typescript',
              when: () => context['type'] === 'script',
            },
            {
              name: 'location',
              type: 'text',
              message: 'Location',
              placeholder: context['type'] === 'project' ? './' : './scripts',
              default: context['type'] === 'project' ? './' : './scripts',
            }
          ]
        })
      },
      {
        id: 'features',
        title: 'Features',
        skip: (context) => context['type'] !== 'project',
        component: async () => await kit.multiselect({
          message: 'Select features to include',
          options: [
            { value: 'tests', label: '🧪 Testing', hint: 'Jest/Vitest setup' },
            { value: 'ci', label: '🔄 CI/CD', hint: 'GitHub Actions workflow' },
            { value: 'docker', label: '🐳 Docker', hint: 'Dockerfile and compose' },
            { value: 'k8s', label: '☸️ Kubernetes', hint: 'K8s manifests' },
            { value: 'examples', label: '📚 Examples', hint: 'Example scripts and tasks' },
            { value: 'git', label: '📦 Git', hint: 'Initialize git repository' },
          ],
          showSelectAll: true,
          default: ['examples', 'git'],
        })
      },
      {
        id: 'targets',
        title: 'Configure Targets',
        skip: (context) => context['type'] !== 'project' && context['type'] !== 'profile',
        component: async () => {
          const addTargets = await kit.confirm({
            message: 'Would you like to configure targets now?',
            default: false,
          });

          if (!addTargets) return { targets: [] };

          const targets: any[] = [];
          let addMore = true;

          while (addMore) {
            const targetType = await kit.select({
              message: 'Select target type',
              options: [
                { value: 'ssh', label: '🖥️ SSH Host' },
                { value: 'docker', label: '🐳 Docker Container' },
                { value: 'k8s', label: '☸️ Kubernetes Pod' },
              ],
            });

            const targetConfig = await configureTarget(targetType as string);
            targets.push(targetConfig);

            addMore = await kit.confirm({
              message: 'Add another target?',
              default: false,
            });
          }

          return { targets };
        }
      },
      {
        id: 'confirm',
        title: 'Confirmation',
        component: async (context) => {
          // Show summary with preview
          const preview = generateProjectPreview(context);
          kit.log.info(preview);

          return await kit.confirm({
            message: 'Create project with these settings?',
            default: true,
          });
        }
      }
    ],
    onStepComplete: async (step, value, context) => {
      // Save progress for recovery
      await kit.saveState('.xec-wizard-state', { step, context });
    },
    allowBack: true,
    allowSkip: true,
    showProgress: true,
  });

  // Check if user cancelled the wizard
  if (kit.isCancel(result)) {
    kit.log.info('Project creation cancelled');
    return;
  }

  // Type-safe result access
  const wizardResult = result as NewProjectWizardResult;

  // Check if user confirmed (if confirmation step exists)
  if (wizardResult.confirm === false) {
    kit.log.info('Project creation skipped');
    return;
  }

  await createProjectFromWizard(wizardResult);
}

/**
 * Helper function to validate project name
 */
function validateProjectName(value: string): string | undefined {
  if (!value) return 'Project name is required';
  if (!/^[a-z][a-z0-9-]*$/.test(value)) {
    return 'Use lowercase letters, numbers, and hyphens (start with letter)';
  }
  if (value.length > 50) {
    return 'Project name must be less than 50 characters';
  }
  return undefined;
}

/**
 * Configure a target based on type
 */
async function configureTarget(type: string): Promise<any> {
  switch (type) {
    case 'ssh':
      return await kit.form({
        title: 'SSH Host Configuration',
        fields: [
          {
            name: 'name',
            type: 'text',
            message: 'Target name',
            placeholder: 'my-server',
            validate: (v) => v ? undefined : 'Name is required',
          },
          {
            name: 'host',
            type: 'text',
            message: 'Hostname or IP',
            placeholder: 'example.com',
            validate: (v) => v ? undefined : 'Host is required',
          },
          {
            name: 'username',
            type: 'text',
            message: 'Username',
            placeholder: 'user',
            validate: (v) => v ? undefined : 'Username is required',
          },
          {
            name: 'port',
            type: 'number',
            message: 'Port',
            default: 22,
            min: 1,
            max: 65535,
          },
        ]
      });

    case 'docker':
      return await kit.form({
        title: 'Docker Container Configuration',
        fields: [
          {
            name: 'name',
            type: 'text',
            message: 'Target name',
            placeholder: 'my-container',
            validate: (v) => v ? undefined : 'Name is required',
          },
          {
            name: 'image',
            type: 'text',
            message: 'Docker image',
            placeholder: 'ubuntu:latest',
            validate: (v) => v ? undefined : 'Image is required',
          },
          {
            name: 'workdir',
            type: 'text',
            message: 'Working directory',
            default: '/app',
          },
        ]
      });

    case 'k8s':
      return await kit.form({
        title: 'Kubernetes Pod Configuration',
        fields: [
          {
            name: 'name',
            type: 'text',
            message: 'Target name',
            placeholder: 'my-pod',
            validate: (v) => v ? undefined : 'Name is required',
          },
          {
            name: 'pod',
            type: 'text',
            message: 'Pod name',
            placeholder: 'app-pod',
            validate: (v) => v ? undefined : 'Pod is required',
          },
          {
            name: 'namespace',
            type: 'text',
            message: 'Namespace',
            default: 'default',
          },
        ]
      });

    default:
      return {};
  }
}

/**
 * Generate project preview
 */
function generateProjectPreview(context: any): string {
  const { type, details, features, targets } = context;

  let preview = chalk.bold(`\n📋 Project Summary\n`);
  preview += chalk.gray('─'.repeat(40)) + '\n';
  preview += `Type: ${chalk.cyan(type)}\n`;
  preview += `Name: ${chalk.green(details.name)}\n`;
  preview += `Description: ${details.description || 'No description'}\n`;

  if (details.language) {
    preview += `Language: ${chalk.yellow(details.language)}\n`;
  }

  preview += `Location: ${chalk.blue(details.location)}\n`;

  if (features && features.length > 0) {
    preview += `\nFeatures:\n`;
    features.forEach((f: string) => {
      preview += `  • ${f}\n`;
    });
  }

  if (targets?.targets && targets.targets.length > 0) {
    preview += `\nTargets:\n`;
    targets.targets.forEach((t: any) => {
      preview += `  • ${t.name} (${t.type || 'ssh'})\n`;
    });
  }

  return preview;
}

/**
 * Create project from wizard result
 */
async function createProjectFromWizard(result: NewProjectWizardResult) {
  const { type, details, features, targets } = result;
  const { name, description, location, language } = details;

  const targetDir = path.resolve(location, name);

  // Create project structure
  const spinner = kit.spinner('Creating project structure...');

  try {
    // Create directories
    await fs.ensureDir(targetDir);

    if (type === 'project') {
      // Create .xec directory
      const xecDir = path.join(targetDir, '.xec');
      await fs.ensureDir(xecDir);

      // Create config file
      const config = getDefaultConfig();
      config.name = name;
      config.description = description;

      // Add targets if configured
      if (targets?.targets && targets.targets.length > 0) {
        const configTargets: any = config.targets || {};
        targets.targets.forEach((t: any) => {
          const targetType = t.type || 'ssh';
          if (!configTargets[targetType]) {
            configTargets[targetType] = {};
          }
          configTargets[targetType][t.name] = t;
        });
        config.targets = configTargets;
      }

      const sorted = sortConfigKeys(config);
      const configPath = path.join(xecDir, 'config.yaml');
      await fs.writeFile(configPath, jsYaml.dump(sorted, { indent: 2 }));

      // Create project files
      const template = TEMPLATES.project;
      await fs.writeFile(
        path.join(targetDir, 'README.md'),
        template.files['README.md'](name, description || `A Xec project`)
      );

      // Create scripts directory
      const scriptsDir = path.join(targetDir, 'scripts');
      await fs.ensureDir(scriptsDir);

      if (!features || features.includes('examples')) {
        await fs.writeFile(
          path.join(scriptsDir, 'setup.js'),
          template.files['scripts/setup.js']()
        );
        await fs.writeFile(
          path.join(scriptsDir, 'deploy.js'),
          template.files['scripts/deploy.js']()
        );
      }

      // Initialize git if requested
      if (features && features.includes('git')) {
        spinner.setText('Initializing git repository...');
        const { $ } = await import('@xec-sh/core');
        await $`git init ${targetDir}`.quiet();

        // Create .gitignore
        await fs.writeFile(
          path.join(targetDir, '.gitignore'),
          `node_modules/
.env
.env.local
*.log
dist/
build/
.xec/secrets/
`
        );
      }

      // Add CI/CD if requested
      if (features && features.includes('ci')) {
        const githubDir = path.join(targetDir, '.github', 'workflows');
        await fs.ensureDir(githubDir);
        await fs.writeFile(
          path.join(githubDir, 'ci.yml'),
          `name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
`
        );
      }

      // Add Docker files if requested
      if (features && features.includes('docker')) {
        await fs.writeFile(
          path.join(targetDir, 'Dockerfile'),
          `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["npm", "start"]
`
        );

        await fs.writeFile(
          path.join(targetDir, 'docker-compose.yml'),
          `version: '3.8'
services:
  app:
    build: .
    volumes:
      - .:/app
    environment:
      - NODE_ENV=development
`
        );
      }
    } else if (type === 'script') {
      // Create script file
      const ext = language === 'typescript' ? 'ts' : 'js';
      const scriptPath = path.join(targetDir, `${name}.${ext}`);
      const template = TEMPLATES.script.template[ext as 'js' | 'ts'];

      const globalsPath = '../../../globals.d.ts';

      const content = ext === 'ts'
        ? (template as any)(name, description || 'Script created with Xec', globalsPath)
        : (template as any)(name, description || 'Script created with Xec');

      await fs.writeFile(scriptPath, content);
      await fs.chmod(scriptPath, 0o755);
    }

    spinner.success('Project created successfully!');

    // Show next steps
    kit.log.info('\n📚 Next steps:');
    if (type === 'project') {
      kit.log.step(`cd ${name}`);
      kit.log.step('npm install');
      kit.log.step('xec task build');
    } else if (type === 'script') {
      kit.log.step(`xec ${name}.${language === 'typescript' ? 'ts' : 'js'}`);
    }

  } catch (error) {
    spinner.error('Failed to create project');
    throw error;
  }
}