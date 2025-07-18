import * as net from 'net';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import { Command } from 'commander';

import { SubcommandBase } from '../../utils/command-base.js';
import { errorMessages } from '../../utils/error-handler.js';
import { validateHostPattern } from '../../utils/validation.js';
// Simple ping implementation
const ping = async (host: string, timeout: number = 5000): Promise<boolean> => new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      resolve(false);
    });
    
    socket.connect(22, host); // Try SSH port
  });

interface InventoryOptions {
  group?: string;
  host?: string;
  tag?: string;
  port?: number;
  user?: string;
  format?: 'yaml' | 'json';
  timeout?: number;
}

interface HostEntry {
  host: string;
  port?: number;
  user?: string;
  tags?: string[];
  groups?: string[];
  vars?: Record<string, any>;
  description?: string;
}

interface InventoryData {
  hosts: Record<string, HostEntry>;
  groups: Record<string, {
    hosts: string[];
    vars?: Record<string, any>;
    description?: string;
  }>;
  vars?: Record<string, any>;
}

export class InventoryCommand extends SubcommandBase {
  constructor() {
    super({
      name: 'inventory',
      description: 'Manage host inventory',
      aliases: ['inv'],
      examples: [
        {
          command: 'xec project inventory add production 192.168.1.100',
          description: 'Add host to production group',
        },
        {
          command: 'xec project inventory list --group web',
          description: 'List hosts in web group',
        },
        {
          command: 'xec project inventory test --host production',
          description: 'Test connectivity to production host',
        },
        {
          command: 'xec project inventory tag web1 --tag frontend,nginx',
          description: 'Add tags to host',
        },
      ],
    });
  }

  protected setupSubcommands(command: Command): void {
    // xec project inventory add
    command
      .command('add')
      .description('Add host to inventory')
      .argument('<name>', 'Host name or identifier')
      .argument('<host>', 'Host address (IP or hostname)')
      .option('-g, --group <group>', 'Group to add host to')
      .option('-p, --port <port>', 'SSH port (default: 22)', '22')
      .option('-u, --user <user>', 'SSH user')
      .option('-t, --tag <tags>', 'Tags (comma-separated)')
      .option('-d, --description <desc>', 'Host description')
      .action(async (name: string, host: string, options: InventoryOptions & { description?: string }) => {
        this.options = { ...this.options, ...options };
        await this.addHost(name, host, options);
      });

    // xec project inventory remove
    command
      .command('remove')
      .description('Remove host from inventory')
      .argument('<name>', 'Host name to remove')
      .option('--force', 'Skip confirmation prompt')
      .action(async (name: string, options: { force?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.removeHost(name, options);
      });

    // xec project inventory list
    command
      .command('list')
      .description('List inventory hosts')
      .option('-g, --group <group>', 'Filter by group')
      .option('-t, --tag <tag>', 'Filter by tag')
      .option('--hosts-only', 'Show only host names')
      .action(async (options: InventoryOptions & { hostsOnly?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.listHosts(options);
      });

    // xec project inventory show
    command
      .command('show')
      .description('Show host details')
      .argument('<name>', 'Host name')
      .action(async (name: string) => {
        await this.showHost(name);
      });

    // xec project inventory test
    command
      .command('test')
      .description('Test connectivity to hosts')
      .option('-h, --host <host>', 'Test specific host')
      .option('-g, --group <group>', 'Test hosts in group')
      .option('-t, --timeout <ms>', 'Connection timeout', '5000')
      .action(async (options: InventoryOptions) => {
        this.options = { ...this.options, ...options };
        await this.testConnectivity(options);
      });

    // xec project inventory tag
    command
      .command('tag')
      .description('Manage host tags')
      .argument('<name>', 'Host name')
      .option('-t, --tag <tags>', 'Tags to add (comma-separated)')
      .option('--remove-tag <tags>', 'Tags to remove (comma-separated)')
      .option('--clear-tags', 'Clear all tags')
      .action(async (name: string, options: { tag?: string; removeTag?: string; clearTags?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.manageTags(name, options);
      });

    // xec project inventory group
    command
      .command('group')
      .description('Manage host groups')
      .argument('<action>', 'Action: create, delete, add-host, remove-host')
      .argument('<group>', 'Group name')
      .argument('[host]', 'Host name (for add-host/remove-host)')
      .option('-d, --description <desc>', 'Group description')
      .action(async (action: string, group: string, host?: string, options?: { description?: string }) => {
        this.options = { ...this.options, ...options };
        await this.manageGroup(action, group, host, options);
      });

    // xec project inventory import
    command
      .command('import')
      .description('Import inventory from file')
      .argument('<file>', 'File to import')
      .option('--merge', 'Merge with existing inventory')
      .option('--format <format>', 'File format (yaml|json)', 'yaml')
      .action(async (file: string, options: { merge?: boolean; format?: string }) => {
        this.options = { ...this.options, ...options };
        await this.importInventory(file, options);
      });

    // xec project inventory export
    command
      .command('export')
      .description('Export inventory to file')
      .argument('<file>', 'File to export to')
      .option('--format <format>', 'Export format (yaml|json)', 'yaml')
      .action(async (file: string, options: { format?: string }) => {
        this.options = { ...this.options, ...options };
        await this.exportInventory(file, options);
      });
  }

  private async addHost(name: string, host: string, options: InventoryOptions & { description?: string }): Promise<void> {
    validateHostPattern(host);
    
    const inventory = await this.loadInventory();
    
    if (inventory.hosts[name]) {
      const overwrite = await this.confirm(`Host '${name}' already exists. Overwrite?`);
      if (!overwrite) {
        this.log('Host addition cancelled', 'info');
        return;
      }
    }

    const hostEntry: HostEntry = {
      host,
      port: options.port || 22,
      user: options.user,
      tags: options.tag ? options.tag.split(',').map(t => t.trim()) : [],
      groups: options.group ? [options.group] : [],
      description: options.description,
    };

    inventory.hosts[name] = hostEntry;

    // Add to group if specified
    if (options.group) {
      if (!inventory.groups[options.group]) {
        inventory.groups[options.group] = {
          hosts: [],
          description: `Group: ${options.group}`,
        };
      }
      
      const group = inventory.groups[options.group];
      if (group && !group.hosts.includes(name)) {
        group.hosts.push(name);
      }
    }

    await this.saveInventory(inventory);
    this.log(`Host '${name}' added to inventory`, 'success');
  }

  private async removeHost(name: string, options: { force?: boolean }): Promise<void> {
    const inventory = await this.loadInventory();
    
    if (!inventory.hosts[name]) {
      throw errorMessages.configurationInvalid('host', `Host '${name}' not found`);
    }

    if (!options.force) {
      const confirm = await this.confirm(`Are you sure you want to remove host '${name}'?`);
      if (!confirm) {
        this.log('Host removal cancelled', 'info');
        return;
      }
    }

    // Remove from groups
    Object.keys(inventory.groups).forEach(groupName => {
      const group = inventory.groups[groupName];
      if (group) {
        group.hosts = group.hosts.filter(h => h !== name);
      }
    });

    delete inventory.hosts[name];
    
    await this.saveInventory(inventory);
    this.log(`Host '${name}' removed from inventory`, 'success');
  }

  private async listHosts(options: InventoryOptions & { hostsOnly?: boolean }): Promise<void> {
    const inventory = await this.loadInventory();
    let hosts = Object.entries(inventory.hosts);

    // Filter by group
    if (options.group) {
      const group = inventory.groups[options.group];
      if (!group) {
        throw errorMessages.configurationInvalid('group', `Group '${options.group}' not found`);
      }
      hosts = hosts.filter(([name]) => group.hosts.includes(name));
    }

    // Filter by tag
    if (options.tag) {
      hosts = hosts.filter(([, host]) => host.tags?.includes(options.tag!));
    }

    if (options.hostsOnly) {
      const hostNames = hosts.map(([name]) => name);
      this.formatter.list(hostNames, 'Hosts');
    } else {
      const tableData = {
        columns: [
          { header: 'Name', width: 20 },
          { header: 'Host', width: 25 },
          { header: 'Port', width: 8 },
          { header: 'User', width: 15 },
          { header: 'Groups', width: 20 },
          { header: 'Tags', width: 25 },
        ],
        rows: hosts.map(([name, host]) => [
          name,
          host.host,
          (host.port || 22).toString(),
          host.user || '',
          (host.groups || []).join(', '),
          (host.tags || []).join(', '),
        ]),
      };
      
      this.formatter.table(tableData);
    }
  }

  private async showHost(name: string): Promise<void> {
    const inventory = await this.loadInventory();
    const host = inventory.hosts[name];
    
    if (!host) {
      throw errorMessages.configurationInvalid('host', `Host '${name}' not found`);
    }

    this.formatter.keyValue({
      Name: name,
      Host: host.host,
      Port: host.port || 22,
      User: host.user || 'default',
      Groups: (host.groups || []).join(', ') || 'none',
      Tags: (host.tags || []).join(', ') || 'none',
      Description: host.description || 'none',
      Variables: host.vars ? Object.keys(host.vars).length : 0,
    }, `Host Details: ${name}`);

    if (host.vars && Object.keys(host.vars).length > 0) {
      this.formatter.keyValue(host.vars, 'Host Variables');
    }
  }

  private async testConnectivity(options: InventoryOptions): Promise<void> {
    const inventory = await this.loadInventory();
    let hosts: [string, HostEntry][] = [];

    if (options.host) {
      const host = inventory.hosts[options.host];
      if (!host) {
        throw errorMessages.configurationInvalid('host', `Host '${options.host}' not found`);
      }
      hosts = [[options.host, host]];
    } else if (options.group) {
      const group = inventory.groups[options.group];
      if (!group) {
        throw errorMessages.configurationInvalid('group', `Group '${options.group}' not found`);
      }
      hosts = group.hosts.map(name => [name, inventory.hosts[name]]).filter(([_, host]) => host !== undefined) as [string, HostEntry][];
    } else {
      hosts = Object.entries(inventory.hosts);
    }

    const timeout = options.timeout || 5000;
    this.log(`Testing connectivity to ${hosts.length} host(s)...`, 'info');

    const results = await Promise.allSettled(
      hosts.map(async ([name, host]) => {
        const start = Date.now();
        try {
          const isReachable = await this.testHostConnectivity(host.host, host.port || 22, timeout);
          const duration = Date.now() - start;
          return {
            name,
            host: host.host,
            port: host.port || 22,
            status: isReachable ? 'success' : 'failed',
            duration,
          };
        } catch (error) {
          return {
            name,
            host: host.host,
            port: host.port || 22,
            status: 'error',
            duration: Date.now() - start,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    const tableData = {
      columns: [
        { header: 'Name', width: 20 },
        { header: 'Host', width: 25 },
        { header: 'Port', width: 8 },
        { header: 'Status', width: 15 },
        { header: 'Duration', width: 10 },
        { header: 'Error', width: 30 },
      ],
      rows: results.map(result => {
        const data = result.status === 'fulfilled' ? result.value : null;
        return [
          data?.name || '',
          data?.host || '',
          (data?.port || 22).toString(),
          data?.status || 'unknown',
          data?.duration ? `${data.duration}ms` : '',
          data?.error || '',
        ];
      }),
    };

    this.formatter.table(tableData);
  }

  private async testHostConnectivity(host: string, port: number, timeout: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      
      socket.setTimeout(timeout);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.connect(port, host);
    });
  }

  private async manageTags(name: string, options: { tag?: string; removeTag?: string; clearTags?: boolean }): Promise<void> {
    const inventory = await this.loadInventory();
    const host = inventory.hosts[name];
    
    if (!host) {
      throw errorMessages.configurationInvalid('host', `Host '${name}' not found`);
    }

    if (!host.tags) {
      host.tags = [];
    }

    if (options.clearTags) {
      host.tags = [];
    }

    if (options.tag) {
      const tagsToAdd = options.tag.split(',').map(t => t.trim());
      tagsToAdd.forEach(tag => {
        if (!host.tags!.includes(tag)) {
          host.tags!.push(tag);
        }
      });
    }

    if (options.removeTag) {
      const tagsToRemove = options.removeTag.split(',').map(t => t.trim());
      host.tags = host.tags!.filter(tag => !tagsToRemove.includes(tag));
    }

    await this.saveInventory(inventory);
    this.log(`Tags updated for host '${name}'`, 'success');
  }

  private async manageGroup(action: string, group: string, host?: string, options?: { description?: string }): Promise<void> {
    const inventory = await this.loadInventory();

    switch (action) {
      case 'create':
        if (inventory.groups[group]) {
          throw errorMessages.configurationInvalid('group', `Group '${group}' already exists`);
        }
        inventory.groups[group] = {
          hosts: [],
          description: options?.description || `Group: ${group}`,
        };
        await this.saveInventory(inventory);
        this.log(`Group '${group}' created`, 'success');
        break;

      case 'delete':
        if (!inventory.groups[group]) {
          throw errorMessages.configurationInvalid('group', `Group '${group}' not found`);
        }
        delete inventory.groups[group];
        await this.saveInventory(inventory);
        this.log(`Group '${group}' deleted`, 'success');
        break;

      case 'add-host':
        if (!host) {
          throw errorMessages.configurationInvalid('host', 'Host name is required');
        }
        if (!inventory.hosts[host]) {
          throw errorMessages.configurationInvalid('host', `Host '${host}' not found`);
        }
        if (!inventory.groups[group]) {
          inventory.groups[group] = {
            hosts: [],
            description: `Group: ${group}`,
          };
        }
        if (!inventory.groups[group].hosts.includes(host)) {
          inventory.groups[group].hosts.push(host);
        }
        if (!inventory.hosts[host].groups) {
          inventory.hosts[host].groups = [];
        }
        if (!inventory.hosts[host].groups!.includes(group)) {
          inventory.hosts[host].groups!.push(group);
        }
        await this.saveInventory(inventory);
        this.log(`Host '${host}' added to group '${group}'`, 'success');
        break;

      case 'remove-host':
        if (!host) {
          throw errorMessages.configurationInvalid('host', 'Host name is required');
        }
        if (!inventory.groups[group]) {
          throw errorMessages.configurationInvalid('group', `Group '${group}' not found`);
        }
        inventory.groups[group].hosts = inventory.groups[group].hosts.filter(h => h !== host);
        if (inventory.hosts[host] && inventory.hosts[host].groups) {
          inventory.hosts[host].groups = inventory.hosts[host].groups!.filter(g => g !== group);
        }
        await this.saveInventory(inventory);
        this.log(`Host '${host}' removed from group '${group}'`, 'success');
        break;

      default:
        throw errorMessages.configurationInvalid('action', `Unknown action: ${action}`);
    }
  }

  private async importInventory(file: string, options: { merge?: boolean; format?: string }): Promise<void> {
    const filePath = path.resolve(file);
    const content = await fs.readFile(filePath, 'utf8');
    
    let importedInventory: InventoryData;
    if (options.format === 'json') {
      importedInventory = JSON.parse(content);
    } else {
      importedInventory = yaml.load(content) as InventoryData;
    }

    if (options.merge) {
      const existingInventory = await this.loadInventory();
      // Merge logic
      Object.assign(existingInventory.hosts, importedInventory.hosts);
      Object.assign(existingInventory.groups, importedInventory.groups);
      if (importedInventory.vars) {
        Object.assign(existingInventory.vars || {}, importedInventory.vars);
      }
      await this.saveInventory(existingInventory);
    } else {
      await this.saveInventory(importedInventory);
    }

    this.log(`Inventory imported from ${file}`, 'success');
  }

  private async exportInventory(file: string, options: { format?: string }): Promise<void> {
    const inventory = await this.loadInventory();
    const filePath = path.resolve(file);
    
    let content: string;
    if (options.format === 'json') {
      content = JSON.stringify(inventory, null, 2);
    } else {
      content = yaml.dump(inventory, { lineWidth: -1, noRefs: true });
    }
    
    await fs.writeFile(filePath, content);
    this.log(`Inventory exported to ${file}`, 'success');
  }

  private async loadInventory(): Promise<InventoryData> {
    const inventoryPath = await this.getInventoryPath();
    
    try {
      const content = await fs.readFile(inventoryPath, 'utf8');
      
      if (inventoryPath.endsWith('.json')) {
        return JSON.parse(content);
      } else {
        return yaml.load(content) as InventoryData || this.getDefaultInventory();
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return this.getDefaultInventory();
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private async saveInventory(inventory: InventoryData): Promise<void> {
    const inventoryPath = await this.getInventoryPath();
    const dir = path.dirname(inventoryPath);
    
    await fs.mkdir(dir, { recursive: true });
    
    let content: string;
    if (inventoryPath.endsWith('.json')) {
      content = JSON.stringify(inventory, null, 2);
    } else {
      content = yaml.dump(inventory, { lineWidth: -1, noRefs: true });
    }
    
    await fs.writeFile(inventoryPath, content);
  }

  private async getInventoryPath(): Promise<string> {
    const possiblePaths = [
      './inventory.yaml',
      './inventory.yml',
      './inventory.json',
      './.xec/inventory.yaml',
      './.xec/inventory.yml',
      './.xec/inventory.json',
    ];

    for (const inventoryPath of possiblePaths) {
      try {
        await fs.access(inventoryPath);
        return inventoryPath;
      } catch {
        continue;
      }
    }

    return './inventory.yaml';
  }

  private getDefaultInventory(): InventoryData {
    return {
      hosts: {},
      groups: {},
      vars: {},
    };
  }
}
