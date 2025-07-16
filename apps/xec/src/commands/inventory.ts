import chalk from 'chalk';
import * as path from 'path';
import { table } from 'table';
import * as yaml from 'js-yaml';
import { Command } from 'commander';
import { promises as fs } from 'fs';
import { text, confirm } from '@clack/prompts';

import { getProjectRoot } from '../utils/project.js';

interface Host {
  name: string;
  host: string;
  hostname?: string;
  port?: number;
  user?: string;
  password?: string;
  privateKey?: string;
  tags?: string[];
  vars?: Record<string, any>;
}

interface Group {
  name: string;
  hosts: string[];
  children?: string[];
  vars?: Record<string, any>;
}

interface InventoryData {
  hosts: Record<string, Host>;
  groups: Record<string, Group>;
}

export default function inventoryCommand(program: Command) {
  const inventory = program
    .command('inventory')
    .alias('inv')
    .description('Manage inventory hosts and groups');

  inventory
    .command('list')
    .alias('ls')
    .description('List all hosts and groups')
    .option('--hosts', 'Show only hosts')
    .option('--groups', 'Show only groups')
    .option('--format <format>', 'Output format (table|json|yaml)', 'table')
    .action(async (options?: { hosts?: boolean; groups?: boolean; format?: string }) => {
      try {
        const inv = await loadInventory();
        
        const showHosts = !options?.groups || options?.hosts;
        const showGroups = !options?.hosts || options?.groups;

        if (options?.format === 'json') {
          const output: any = {};
          if (showHosts) output.hosts = inv.hosts;
          if (showGroups) output.groups = inv.groups;
          console.log(JSON.stringify(output, null, 2));
          return;
        }

        if (options?.format === 'yaml') {
          const output: any = {};
          if (showHosts) output.hosts = inv.hosts;
          if (showGroups) output.groups = inv.groups;
          console.log(yaml.dump(output));
          return;
        }

        // Table format
        if (showHosts) {
          console.log(chalk.bold('\nHosts:\n'));
          
          const hosts = Object.entries(inv.hosts);
          if (hosts.length === 0) {
            console.log(chalk.yellow('No hosts defined'));
          } else {
            const tableData = [['Name', 'Address', 'Port', 'User', 'Tags', 'Groups']];
            
            for (const [name, host] of hosts) {
              const groups = Object.entries(inv.groups)
                .filter(([_, group]) => group.hosts.includes(name))
                .map(([groupName]) => groupName);
              
              tableData.push([
                name,
                host.hostname || host.host,
                (host.port || 22).toString(),
                host.user || 'default',
                (host.tags || []).join(', ') || '-',
                groups.join(', ') || '-',
              ]);
            }
            
            console.log(table(tableData));
          }
        }

        if (showGroups) {
          console.log(chalk.bold('\nGroups:\n'));
          
          const groups = Object.entries(inv.groups);
          if (groups.length === 0) {
            console.log(chalk.yellow('No groups defined'));
          } else {
            const tableData = [['Name', 'Hosts', 'Children', 'Variables']];
            
            for (const [name, group] of groups) {
              tableData.push([
                name,
                group.hosts.length.toString(),
                (group.children || []).length.toString(),
                Object.keys(group.vars || {}).length.toString(),
              ]);
            }
            
            console.log(table(tableData));
          }
        }

        // Summary
        console.log(chalk.gray(`\nTotal: ${Object.keys(inv.hosts).length} host(s), ${Object.keys(inv.groups).length} group(s)`));
        
      } catch (error) {
        console.error(chalk.red(`Failed to list inventory: ${error}`));
        process.exit(1);
      }
    });

  inventory
    .command('add <host>')
    .description('Add host to inventory')
    .option('--hostname <hostname>', 'Hostname or IP address')
    .option('--port <port>', 'SSH port', parseInt, 22)
    .option('--user <user>', 'SSH user')
    .option('--password <password>', 'SSH password')
    .option('--key <key>', 'SSH key file')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--vars <vars>', 'Variables as JSON or key=value')
    .option('--groups <groups>', 'Comma-separated groups')
    .action(async (hostName: string, options?: any) => {
      try {
        const inv = await loadInventory();
        
        if (inv.hosts[hostName]) {
          const overwrite = await confirm({
            message: `Host '${hostName}' already exists. Overwrite?`,
            initialValue: false,
          });
          
          if (!overwrite) {
            console.log(chalk.yellow('Operation cancelled'));
            return;
          }
        }

        // Interactive mode if hostname not provided
        let hostname = options?.hostname;
        if (!hostname) {
          hostname = await text({
            message: 'Enter hostname or IP address:',
            placeholder: '192.168.1.100',
          }) as string;
        }

        const host: Host = {
          name: hostName,
          host: hostname,
          hostname,
          port: options?.port || 22,
        };

        if (options?.user) host.user = options.user;
        if (options?.password) (host as any).password = options.password;
        if (options?.key) (host as any).privateKey = options.key;
        if (options?.tags) host.tags = options.tags.split(',').map((t: string) => t.trim());
        if (options?.vars) host.vars = parseVars(options.vars);

        inv.hosts[hostName] = host;

        // Add to groups if specified
        if (options?.groups) {
          const groupNames = options.groups.split(',').map((g: string) => g.trim());
          for (const groupName of groupNames) {
            if (!inv.groups[groupName]) {
              inv.groups[groupName] = { name: groupName, hosts: [] };
            }
            if (!inv.groups[groupName].hosts.includes(hostName)) {
              inv.groups[groupName].hosts.push(hostName);
            }
          }
        }

        await saveInventory(inv);
        console.log(chalk.green(`✓ Host '${hostName}' added successfully`));
        
      } catch (error) {
        console.error(chalk.red(`Failed to add host: ${error}`));
        process.exit(1);
      }
    });

  inventory
    .command('remove <host>')
    .alias('rm')
    .description('Remove host from inventory')
    .option('--force', 'Skip confirmation')
    .action(async (hostName: string, options?: { force?: boolean }) => {
      try {
        const inv = await loadInventory();
        
        if (!inv.hosts[hostName]) {
          console.log(chalk.red(`Host '${hostName}' not found`));
          process.exit(1);
        }

        if (!options?.force) {
          const confirmed = await confirm({
            message: `Remove host '${hostName}'?`,
            initialValue: false,
          });
          
          if (!confirmed) {
            console.log(chalk.yellow('Operation cancelled'));
            return;
          }
        }

        // Remove from all groups
        for (const group of Object.values(inv.groups)) {
          group.hosts = group.hosts.filter(h => h !== hostName);
        }

        delete inv.hosts[hostName];
        await saveInventory(inv);
        
        console.log(chalk.green(`✓ Host '${hostName}' removed successfully`));
        
      } catch (error) {
        console.error(chalk.red(`Failed to remove host: ${error}`));
        process.exit(1);
      }
    });

  // Group subcommands
  const group = inventory
    .command('group')
    .description('Manage inventory groups');

  group
    .command('create <name>')
    .description('Create a new group')
    .option('--vars <vars>', 'Group variables as JSON or key=value')
    .action(async (groupName: string, options?: { vars?: string }) => {
      try {
        const inv = await loadInventory();
        
        if (inv.groups[groupName]) {
          console.log(chalk.red(`Group '${groupName}' already exists`));
          process.exit(1);
        }

        inv.groups[groupName] = {
          name: groupName,
          hosts: [],
          vars: options?.vars ? parseVars(options.vars) : {},
        };

        await saveInventory(inv);
        console.log(chalk.green(`✓ Group '${groupName}' created successfully`));
        
      } catch (error) {
        console.error(chalk.red(`Failed to create group: ${error}`));
        process.exit(1);
      }
    });

  group
    .command('add <group> <host>')
    .description('Add host to group')
    .action(async (groupName: string, hostName: string) => {
      try {
        const inv = await loadInventory();
        
        if (!inv.groups[groupName]) {
          console.log(chalk.red(`Group '${groupName}' not found`));
          process.exit(1);
        }

        if (!inv.hosts[hostName]) {
          console.log(chalk.red(`Host '${hostName}' not found`));
          process.exit(1);
        }

        if (inv.groups[groupName].hosts.includes(hostName)) {
          console.log(chalk.yellow(`Host '${hostName}' is already in group '${groupName}'`));
          return;
        }

        inv.groups[groupName].hosts.push(hostName);
        await saveInventory(inv);
        
        console.log(chalk.green(`✓ Host '${hostName}' added to group '${groupName}'`));
        
      } catch (error) {
        console.error(chalk.red(`Failed to add host to group: ${error}`));
        process.exit(1);
      }
    });

  group
    .command('remove <group> <host>')
    .description('Remove host from group')
    .action(async (groupName: string, hostName: string) => {
      try {
        const inv = await loadInventory();
        
        if (!inv.groups[groupName]) {
          console.log(chalk.red(`Group '${groupName}' not found`));
          process.exit(1);
        }

        const index = inv.groups[groupName].hosts.indexOf(hostName);
        if (index === -1) {
          console.log(chalk.yellow(`Host '${hostName}' is not in group '${groupName}'`));
          return;
        }

        inv.groups[groupName].hosts.splice(index, 1);
        await saveInventory(inv);
        
        console.log(chalk.green(`✓ Host '${hostName}' removed from group '${groupName}'`));
        
      } catch (error) {
        console.error(chalk.red(`Failed to remove host from group: ${error}`));
        process.exit(1);
      }
    });

  inventory
    .command('import <file>')
    .description('Import inventory from file')
    .option('--format <format>', 'File format (json|yaml|ini)', 'yaml')
    .option('--merge', 'Merge with existing inventory')
    .action(async (file: string, options?: { format?: string; merge?: boolean }) => {
      try {
        const content = await fs.readFile(file, 'utf-8');
        let imported: InventoryData;

        switch (options?.format) {
          case 'json':
            imported = JSON.parse(content);
            break;
          case 'yaml':
            imported = yaml.load(content) as InventoryData;
            break;
          case 'ini':
            imported = parseIniInventory(content);
            break;
          default:
            throw new Error(`Unsupported format: ${options?.format}`);
        }

        const current = await loadInventory();
        
        // Show import summary
        console.log(chalk.bold('Import Summary:\n'));
        console.log(`Hosts to import: ${Object.keys(imported.hosts || {}).length}`);
        console.log(`Groups to import: ${Object.keys(imported.groups || {}).length}`);

        if (!options?.merge && (Object.keys(current.hosts).length > 0 || Object.keys(current.groups).length > 0)) {
          console.log(chalk.yellow('\nWarning: This will replace the existing inventory'));
        }

        const confirmed = await confirm({
          message: options?.merge ? 'Merge with existing inventory?' : 'Import inventory?',
          initialValue: true,
        });

        if (!confirmed) {
          console.log(chalk.yellow('Import cancelled'));
          return;
        }

        let final: InventoryData;
        if (options?.merge) {
          final = {
            hosts: { ...current.hosts, ...(imported.hosts || {}) },
            groups: { ...current.groups, ...(imported.groups || {}) },
          };
        } else {
          final = imported;
        }

        await saveInventory(final);
        console.log(chalk.green('✓ Inventory imported successfully'));
        
      } catch (error) {
        console.error(chalk.red(`Failed to import inventory: ${error}`));
        process.exit(1);
      }
    });

  inventory
    .command('export [file]')
    .description('Export inventory to file')
    .option('--format <format>', 'Output format (json|yaml|ini)', 'yaml')
    .action(async (file?: string, options?: { format?: string }) => {
      try {
        const inv = await loadInventory();
        let output: string;

        switch (options?.format) {
          case 'json':
            output = JSON.stringify(inv, null, 2);
            break;
          case 'yaml':
            output = yaml.dump(inv);
            break;
          case 'ini':
            output = generateIniInventory(inv);
            break;
          default:
            throw new Error(`Unsupported format: ${options?.format}`);
        }

        if (file) {
          await fs.writeFile(file, output);
          console.log(chalk.green(`✓ Inventory exported to ${file}`));
        } else {
          console.log(output);
        }
        
      } catch (error) {
        console.error(chalk.red(`Failed to export inventory: ${error}`));
        process.exit(1);
      }
    });
}

async function getInventoryPath(): Promise<string> {
  const projectRoot = await getProjectRoot();
  return path.join(projectRoot, '.xec', 'inventory.yaml');
}

async function loadInventory(): Promise<InventoryData> {
  const inventoryPath = await getInventoryPath();
  
  try {
    const content = await fs.readFile(inventoryPath, 'utf-8');
    return yaml.load(content) as InventoryData;
  } catch (error) {
    // Initialize empty inventory if file doesn't exist
    return {
      hosts: {},
      groups: {},
    };
  }
}

async function saveInventory(inventory: InventoryData): Promise<void> {
  const inventoryPath = await getInventoryPath();
  const dir = path.dirname(inventoryPath);
  
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(inventoryPath, yaml.dump(inventory));
}

function parseVars(vars: string): Record<string, any> {
  try {
    // Try parsing as JSON first
    return JSON.parse(vars);
  } catch {
    // Parse as key=value pairs
    const result: Record<string, any> = {};
    const pairs = vars.split(',');
    
    for (const pair of pairs) {
      const [key, ...valueParts] = pair.split('=');
      const value = valueParts.join('=').trim();
      
      // Try to parse value as JSON, otherwise treat as string
      if (key) {
        try {
          result[key.trim()] = JSON.parse(value);
        } catch {
          result[key.trim()] = value;
        }
      }
    }
    
    return result;
  }
}

function parseIniInventory(content: string): InventoryData {
  // Basic INI parser for Ansible-style inventory
  const inventory: InventoryData = { hosts: {}, groups: {} };
  const lines = content.split('\n');
  let currentGroup: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

    // Group header
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentGroup = trimmed.slice(1, -1);
      if (!inventory.groups[currentGroup]) {
        inventory.groups[currentGroup] = { name: currentGroup, hosts: [] };
      }
      continue;
    }

    // Host definition
    const parts = trimmed.split(/\s+/);
    const hostName = parts[0];
    
    if (hostName) {
      // Parse host variables
      const hostVars: Record<string, any> = {};
      for (let i = 1; i < parts.length; i++) {
        const kvPair = parts[i]?.split('=');
        if (kvPair && kvPair.length === 2 && kvPair[0] && kvPair[1]) {
          hostVars[kvPair[0]] = kvPair[1];
        }
      }

      // Create host if not exists
      if (!inventory.hosts[hostName]) {
        inventory.hosts[hostName] = {
          name: hostName,
          host: hostVars['ansible_host'] || hostName,
          hostname: hostVars['ansible_host'] || hostName,
          port: parseInt(hostVars['ansible_port']) || 22,
          user: hostVars['ansible_user'],
          vars: hostVars,
        };
      }

      // Add to current group
      if (currentGroup && inventory.groups[currentGroup]) {
        const group = inventory.groups[currentGroup];
        if (group && group.hosts) {
          group.hosts.push(hostName);
        }
      }
    }
  }

  return inventory;
}

function generateIniInventory(inventory: InventoryData): string {
  const lines: string[] = [];
  
  // Ungrouped hosts
  const groupedHosts = new Set<string>();
  for (const group of Object.values(inventory.groups)) {
    group.hosts.forEach(h => groupedHosts.add(h));
  }
  
  const ungroupedHosts = Object.keys(inventory.hosts).filter(h => !groupedHosts.has(h));
  if (ungroupedHosts.length > 0) {
    for (const hostName of ungroupedHosts) {
      const host = inventory.hosts[hostName];
      if (!host) continue;
      const vars: string[] = [];
      if (host.hostname && host.hostname !== hostName) vars.push(`ansible_host=${host.hostname}`);
      if (host.port && host.port !== 22) vars.push(`ansible_port=${host.port}`);
      if (host.user) vars.push(`ansible_user=${host.user}`);
      
      lines.push(`${hostName} ${vars.join(' ')}`);
    }
    lines.push('');
  }

  // Groups
  for (const [groupName, group] of Object.entries(inventory.groups)) {
    lines.push(`[${groupName}]`);
    for (const hostName of group.hosts) {
      const host = inventory.hosts[hostName];
      if (host) {
        const vars: string[] = [];
        if (host.hostname !== hostName) vars.push(`ansible_host=${host.hostname}`);
        if (host.port !== 22) vars.push(`ansible_port=${host.port}`);
        if (host.user) vars.push(`ansible_user=${host.user}`);
        
        lines.push(`${hostName} ${vars.join(' ')}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}