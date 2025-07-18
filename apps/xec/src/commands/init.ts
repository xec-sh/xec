import { z } from 'zod';
import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs/promises';

import { BaseCommand } from '../utils/command-base.js';
import { validateOptions } from '../utils/validation.js';

interface InitOptions {
  template?: string;
  minimal?: boolean;
  interactive?: boolean;
  force?: boolean;
  name?: string;
  description?: string;
  author?: string;
  license?: string;
}

interface ProjectTemplate {
  name: string;
  description: string;
  files: Record<string, string>;
  directories: string[];
  dependencies?: string[];
  devDependencies?: string[];
  scripts?: Record<string, string>;
}

class InitCommand extends BaseCommand {
  constructor() {
    super({
      name: 'init',
      description: 'Initialize a new Xec project',
      arguments: '[directory]',
      options: [
        {
          flags: '--template <name>',
          description: 'Use a project template (web, api, cli, minimal)',
        },
        {
          flags: '--minimal',
          description: 'Create minimal project structure',
        },
        {
          flags: '--interactive',
          description: 'Interactive project setup',
        },
        {
          flags: '--force',
          description: 'Force initialization even if directory is not empty',
        },
        {
          flags: '--name <name>',
          description: 'Project name',
        },
        {
          flags: '--description <description>',
          description: 'Project description',
        },
        {
          flags: '--author <author>',
          description: 'Project author',
        },
        {
          flags: '--license <license>',
          description: 'Project license',
          defaultValue: 'MIT',
        },
      ],
      examples: [
        {
          command: 'xec init',
          description: 'Initialize project in current directory',
        },
        {
          command: 'xec init my-project',
          description: 'Initialize project in new directory',
        },
        {
          command: 'xec init --template web',
          description: 'Initialize with web template',
        },
        {
          command: 'xec init --interactive',
          description: 'Interactive project setup',
        },
        {
          command: 'xec init --minimal',
          description: 'Create minimal project structure',
        },
      ],
      validateOptions: (options) => {
        const schema = z.object({
          template: z.enum(['web', 'api', 'cli', 'minimal']).optional(),
          minimal: z.boolean().optional(),
          interactive: z.boolean().optional(),
          force: z.boolean().optional(),
          name: z.string().optional(),
          description: z.string().optional(),
          author: z.string().optional(),
          license: z.string().optional(),
        });
        validateOptions(options, schema);
      },
    });
  }

  async execute(args: any[]): Promise<void> {
    const [directory] = args;
    const options = args[args.length - 1] as InitOptions;

    // Determine target directory
    const targetDir = directory || process.cwd();
    const projectName = options.name || path.basename(targetDir);

    this.intro(chalk.bgBlue(' Xec Project Initialization '));

    // Check if directory exists and is empty
    await this.checkDirectory(targetDir, options.force || false);

    // Get project configuration
    const projectConfig = await this.getProjectConfig(projectName, options);

    // Create project structure
    await this.createProjectStructure(targetDir, projectConfig, options);

    // Install dependencies if not dry run
    if (!this.isDryRun()) {
      await this.installDependencies(targetDir, projectConfig);
    }

    this.outro(chalk.green('✓ Project initialized successfully!'));
    this.showNextSteps(targetDir, projectName);
  }

  private async checkDirectory(targetDir: string, force: boolean): Promise<void> {
    try {
      const stats = await fs.stat(targetDir);
      if (stats.isDirectory()) {
        const files = await fs.readdir(targetDir);
        if (files.length > 0 && !force) {
          const shouldContinue = await this.confirm(
            `Directory ${targetDir} is not empty. Continue?`,
            false
          );
          if (!shouldContinue) {
            throw new Error('Initialization cancelled');
          }
        }
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Directory doesn't exist, create it
        await fs.mkdir(targetDir, { recursive: true });
      } else {
        throw error;
      }
    }
  }

  private async getProjectConfig(projectName: string, options: InitOptions): Promise<any> {
    let config: any = {
      name: projectName,
      description: options.description || '',
      author: options.author || '',
      license: options.license || 'MIT',
      template: options.template || 'minimal',
    };

    if (options.interactive) {
      config = await this.interactiveSetup(config);
    }

    return config;
  }

  private async interactiveSetup(initialConfig: any): Promise<any> {
    const config = { ...initialConfig };

    // Project name
    config.name = await this.prompt(
      'Project name',
      config.name
    );

    // Project description
    config.description = await this.prompt(
      'Project description',
      config.description
    );

    // Author
    config.author = await this.prompt(
      'Author',
      config.author
    );

    // License
    config.license = await this.select(
      'License',
      [
        { value: 'MIT', label: 'MIT' },
        { value: 'Apache-2.0', label: 'Apache 2.0' },
        { value: 'GPL-3.0', label: 'GPL 3.0' },
        { value: 'BSD-3-Clause', label: 'BSD 3-Clause' },
        { value: 'ISC', label: 'ISC' },
        { value: 'UNLICENSED', label: 'Unlicensed' },
      ]
    );

    // Template
    config.template = await this.select(
      'Project template',
      [
        { value: 'minimal', label: 'Minimal', hint: 'Basic project structure' },
        { value: 'web', label: 'Web Application', hint: 'Full-stack web app template' },
        { value: 'api', label: 'API Service', hint: 'REST API service template' },
        { value: 'cli', label: 'CLI Tool', hint: 'Command-line tool template' },
      ]
    );

    return config;
  }

  private async createProjectStructure(
    targetDir: string,
    config: any,
    options: InitOptions
  ): Promise<void> {
    this.startSpinner('Creating project structure...');

    const template = this.getTemplate(config.template, options.minimal || false);

    // Create directories
    for (const dir of template.directories) {
      const dirPath = path.join(targetDir, dir);
      await fs.mkdir(dirPath, { recursive: true });
    }

    // Create files
    for (const [filePath, content] of Object.entries(template.files)) {
      const fullPath = path.join(targetDir, filePath);
      const processedContent = this.processTemplate(content, config);
      await fs.writeFile(fullPath, processedContent);
    }

    // Create package.json
    const packageJson = this.createPackageJson(config, template);
    await fs.writeFile(
      path.join(targetDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    // Create xec.config.yaml
    const xecConfig = this.createXecConfig(config);
    await fs.writeFile(
      path.join(targetDir, 'xec.config.yaml'),
      xecConfig
    );

    // Create .gitignore
    const gitignore = this.createGitignore(config);
    await fs.writeFile(
      path.join(targetDir, '.gitignore'),
      gitignore
    );

    // Create README.md
    const readme = this.createReadme(config);
    await fs.writeFile(
      path.join(targetDir, 'README.md'),
      readme
    );

    this.stopSpinner('✓ Project structure created');
  }

  private getTemplate(templateName: string, minimal: boolean): ProjectTemplate {
    const baseTemplate: ProjectTemplate = {
      name: 'minimal',
      description: 'Minimal Xec project',
      directories: [
        'src',
        'recipes',
        'modules',
        'scripts',
        '.xec',
        'tests',
      ],
      files: {
        'src/index.ts': '// Main application entry point\nexport default function main() {\n  console.log("Hello, Xec!");\n}\n',
        'recipes/hello.ts': this.getHelloRecipeTemplate(),
        'scripts/deploy.ts': this.getDeployScriptTemplate(),
        'tsconfig.json': this.getTsConfigTemplate(),
        '.xec/config.yaml': 'version: "1.0"\n',
      },
      dependencies: ['@xec/core'],
      devDependencies: ['typescript', '@types/node'],
      scripts: {
        'build': 'tsc',
        'dev': 'tsc --watch',
        'start': 'node dist/index.js',
        'test': 'vitest',
        'lint': 'eslint src --ext .ts',
      },
    };

    if (minimal) {
      return {
        ...baseTemplate,
        directories: ['src', 'recipes', '.xec'],
        files: {
          'src/index.ts': baseTemplate.files['src/index.ts'] || '',
          'recipes/hello.ts': baseTemplate.files['recipes/hello.ts'] || '',
          'tsconfig.json': baseTemplate.files['tsconfig.json'] || '',
        },
      };
    }

    return baseTemplate;
  }

  private processTemplate(content: string, config: any): string {
    return content
      .replace(/\{\{name\}\}/g, config.name)
      .replace(/\{\{description\}\}/g, config.description)
      .replace(/\{\{author\}\}/g, config.author)
      .replace(/\{\{license\}\}/g, config.license);
  }

  private createPackageJson(config: any, template: ProjectTemplate): any {
    return {
      name: config.name,
      version: '1.0.0',
      description: config.description,
      author: config.author,
      license: config.license,
      type: 'module',
      main: 'dist/index.js',
      scripts: template.scripts,
      dependencies: template.dependencies?.reduce((acc, dep) => {
        acc[dep] = 'latest';
        return acc;
      }, {} as Record<string, string>),
      devDependencies: template.devDependencies?.reduce((acc, dep) => {
        acc[dep] = 'latest';
        return acc;
      }, {} as Record<string, string>),
      engines: {
        node: '>=18.0.0',
      },
    };
  }

  private createXecConfig(config: any): string {
    return `# Xec Configuration
version: "1.0"
name: ${config.name}
description: ${config.description}
author: ${config.author}

# Default settings
defaults:
  verbose: false
  dryRun: false
  parallel: false
  timeout: 300000

# Environments
environments:
  development:
    type: local
    variables:
      NODE_ENV: development
  
  production:
    type: remote
    variables:
      NODE_ENV: production

# Modules
modules:
  - "@xec/core"

# Module paths
modulePaths:
  - "./modules"
  - "./node_modules"
`;
  }

  private createGitignore(config: any): string {
    return `# Dependencies
node_modules/

# Build output
dist/
build/

# Environment files
.env
.env.local
.env.*.local

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Xec specific
.xec/state/
.xec/cache/
.xec/secrets/
`;
  }

  private createReadme(config: any): string {
    return `# ${config.name}

${config.description}

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- Yarn or npm

### Installation

\`\`\`bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev
\`\`\`

### Usage

\`\`\`bash
# Run a recipe
xec run hello

# Run a task
xec task example

# Run a script
xec script scripts/deploy.ts

# Interactive mode
xec script --repl
\`\`\`

## Project Structure

\`\`\`
${config.name}/
├── src/                 # Source code
├── recipes/             # Xec recipes
├── scripts/             # Xec scripts
├── modules/             # Custom modules
├── tests/               # Test files
├── .xec/                # Xec configuration
├── xec.config.yaml      # Main configuration
├── package.json         # Package configuration
└── tsconfig.json        # TypeScript configuration
\`\`\`

## Development

### Running Tests

\`\`\`bash
npm test
\`\`\`

### Linting

\`\`\`bash
npm run lint
\`\`\`

### Building

\`\`\`bash
npm run build
\`\`\`

## Documentation

- [Xec Documentation](https://docs.xec.sh)
- [API Reference](https://docs.xec.sh/api)
- [Examples](https://github.com/xec-sh/examples)

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the ${config.license} License - see the LICENSE file for details.
`;
  }

  private async installDependencies(targetDir: string, config: any): Promise<void> {
    this.startSpinner('Installing dependencies...');

    try {
      const { $ } = await import('@xec/ush');
      
      // Change to target directory
      process.chdir(targetDir);
      
      // Install dependencies
      await $`npm install`;
      
      this.stopSpinner('✓ Dependencies installed');
    } catch (error) {
      this.stopSpinner('⚠ Failed to install dependencies');
      this.log('Run "npm install" manually to install dependencies', 'warn');
    }
  }

  private showNextSteps(targetDir: string, projectName: string): void {
    console.log(chalk.bold('\n🚀 Next Steps:'));
    console.log(`  1. ${chalk.cyan(`cd ${targetDir}`)}`);
    console.log(`  2. ${chalk.cyan('npm install')} (if not already done)`);
    console.log(`  3. ${chalk.cyan('npm run dev')} (start development)`);
    console.log(`  4. ${chalk.cyan('xec run hello')} (run your first recipe)`);
    console.log(`  5. ${chalk.cyan('xec script --repl')} (explore interactively)`);
    
    console.log(chalk.bold('\n📚 Learn More:'));
    console.log(`  • ${chalk.blue('https://docs.xec.sh')} - Documentation`);
    console.log(`  • ${chalk.blue('https://github.com/xec-sh/examples')} - Examples`);
    console.log(`  • ${chalk.blue('xec --help')} - CLI help`);
  }

  // Template methods
  private getHelloRecipeTemplate(): string {
    return `import { recipe, task, log } from '@xec/core';

export default recipe('hello')
  .description('Hello World recipe')
  .task(
    task('greet')
      .description('Greet the user')
      .run(async (ctx) => {
        const name = ctx.vars.name || 'World';
        log(\`Hello, \${name}!\`);
        return \`Greeted \${name}\`;
      })
  )
  .task(
    task('info')
      .description('Show system info')
      .run(async (ctx) => {
        const stdlib = await ctx.stdlib();
        const info = await stdlib.os.info();
        log(\`Running on \${info.platform} \${info.arch}\`);
        return info;
      })
  );
`;
  }

  private getDeployScriptTemplate(): string {
    return `#!/usr/bin/env xec script
// Example deployment script

import { $, log, recipe, task } from '@xec/core';

const deployRecipe = recipe('deploy')
  .description('Deploy application')
  .task(
    task('build')
      .description('Build application')
      .run(async () => {
        log('Building application...');
        await $\`npm run build\`;
        return 'Build completed';
      })
  )
  .task(
    task('test')
      .description('Run tests')
      .run(async () => {
        log('Running tests...');
        await $\`npm test\`;
        return 'Tests passed';
      })
  )
  .task(
    task('deploy')
      .description('Deploy to server')
      .depends('build', 'test')
      .run(async (ctx) => {
        const env = ctx.vars.environment || 'development';
        log(\`Deploying to \${env}...\`);
        
        // Your deployment logic here
        
        return \`Deployed to \${env}\`;
      })
  );

// Run the recipe
await deployRecipe.run();
`;
  }

  private getTsConfigTemplate(): string {
    return `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "removeComments": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noImplicitThis": true,
    "strictNullChecks": true
  },
  "include": [
    "src/**/*",
    "recipes/**/*",
    "scripts/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "tests"
  ]
}`;
  }
}

export default function initCommand(program: any): void {
  program.addCommand(new InitCommand().create());
}