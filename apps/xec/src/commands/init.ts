import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { $ } from '@xec-sh/core';
import { Command } from 'commander';
import * as clack from '@clack/prompts';

interface InitOptions {
  minimal?: boolean;
  force?: boolean;
  skipGit?: boolean;
  name?: string;
  description?: string;
}

const CONFIG_TEMPLATE = `# Xec Project Configuration
name: {name}
description: {description}

# Default settings
defaults:
  adapter: local
  shell: /bin/bash
  timeout: 30000

# Environment-specific settings  
environments:
  development:
    env:
      NODE_ENV: development
      DEBUG: true
  
  production:
    env:
      NODE_ENV: production
      DEBUG: false

# SSH hosts configuration
ssh:
  defaults:
    port: 22
    keepAlive: true
  
  hosts:
    # example-server:
    #   host: example.com
    #   user: deploy
    #   key: ~/.ssh/id_rsa

# Docker configuration  
docker:
  defaults:
    network: bridge

# Kubernetes configuration
kubernetes:
  defaults:
    namespace: default
    # context: my-cluster
`;

const GITIGNORE_TEMPLATE = `# Xec project files
.xec/cache/
.xec/logs/
.xec/tmp/
.xec/.env
.xec/.env.*

# OS files
.DS_Store
Thumbs.db

# Editor files  
.vscode/
.idea/
*.swp
*.swo
`;

const EXAMPLE_SCRIPT = `#!/usr/bin/env xec

/**
 * Example Xec script
 * Run with: xec scripts/example.js
 */

// Use the $ function from @xec-sh/core
const result = await $\`echo "Hello from Xec!"\`;
log.success(result.stdout);

// Interactive prompts
const name = await question({
  message: 'What is your name?',
  defaultValue: 'World'
});

log.info(\`Hello, \${name}!\`);

// Work with files
const files = await glob('*.js');
log.step(\`Found \${files.length} JavaScript files\`);

// HTTP requests
const response = await fetch('https://api.github.com/users/github');
const data = await response.json();
log.info(\`GitHub has \${data.public_repos} public repos\`);

// Parallel execution
const results = await Promise.all([
  $\`echo "Task 1"\`,
  $\`echo "Task 2"\`,
  $\`echo "Task 3"\`
]);

log.success('All tasks completed!');
`;

const EXAMPLE_COMMAND = `/**
 * Example dynamic CLI command
 * This will be available as: xec hello [name]
 */

export function command(program) {
  program
    .command('hello [name]')
    .description('Say hello')
    .option('-u, --uppercase', 'Output in uppercase')
    .option('-r, --repeat <times>', 'Repeat the message', '1')
    .action(async (name = 'World', options) => {
      const { log } = await import('@clack/prompts');
      
      let message = \`Hello, \${name}!\`;
      
      if (options.uppercase) {
        message = message.toUpperCase();
      }
      
      const times = parseInt(options.repeat, 10);
      for (let i = 0; i < times; i++) {
        log.success(message);
      }
    });
}
`;

const DEPLOY_SCRIPT_TEMPLATE = `#!/usr/bin/env xec

/**
 * Deployment script
 * Run with: xec scripts/deploy.js [environment]
 */

const environment = args[0] || 'production';

log.info(chalk.bold(\`🚀 Deploying to \${environment}\`));

const spinner = clack.spinner();

try {
  // Load environment config
  spinner.start('Loading configuration...');
  const config = await loadConfig(environment);
  spinner.stop('Configuration loaded');

  // Run tests
  spinner.start('Running tests...');
  const testResult = await $\`npm test\`.nothrow();
  if (!testResult.isSuccess()) {
    throw new Error('Tests failed');
  }
  spinner.stop('Tests passed');

  // Build application
  spinner.start('Building application...');
  await $\`npm run build\`;
  spinner.stop('Build completed');

  // Deploy based on environment
  if (environment === 'production') {
    // Production deployment
    const $prod = $.ssh({
      host: config.host,
      username: config.user
    });
    
    spinner.start('Deploying to production...');
    await $prod\`cd /app && git pull\`;
    await $prod\`cd /app && npm install --production\`;
    await $prod\`cd /app && npm run migrate\`;
    await $prod\`sudo systemctl restart app\`;
    spinner.stop('Deployed to production');
  } else {
    // Staging deployment
    spinner.start('Deploying to staging...');
    await $\`docker build -t app:staging .\`;
    await $\`docker push app:staging\`;
    spinner.stop('Deployed to staging');
  }

  log.success(chalk.green(\`✅ Deployment to \${environment} completed!\`));
  
} catch (error) {
  spinner.stop(chalk.red('Deployment failed'));
  log.error(error.message);
  process.exit(1);
}

async function loadConfig(env) {
  // Load configuration for environment
  const configPath = path.join('.xec', 'config.yaml');
  const config = await yaml().then(y => y.parse(await fs.readFile(configPath, 'utf-8')));
  return config.environments[env] || {};
}
`;

export default function (program: Command) {
  program
    .command('init [directory]')
    .description('Initialize a new Xec project')
    .option('-m, --minimal', 'Create minimal project structure')
    .option('-f, --force', 'Overwrite existing files')
    .option('--skip-git', 'Skip git initialization')
    .option('--name <name>', 'Project name')
    .option('--description <desc>', 'Project description')
    .action(async (directory, options: InitOptions) => {
      try {
        const targetDir = path.resolve(directory || '.');
        const xecDir = path.join(targetDir, '.xec');

        // Check if .xec already exists
        if (fs.existsSync(xecDir) && !options.force) {
          const shouldContinue = await clack.confirm({
            message: '.xec directory already exists. Overwrite?',
            initialValue: false
          });

          if (!shouldContinue) {
            clack.log.info('Initialization cancelled');
            return;
          }
        }

        clack.intro(chalk.bold('🚀 Initialize Xec Project'));

        // Gather project information
        let projectName = options.name;
        let projectDescription = options.description;

        if (!options.minimal && !projectName) {
          projectName = await clack.text({
            message: 'Project name:',
            defaultValue: path.basename(targetDir),
            validate: (value) => {
              if (!value) return 'Project name is required';
              if (!/^[a-z0-9-_]+$/i.test(value)) {
                return 'Project name must contain only letters, numbers, hyphens, and underscores';
              }
              return undefined;
            }
          }) as string;
        }

        if (!options.minimal && !projectDescription) {
          projectDescription = await clack.text({
            message: 'Project description:',
            defaultValue: 'An Xec automation project'
          }) as string;
        }

        const tasks = clack.spinner();

        // Create directory structure
        tasks.start('Creating project structure...');

        const dirs = [
          '.xec',
          '.xec/scripts',
          '.xec/commands',
          '.xec/cache',
          '.xec/logs'
        ];

        for (const dir of dirs) {
          await fs.ensureDir(path.join(targetDir, dir));
        }

        // Create config file
        const configContent = CONFIG_TEMPLATE
          .replace('{name}', projectName || 'xec-project')
          .replace('{description}', projectDescription || 'An Xec automation project');

        await fs.writeFile(
          path.join(xecDir, 'config.yaml'),
          configContent
        );

        // Create .gitignore
        await fs.writeFile(
          path.join(xecDir, '.gitignore'),
          GITIGNORE_TEMPLATE
        );

        if (!options.minimal) {
          // Create example script
          await fs.writeFile(
            path.join(xecDir, 'scripts', 'example.js'),
            EXAMPLE_SCRIPT
          );

          // Create example command
          await fs.writeFile(
            path.join(xecDir, 'commands', 'hello.js'),
            EXAMPLE_COMMAND
          );

          // Create deploy script template
          await fs.writeFile(
            path.join(xecDir, 'scripts', 'deploy.js'),
            DEPLOY_SCRIPT_TEMPLATE
          );

          // Create README
          const readmeContent = `# ${projectName || 'Xec Project'}

${projectDescription || 'An Xec automation project'}

## Getting Started

1. Run example script:
   \`\`\`bash
   xec .xec/scripts/example.js
   \`\`\`

2. Try the custom command:
   \`\`\`bash
   xec hello YourName
   \`\`\`

3. Deploy (example):
   \`\`\`bash
   xec .xec/scripts/deploy.js production
   \`\`\`

## Project Structure

- \`.xec/config.yaml\` - Project configuration
- \`.xec/scripts/\` - Xec scripts
- \`.xec/commands/\` - Custom CLI commands
- \`.xec/cache/\` - Cache directory
- \`.xec/logs/\` - Log files

## Learn More

- [Xec Documentation](https://github.com/xec-sh/xec)
- [Writing Scripts](https://github.com/xec-sh/xec/docs/scripts)
- [Custom Commands](https://github.com/xec-sh/xec/docs/commands)
`;

          await fs.writeFile(
            path.join(xecDir, 'README.md'),
            readmeContent
          );
        }

        tasks.stop('Project structure created');

        // Initialize git if not skipped
        if (!options.skipGit && !fs.existsSync(path.join(targetDir, '.git'))) {
          const shouldInitGit = await clack.confirm({
            message: 'Initialize git repository?',
            initialValue: true
          });

          if (shouldInitGit) {
            tasks.start('Initializing git repository...');
            await $`cd ${targetDir} && git init`;
            await $`cd ${targetDir} && git add .xec`;
            await $`cd ${targetDir} && git commit -m "Initialize Xec project"`.nothrow();
            tasks.stop('Git repository initialized');
          }
        }

        clack.outro(chalk.green('✅ Xec project initialized successfully!'));

        if (!options.minimal) {
          clack.log.info('\nNext steps:');
          clack.log.info(`  ${chalk.cyan('cd')} ${directory || '.'}`);
          clack.log.info(`  ${chalk.cyan('xec')} .xec/scripts/example.js`);
          clack.log.info(`  ${chalk.cyan('xec')} hello World`);
        }

      } catch (error) {
        clack.log.error(error instanceof Error ? error.message : 'Initialization failed');
        process.exit(1);
      }
    });
}