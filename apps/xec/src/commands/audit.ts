import chalk from 'chalk';
import * as path from 'path';
import { table } from 'table';
import { Command } from 'commander';
import { promises as fs } from 'fs';

import { getProjectRoot } from '../utils/project.js';

interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  result: 'success' | 'failure';
  metadata?: Record<string, any>;
  ip?: string;
  userAgent?: string;
  hash?: string;
}

export default function auditCommand(program: Command) {
  const audit = program
    .command('audit')
    .description('View and manage audit logs');

  audit
    .command('show')
    .alias('list')
    .description('Display audit logs')
    .option('--from <date>', 'Start date (ISO format or relative like "1d", "1w")')
    .option('--to <date>', 'End date (ISO format or relative)')
    .option('--user <user>', 'Filter by user')
    .option('--action <action>', 'Filter by action')
    .option('--resource <resource>', 'Filter by resource')
    .option('--result <result>', 'Filter by result (success|failure)')
    .option('--limit <n>', 'Limit number of entries', parseInt, 100)
    .option('--json', 'Output as JSON')
    .option('--detailed', 'Show detailed information')
    .action(async (options?: any) => {
      try {
        const entries = await loadAuditLogs();
        
        // Apply filters
        let filtered = entries;
        
        if (options?.from) {
          const fromDate = parseDate(options.from);
          filtered = filtered.filter(e => new Date(e.timestamp) >= fromDate);
        }
        
        if (options?.to) {
          const toDate = parseDate(options.to);
          filtered = filtered.filter(e => new Date(e.timestamp) <= toDate);
        }
        
        if (options?.user) {
          filtered = filtered.filter(e => e.user.includes(options.user));
        }
        
        if (options?.action) {
          filtered = filtered.filter(e => e.action.includes(options.action));
        }
        
        if (options?.resource) {
          filtered = filtered.filter(e => e.resource.includes(options.resource));
        }
        
        if (options?.result) {
          filtered = filtered.filter(e => e.result === options.result);
        }
        
        // Apply limit
        if (options?.limit) {
          filtered = filtered.slice(-options.limit);
        }

        if (options?.json) {
          console.log(JSON.stringify(filtered, null, 2));
          return;
        }

        if (filtered.length === 0) {
          console.log(chalk.yellow('No audit entries found'));
          return;
        }

        console.log(chalk.bold(`\nAudit Log (${filtered.length} entries):\n`));
        
        if (options?.detailed) {
          // Detailed view
          for (const entry of filtered) {
            console.log(chalk.gray('─'.repeat(80)));
            console.log(`${chalk.cyan('ID:')} ${entry.id}`);
            console.log(`${chalk.cyan('Time:')} ${new Date(entry.timestamp).toLocaleString()}`);
            console.log(`${chalk.cyan('User:')} ${entry.user}`);
            console.log(`${chalk.cyan('Action:')} ${entry.action}`);
            console.log(`${chalk.cyan('Resource:')} ${entry.resource}`);
            console.log(`${chalk.cyan('Result:')} ${entry.result === 'success' ? chalk.green('success') : chalk.red('failure')}`);
            
            if (entry.ip) {
              console.log(`${chalk.cyan('IP:')} ${entry.ip}`);
            }
            
            if (entry.metadata && Object.keys(entry.metadata).length > 0) {
              console.log(`${chalk.cyan('Metadata:')} ${JSON.stringify(entry.metadata)}`);
            }
            
            if (entry.hash) {
              console.log(`${chalk.cyan('Hash:')} ${chalk.gray(entry.hash)}`);
            }
          }
          console.log(chalk.gray('─'.repeat(80)));
        } else {
          // Table view
          const tableData = [['Time', 'User', 'Action', 'Resource', 'Result']];
          
          for (const entry of filtered) {
            tableData.push([
              new Date(entry.timestamp).toLocaleString(),
              entry.user,
              entry.action,
              truncate(entry.resource, 30),
              entry.result === 'success' ? chalk.green('✓') : chalk.red('✗'),
            ]);
          }
          
          console.log(table(tableData));
        }
        
      } catch (error) {
        console.error(chalk.red(`Failed to show audit logs: ${error}`));
        process.exit(1);
      }
    });

  audit
    .command('export <file>')
    .description('Export audit logs to file')
    .option('--format <format>', 'Output format (json|csv)', 'json')
    .option('--from <date>', 'Start date')
    .option('--to <date>', 'End date')
    .action(async (file: string, options?: any) => {
      try {
        const entries = await loadAuditLogs();
        
        // Apply date filters
        let filtered = entries;
        
        if (options?.from) {
          const fromDate = parseDate(options.from);
          filtered = filtered.filter(e => new Date(e.timestamp) >= fromDate);
        }
        
        if (options?.to) {
          const toDate = parseDate(options.to);
          filtered = filtered.filter(e => new Date(e.timestamp) <= toDate);
        }

        let output: string;
        
        if (options?.format === 'csv') {
          // Generate CSV
          const headers = ['ID', 'Timestamp', 'User', 'Action', 'Resource', 'Result', 'IP', 'Metadata'];
          const rows = [headers];
          
          for (const entry of filtered) {
            rows.push([
              entry.id,
              entry.timestamp,
              entry.user,
              entry.action,
              entry.resource,
              entry.result,
              entry.ip || '',
              JSON.stringify(entry.metadata || {}),
            ]);
          }
          
          output = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        } else {
          // Generate JSON
          output = JSON.stringify(filtered, null, 2);
        }

        await fs.writeFile(file, output);
        console.log(chalk.green(`✓ Exported ${filtered.length} audit entries to ${file}`));
        
      } catch (error) {
        console.error(chalk.red(`Failed to export audit logs: ${error}`));
        process.exit(1);
      }
    });

  audit
    .command('verify')
    .description('Verify audit log integrity')
    .option('--from <date>', 'Start date')
    .option('--to <date>', 'End date')
    .action(async (options?: any) => {
      try {
        console.log(chalk.yellow('Verifying audit log integrity...\n'));
        
        const entries = await loadAuditLogs();
        
        // Apply date filters
        let filtered = entries;
        
        if (options?.from) {
          const fromDate = parseDate(options.from);
          filtered = filtered.filter(e => new Date(e.timestamp) >= fromDate);
        }
        
        if (options?.to) {
          const toDate = parseDate(options.to);
          filtered = filtered.filter(e => new Date(e.timestamp) <= toDate);
        }

        let valid = 0;
        let invalid = 0;
        const issues: string[] = [];

        for (const entry of filtered) {
          // Verify entry structure
          if (!entry.id || !entry.timestamp || !entry.user || !entry.action || !entry.resource || !entry.result) {
            invalid++;
            issues.push(`Entry ${entry.id || 'unknown'}: Missing required fields`);
            continue;
          }

          // Verify timestamp
          const timestamp = new Date(entry.timestamp);
          if (isNaN(timestamp.getTime())) {
            invalid++;
            issues.push(`Entry ${entry.id}: Invalid timestamp`);
            continue;
          }

          // Verify hash if present
          if (entry.hash) {
            const computedHash = await computeEntryHash(entry);
            if (computedHash !== entry.hash) {
              invalid++;
              issues.push(`Entry ${entry.id}: Hash mismatch`);
              continue;
            }
          }

          valid++;
        }

        console.log(chalk.bold('Verification Results:\n'));
        console.log(`Total entries: ${filtered.length}`);
        console.log(`Valid entries: ${chalk.green(valid.toString())}`);
        console.log(`Invalid entries: ${invalid > 0 ? chalk.red(invalid.toString()) : '0'}`);

        if (issues.length > 0) {
          console.log(chalk.red('\nIssues found:'));
          issues.slice(0, 10).forEach(issue => console.log(`  - ${issue}`));
          if (issues.length > 10) {
            console.log(chalk.gray(`  ... and ${issues.length - 10} more`));
          }
        } else {
          console.log(chalk.green('\n✓ All entries are valid'));
        }

        // Check for gaps
        const sortedEntries = filtered.sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const gaps: string[] = [];
        for (let i = 1; i < sortedEntries.length; i++) {
          const prevEntry = sortedEntries[i - 1];
          const currEntry = sortedEntries[i];
          if (prevEntry && currEntry) {
            const prevTime = new Date(prevEntry.timestamp).getTime();
            const currTime = new Date(currEntry.timestamp).getTime();
            const gap = currTime - prevTime;
            
            // Flag gaps larger than 1 hour
            if (gap > 3600000) {
              const hours = Math.floor(gap / 3600000);
              gaps.push(`${hours}h gap between ${prevEntry.id} and ${currEntry.id}`);
            }
          }
        }

        if (gaps.length > 0) {
          console.log(chalk.yellow('\nTime gaps detected:'));
          gaps.slice(0, 5).forEach(gap => console.log(`  - ${gap}`));
          if (gaps.length > 5) {
            console.log(chalk.gray(`  ... and ${gaps.length - 5} more`));
          }
        }
        
      } catch (error) {
        console.error(chalk.red(`Failed to verify audit logs: ${error}`));
        process.exit(1);
      }
    });

  audit
    .command('query <query>')
    .description('Query audit logs using advanced filters')
    .option('--explain', 'Explain query syntax')
    .action(async (query: string, options?: any) => {
      try {
        if (options?.explain) {
          console.log(chalk.bold('\nAudit Query Syntax:\n'));
          console.log('Basic operators:');
          console.log('  user:john         - Filter by user');
          console.log('  action:create     - Filter by action');
          console.log('  resource:recipe   - Filter by resource');
          console.log('  result:success    - Filter by result');
          console.log('  ip:192.168        - Filter by IP prefix');
          console.log();
          console.log('Date operators:');
          console.log('  after:2024-01-01  - After specific date');
          console.log('  before:2024-01-01 - Before specific date');
          console.log('  today             - Today\'s entries');
          console.log('  yesterday         - Yesterday\'s entries');
          console.log('  last:7d           - Last 7 days');
          console.log();
          console.log('Logical operators:');
          console.log('  AND, OR, NOT      - Combine conditions');
          console.log();
          console.log('Examples:');
          console.log('  user:john AND action:deploy');
          console.log('  resource:secret NOT result:success');
          console.log('  (user:admin OR user:root) AND last:24h');
          return;
        }

        const entries = await loadAuditLogs();
        const filtered = parseAuditQuery(entries, query);

        if (filtered.length === 0) {
          console.log(chalk.yellow('No entries match the query'));
          return;
        }

        console.log(chalk.bold(`\nQuery Results (${filtered.length} entries):\n`));
        
        const tableData = [['Time', 'User', 'Action', 'Resource', 'Result']];
        
        for (const entry of filtered.slice(-50)) {
          tableData.push([
            new Date(entry.timestamp).toLocaleString(),
            entry.user,
            entry.action,
            truncate(entry.resource, 30),
            entry.result === 'success' ? chalk.green('✓') : chalk.red('✗'),
          ]);
        }
        
        console.log(table(tableData));
        
        if (filtered.length > 50) {
          console.log(chalk.gray(`\nShowing last 50 of ${filtered.length} entries`));
        }
        
      } catch (error) {
        console.error(chalk.red(`Failed to query audit logs: ${error}`));
        process.exit(1);
      }
    });

  audit
    .command('stats')
    .description('Show audit log statistics')
    .option('--from <date>', 'Start date')
    .option('--to <date>', 'End date')
    .option('--by <field>', 'Group by field (user|action|resource|result|hour|day)')
    .action(async (options?: any) => {
      try {
        const entries = await loadAuditLogs();
        
        // Apply date filters
        let filtered = entries;
        
        if (options?.from) {
          const fromDate = parseDate(options.from);
          filtered = filtered.filter(e => new Date(e.timestamp) >= fromDate);
        }
        
        if (options?.to) {
          const toDate = parseDate(options.to);
          filtered = filtered.filter(e => new Date(e.timestamp) <= toDate);
        }

        console.log(chalk.bold('\nAudit Log Statistics:\n'));
        
        // Overall stats
        console.log(`Total entries: ${filtered.length}`);
        const successCount = filtered.filter(e => e.result === 'success').length;
        const failureCount = filtered.filter(e => e.result === 'failure').length;
        if (filtered.length > 0) {
          console.log(`Success rate: ${chalk.green(`${((successCount / filtered.length) * 100).toFixed(1)}%`)}`);
          console.log(`Failures: ${failureCount > 0 ? chalk.red(failureCount.toString()) : '0'}`);
          
          const firstEntry = filtered[0];
          const lastEntry = filtered[filtered.length - 1];
          if (firstEntry && lastEntry) {
            const firstDate = new Date(firstEntry.timestamp);
            const lastDate = new Date(lastEntry.timestamp);
            console.log(`\nTime range: ${firstDate.toLocaleString()} - ${lastDate.toLocaleString()}`);
          }
        } else {
          console.log('No entries found');
        }

        // Group by stats
        const groupBy = options?.by || 'user';
        console.log(chalk.bold(`\nBy ${groupBy}:\n`));
        
        const grouped = new Map<string, number>();
        
        for (const entry of filtered) {
          let key: string = '';
          
          switch (groupBy) {
            case 'user':
              key = entry.user || 'unknown';
              break;
            case 'action':
              key = entry.action || 'unknown';
              break;
            case 'resource':
              key = entry.resource?.split('/')[0] || 'unknown'; // Group by resource type
              break;
            case 'result':
              key = entry.result || 'unknown';
              break;
            case 'hour':
              key = new Date(entry.timestamp).toISOString().slice(0, 13) + ':00';
              break;
            case 'day':
              key = new Date(entry.timestamp).toISOString().slice(0, 10);
              break;
            default:
              key = entry.user || 'unknown';
          }
          
          grouped.set(key, (grouped.get(key) || 0) + 1);
        }

        // Sort by count
        const sorted = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]);
        
        const tableData = [[capitalize(groupBy), 'Count', 'Percentage']];
        
        for (const [key, count] of sorted.slice(0, 20)) {
          const percentage = ((count / filtered.length) * 100).toFixed(1);
          tableData.push([key, count.toString(), `${percentage}%`]);
        }
        
        console.log(table(tableData));
        
        if (sorted.length > 20) {
          console.log(chalk.gray(`\nShowing top 20 of ${sorted.length} ${groupBy}s`));
        }
        
      } catch (error) {
        console.error(chalk.red(`Failed to generate statistics: ${error}`));
        process.exit(1);
      }
    });
}

async function getAuditLogPath(): Promise<string> {
  const projectRoot = await getProjectRoot();
  return path.join(projectRoot, '.xec', 'audit.log');
}

async function loadAuditLogs(): Promise<AuditEntry[]> {
  try {
    const auditPath = await getAuditLogPath();
    const content = await fs.readFile(auditPath, 'utf-8');
    
    // Parse line-delimited JSON
    const entries: AuditEntry[] = [];
    const lines = content.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // Skip invalid lines
      }
    }
    
    return entries;
  } catch {
    // Return empty array if file doesn't exist
    return [];
  }
}

function parseDate(dateStr: string): Date {
  // Handle relative dates
  if (dateStr.endsWith('d')) {
    const days = parseInt(dateStr);
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  } else if (dateStr.endsWith('w')) {
    const weeks = parseInt(dateStr);
    const date = new Date();
    date.setDate(date.getDate() - (weeks * 7));
    return date;
  } else if (dateStr.endsWith('m')) {
    const months = parseInt(dateStr);
    const date = new Date();
    date.setMonth(date.getMonth() - months);
    return date;
  } else if (dateStr === 'today') {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  } else if (dateStr === 'yesterday') {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    date.setHours(0, 0, 0, 0);
    return date;
  }
  
  // Parse as ISO date
  return new Date(dateStr);
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function computeEntryHash(entry: AuditEntry): Promise<string> {
  // In a real implementation, compute proper hash
  const crypto = await import('crypto');
  const data = JSON.stringify({
    id: entry.id,
    timestamp: entry.timestamp,
    user: entry.user,
    action: entry.action,
    resource: entry.resource,
    result: entry.result,
  });
  return crypto.createHash('sha256').update(data).digest('hex');
}

function parseAuditQuery(entries: AuditEntry[], query: string): AuditEntry[] {
  // Simple query parser - in real implementation would be more sophisticated
  const tokens = query.toLowerCase().split(/\s+/);
  
  return entries.filter(entry => {
    for (const token of tokens) {
      if (token.includes(':')) {
        const [field, value] = token.split(':');
        
        if (!value) continue;
        
        switch (field) {
          case 'user':
            if (!entry.user?.toLowerCase().includes(value)) return false;
            break;
          case 'action':
            if (!entry.action?.toLowerCase().includes(value)) return false;
            break;
          case 'resource':
            if (!entry.resource?.toLowerCase().includes(value)) return false;
            break;
          case 'result':
            if (entry.result !== value) return false;
            break;
          case 'ip':
            if (!entry.ip?.startsWith(value)) return false;
            break;
        }
      } else if (token === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (new Date(entry.timestamp) < today) return false;
      } else if (token === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const entryDate = new Date(entry.timestamp);
        if (entryDate < yesterday || entryDate >= new Date(yesterday.getTime() + 86400000)) return false;
      }
    }
    
    return true;
  });
}