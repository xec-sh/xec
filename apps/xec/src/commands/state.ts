import chalk from 'chalk';
import * as path from 'path';
import { table } from 'table';
import { Command } from 'commander';
import { promises as fs } from 'fs';
import { confirm } from '@clack/prompts';
import { Ledger, StateStore, LockManager, OperationType, FileStorageAdapter } from '@xec/core';

import { getProjectRoot } from '../utils/project.js';

export default function stateCommand(program: Command) {
  const state = program
    .command('state')
    .description('Manage and inspect execution state');

  state
    .command('show [key]')
    .description('Display current state or specific key')
    .option('--json', 'Output as JSON')
    .option('--depth <n>', 'Depth for nested objects', parseInt)
    .action(async (key?: string, options?: { json?: boolean; depth?: number }) => {
      try {
        const stateStore = await getStateStore();
        
        if (key) {
          const value = await stateStore.getCurrentState(key);
          if (value === undefined) {
            console.log(chalk.red(`Key '${key}' not found in state`));
            process.exit(1);
          }

          if (options?.json) {
            console.log(JSON.stringify(value, null, 2));
          } else {
            console.log(chalk.bold(`State key: ${key}`));
            console.log(formatValue(value, options?.depth || 3));
          }
        } else {
          // Show all state
          const allState = await getAllState(stateStore);
          
          if (options?.json) {
            console.log(JSON.stringify(allState, null, 2));
          } else {
            if (Object.keys(allState).length === 0) {
              console.log(chalk.yellow('State is empty'));
              return;
            }

            console.log(chalk.bold('Current State:\n'));
            for (const [key, value] of Object.entries(allState)) {
              console.log(chalk.cyan(`${key}:`), formatValue(value, 1));
            }
          }
        }
      } catch (error) {
        console.error(chalk.red(`Failed to show state: ${error}`));
        process.exit(1);
      }
    });

  state
    .command('list')
    .alias('ls')
    .description('List all state keys')
    .option('--pattern <pattern>', 'Filter keys by pattern')
    .option('--json', 'Output as JSON')
    .action(async (options?: { pattern?: string; json?: boolean }) => {
      try {
        const stateStore = await getStateStore();
        const allState = await getAllState(stateStore);
        let keys = Object.keys(allState);

        if (options?.pattern) {
          const regex = new RegExp(options.pattern);
          keys = keys.filter(key => regex.test(key));
        }

        if (options?.json) {
          console.log(JSON.stringify({ keys }, null, 2));
        } else {
          if (keys.length === 0) {
            console.log(chalk.yellow('No state keys found'));
            return;
          }

          console.log(chalk.bold('State Keys:\n'));
          
          // Create table with key info
          const tableData = [['Key', 'Type', 'Size']];
          
          for (const key of keys) {
            const value = await stateStore.getCurrentState(key);
            const type = Array.isArray(value) ? 'array' : typeof value;
            const size = JSON.stringify(value).length;
            tableData.push([key, type, `${size} bytes`]);
          }

          console.log(table(tableData));
          console.log(chalk.gray(`Total: ${keys.length} key(s)`));
        }
      } catch (error) {
        console.error(chalk.red(`Failed to list state: ${error}`));
        process.exit(1);
      }
    });

  state
    .command('history [key]')
    .description('Show state change history')
    .option('--limit <n>', 'Number of entries to show', parseInt, 10)
    .option('--from <date>', 'Start date (ISO format)')
    .option('--to <date>', 'End date (ISO format)')
    .option('--json', 'Output as JSON')
    .action(async (key?: string, options?: any) => {
      try {
        const ledger = await getStateLedger();
        
        let entries = await ledger.getEntries({
          limit: options?.limit || 100,
          offset: options?.offset || 0
        });
        
        // Filter by key if provided
        if (key) {
          entries = entries.filter(e => 
            (e.operation === OperationType.CREATE || e.operation === OperationType.UPDATE || e.operation === OperationType.DELETE) && 
            e.resource.id === key
          );
        }

        // Filter by date range
        if (options?.from) {
          const fromDate = new Date(options.from).getTime();
          entries = entries.filter(e => e.timestamp >= fromDate);
        }
        
        if (options?.to) {
          const toDate = new Date(options.to).getTime();
          entries = entries.filter(e => e.timestamp <= toDate);
        }

        // Apply limit
        if (options?.limit) {
          entries = entries.slice(-options.limit);
        }

        if (options?.json) {
          console.log(JSON.stringify({ entries }, null, 2));
        } else {
          if (entries.length === 0) {
            console.log(chalk.yellow('No history found'));
            return;
          }

          console.log(chalk.bold('State History:\n'));
          
          for (const entry of entries) {
            const date = new Date(entry.timestamp).toLocaleString();
            const action = entry.operation === OperationType.CREATE ? chalk.green('CREATE') : 
                          entry.operation === OperationType.UPDATE ? chalk.blue('UPDATE') : 
                          chalk.red('DELETE');
            const key = entry.resource.id;
            
            console.log(`[${chalk.gray(date)}] ${action} ${chalk.cyan(key)}`);
            
            if ((entry.operation === OperationType.CREATE || entry.operation === OperationType.UPDATE) && entry.newState !== undefined) {
              console.log(`  Value: ${formatValue(entry.newState, 1)}`);
            }
            
            if ((entry as any).metadata?.user) {
              console.log(`  User: ${(entry as any).metadata.user}`);
            }
            
            console.log();
          }
        }
      } catch (error) {
        console.error(chalk.red(`Failed to show history: ${error}`));
        process.exit(1);
      }
    });

  state
    .command('export [file]')
    .description('Export state to file')
    .option('--format <format>', 'Output format (json|yaml)', 'json')
    .option('--pretty', 'Pretty print output')
    .action(async (file?: string, options?: { format?: string; pretty?: boolean }) => {
      try {
        const stateStore = await getStateStore();
        const allState = await getAllState(stateStore);
        
        let output: string;
        
        if (options?.format === 'yaml') {
          // In a real implementation, we'd use a YAML library
          output = '# State export\n';
          for (const [key, value] of Object.entries(allState)) {
            output += `${key}: ${JSON.stringify(value)}\n`;
          }
        } else {
          output = JSON.stringify(allState, null, options?.pretty ? 2 : 0);
        }

        if (file) {
          await fs.writeFile(file, output);
          console.log(chalk.green(`✓ State exported to ${file}`));
        } else {
          console.log(output);
        }
      } catch (error) {
        console.error(chalk.red(`Failed to export state: ${error}`));
        process.exit(1);
      }
    });

  state
    .command('import <file>')
    .description('Import state from file')
    .option('--merge', 'Merge with existing state')
    .option('--dry-run', 'Preview changes without applying')
    .action(async (file: string, options?: { merge?: boolean; dryRun?: boolean }) => {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const importedState = JSON.parse(content);
        
        if (typeof importedState !== 'object' || importedState === null) {
          console.log(chalk.red('Invalid state file format'));
          process.exit(1);
        }

        const stateStore = await getStateStore();
        const currentState = await getAllState(stateStore);
        
        // Show what will be imported
        console.log(chalk.bold('State to import:\n'));
        const importKeys = Object.keys(importedState);
        const existingKeys = Object.keys(currentState);
        const newKeys = importKeys.filter(k => !existingKeys.includes(k));
        const updatedKeys = importKeys.filter(k => existingKeys.includes(k));
        
        if (newKeys.length > 0) {
          console.log(chalk.green(`New keys (${newKeys.length}):`), newKeys.join(', '));
        }
        
        if (updatedKeys.length > 0) {
          console.log(chalk.yellow(`Updated keys (${updatedKeys.length}):`), updatedKeys.join(', '));
        }

        if (!options?.merge && existingKeys.length > 0) {
          const deletedKeys = existingKeys.filter(k => !importKeys.includes(k));
          if (deletedKeys.length > 0) {
            console.log(chalk.red(`Deleted keys (${deletedKeys.length}):`), deletedKeys.join(', '));
          }
        }

        console.log();

        if (options?.dryRun) {
          console.log(chalk.yellow('DRY RUN - No changes applied'));
          return;
        }

        // Confirm import
        const confirmed = await confirm({
          message: options?.merge 
            ? 'Merge imported state with existing state?' 
            : 'Replace existing state with imported state?',
          initialValue: false,
        });

        if (!confirmed) {
          console.log(chalk.yellow('Import cancelled'));
          return;
        }

        // Apply import
        if (!options?.merge) {
          // Clear existing state
          for (const key of existingKeys) {
            await stateStore.deleteState(key);
          }
        }

        // Import new state
        for (const [key, value] of Object.entries(importedState)) {
          await stateStore.setState(key, value, 1);
        }

        console.log(chalk.green(`✓ State imported successfully`));
      } catch (error) {
        console.error(chalk.red(`Failed to import state: ${error}`));
        process.exit(1);
      }
    });

  state
    .command('reset')
    .description('Reset state to empty')
    .option('--force', 'Skip confirmation')
    .action(async (options?: { force?: boolean }) => {
      try {
        if (!options?.force) {
          const confirmed = await confirm({
            message: chalk.red('Are you sure you want to reset all state? This cannot be undone.'),
            initialValue: false,
          });

          if (!confirmed) {
            console.log(chalk.yellow('Reset cancelled'));
            return;
          }
        }

        const stateStore = await getStateStore();
        const allState = await getAllState(stateStore);
        
        for (const key of Object.keys(allState)) {
          await stateStore.deleteState(key);
        }

        console.log(chalk.green('✓ State reset successfully'));
      } catch (error) {
        console.error(chalk.red(`Failed to reset state: ${error}`));
        process.exit(1);
      }
    });

  state
    .command('lock <key>')
    .description('Acquire lock on state key')
    .option('--timeout <ms>', 'Lock timeout in milliseconds', parseInt, 30000)
    .option('--wait', 'Wait for lock if not available')
    .action(async (key: string, options?: { timeout?: number; wait?: boolean }) => {
      try {
        const lockManager = await getLockManager();
        
        console.log(chalk.yellow(`Acquiring lock on '${key}'...`));
        
        const acquired = await lockManager.acquire(
          key, 
          options?.timeout || 30000
        );

        if (acquired) {
          console.log(chalk.green(`✓ Lock acquired on '${key}'`));
          console.log(chalk.gray('Lock will be automatically released on process exit'));
          
          // Keep process running until interrupted
          process.on('SIGINT', async () => {
            await lockManager.release(key);
            console.log(chalk.green(`\n✓ Lock released on '${key}'`));
            process.exit(0);
          });
          
          // Keep the process alive
          await new Promise(() => {});
        } else {
          console.log(chalk.red(`Failed to acquire lock on '${key}'`));
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red(`Failed to acquire lock: ${error}`));
        process.exit(1);
      }
    });

  state
    .command('unlock <key>')
    .description('Release lock on state key')
    .option('--force', 'Force unlock even if not owner')
    .action(async (key: string, options?: { force?: boolean }) => {
      try {
        const lockManager = await getLockManager();
        
        await lockManager.release(key);
        console.log(chalk.green(`✓ Lock released on '${key}'`));
      } catch (error) {
        console.error(chalk.red(`Failed to release lock: ${error}`));
        process.exit(1);
      }
    });
}

async function getStateStore(): Promise<StateStore> {
  const projectRoot = await getProjectRoot();
  const statePath = path.join(projectRoot, '.xec', 'state');
  
  // Ensure state directory exists
  await fs.mkdir(statePath, { recursive: true });
  
  const storage = new FileStorageAdapter({
    basePath: path.join(statePath, 'state')
  });
  const lockManager = new LockManager();
  return new StateStore(storage, lockManager);
}

async function getStateLedger(): Promise<Ledger> {
  const projectRoot = await getProjectRoot();
  const statePath = path.join(projectRoot, '.xec', 'state');
  
  // Ensure state directory exists
  await fs.mkdir(statePath, { recursive: true });
  
  const storage = new FileStorageAdapter({
    basePath: path.join(statePath, 'ledger')
  });
  
  return new Ledger(storage);
}

async function getLockManager(): Promise<LockManager> {
  const projectRoot = await getProjectRoot();
  const statePath = path.join(projectRoot, '.xec', 'state');
  
  // Ensure state directory exists
  await fs.mkdir(statePath, { recursive: true });
  
  const storage = new FileStorageAdapter({
    basePath: path.join(statePath, 'locks')
  });
  
  return new LockManager();
}

async function getAllState(stateStore: StateStore): Promise<Record<string, any>> {
  // In a real implementation, StateStore would have a method to get all keys
  // For now, we'll simulate it
  const state: Record<string, any> = {};
  
  // This is a placeholder - in reality, we'd iterate through all stored keys
  // For demonstration, we'll return an empty object
  return state;
}

function formatValue(value: any, maxDepth: number, currentDepth: number = 0): string {
  if (currentDepth >= maxDepth) {
    return chalk.gray('...');
  }

  if (value === null) return chalk.gray('null');
  if (value === undefined) return chalk.gray('undefined');
  
  if (typeof value === 'string') return chalk.green(`"${value}"`);
  if (typeof value === 'number') return chalk.yellow(value.toString());
  if (typeof value === 'boolean') return chalk.cyan(value.toString());
  
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (currentDepth === maxDepth - 1) return `[Array(${value.length})]`;
    
    const items = value.slice(0, 3).map(v => formatValue(v, maxDepth, currentDepth + 1));
    if (value.length > 3) items.push(chalk.gray('...'));
    return `[${items.join(', ')}]`;
  }
  
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    if (currentDepth === maxDepth - 1) return `{Object(${keys.length})}`;
    
    const items = keys.slice(0, 3).map(k => 
      `${k}: ${formatValue(value[k], maxDepth, currentDepth + 1)}`
    );
    if (keys.length > 3) items.push(chalk.gray('...'));
    return `{ ${items.join(', ')} }`;
  }
  
  return String(value);
}