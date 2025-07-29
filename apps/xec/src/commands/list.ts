import fs from 'fs-extra';
import chalk from 'chalk';
import { glob } from 'glob';
import { Command } from 'commander';
import { fileURLToPath } from 'url';
import path, { join, dirname } from 'path';

import { getConfig } from '../utils/config.js';
import { BaseCommand } from '../utils/command-base.js';
import { getDynamicCommandLoader } from '../utils/dynamic-commands.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ListOptions {
  format?: 'table' | 'json' | 'simple';
  filter?: string;
  verbose?: boolean;
  sort?: 'name' | 'type' | 'status';
}

interface ListableItem {
  name: string;
  description?: string;
  path?: string;
  type?: string;
  status?: string;
  error?: string;
  category?: string;
}

// Built-in command descriptions
const BUILTIN_DESCRIPTIONS: Record<string, string> = {
  cache: 'Manage execution cache',
  config: 'Manage configuration settings',
  copy: 'Copy files between locations',
  env: 'Display environment variables',
  forward: 'Set up port forwarding',
  in: 'Execute commands in containers or pods',
  init: 'Initialize a new Xec project',
  interactive: 'Start interactive shell',
  list: 'List available resources',
  logs: 'Stream logs from various sources',
  new: 'Create new scripts or commands from templates',
  on: 'Execute commands on remote hosts',
  run: 'Run scripts or evaluate code',
  version: 'Display version information',
  watch: 'Watch files and execute commands on change'
};

class ListCommand extends BaseCommand {
  constructor() {
    super({
      name: 'list',
      description: 'List available resources',
      arguments: '[type]',
      options: [
        {
          flags: '-f, --format <format>',
          description: 'Output format (table|json|simple)',
          defaultValue: 'table'
        },
        {
          flags: '--filter <pattern>',
          description: 'Filter results by pattern'
        },
        {
          flags: '--sort <field>',
          description: 'Sort by field (name|type|status)',
          defaultValue: 'name'
        }
      ],
      examples: [
        {
          command: 'xec list',
          description: 'List all available resources'
        },
        {
          command: 'xec list scripts',
          description: 'List available scripts'
        },
        {
          command: 'xec list commands',
          description: 'List available commands'
        },
        {
          command: 'xec list profiles',
          description: 'List configuration profiles'
        },
        {
          command: 'xec list hosts',
          description: 'List configured SSH hosts'
        }
      ]
    });
  }

  async execute(args: any[]): Promise<void> {
    const type = args[0];
    const options = args[args.length - 1] as ListOptions;

    if (!type) {
      await this.listAll(options);
    } else {
      switch (type.toLowerCase()) {
        case 'scripts':
        case 'script':
          await this.listScripts(options);
          break;
        
        case 'commands':
        case 'command':
        case 'cmd':
          await this.listCommands(options);
          break;
        
        case 'profiles':
        case 'profile':
          await this.listProfiles(options);
          break;
        
        case 'hosts':
        case 'host':
          await this.listHosts(options);
          break;
        
        case 'templates':
        case 'template':
          await this.listTemplates(options);
          break;
        
        case 'pipelines':
        case 'pipeline':
          await this.listPipelines(options);
          break;
        
        case 'batches':
        case 'batch':
          await this.listBatches(options);
          break;
        
        default:
          this.log(`Unknown resource type: ${type}`, 'error');
          this.log('Available types: scripts, commands, profiles, hosts, templates, pipelines, batches', 'info');
          process.exit(1);
      }
    }
  }

  private async listAll(options: ListOptions): Promise<void> {
    this.intro(chalk.bold('Available Resources'));

    const sections = [
      { title: 'Scripts', items: await this.getScripts(options) },
      { title: 'Commands', items: await this.getCommands(options) },
      { title: 'Profiles', items: await this.getProfiles(options) },
      { title: 'SSH Hosts', items: await this.getHosts(options) },
      { title: 'Templates', items: await this.getTemplates(options) },
      { title: 'Pipelines', items: await this.getPipelines(options) },
      { title: 'Batches', items: await this.getBatches(options) }
    ];

    let totalCount = 0;
    const sectionCounts: Record<string, number> = {};

    for (const section of sections) {
      sectionCounts[section.title] = section.items.length;
      totalCount += section.items.length;
      
      if (section.items.length > 0) {
        console.log(`\n${chalk.bold.cyan(section.title)} ${chalk.dim(`(${section.items.length})`)}:`);
        this.displayItems(section.items, options);
      }
    }

    // Display summary
    console.log(`\n${chalk.bold('Summary:')}`);
    console.log(`  Total resources: ${chalk.green(totalCount)}`);
    for (const [title, count] of Object.entries(sectionCounts)) {
      if (count > 0) {
        console.log(`  ${title}: ${chalk.cyan(count)}`);
      }
    }

    this.outro('');
  }

  private async listScripts(options: ListOptions): Promise<void> {
    this.intro(chalk.bold('Available Scripts'));
    const scripts = await this.getScripts(options);
    
    if (scripts.length === 0) {
      this.log('No scripts found', 'warn');
      this.log('Create scripts in .xec/scripts/', 'info');
    } else {
      this.displayItems(scripts, options);
    }
  }

  private async listCommands(options: ListOptions): Promise<void> {
    this.intro(chalk.bold('Available Commands'));
    const commands = await this.getCommands(options);
    
    if (commands.length === 0) {
      this.log('No commands found matching filter', 'warn');
    } else {
      // Group by category
      const builtIn = commands.filter(c => c.category === 'built-in');
      const custom = commands.filter(c => c.category === 'custom');
      
      if (builtIn.length > 0) {
        console.log(`\n${chalk.bold.cyan('Built-in Commands')} ${chalk.dim(`(${builtIn.length})`)}:`);
        this.displayItems(builtIn, options);
      }
      
      if (custom.length > 0) {
        console.log(`\n${chalk.bold.cyan('Custom Commands')} ${chalk.dim(`(${custom.length})`)}:`);
        this.displayItems(custom, options);
      } else if (!options.filter) {
        console.log(`\n${chalk.dim('No custom commands found. Create commands in .xec/commands/')}`);
      }
      
      console.log(`\n${chalk.bold('Total:')} ${chalk.green(commands.length)} command${commands.length === 1 ? '' : 's'}`);
    }
  }

  private async listProfiles(options: ListOptions): Promise<void> {
    this.intro(chalk.bold('Configuration Profiles'));
    const profiles = await this.getProfiles(options);
    
    if (profiles.length === 0) {
      this.log('No profiles configured', 'warn');
      this.log('Add profiles to your config file', 'info');
    } else {
      this.displayItems(profiles, options);
    }
  }

  private async listHosts(options: ListOptions): Promise<void> {
    this.intro(chalk.bold('SSH Hosts'));
    const hosts = await this.getHosts(options);
    
    if (hosts.length === 0) {
      this.log('No SSH hosts configured', 'warn');
      this.log('Add hosts to your config file under ssh.hosts', 'info');
    } else {
      this.displayItems(hosts, options);
    }
  }

  private async listTemplates(options: ListOptions): Promise<void> {
    this.intro(chalk.bold('Templates'));
    const templates = await this.getTemplates(options);
    
    if (templates.length === 0) {
      this.log('No templates found', 'warn');
      this.log('Create templates in .xec/templates/', 'info');
    } else {
      this.displayItems(templates, options);
    }
  }

  private async listPipelines(options: ListOptions): Promise<void> {
    this.intro(chalk.bold('Pipelines'));
    const pipelines = await this.getPipelines(options);
    
    if (pipelines.length === 0) {
      this.log('No pipelines found', 'warn');
      this.log('Create pipelines in .xec/pipelines/', 'info');
    } else {
      this.displayItems(pipelines, options);
    }
  }

  private async listBatches(options: ListOptions): Promise<void> {
    this.intro(chalk.bold('Batch Jobs'));
    const batches = await this.getBatches(options);
    
    if (batches.length === 0) {
      this.log('No batch jobs found', 'warn');
      this.log('Create batch jobs in .xec/batches/', 'info');
    } else {
      this.displayItems(batches, options);
    }
  }

  private async getScripts(options: ListOptions): Promise<ListableItem[]> {
    const scriptsDir = path.join(process.cwd(), '.xec', 'scripts');
    if (!await fs.pathExists(scriptsDir)) {
      return [];
    }

    const pattern = options.filter ? `**/*${options.filter}*` : '**/*';
    const files = await glob(pattern, {
      cwd: scriptsDir,
      nodir: true,
      ignore: ['**/*.test.*', '**/*.spec.*']
    });

    const scripts = await Promise.all(
      files
        .filter(file => ['.js', '.ts', '.mjs', '.sh'].some(ext => file.endsWith(ext)))
        .map(async (file) => {
          const fullPath = path.join(scriptsDir, file);
          let description = '';
          
          // Try to extract description from script
          if (options.verbose) {
            try {
              const content = await fs.readFile(fullPath, 'utf-8');
              const lines = content.split('\n');
              
              // Look for description in comments
              for (const line of lines.slice(0, 10)) {
                if (line.match(/^\s*(\/\/|#)\s*@description\s+(.+)$/)) {
                  description = RegExp.$2;
                  break;
                } else if (line.match(/^\s*(\/\/|#)\s*Description:\s*(.+)$/i)) {
                  description = RegExp.$2;
                  break;
                }
              }
            } catch {}
          }
          
          return {
            name: file,
            path: fullPath,
            type: 'script',
            description
          };
        })
    );

    return this.sortItems(scripts, options);
  }

  private async getCommands(options: ListOptions): Promise<ListableItem[]> {
    const loader = getDynamicCommandLoader();
    const commands = loader.getCommands();

    const items: ListableItem[] = [];

    // Get built-in commands dynamically from the commands directory
    const builtInCommands = await this.getBuiltInCommands();
    
    // Add built-in commands
    for (const cmd of builtInCommands) {
      if (!options.filter || cmd.includes(options.filter)) {
        items.push({
          name: cmd,
          description: BUILTIN_DESCRIPTIONS[cmd],
          type: 'built-in',
          status: 'loaded',
          category: 'built-in'
        });
      }
    }

    // Add custom commands
    const customCommands = commands
      .filter(cmd => !options.filter || cmd.name.includes(options.filter))
      .map(cmd => ({
        name: cmd.name,
        path: cmd.path,
        type: 'custom',
        status: cmd.loaded ? 'loaded' : 'failed',
        error: cmd.error,
        category: 'custom'
      }));

    items.push(...customCommands);

    // Sort by category (built-in first) then by name
    items.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category === 'built-in' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return items;
  }

  private async getBuiltInCommands(): Promise<string[]> {
    const commandsDir = join(__dirname, '../commands');
    const builtInCommands: string[] = [];

    if (await fs.pathExists(commandsDir)) {
      const files = await fs.readdir(commandsDir);
      for (const file of files) {
        // Skip declaration files and test files
        if ((file.endsWith('.js') || file.endsWith('.ts')) && 
            !file.endsWith('.d.ts') && 
            !file.endsWith('.test.ts') && 
            !file.endsWith('.test.js')) {
          const commandName = file.replace(/\.(js|ts)$/, '');
          builtInCommands.push(commandName);
        }
      }
    }

    return builtInCommands.sort();
  }

  private async getProfiles(options: ListOptions): Promise<ListableItem[]> {
    const config = getConfig();
    const profiles = config.listProfiles();
    const activeProfile = config.getActiveProfile();

    return profiles
      .filter(name => !options.filter || name.includes(options.filter))
      .map(name => ({
        name,
        type: 'profile',
        status: name === activeProfile ? 'active' : undefined
      }));
  }

  private async getHosts(options: ListOptions): Promise<ListableItem[]> {
    const config = getConfig();
    const sshConfig = config.getValue('adapters.ssh.hosts') || {};

    return Object.entries(sshConfig)
      .filter(([name]) => !options.filter || name.includes(options.filter))
      .map(([name, hostConfig]: [string, any]) => ({
        name,
        description: `${hostConfig.user || 'root'}@${hostConfig.host || name}${hostConfig.port ? ':' + hostConfig.port : ''}`,
        type: 'ssh-host'
      }));
  }

  private async getTemplates(options: ListOptions): Promise<ListableItem[]> {
    const templatesDir = path.join(process.cwd(), '.xec', 'templates');
    if (!await fs.pathExists(templatesDir)) {
      return [];
    }

    const pattern = options.filter ? `**/*${options.filter}*` : '**/*';
    const files = await glob(pattern, {
      cwd: templatesDir,
      nodir: true
    });

    return this.sortItems(
      files.map(file => ({
        name: file,
        path: path.join(templatesDir, file),
        type: 'template',
        description: file.replace(/\.(yaml|yml|json|js|ts)$/, '')
      })),
      options
    );
  }

  private async getPipelines(options: ListOptions): Promise<ListableItem[]> {
    const pipelinesDir = path.join(process.cwd(), '.xec', 'pipelines');
    if (!await fs.pathExists(pipelinesDir)) {
      return [];
    }

    const pattern = options.filter ? `**/*${options.filter}*` : '**/*';
    const files = await glob(pattern, {
      cwd: pipelinesDir,
      nodir: true,
      ignore: ['**/*.test.*', '**/*.spec.*']
    });

    return this.sortItems(
      files
        .filter(file => ['.yaml', '.yml', '.json'].some(ext => file.endsWith(ext)))
        .map(file => ({
          name: file,
          path: path.join(pipelinesDir, file),
          type: 'pipeline',
          description: path.basename(file, path.extname(file))
        })),
      options
    );
  }

  private async getBatches(options: ListOptions): Promise<ListableItem[]> {
    const batchesDir = path.join(process.cwd(), '.xec', 'batches');
    if (!await fs.pathExists(batchesDir)) {
      return [];
    }

    const pattern = options.filter ? `**/*${options.filter}*` : '**/*';
    const files = await glob(pattern, {
      cwd: batchesDir,
      nodir: true,
      ignore: ['**/*.test.*', '**/*.spec.*']
    });

    return this.sortItems(
      files
        .filter(file => ['.yaml', '.yml', '.json'].some(ext => file.endsWith(ext)))
        .map(file => ({
          name: file,
          path: path.join(batchesDir, file),
          type: 'batch',
          description: path.basename(file, path.extname(file))
        })),
      options
    );
  }

  private displayItems(items: ListableItem[], options: ListOptions): void {
    if (options.format === 'json') {
      console.log(JSON.stringify(items, null, 2));
      return;
    }

    if (options.format === 'simple') {
      items.forEach(item => console.log(item.name));
      return;
    }

    // Table format with icons
    items.forEach(item => {
      let icon = '  ';
      const nameColor = chalk.cyan;
      
      // Choose icon based on type
      switch (item.type) {
        case 'script':
          icon = chalk.green('  ▶ ');
          break;
        case 'built-in':
          icon = chalk.blue('  ⌘ ');
          break;
        case 'custom':
          icon = chalk.yellow('  ★ ');
          break;
        case 'profile':
          icon = chalk.magenta('  ⚙ ');
          break;
        case 'ssh-host':
          icon = chalk.cyan('  ⇄ ');
          break;
        case 'template':
          icon = chalk.gray('  ≡ ');
          break;
        case 'pipeline':
          icon = chalk.blue('  ⇨ ');
          break;
        case 'batch':
          icon = chalk.yellow('  ☰ ');
          break;
      }
      
      let line = `${icon}${nameColor(item.name)}`;
      
      if (item.status === 'active') {
        line += chalk.green(' ✓');
      } else if (item.status === 'failed') {
        line += chalk.red(' ✗');
      }
      
      if (item.description) {
        const maxDescLen = process.stdout.columns ? process.stdout.columns - 40 : 60;
        const desc = item.description.length > maxDescLen 
          ? item.description.substring(0, maxDescLen - 3) + '...'
          : item.description;
        line += chalk.gray(` - ${desc}`);
      }
      
      console.log(line);
      
      if (options.verbose) {
        if (item.path) {
          console.log(`      ${chalk.dim('Path:')} ${chalk.dim(item.path)}`);
        }
        if (item.error) {
          console.log(`      ${chalk.red('Error:')} ${item.error}`);
        }
        if (item.type && !['built-in', 'custom'].includes(item.type)) {
          console.log(`      ${chalk.dim('Type:')} ${item.type}`);
        }
      }
    });
  }

  private sortItems(items: ListableItem[], options: ListOptions): ListableItem[] {
    const sorted = [...items];
    
    switch (options.sort) {
      case 'type':
        sorted.sort((a, b) => (a.type || '').localeCompare(b.type || ''));
        break;
      case 'status':
        sorted.sort((a, b) => (a.status || '').localeCompare(b.status || ''));
        break;
      case 'name':
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    
    return sorted;
  }
}

export default function listCommand(program: Command): void {
  const cmd = new ListCommand();
  program.addCommand(cmd.create());
}