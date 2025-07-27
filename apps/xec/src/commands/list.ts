import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { glob } from 'glob';
import { Command } from 'commander';

import { getConfig } from '../utils/config.js';
import { BaseCommand } from '../utils/command-base.js';
import { getDynamicCommandLoader } from '../utils/dynamic-commands.js';

interface ListOptions {
  format?: 'table' | 'json' | 'simple';
  filter?: string;
  verbose?: boolean;
}

interface ListableItem {
  name: string;
  description?: string;
  path?: string;
  type?: string;
  status?: string;
  error?: string;
}

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

    for (const section of sections) {
      if (section.items.length > 0) {
        console.log(`\n${chalk.bold.cyan(section.title)}:`);
        this.displayItems(section.items, options);
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
      this.log('No custom commands found', 'warn');
      this.log('Create commands in .xec/commands/', 'info');
    } else {
      this.displayItems(commands, options);
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

    return files
      .filter(file => ['.js', '.ts', '.mjs', '.sh'].some(ext => file.endsWith(ext)))
      .map(file => ({
        name: file,
        path: path.join(scriptsDir, file),
        type: 'script'
      }));
  }

  private async getCommands(options: ListOptions): Promise<ListableItem[]> {
    const loader = getDynamicCommandLoader();
    const commands = loader.getCommands();

    const items: ListableItem[] = commands
      .filter(cmd => !options.filter || cmd.name.includes(options.filter))
      .map(cmd => ({
        name: cmd.name,
        path: cmd.path,
        type: 'command',
        status: cmd.loaded ? 'loaded' : 'failed',
        error: cmd.error
      }));

    // Also add built-in commands if no filter or filter matches
    const builtInCommands = ['init', 'run', 'exec', 'ssh', 'docker', 'k8s', 'list', 'version'];
    for (const cmd of builtInCommands) {
      if (!options.filter || cmd.includes(options.filter)) {
        items.unshift({
          name: cmd,
          type: 'built-in',
          status: 'loaded'
        });
      }
    }

    return items;
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
        description: `${hostConfig.user || 'root'}@${hostConfig.host || name}`,
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

    return files.map(file => ({
      name: file,
      path: path.join(templatesDir, file),
      type: 'template'
    }));
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

    return files
      .filter(file => ['.yaml', '.yml', '.json'].some(ext => file.endsWith(ext)))
      .map(file => ({
        name: file,
        path: path.join(pipelinesDir, file),
        type: 'pipeline'
      }));
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

    return files
      .filter(file => ['.yaml', '.yml', '.json'].some(ext => file.endsWith(ext)))
      .map(file => ({
        name: file,
        path: path.join(batchesDir, file),
        type: 'batch'
      }));
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

    // Table format
    items.forEach(item => {
      let line = `  ${chalk.cyan(item.name)}`;
      
      if (item.status === 'active') {
        line += chalk.green(' (active)');
      } else if (item.status === 'failed') {
        line += chalk.red(' (failed)');
      }
      
      if (item.type === 'built-in') {
        line += chalk.dim(' [built-in]');
      }
      
      if (item.description) {
        line += chalk.gray(` - ${item.description}`);
      }
      
      console.log(line);
      
      if (options.verbose) {
        if (item.path) {
          console.log(`    ${chalk.dim('Path:')} ${item.path}`);
        }
        if (item.error) {
          console.log(`    ${chalk.red('Error:')} ${item.error}`);
        }
      }
    });
  }
}

export default function listCommand(program: Command): void {
  const cmd = new ListCommand();
  program.addCommand(cmd.create());
}