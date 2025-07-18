import chalk from 'chalk';
import * as path from 'path';
import { $ } from '@xec/ush';
import { table } from 'table';
import { Command } from 'commander';
import { promises as fs } from 'fs';
import { confirm, spinner } from '@clack/prompts';
import { type TaskContext, type EnvironmentInfo, createStandardLibrary } from '@xec/core';

import { getProjectRoot } from '../utils/project.js';

interface ModuleManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  main: string;
  types?: string;
  dependencies?: Record<string, string>;
  xec?: {
    type: 'task' | 'helper' | 'pattern' | 'integration' | 'mixed';
    tasks?: string[];
    helpers?: string[];
    patterns?: string[];
    integrations?: string[];
  };
}

interface InstalledModule {
  manifest: ModuleManifest;
  path: string;
  enabled: boolean;
}

export default function moduleCommand(program: Command) {
  const module = program
    .command('module')
    .alias('mod')
    .description('Manage modules and extensions');

  module
    .command('list')
    .alias('ls')
    .description('List installed modules')
    .option('--type <type>', 'Filter by type (task|helper|pattern|integration)')
    .option('--enabled', 'Show only enabled modules')
    .option('--disabled', 'Show only disabled modules')
    .option('--json', 'Output as JSON')
    .action(async (options?: any) => {
      try {
        const modules = await listInstalledModules();
        
        // Filter modules
        let filtered = modules;
        if (options?.type) {
          filtered = filtered.filter(m => m.manifest.xec?.type === options.type);
        }
        if (options?.enabled) {
          filtered = filtered.filter(m => m.enabled);
        }
        if (options?.disabled) {
          filtered = filtered.filter(m => !m.enabled);
        }

        if (options?.json) {
          console.log(JSON.stringify(filtered, null, 2));
          return;
        }

        if (filtered.length === 0) {
          console.log(chalk.yellow('No modules found'));
          return;
        }

        console.log(chalk.bold('\nInstalled Modules:\n'));
        
        // Show built-in modules first
        console.log(chalk.cyan('Built-in Modules:'));
        const builtinModules = [
          { name: '@xec/core:core', description: 'Core module with basic operations', type: 'task' },
          { name: '@xec/core:file', description: 'File system operations', type: 'task' },
          { name: '@xec/core:system', description: 'System operations', type: 'task' },
          { name: '@xec/core:network', description: 'Network operations', type: 'task' },
          { name: '@xec/core:process', description: 'Process management', type: 'task' },
        ];
        
        // Show stdlib modules
        console.log(chalk.cyan('\nStandard Library Modules:'));
        const stdlibModules = [
          { name: 'std:fs', description: 'File system operations', type: 'stdlib' },
          { name: 'std:http', description: 'HTTP client operations', type: 'stdlib' },
          { name: 'std:os', description: 'Operating system information', type: 'stdlib' },
          { name: 'std:proc', description: 'Process management', type: 'stdlib' },
          { name: 'std:pkg', description: 'Package management', type: 'stdlib' },
          { name: 'std:svc', description: 'Service management', type: 'stdlib' },
          { name: 'std:net', description: 'Network utilities', type: 'stdlib' },
          { name: 'std:crypto', description: 'Cryptographic operations', type: 'stdlib' },
          { name: 'std:time', description: 'Time and date utilities', type: 'stdlib' },
          { name: 'std:json', description: 'JSON utilities', type: 'stdlib' },
          { name: 'std:yaml', description: 'YAML utilities', type: 'stdlib' },
          { name: 'std:env', description: 'Environment variables', type: 'stdlib' },
          { name: 'std:template', description: 'Template engine', type: 'stdlib' },
        ];
        
        const builtinTable = [['Name', 'Description', 'Type']];
        for (const mod of builtinModules) {
          builtinTable.push([mod.name, mod.description, mod.type]);
        }
        console.log(table(builtinTable));
        
        const stdlibTable = [['Name', 'Description', 'Type']];
        for (const mod of stdlibModules) {
          stdlibTable.push([mod.name, mod.description, mod.type]);
        }
        console.log(table(stdlibTable));

        // Show custom modules
        if (filtered.length > 0) {
          console.log(chalk.cyan('\nCustom Modules:'));
          const customTable = [['Name', 'Version', 'Type', 'Status', 'Description']];
          
          for (const mod of filtered) {
            customTable.push([
              mod.manifest.name,
              mod.manifest.version,
              mod.manifest.xec?.type || 'unknown',
              mod.enabled ? chalk.green('enabled') : chalk.gray('disabled'),
              mod.manifest.description || '-',
            ]);
          }
          
          console.log(table(customTable));
        }

        console.log(chalk.gray(`\nTotal: ${builtinModules.length} built-in, ${stdlibModules.length} stdlib, ${filtered.length} custom module(s)`));
        
      } catch (error) {
        console.error(chalk.red(`Failed to list modules: ${error}`));
        process.exit(1);
      }
    });

  module
    .command('install <module>')
    .description('Install a module')
    .option('--dev', 'Install as development dependency')
    .option('--registry <url>', 'Use custom registry')
    .action(async (moduleName: string, options?: any) => {
      try {
        const s = spinner();
        s.start(`Installing module ${moduleName}...`);

        // In a real implementation, this would:
        // 1. Fetch module from registry
        // 2. Download and extract
        // 3. Validate manifest
        // 4. Install dependencies
        // 5. Register with module system

        // For now, simulate local installation
        const projectRoot = await getProjectRoot();
        const modulesDir = path.join(projectRoot, '.xec', 'modules');
        await fs.mkdir(modulesDir, { recursive: true });

        // Check if module exists locally
        const localModulePath = path.resolve(moduleName);
        let modulePath: string;
        
        try {
          const stats = await fs.stat(localModulePath);
          if (stats.isDirectory()) {
            // Local module installation
            s.message('Installing from local path...');
            modulePath = localModulePath;
          } else {
            throw new Error('Not a directory');
          }
        } catch {
          // Would fetch from registry in real implementation
          s.stop(chalk.red(`✗ Module '${moduleName}' not found`));
          console.log(chalk.gray('\nNote: Remote registry not yet implemented. Please provide a local path.'));
          process.exit(1);
        }

        // Load and validate manifest
        const manifestPath = path.join(modulePath, 'package.json');
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as ModuleManifest;
        
        if (!manifest.xec) {
          s.stop(chalk.red('✗ Not a valid Xec module (missing xec configuration)'));
          process.exit(1);
        }

        // Copy module to .xec/modules
        const targetPath = path.join(modulesDir, manifest.name);
        await copyDirectory(modulePath, targetPath);

        // Save module info
        await saveModuleInfo({
          manifest,
          path: targetPath,
          enabled: true,
        });

        s.stop(chalk.green(`✓ Module '${manifest.name}' installed successfully`));
        
        // Show module info
        console.log(chalk.bold('\nModule Information:'));
        console.log(`  Name: ${manifest.name}`);
        console.log(`  Version: ${manifest.version}`);
        console.log(`  Type: ${manifest.xec.type}`);
        if (manifest.xec.tasks?.length) {
          console.log(`  Tasks: ${manifest.xec.tasks.join(', ')}`);
        }
        if (manifest.xec.helpers?.length) {
          console.log(`  Helpers: ${manifest.xec.helpers.join(', ')}`);
        }
        
      } catch (error) {
        console.error(chalk.red(`Failed to install module: ${error}`));
        process.exit(1);
      }
    });

  module
    .command('uninstall <module>')
    .alias('remove')
    .description('Remove a module')
    .option('--force', 'Skip confirmation')
    .action(async (moduleName: string, options?: { force?: boolean }) => {
      try {
        const modules = await listInstalledModules();
        const module = modules.find(m => m.manifest.name === moduleName);
        
        if (!module) {
          console.log(chalk.red(`Module '${moduleName}' not found`));
          process.exit(1);
        }

        if (!options?.force) {
          const confirmed = await confirm({
            message: `Remove module '${moduleName}'?`,
            initialValue: false,
          });
          
          if (!confirmed) {
            console.log(chalk.yellow('Operation cancelled'));
            return;
          }
        }

        // Remove module directory
        await fs.rm(module.path, { recursive: true, force: true });
        
        // Remove from installed modules
        await removeModuleInfo(moduleName);
        
        console.log(chalk.green(`✓ Module '${moduleName}' uninstalled successfully`));
        
      } catch (error) {
        console.error(chalk.red(`Failed to uninstall module: ${error}`));
        process.exit(1);
      }
    });

  module
    .command('info <module>')
    .description('Show module details')
    .action(async (moduleName: string) => {
      try {
        // Check if it's a built-in module
        const builtinModules = ['core', 'file', 'system', 'network', 'process'];
        if (builtinModules.includes(moduleName)) {
          showBuiltinModuleInfo(moduleName);
          return;
        }
        
        // Check if it's a stdlib module
        const stdlibModules = ['fs', 'http', 'os', 'proc', 'pkg', 'svc', 'net', 'crypto', 'time', 'json', 'yaml', 'env', 'template'];
        if (stdlibModules.includes(moduleName)) {
          showStdlibModuleInfo(moduleName);
          return;
        }
        
        // Check if it's a stdlib module with std: prefix
        if (moduleName.startsWith('std:')) {
          const actualModuleName = moduleName.substring(4);
          if (stdlibModules.includes(actualModuleName)) {
            showStdlibModuleInfo(actualModuleName);
            return;
          }
        }

        // Check custom modules
        const modules = await listInstalledModules();
        const module = modules.find(m => m.manifest.name === moduleName);
        
        if (!module) {
          console.log(chalk.red(`Module '${moduleName}' not found`));
          process.exit(1);
        }

        console.log(chalk.bold(`\nModule: ${module.manifest.name}\n`));
        console.log(`Version: ${module.manifest.version}`);
        console.log(`Description: ${module.manifest.description}`);
        console.log(`Author: ${module.manifest.author || 'Unknown'}`);
        console.log(`License: ${module.manifest.license || 'Unknown'}`);
        console.log(`Type: ${module.manifest.xec?.type || 'Unknown'}`);
        console.log(`Status: ${module.enabled ? chalk.green('enabled') : chalk.gray('disabled')}`);
        console.log(`Path: ${module.path}`);

        if (module.manifest.xec?.tasks?.length) {
          console.log(chalk.bold('\nTasks:'));
          for (const task of module.manifest.xec.tasks) {
            console.log(`  - ${task}`);
          }
        }

        if (module.manifest.xec?.helpers?.length) {
          console.log(chalk.bold('\nHelpers:'));
          for (const helper of module.manifest.xec.helpers) {
            console.log(`  - ${helper}`);
          }
        }

        if (module.manifest.xec?.patterns?.length) {
          console.log(chalk.bold('\nPatterns:'));
          for (const pattern of module.manifest.xec.patterns) {
            console.log(`  - ${pattern}`);
          }
        }

        if (module.manifest.dependencies && Object.keys(module.manifest.dependencies).length > 0) {
          console.log(chalk.bold('\nDependencies:'));
          for (const [dep, version] of Object.entries(module.manifest.dependencies)) {
            console.log(`  - ${dep}: ${version}`);
          }
        }
        
      } catch (error) {
        console.error(chalk.red(`Failed to get module info: ${error}`));
        process.exit(1);
      }
    });

  module
    .command('search <query>')
    .description('Search available modules')
    .option('--type <type>', 'Filter by type')
    .action(async (query: string, options?: { type?: string }) => {
      try {
        console.log(chalk.yellow('Searching for modules...'));
        
        // In a real implementation, this would search a module registry
        console.log(chalk.gray('\nNote: Module registry not yet implemented.'));
        console.log(chalk.gray('You can install local modules using: xec module install /path/to/module'));
        
        // Show example search results
        console.log(chalk.bold('\nExample modules you could create:'));
        const examples = [
          { name: 'xec-aws', description: 'AWS operations and deployment', type: 'integration' },
          { name: 'xec-docker', description: 'Docker container management', type: 'task' },
          { name: 'xec-monitoring', description: 'Monitoring and alerting tasks', type: 'mixed' },
          { name: 'xec-security', description: 'Security scanning and hardening', type: 'task' },
        ];
        
        const filtered = examples.filter(e => 
          e.name.includes(query) || e.description.toLowerCase().includes(query.toLowerCase())
        );
        
        if (filtered.length > 0) {
          const tableData = [['Name', 'Description', 'Type']];
          for (const example of filtered) {
            tableData.push([example.name, example.description, example.type]);
          }
          console.log(table(tableData));
        }
        
      } catch (error) {
        console.error(chalk.red(`Failed to search modules: ${error}`));
        process.exit(1);
      }
    });

  module
    .command('create <name>')
    .description('Create new module template')
    .option('--type <type>', 'Module type (task|helper|pattern|integration|mixed)', 'task')
    .action(async (moduleName: string, options?: { type?: string }) => {
      try {
        const modulePath = path.resolve(moduleName);
        
        // Check if directory exists
        try {
          await fs.access(modulePath);
          console.log(chalk.red(`Directory '${moduleName}' already exists`));
          process.exit(1);
        } catch {
          // Directory doesn't exist, good
        }

        const s = spinner();
        s.start('Creating module template...');

        // Create directory structure
        await fs.mkdir(modulePath, { recursive: true });
        await fs.mkdir(path.join(modulePath, 'src'));
        await fs.mkdir(path.join(modulePath, 'tests'));

        // Create package.json
        const packageJson: any = {
          name: moduleName,
          version: '1.0.0',
          description: `${moduleName} module for Xec`,
          main: 'dist/index.js',
          types: 'dist/index.d.ts',
          xec: {
            type: options?.type as any || 'task',
            tasks: options?.type === 'task' || options?.type === 'mixed' ? ['example-task'] : undefined,
            helpers: options?.type === 'helper' || options?.type === 'mixed' ? ['exampleHelper'] : undefined,
            patterns: options?.type === 'pattern' || options?.type === 'mixed' ? ['example-pattern'] : undefined,
            integrations: options?.type === 'integration' || options?.type === 'mixed' ? ['example'] : undefined,
          },
          scripts: {
            build: 'tsc',
            test: 'vitest',
            lint: 'eslint src',
          },
          devDependencies: {
            '@types/node': '^20.0.0',
            'typescript': '^5.0.0',
            'vitest': '^0.34.0',
            'eslint': '^8.0.0',
          },
          dependencies: {
            '@xec/core': '^1.0.0',
          },
        };

        await fs.writeFile(
          path.join(modulePath, 'package.json'),
          JSON.stringify(packageJson, null, 2)
        );

        // Create tsconfig.json
        const tsConfig = {
          compilerOptions: {
            target: 'ES2022',
            module: 'ES2022',
            lib: ['ES2022'],
            outDir: './dist',
            rootDir: './src',
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            declaration: true,
            declarationMap: true,
            sourceMap: true,
          },
          include: ['src/**/*'],
          exclude: ['node_modules', 'dist', 'tests'],
        };

        await fs.writeFile(
          path.join(modulePath, 'tsconfig.json'),
          JSON.stringify(tsConfig, null, 2)
        );

        // Create index.ts based on type
        let indexContent = '';
        
        switch (options?.type) {
          case 'task':
            indexContent = `import { Module, Task } from '@xec/core';

export class ${moduleName.replace(/-/g, '')}Module implements Module {
  name = '${moduleName}';
  
  async register(registry: any): Promise<void> {
    registry.registerTask('example-task', this.createExampleTask());
  }
  
  private createExampleTask(): Task {
    return {
      name: 'example-task',
      description: 'Example task from ${moduleName}',
      handler: async (context) => {
        console.log('Executing example task');
        // Task implementation here
      },
    };
  }
}

export default ${moduleName.replace(/-/g, '')}Module;
`;
            break;
            
          case 'helper':
            indexContent = `import { Module } from '@xec/core';

export class ${moduleName.replace(/-/g, '')}Module implements Module {
  name = '${moduleName}';
  
  async register(registry: any): Promise<void> {
    registry.registerHelper('exampleHelper', this.exampleHelper);
  }
  
  private exampleHelper(input: string): string {
    // Helper implementation here
    return \`Processed: \${input}\`;
  }
}

export default ${moduleName.replace(/-/g, '')}Module;
`;
            break;
            
          default:
            indexContent = `import { Module } from '@xec/core';

export class ${moduleName.replace(/-/g, '')}Module implements Module {
  name = '${moduleName}';
  
  async register(registry: any): Promise<void> {
    // Register your module components here
  }
}

export default ${moduleName.replace(/-/g, '')}Module;
`;
        }

        await fs.writeFile(path.join(modulePath, 'src', 'index.ts'), indexContent);

        // Create README.md
        const readme = `# ${moduleName}

${moduleName} module for Xec infrastructure orchestration system.

## Installation

\`\`\`bash
xec module install ${moduleName}
\`\`\`

## Usage

\`\`\`javascript
// In your recipe
${options?.type === 'task' ? `await task('example-task').run();` : '// Use your module components here'}
\`\`\`

## Development

\`\`\`bash
npm install
npm run build
npm test
\`\`\`
`;

        await fs.writeFile(path.join(modulePath, 'README.md'), readme);

        // Create .gitignore
        const gitignore = `node_modules/
dist/
*.log
.DS_Store
`;

        await fs.writeFile(path.join(modulePath, '.gitignore'), gitignore);

        s.stop(chalk.green(`✓ Module template created at ${modulePath}`));
        
        console.log(chalk.bold('\nNext steps:'));
        console.log(`  1. cd ${moduleName}`);
        console.log('  2. npm install');
        console.log('  3. Implement your module in src/index.ts');
        console.log('  4. npm run build');
        console.log(`  5. xec module install ${modulePath}`);
        
      } catch (error) {
        console.error(chalk.red(`Failed to create module: ${error}`));
        process.exit(1);
      }
    });

  module
    .command('enable <module>')
    .description('Enable a module')
    .action(async (moduleName: string) => {
      try {
        await setModuleEnabled(moduleName, true);
        console.log(chalk.green(`✓ Module '${moduleName}' enabled`));
      } catch (error) {
        console.error(chalk.red(`Failed to enable module: ${error}`));
        process.exit(1);
      }
    });

  module
    .command('disable <module>')
    .description('Disable a module')
    .action(async (moduleName: string) => {
      try {
        await setModuleEnabled(moduleName, false);
        console.log(chalk.green(`✓ Module '${moduleName}' disabled`));
      } catch (error) {
        console.error(chalk.red(`Failed to disable module: ${error}`));
        process.exit(1);
      }
    });

  module
    .command('exec <module> <task> [args...]')
    .description('Execute a task from a specific module')
    .option('-v, --vars <json>', 'Variables in JSON format')
    .option('--dry-run', 'Simulate without making changes')
    .option('--timeout <ms>', 'Task timeout in milliseconds')
    .action(async (moduleName: string, taskName: string, args: string[], options: any) => {
      try {
        const { ModuleLoader, TaskRunner, EnvironmentManager, createExecutionContext } = await import('@xec/core');
        
        // Check if it's a builtin module
        const builtinModules = ['aws', 'docker', 'k8s', 'kubernetes', 'monitoring'];
        const stdlibModules = ['fs', 'http', 'os', 'proc', 'pkg', 'svc', 'net', 'crypto', 'time', 'json', 'yaml', 'env', 'template'];
        const isBuiltin = builtinModules.includes(moduleName);
        let isStdlib = false;
        let actualModuleName = moduleName;
        
        // Handle std: prefix
        if (moduleName.startsWith('std:')) {
          actualModuleName = moduleName.substring(4);
          isStdlib = stdlibModules.includes(actualModuleName);
        } else {
          // Support legacy format without std: prefix
          isStdlib = stdlibModules.includes(moduleName);
        }
        
        const s = spinner();
        s.start(`Loading module: ${moduleName}`);
        
        // Create module loader and task runner
        const moduleLoader = new ModuleLoader();
        const environmentManager = new EnvironmentManager();
        const taskRunner = new TaskRunner(environmentManager);
        
        // Register the module
        if (isBuiltin) {
          // For builtin modules, we would need to import them properly
          // This is a simplified version - in reality we'd load the actual module
          s.stop(chalk.yellow(`Note: Builtin module execution not fully implemented`));
          console.log(chalk.gray(`Builtin modules require proper integration with @xec/core`));
          process.exit(1);
        } else if (isStdlib) {
          // Execute stdlib module function
          await executeStdlibFunction(actualModuleName, taskName, args, options, s);
          return;
        } else {
          // Load custom module
          const modules = await listInstalledModules();
          const module = modules.find(m => m.manifest.name === moduleName);
          
          if (!module) {
            s.stop(chalk.red(`✗ Module '${moduleName}' not found`));
            process.exit(1);
          }
          
          if (!module.enabled) {
            s.stop(chalk.red(`✗ Module '${moduleName}' is disabled`));
            console.log(chalk.gray(`Enable it with: xec module enable ${moduleName}`));
            process.exit(1);
          }
          
          // Load the module
          const loadedModule = await moduleLoader.load(module.path);
          if (loadedModule) {
            // Adapt Module to XecModule interface
            // Convert TaskDefinition to Task format
            const tasks: Record<string, any> = {};
            if (loadedModule.exports?.tasks) {
              for (const [name, taskDef] of Object.entries(loadedModule.exports.tasks)) {
                tasks[name] = {
                  name: (taskDef as any).name,
                  description: (taskDef as any).description,
                  run: (taskDef as any).handler // Map handler to run
                };
              }
            }
            
            // Convert HelperDefinition to HelperFunction format
            const helpers: Record<string, any> = {};
            if (loadedModule.exports?.helpers) {
              for (const [name, helperDef] of Object.entries(loadedModule.exports.helpers)) {
                // If helper has methods, we'll use the first method or a composite
                if ((helperDef as any).methods && Object.keys((helperDef as any).methods).length > 0) {
                  const firstMethod = Object.values((helperDef as any).methods)[0];
                  helpers[name] = firstMethod;
                }
              }
            }
            
            // Convert PatternDefinition to Pattern format
            const patterns: Record<string, any> = {};
            if (loadedModule.exports?.patterns) {
              for (const [name, patternDef] of Object.entries(loadedModule.exports.patterns)) {
                patterns[name] = {
                  name: (patternDef as any).name,
                  description: (patternDef as any).description,
                  template: (patternDef as any).template
                };
              }
            }
            
            const xecModule = {
              name: loadedModule.metadata?.['name'] || 'unknown',
              version: loadedModule.metadata?.['version'] || '1.0.0',
              description: loadedModule.metadata?.['description'] || 'No description',
              exports: {
                tasks: Object.keys(tasks).length > 0 ? tasks : undefined,
                helpers: Object.keys(helpers).length > 0 ? helpers : undefined,
                patterns: Object.keys(patterns).length > 0 ? patterns : undefined
              },
              dependencies: loadedModule.metadata?.['dependencies']
            };
            await taskRunner.registerModule(xecModule);
          }
        }
        
        s.stop(chalk.green(`✓ Module loaded`));
        
        // Parse variables
        let variables = {};
        if (options.vars) {
          try {
            variables = JSON.parse(options.vars);
          } catch {
            console.error(chalk.red('Invalid JSON in --vars option'));
            process.exit(1);
          }
        }
        
        // Add args to variables if provided
        if (args.length > 0) {
          variables = { ...variables, args };
        }
        
        // Create execution context
        const context = createExecutionContext({
          dryRun: options.dryRun,
          timeout: options.timeout ? parseInt(options.timeout) : undefined
        });
        
        // Add variables to context
        if (Object.keys(variables).length > 0) {
          Object.assign(context.vars, variables);
        }
        
        // Execute the task
        const taskFullName = `${moduleName}:${taskName}`;
        console.log(chalk.cyan(`\nExecuting task: ${taskFullName}\n`));
        
        const result = await taskRunner.runTask(taskFullName, context);
        
        if (result.success) {
          console.log(chalk.green(`\n✓ Task completed successfully`));
          if (result.output) {
            console.log(chalk.bold('\nOutput:'));
            console.log(result.output);
          }
        } else {
          console.error(chalk.red(`\n✗ Task failed`));
          if (result.error) {
            console.error(chalk.red(result.error));
          }
          process.exit(1);
        }
        
      } catch (error) {
        console.error(chalk.red(`Failed to execute task: ${error}`));
        process.exit(1);
      }
    });

  module
    .command('tasks <module>')
    .description('List tasks available in a module')
    .action(async (moduleName: string) => {
      try {
        // Check if it's a builtin module
        const builtinTasks: Record<string, string[]> = {
          aws: ['configure', 'ec2Instance', 's3Bucket', 'rds', 'cloudformation', 'lambda', 'route53', 'cloudwatch'],
          docker: ['build', 'run', 'stop', 'remove', 'push', 'pull', 'compose', 'swarm', 'network', 'volume'],
          k8s: ['deploy', 'scale', 'rollback', 'configmap', 'secret', 'ingress', 'helm', 'logs', 'exec'],
          kubernetes: ['deploy', 'scale', 'rollback', 'configmap', 'secret', 'ingress', 'helm', 'logs', 'exec'],
          monitoring: ['prometheus', 'grafana', 'elasticsearch', 'loki', 'alerts', 'metrics', 'dashboards']
        };
        
        // Check if it's a stdlib module
        const stdlibTasks: Record<string, string[]> = {
          fs: ['read', 'write', 'append', 'exists', 'rm', 'mkdir', 'ls', 'copy', 'move', 'chmod', 'chown', 'stat', 'isFile', 'isDir', 'temp', 'join', 'resolve', 'dirname', 'basename', 'extname'],
          http: ['get', 'post', 'put', 'delete', 'request', 'download', 'upload'],
          os: ['platform', 'arch', 'hostname', 'release', 'cpus', 'memory', 'disk', 'user', 'home'],
          proc: ['exec', 'spawn', 'list', 'kill', 'exists', 'cwd', 'exit'],
          pkg: ['install', 'remove', 'update', 'upgrade', 'installed', 'version', 'search', 'manager'],
          svc: ['start', 'stop', 'restart', 'reload', 'status', 'enable', 'disable', 'list', 'exists'],
          net: ['ping', 'traceroute', 'isPortOpen', 'waitForPort', 'resolve', 'reverse', 'interfaces', 'publicIP', 'privateIP'],
          crypto: ['hash', 'md5', 'sha256', 'sha512', 'randomBytes', 'uuid', 'base64Encode', 'base64Decode'],
          time: ['now', 'timestamp', 'format', 'parse', 'add', 'subtract', 'diff', 'sleep', 'timeout'],
          json: ['parse', 'stringify', 'read', 'write', 'merge', 'get', 'set'],
          yaml: ['parse', 'stringify', 'read', 'write', 'parseAll', 'stringifyAll'],
          env: ['get', 'set', 'all', 'load', 'expand', 'require'],
          template: ['render', 'renderFile', 'compile', 'registerHelper', 'registerPartial']
        };
        
        let actualModuleName = moduleName;
        let displayModuleName = moduleName;
        
        // Handle std: prefix
        if (moduleName.startsWith('std:')) {
          actualModuleName = moduleName.substring(4);
          displayModuleName = moduleName;
        } else if (stdlibTasks[moduleName]) {
          // For stdlib modules without prefix, show with std: prefix
          displayModuleName = `std:${moduleName}`;
        }
        
        const builtinModuleTasks = builtinTasks[actualModuleName];
        if (builtinModuleTasks) {
          console.log(chalk.bold(`\nTasks in builtin module '${actualModuleName}':\n`));
          for (const task of builtinModuleTasks) {
            console.log(`  - ${task}`);
          }
          console.log(chalk.gray(`\nRun a task with: xec module exec ${actualModuleName} <task>`));
          return;
        }
        
        const stdlibModuleTasks = stdlibTasks[actualModuleName];
        if (stdlibModuleTasks) {
          console.log(chalk.bold(`\nFunctions in stdlib module '${displayModuleName}':\n`));
          for (const task of stdlibModuleTasks) {
            console.log(`  - ${task}`);
          }
          console.log(chalk.gray(`\nRun a function with: xec module exec ${displayModuleName} <function> [args...]`));
          console.log(chalk.gray(`Or with task command: xec task ${displayModuleName}:<function> [--var key=value]`));
          return;
        }
        
        // Check custom modules
        const modules = await listInstalledModules();
        const module = modules.find(m => m.manifest.name === moduleName);
        
        if (!module) {
          console.log(chalk.red(`Module '${moduleName}' not found`));
          process.exit(1);
        }
        
        if (module.manifest.xec?.tasks && module.manifest.xec.tasks.length > 0) {
          console.log(chalk.bold(`\nTasks in module '${moduleName}':\n`));
          for (const task of module.manifest.xec.tasks) {
            console.log(`  - ${task}`);
          }
          console.log(chalk.gray(`\nRun a task with: xec module exec ${moduleName} <task>`));
        } else {
          console.log(chalk.yellow(`Module '${moduleName}' has no tasks`));
        }
        
      } catch (error) {
        console.error(chalk.red(`Failed to list tasks: ${error}`));
        process.exit(1);
      }
    });
}

async function getModulesPath(): Promise<string> {
  const projectRoot = await getProjectRoot();
  return path.join(projectRoot, '.xec', 'modules');
}

async function getModulesConfigPath(): Promise<string> {
  const projectRoot = await getProjectRoot();
  return path.join(projectRoot, '.xec', 'modules.json');
}

async function listInstalledModules(): Promise<InstalledModule[]> {
  try {
    const configPath = await getModulesConfigPath();
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function saveModuleInfo(module: InstalledModule): Promise<void> {
  const modules = await listInstalledModules();
  const existing = modules.findIndex(m => m.manifest.name === module.manifest.name);
  
  if (existing >= 0) {
    modules[existing] = module;
  } else {
    modules.push(module);
  }
  
  const configPath = await getModulesConfigPath();
  await fs.writeFile(configPath, JSON.stringify(modules, null, 2));
}

async function removeModuleInfo(moduleName: string): Promise<void> {
  const modules = await listInstalledModules();
  const filtered = modules.filter(m => m.manifest.name !== moduleName);
  
  const configPath = await getModulesConfigPath();
  await fs.writeFile(configPath, JSON.stringify(filtered, null, 2));
}

async function setModuleEnabled(moduleName: string, enabled: boolean): Promise<void> {
  const modules = await listInstalledModules();
  const module = modules.find(m => m.manifest.name === moduleName);
  
  if (!module) {
    throw new Error(`Module '${moduleName}' not found`);
  }
  
  module.enabled = enabled;
  await saveModuleInfo(module);
}

async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

function showBuiltinModuleInfo(moduleName: string): void {
  const modules: Record<string, any> = {
    core: {
      description: 'Core module providing basic operations and utilities',
      tasks: ['echo', 'exec', 'fail', 'debug', 'pause', 'prompt'],
      helpers: ['env', 'os', 'date', 'random', 'uuid'],
    },
    file: {
      description: 'File system operations module',
      tasks: ['copy', 'move', 'delete', 'mkdir', 'chmod', 'chown', 'template'],
      helpers: ['exists', 'isFile', 'isDirectory', 'readFile', 'writeFile'],
    },
    system: {
      description: 'System operations and management',
      tasks: ['service', 'package', 'user', 'group', 'cron', 'sysctl'],
      helpers: ['platform', 'arch', 'hostname', 'uptime', 'loadavg'],
    },
    network: {
      description: 'Network operations and utilities',
      tasks: ['ping', 'curl', 'download', 'upload', 'firewall'],
      helpers: ['resolveHost', 'isReachable', 'getInterfaces'],
    },
    process: {
      description: 'Process management utilities',
      tasks: ['spawn', 'kill', 'wait', 'signal'],
      helpers: ['isRunning', 'getPid', 'getProcesses'],
    },
  };

  const info = modules[moduleName];
  if (!info) {
    console.log(chalk.red(`Unknown built-in module: ${moduleName}`));
    return;
  }

  console.log(chalk.bold(`\nBuilt-in Module: @xec/core:${moduleName}\n`));
  console.log(`Description: ${info.description}`);
  console.log(`Type: task/helper`);
  console.log(`Status: ${chalk.green('always enabled')}`);
  
  if (info.tasks?.length) {
    console.log(chalk.bold('\nTasks:'));
    for (const task of info.tasks) {
      console.log(`  - ${task}`);
    }
  }
  
  if (info.helpers?.length) {
    console.log(chalk.bold('\nHelpers:'));
    for (const helper of info.helpers) {
      console.log(`  - ${helper}`);
    }
  }
}

function showStdlibModuleInfo(moduleName: string): void {
  const modules: Record<string, any> = {
    fs: {
      description: 'File system operations',
      functions: ['read', 'write', 'append', 'exists', 'rm', 'mkdir', 'ls', 'copy', 'move', 'chmod', 'chown', 'stat', 'isFile', 'isDir', 'temp', 'join', 'resolve', 'dirname', 'basename', 'extname'],
    },
    http: {
      description: 'HTTP client operations',
      functions: ['get', 'post', 'put', 'delete', 'request', 'download', 'upload'],
    },
    os: {
      description: 'Operating system information',
      functions: ['platform', 'arch', 'hostname', 'release', 'cpus', 'memory', 'disk', 'user', 'home'],
    },
    proc: {
      description: 'Process management',
      functions: ['exec', 'spawn', 'list', 'kill', 'exists', 'cwd', 'exit'],
    },
    pkg: {
      description: 'Package management',
      functions: ['install', 'remove', 'update', 'upgrade', 'installed', 'version', 'search', 'manager'],
    },
    svc: {
      description: 'Service management',
      functions: ['start', 'stop', 'restart', 'reload', 'status', 'enable', 'disable', 'list', 'exists'],
    },
    net: {
      description: 'Network utilities',
      functions: ['ping', 'traceroute', 'isPortOpen', 'waitForPort', 'resolve', 'reverse', 'interfaces', 'publicIP', 'privateIP'],
    },
    crypto: {
      description: 'Cryptographic operations',
      functions: ['hash', 'md5', 'sha256', 'sha512', 'randomBytes', 'uuid', 'base64Encode', 'base64Decode'],
    },
    time: {
      description: 'Time and date utilities',
      functions: ['now', 'timestamp', 'format', 'parse', 'add', 'subtract', 'diff', 'sleep', 'timeout'],
    },
    json: {
      description: 'JSON utilities',
      functions: ['parse', 'stringify', 'read', 'write', 'merge', 'get', 'set'],
    },
    yaml: {
      description: 'YAML utilities',
      functions: ['parse', 'stringify', 'read', 'write', 'parseAll', 'stringifyAll'],
    },
    env: {
      description: 'Environment variables',
      functions: ['get', 'set', 'all', 'load', 'expand', 'require'],
    },
    template: {
      description: 'Template engine',
      functions: ['render', 'renderFile', 'compile', 'registerHelper', 'registerPartial'],
    },
  };

  const info = modules[moduleName];
  if (!info) {
    console.log(chalk.red(`Unknown stdlib module: ${moduleName}`));
    return;
  }

  const displayName = `std:${moduleName}`;
  console.log(chalk.bold(`\nStdlib Module: ${displayName}\n`));
  console.log(`Description: ${info.description}`);
  console.log(`Type: stdlib`);
  console.log(`Status: ${chalk.green('always available')}`);
  
  if (info.functions?.length) {
    console.log(chalk.bold('\nFunctions:'));
    for (const func of info.functions) {
      console.log(`  - ${func}`);
    }
  }
  
  console.log(chalk.gray(`\nUse: xec module exec ${displayName} <function> [args...]`));
  console.log(chalk.gray(`Or:  xec task ${displayName}:<function> [--var key=value]`));
  console.log(chalk.gray(`Example: xec module exec ${displayName} ${info.functions[0]} arg1 arg2`));
}

async function executeStdlibFunction(moduleName: string, functionName: string, args: string[], options: any, s: any): Promise<void> {
  try {
    // Create a minimal environment info
    const envInfo: EnvironmentInfo = {
      type: 'local',
      capabilities: {
        shell: true,
        sudo: process.platform !== 'win32',
        docker: false,
        systemd: process.platform === 'linux'
      },
      platform: {
        os: process.platform === 'darwin' ? 'darwin' : 
            process.platform === 'win32' ? 'windows' : 
            'linux' as any,
        arch: process.arch === 'x64' ? 'x64' : 
              process.arch === 'arm64' ? 'arm64' : 
              'arm' as any
      }
    };

    // Create a minimal logger
    const logger: any = {
      debug: (message: string, meta?: any) => options.verbose && console.log(chalk.gray('[DEBUG]'), message, meta || ''),
      info: (message: string, meta?: any) => console.log(chalk.blue('[INFO]'), message, meta || ''),
      warn: (message: string, meta?: any) => console.log(chalk.yellow('[WARN]'), message, meta || ''),
      error: (message: string, meta?: any) => console.error(chalk.red('[ERROR]'), message, meta || ''),
      child() { return this; }
    };

    // Create a minimal context to get stdlib
    const context: Partial<TaskContext> = {
      $,
      env: envInfo,
      logger
    };

    // Create standard library
    const stdlib = await createStandardLibrary(context);
    
    // Get the stdlib module
    const stdlibModule = (stdlib as any)[moduleName];
    if (!stdlibModule) {
      throw new Error(`Stdlib module not found: ${moduleName}`);
    }

    const method = stdlibModule[functionName as keyof typeof stdlibModule];
    if (typeof method !== 'function') {
      throw new Error(`Function not found: ${moduleName}.${functionName}`);
    }

    // Parse arguments
    const parsedArgs = args.map(arg => {
      try {
        return JSON.parse(arg);
      } catch {
        return arg;
      }
    });

    s.stop(chalk.green(`✓ Module loaded`));
    
    console.log(chalk.cyan(`\nExecuting: ${moduleName}.${functionName}(${parsedArgs.map(a => JSON.stringify(a)).join(', ')})\n`));

    // Call the method
    const result = await method.apply(stdlibModule, parsedArgs);

    // Format output
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (options.raw) {
      console.log(result);
    } else {
      if (result === undefined) {
        console.log(chalk.gray('(undefined)'));
      } else if (result === null) {
        console.log(chalk.gray('(null)'));
      } else if (typeof result === 'object') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result);
      }
    }
    
    console.log(chalk.green(`\n✓ Function executed successfully`));
    
  } catch (error) {
    s.stop(chalk.red(`✗ Execution failed`));
    console.error(chalk.red(`Error: ${(error as Error).message}`));
    if (options.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}