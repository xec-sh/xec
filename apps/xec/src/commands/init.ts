import path from 'path';
import chalk from 'chalk';
import fs from 'fs/promises';
import { Command } from 'commander';
import { fileURLToPath } from 'url';
import * as clack from '@clack/prompts';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface InitOptions {
  template: 'basic' | 'advanced' | 'monorepo';
  name?: string;
  description?: string;
  git: boolean;
  install: boolean;
}

export default function (program: Command) {
  program
    .command('init [directory]')
    .description('Initialize a new Xec project')
    .option('-t, --template <template>', 'Project template', 'basic')
    .option('-n, --name <name>', 'Project name')
    .option('-d, --description <description>', 'Project description')
    .option('--no-git', 'Skip git initialization')
    .option('--no-install', 'Skip dependency installation')
    .action(async (directory = '.', options: InitOptions) => {
      clack.intro(chalk.bgBlue(' Xec Project Initialization '));

      const projectDir = path.resolve(directory);
      const isMonorepo = await detectMonorepo(projectDir);

      // Gather project information
      const projectInfo = await clack.group({
        name: () => clack.text({
          message: 'Project name:',
          placeholder: path.basename(projectDir),
          defaultValue: options.name || path.basename(projectDir),
        }),
        description: () => clack.text({
          message: 'Project description:',
          placeholder: 'An Xec automation project',
          defaultValue: options.description || 'An Xec automation project',
        }),
        template: () => clack.select({
          message: 'Select project template:',
          options: [
            { value: 'basic', label: 'Basic - Simple project structure' },
            { value: 'advanced', label: 'Advanced - Full-featured project' },
            { value: 'monorepo', label: 'Monorepo - Part of monorepo', hint: isMonorepo ? 'Detected' : undefined },
          ],
          initialValue: isMonorepo ? 'monorepo' : options.template,
        }),
        features: () => clack.multiselect({
          message: 'Select features to include:',
          options: [
            { value: 'typescript', label: 'TypeScript support', hint: 'recommended' },
            { value: 'docker', label: 'Docker integration' },
            { value: 'kubernetes', label: 'Kubernetes support' },
            { value: 'aws', label: 'AWS integration' },
            { value: 'testing', label: 'Testing framework' },
          ],
          required: false,
        }),
      });

      const spinner = clack.spinner();

      try {
        // Create project structure
        spinner.start('Creating project structure');

        const xecDir = path.join(projectDir, '.xec');
        const dirs = [
          xecDir,
          path.join(xecDir, 'recipes'),
          path.join(xecDir, 'modules'),
          path.join(xecDir, 'commands'),
          path.join(xecDir, 'scripts'),
          path.join(xecDir, 'vars'),
          path.join(xecDir, 'cache'),
          path.join(xecDir, 'logs'),
        ];

        // Add template-specific directories
        if (projectInfo.template !== 'monorepo') {
          dirs.push(
            path.join(projectDir, 'src'),
            path.join(projectDir, 'test'),
          );
        }

        for (const dir of dirs) {
          await fs.mkdir(dir, { recursive: true });
        }

        spinner.stop('Project structure created');

        // Create configuration files
        spinner.start('Creating configuration files');

        // Create .xec/config.json
        const xecConfig = {
          name: projectInfo.name,
          description: projectInfo.description,
          version: '1.0.0',
          template: projectInfo.template,
          features: projectInfo.features || [],
          modules: {},
          commands: {},
          scripts: {
            preInstall: '',
            postInstall: '',
            preDeploy: '',
            postDeploy: '',
          },
        };

        await fs.writeFile(
          path.join(xecDir, 'config.json'),
          JSON.stringify(xecConfig, null, 2)
        );

        // Create example recipe
        const exampleRecipe = `import { recipe, task } from '@xec/core';

export const deploy = recipe('deploy')
  .description('${projectInfo.description} deployment')
  .vars({
    environment: 'development',
    version: 'latest'
  })
  .task(task('validate')
    .description('Validate configuration')
    .handler(async (context) => {
      context.logger.info('Validating configuration...');
      // Add your validation logic here
      return { valid: true };
    })
  )
  .task(task('prepare')
    .description('Prepare deployment')
    .depends('validate')
    .handler(async (context) => {
      context.logger.info(\`Preparing \${context.vars.environment} deployment\`);
      return { prepared: true };
    })
  )
  .task(task('deploy')
    .description('Deploy application')
    .depends('prepare')
    .handler(async (context) => {
      context.logger.info(\`Deploying version \${context.vars.version}\`);
      return { deployed: true };
    })
  )
  .build();

export default deploy;
`;

        await fs.writeFile(
          path.join(xecDir, 'recipes', 'deploy.js'),
          exampleRecipe
        );

        // Create example script
        const exampleScript = `#!/usr/bin/env xec

// This is an example Xec script
// It demonstrates the power of Xec scripting with @xec/ush

import { $, cd, echo, sleep, spinner } from '@xec/core/script';

echo(chalk.blue('Starting deployment process...'));

const s = spinner('Checking environment');
await sleep(1000);
s.succeed();

// Execute commands with full ush power
const result = await $\`ls -la\`;
echo(result.stdout);

// Change directory
cd('.xec');

// Use all Node.js features
const config = await fs.readJSON('./config.json');
echo(\`Project: \${config.name}\`);

// Integration with Xec recipes
if (argv.deploy) {
  await runRecipe('deploy', { 
    environment: argv.env || 'development' 
  });
}
`;

        await fs.writeFile(
          path.join(xecDir, 'scripts', 'example.mjs'),
          exampleScript
        );
        await fs.chmod(path.join(xecDir, 'scripts', 'example.mjs'), 0o755);

        // Create example dynamic command
        const exampleCommand = `// Example dynamic command for Xec CLI
// This extends the CLI with custom commands

export function command(program) {
  program
    .command('custom:hello [name]')
    .description('Custom hello command')
    .option('-u, --uppercase', 'Output in uppercase')
    .action((name = 'World', options) => {
      const message = \`Hello, \${name}!\`;
      console.log(options.uppercase ? message.toUpperCase() : message);
    });
}
`;

        await fs.writeFile(
          path.join(xecDir, 'commands', 'hello.js'),
          exampleCommand
        );

        // Create .gitignore
        const gitignore = `# Xec
.xec/cache/
.xec/logs/
.xec/vars/*.local.json

# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.npm

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Build
dist/
build/
*.log
`;

        await fs.writeFile(path.join(projectDir, '.gitignore'), gitignore);

        // Create or update package.json
        let packageJson: any = {};
        const packageJsonPath = path.join(projectDir, 'package.json');

        try {
          const existing = await fs.readFile(packageJsonPath, 'utf-8');
          packageJson = JSON.parse(existing);
        } catch {
          // New package.json
          packageJson = {
            name: projectInfo.name,
            version: '1.0.0',
            description: projectInfo.description,
            type: 'module',
          };
        }

        // Add Xec scripts
        packageJson.scripts = {
          ...packageJson.scripts,
          'xec': 'xec',
          'deploy': 'xec run deploy',
          'deploy:prod': 'xec run deploy --var environment=production',
          'script': 'xec .xec/scripts/example.mjs',
        };

        // Add dependencies
        packageJson.dependencies = {
          ...packageJson.dependencies,
          '@xec/core': '^2.0.0',
        };

        if (projectInfo.features?.includes('typescript')) {
          packageJson.devDependencies = {
            ...packageJson.devDependencies,
            '@types/node': '^20.0.0',
            'typescript': '^5.0.0',
          };
        }

        await fs.writeFile(
          packageJsonPath,
          JSON.stringify(packageJson, null, 2)
        );

        spinner.stop('Configuration files created');

        // Initialize git
        if (options.git && !isMonorepo) {
          spinner.start('Initializing git repository');
          try {
            execSync('git init', { cwd: projectDir, stdio: 'ignore' });
            execSync('git add .', { cwd: projectDir, stdio: 'ignore' });
            execSync('git commit -m "Initial Xec project setup"', { cwd: projectDir, stdio: 'ignore' });
            spinner.stop('Git repository initialized');
          } catch {
            spinner.stop('Git initialization skipped');
          }
        }

        // Install dependencies
        if (options.install) {
          spinner.start('Installing dependencies');
          try {
            const packageManager = await detectPackageManager();
            execSync(`${packageManager} install`, { cwd: projectDir, stdio: 'ignore' });
            spinner.stop('Dependencies installed');
          } catch {
            spinner.stop('Dependency installation failed');
            clack.log.warn('Please run npm/yarn install manually');
          }
        }

        clack.outro(chalk.green('✨ Xec project initialized successfully!'));

        // Show next steps
        clack.log.info(chalk.bold('\nNext steps:'));
        if (directory !== '.') {
          clack.log.info(`  ${chalk.cyan(`cd ${directory}`)}`);
        }
        if (!options.install) {
          clack.log.info(`  ${chalk.cyan('npm install')}`);
        }
        clack.log.info(`  ${chalk.cyan('xec run deploy')} - Run the example deployment`);
        clack.log.info(`  ${chalk.cyan('xec .xec/scripts/example.mjs')} - Run example script`);
        clack.log.info(`  ${chalk.cyan('xec custom:hello')} - Try the dynamic command`);
        clack.log.info(`\n${chalk.dim('Learn more at https://xec.dev')}`);

      } catch (error) {
        spinner.stop('Error');
        clack.log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function detectMonorepo(dir: string): Promise<boolean> {
  let currentDir = dir;
  while (currentDir !== path.dirname(currentDir)) {
    try {
      const files = await fs.readdir(currentDir);
      if (files.includes('lerna.json') || files.includes('pnpm-workspace.yaml') || files.includes('rush.json')) {
        return true;
      }
      const packageJson = path.join(currentDir, 'package.json');
      const content = await fs.readFile(packageJson, 'utf-8');
      const pkg = JSON.parse(content);
      if (pkg.workspaces) {
        return true;
      }
    } catch {
      // Continue
    }
    currentDir = path.dirname(currentDir);
  }
  return false;
}

async function detectPackageManager(): Promise<string> {
  try {
    execSync('yarn --version', { stdio: 'ignore' });
    return 'yarn';
  } catch {
    try {
      execSync('pnpm --version', { stdio: 'ignore' });
      return 'pnpm';
    } catch {
      return 'npm';
    }
  }
}