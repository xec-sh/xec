import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import * as clack from '@clack/prompts';
import { QuotaManager, ResourceManager, type ResourceQuota, type ResourceRequest } from '@xec/core';

interface ResourceOptions {
  json?: boolean;
  verbose?: boolean;
}

export default function (program: Command) {
  const cmd = new Command('resource')
    .alias('res')
    .description('Manage resource pools and allocations')
    .action(async () => {
      await listPools();
    });

  cmd
    .command('pools')
    .alias('ls')
    .description('List all resource pools')
    .option('--json', 'Output as JSON')
    .action(async (options: ResourceOptions) => {
      await listPools(options);
    });

  cmd
    .command('create-pool <id> <name>')
    .description('Create a new resource pool')
    .option('--cpu <cores>', 'CPU cores quota', '4')
    .option('--memory <mb>', 'Memory quota in MB', '8192')
    .option('--disk <gb>', 'Disk quota in GB', '100')
    .action(async (id, name, options) => {
      await createPool(id, name, options);
    });

  cmd
    .command('delete-pool <poolId>')
    .description('Delete a resource pool')
    .option('--force', 'Force deletion even if allocations exist')
    .action(async (poolId, options) => {
      await deletePool(poolId, options);
    });

  cmd
    .command('allocate <poolId>')
    .description('Request resources from a pool')
    .option('--cpu <cores>', 'CPU cores to allocate', '1')
    .option('--memory <mb>', 'Memory to allocate in MB', '1024')
    .option('--consumer <id>', 'Consumer ID', 'cli-user')
    .option('--priority <level>', 'Priority level', 'normal')
    .action(async (poolId, options) => {
      await allocateResources(poolId, options);
    });

  cmd
    .command('release <allocationId>')
    .description('Release allocated resources')
    .action(async (allocationId) => {
      await releaseResources(allocationId);
    });

  cmd
    .command('allocations [poolId]')
    .description('List resource allocations')
    .option('--consumer <id>', 'Filter by consumer')
    .option('--json', 'Output as JSON')
    .action(async (poolId, options) => {
      await listAllocations(poolId, options);
    });

  cmd
    .command('usage <poolId>')
    .description('Show pool usage statistics')
    .option('--json', 'Output as JSON')
    .action(async (poolId, options) => {
      await showPoolUsage(poolId, options);
    });

  cmd
    .command('quotas')
    .description('Manage resource quotas')
    .action(async () => {
      await listQuotas();
    });

  cmd
    .command('set-quota <scope> <resource> <limit>')
    .description('Set resource quota')
    .option('--soft', 'Set as soft limit')
    .action(async (scope, resource, limit, options) => {
      await setQuota(scope, resource, limit, options);
    });

  program.addCommand(cmd);
}

// Create manager instances
const resourceManager = new ResourceManager({
  enforcementMode: 'strict',
  defaultQuota: {
    cpu: 8,
    memory: 16384,
    disk: 500,
    network: 100,
    connections: 100,
    tasks: 50
  }
});

const quotaManager = new QuotaManager();

async function listPools(options: ResourceOptions = {}) {
  const pools = resourceManager.getAllPools();
  
  if (pools.length === 0) {
    clack.log.info('No resource pools found');
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(pools, null, 2));
    return;
  }

  const table = new Table({
    head: ['Pool ID', 'Name', 'CPU', 'Memory', 'Disk', 'Allocations'],
    style: { head: ['cyan'] }
  });

  pools.forEach(pool => {
    table.push([
      pool.id,
      pool.name,
      `${pool.usage.cpu || 0}/${pool.quota.cpu} cores`,
      `${pool.usage.memory || 0}/${pool.quota.memory} MB`,
      `${pool.usage.disk || 0}/${pool.quota.disk} GB`,
      pool.allocated.size
    ]);
  });

  console.log(table.toString());
}

async function createPool(id: string, name: string, options: any) {
  try {
    const quota: ResourceQuota = {
      cpu: parseInt(options.cpu),
      memory: parseInt(options.memory),
      disk: parseInt(options.disk),
      network: 100,
      connections: 100,
      tasks: 50
    };

    const pool = resourceManager.createPool(id, name, quota);
    
    clack.log.success(`Resource pool created: ${pool.name} (${pool.id})`);
    console.log(chalk.gray('Quotas:'));
    console.log(chalk.gray(`  CPU: ${quota.cpu} cores`));
    console.log(chalk.gray(`  Memory: ${quota.memory} MB`));
    console.log(chalk.gray(`  Disk: ${quota.disk} GB`));
  } catch (error) {
    clack.log.error(error instanceof Error ? error.message : 'Failed to create pool');
    process.exit(1);
  }
}

async function deletePool(poolId: string, options: { force?: boolean }) {
  try {
    const pool = resourceManager.getPool(poolId);
    if (!pool) {
      clack.log.error(`Pool not found: ${poolId}`);
      process.exit(1);
    }

    if (pool.allocated.size > 0 && !options.force) {
      clack.log.error(`Pool has ${pool.allocated.size} active allocations. Use --force to delete anyway.`);
      process.exit(1);
    }

    resourceManager.deletePool(poolId);
    clack.log.success(`Resource pool deleted: ${poolId}`);
  } catch (error) {
    clack.log.error(error instanceof Error ? error.message : 'Failed to delete pool');
    process.exit(1);
  }
}

async function allocateResources(poolId: string, options: any) {
  try {
    const request: ResourceRequest = {
      resources: {
        cpu: parseFloat(options.cpu),
        memory: parseFloat(options.memory)
      },
      consumerId: options.consumer,
      priority: options.priority === 'high' ? 1 : options.priority === 'low' ? 3 : 2,
      metadata: {
        source: 'cli'
      }
    };

    const allocation = await resourceManager.requestResources(poolId, request);
    
    clack.log.success(`Resources allocated: ${allocation.id}`);
    console.log(chalk.gray('Allocated:'));
    console.log(chalk.gray(`  CPU: ${allocation.resources.cpu} cores`));
    console.log(chalk.gray(`  Memory: ${allocation.resources.memory} MB`));
    console.log(chalk.gray(`  Consumer: ${allocation.consumerId}`));
  } catch (error) {
    clack.log.error(error instanceof Error ? error.message : 'Failed to allocate resources');
    process.exit(1);
  }
}

async function releaseResources(allocationId: string) {
  try {
    await resourceManager.releaseResources(allocationId);
    clack.log.success(`Resources released: ${allocationId}`);
  } catch (error) {
    clack.log.error(error instanceof Error ? error.message : 'Failed to release resources');
    process.exit(1);
  }
}

async function listAllocations(poolId?: string, options: any = {}) {
  let allocations: any[] = [];
  
  if (poolId) {
    allocations = resourceManager.getPoolAllocations(poolId);
  } else if (options.consumer) {
    allocations = resourceManager.getAllocationsByConsumer(options.consumer);
  } else {
    // Get all allocations from all pools
    allocations = [];
    const pools = resourceManager.getAllPools();
    pools.forEach(pool => {
      allocations.push(...resourceManager.getPoolAllocations(pool.id));
    });
  }

  if (allocations.length === 0) {
    clack.log.info('No allocations found');
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(allocations, null, 2));
    return;
  }

  const table = new Table({
    head: ['Allocation ID', 'Pool', 'Consumer', 'CPU', 'Memory', 'Priority', 'Created'],
    style: { head: ['cyan'] }
  });

  allocations.forEach(allocation => {
    table.push([
      allocation.id.substring(0, 8),
      allocation.poolId,
      allocation.consumerId,
      `${allocation.resources.cpu || 0} cores`,
      `${allocation.resources.memory || 0} MB`,
      allocation.priority,
      new Date(allocation.createdAt).toLocaleString()
    ]);
  });

  console.log(table.toString());
}

async function showPoolUsage(poolId: string, options: ResourceOptions = {}) {
  const pool = resourceManager.getPool(poolId);
  if (!pool) {
    clack.log.error(`Pool not found: ${poolId}`);
    process.exit(1);
  }

  const usage = resourceManager.getPoolUsagePercentage(poolId);
  
  if (options.json) {
    console.log(JSON.stringify({
      pool: {
        id: pool.id,
        name: pool.name,
        quota: pool.quota,
        usage: pool.usage,
        allocated: Array.from(pool.allocated.values())
      },
      usage
    }, null, 2));
    return;
  }

  console.log(chalk.bold(`\nResource Pool: ${pool.name} (${pool.id})\n`));
  
  const table = new Table({
    head: ['Resource', 'Allocated', 'Available', 'Quota', 'Usage %'],
    style: { head: ['cyan'] }
  });

  const resources = ['cpu', 'memory', 'disk'];
  const units = { cpu: 'cores', memory: 'MB', disk: 'GB' };
  
  resources.forEach(resource => {
    const used = (pool.usage as any)[resource] || 0;
    const quota = (pool.quota as any)[resource] || 0;
    const available = Math.max(0, quota - used);
    const usagePercent = (usage as any)[resource] || 0;
    
    table.push([
      resource,
      `${used} ${(units as any)[resource]}`,
      `${available} ${(units as any)[resource]}`,
      `${quota} ${(units as any)[resource]}`,
      `${usagePercent.toFixed(1)}%`
    ]);
  });

  console.log(table.toString());
  
  // Show allocations summary
  console.log(chalk.cyan(`\nActive allocations: ${pool.allocated.size}`));
}

async function listQuotas() {
  const quotaScopes = ['global', 'team', 'user'];
  
  console.log(chalk.bold('Resource Quotas\n'));
  
  const table = new Table({
    head: ['Scope', 'Resource', 'Soft Limit', 'Hard Limit'],
    style: { head: ['cyan'] }
  });

  for (const scope of quotaScopes) {
    // QuotaManager.getQuota requires a resource parameter
    const resources = ['cpu', 'memory', 'disk', 'network'];
    resources.forEach(resource => {
      const quota = quotaManager.getQuota(scope as any, resource);
      if (quota && typeof quota === 'object') {
        table.push([
          scope,
          resource,
          (quota as any).soft || '-',
          (quota as any).hard || '-'
        ]);
      }
    });
  }

  if (table.length === 0) {
    clack.log.info('No quotas configured');
    return;
  }

  console.log(table.toString());
}

async function setQuota(scope: string, resource: string, limit: string, options: any) {
  const numLimit = parseFloat(limit);
  if (isNaN(numLimit) || numLimit < 0) {
    clack.log.error('Limit must be a non-negative number');
    process.exit(1);
  }

  // Current implementation doesn't support modifying quotas directly
  const limitType = options.soft ? 'soft' : 'hard';
  
  // Note: QuotaManager doesn't have a setQuota method, would need to extend it
  clack.log.warn('Quota management is not fully implemented in the current version');
  clack.log.info(`Would set ${scope}/${resource} ${options.soft ? 'soft' : 'hard'} limit to ${numLimit}`);
}