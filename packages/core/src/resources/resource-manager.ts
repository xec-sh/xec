import { EventEmitter } from 'events';

import { Logger } from '../utils/logger.js';

export interface ResourceQuota {
  cpu?: number;           // CPU cores
  memory?: number;        // Memory in MB
  disk?: number;          // Disk in GB
  network?: number;       // Network bandwidth in Mbps
  connections?: number;   // Max concurrent connections
  tasks?: number;         // Max concurrent tasks
  custom?: Record<string, number>; // Custom quotas
}

export interface ResourceUsage {
  cpu: number;
  memory: number;
  disk: number;
  network: number;
  connections: number;
  tasks: number;
  custom?: Record<string, number>;
}

export interface ResourcePool {
  id: string;
  name: string;
  description?: string;
  quota: ResourceQuota;
  usage: ResourceUsage;
  allocated: Map<string, ResourceAllocation>;
  metadata?: Record<string, any>;
}

export interface ResourceAllocation {
  id: string;
  poolId: string;
  consumerId: string;
  resources: Partial<ResourceUsage>;
  priority: number;
  startTime: Date;
  endTime?: Date;
  metadata?: Record<string, any>;
}

export interface ResourceRequest {
  consumerId: string;
  resources: Partial<ResourceUsage>;
  priority?: number;
  duration?: number; // Expected duration in ms
  metadata?: Record<string, any>;
}

export interface ResourceManagerOptions {
  logger?: Logger;
  defaultQuota?: ResourceQuota;
  enforcementMode?: 'strict' | 'soft' | 'none';
  monitoringInterval?: number;
}

export class ResourceManager extends EventEmitter {
  private pools: Map<string, ResourcePool> = new Map();
  private allocations: Map<string, ResourceAllocation> = new Map();
  private logger: Logger;
  private enforcementMode: 'strict' | 'soft' | 'none';
  private monitoringInterval?: NodeJS.Timeout;
  private defaultQuota: ResourceQuota;

  constructor(options: ResourceManagerOptions = {}) {
    super();
    this.logger = options.logger || new Logger({ name: 'resource-manager' });
    this.enforcementMode = options.enforcementMode || 'strict';
    this.defaultQuota = options.defaultQuota || {
      cpu: 4,
      memory: 8192,
      disk: 100,
      network: 100,
      connections: 100,
      tasks: 50
    };

    if (options.monitoringInterval && options.monitoringInterval > 0) {
      this.startMonitoring(options.monitoringInterval);
    }
  }

  createPool(id: string, name: string, quota: ResourceQuota, metadata?: Record<string, any>): ResourcePool {
    if (this.pools.has(id)) {
      throw new Error(`Resource pool ${id} already exists`);
    }

    const pool: ResourcePool = {
      id,
      name,
      quota,
      usage: {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: 0,
        connections: 0,
        tasks: 0
      },
      allocated: new Map(),
      metadata
    };

    this.pools.set(id, pool);
    this.emit('pool:created', pool);
    this.logger.info(`Created resource pool: ${name} (${id})`);

    return pool;
  }

  deletePool(poolId: string): void {
    const pool = this.pools.get(poolId);
    if (!pool) {
      throw new Error(`Resource pool ${poolId} not found`);
    }

    if (pool.allocated.size > 0) {
      throw new Error(`Cannot delete pool ${poolId}: has active allocations`);
    }

    this.pools.delete(poolId);
    this.emit('pool:deleted', pool);
    this.logger.info(`Deleted resource pool: ${pool.name} (${poolId})`);
  }

  getPool(poolId: string): ResourcePool | undefined {
    return this.pools.get(poolId);
  }

  getAllPools(): ResourcePool[] {
    return Array.from(this.pools.values());
  }

  async requestResources(poolId: string, request: ResourceRequest): Promise<ResourceAllocation> {
    const pool = this.pools.get(poolId);
    if (!pool) {
      throw new Error(`Resource pool ${poolId} not found`);
    }

    // Check if resources are available
    if (!this.canAllocate(pool, request.resources)) {
      if (this.enforcementMode === 'strict') {
        throw new Error(`Insufficient resources in pool ${poolId}`);
      } else if (this.enforcementMode === 'soft') {
        this.logger.warn(`Resource quota exceeded in pool ${poolId}, but allowing due to soft enforcement`);
        this.emit('quota:exceeded', { pool, request });
      }
    }

    // Create allocation
    const allocation: ResourceAllocation = {
      id: `alloc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      poolId,
      consumerId: request.consumerId,
      resources: request.resources,
      priority: request.priority || 0,
      startTime: new Date(),
      metadata: request.metadata
    };

    // Update pool usage
    this.updatePoolUsage(pool, request.resources, 'allocate');

    // Store allocation
    pool.allocated.set(allocation.id, allocation);
    this.allocations.set(allocation.id, allocation);

    // Set auto-release if duration specified
    if (request.duration && request.duration > 0) {
      setTimeout(() => {
        this.releaseResources(allocation.id).catch(err => {
          this.logger.error(`Failed to auto-release allocation ${allocation.id}: ${err}`);
        });
      }, request.duration);
    }

    this.emit('resources:allocated', allocation);
    this.logger.debug(`Allocated resources in pool ${poolId} for ${request.consumerId}`);

    return allocation;
  }

  async releaseResources(allocationId: string): Promise<void> {
    const allocation = this.allocations.get(allocationId);
    if (!allocation) {
      throw new Error(`Allocation ${allocationId} not found`);
    }

    const pool = this.pools.get(allocation.poolId);
    if (!pool) {
      throw new Error(`Resource pool ${allocation.poolId} not found`);
    }

    // Update pool usage
    this.updatePoolUsage(pool, allocation.resources, 'release');

    // Mark allocation as ended
    allocation.endTime = new Date();

    // Remove from active allocations
    pool.allocated.delete(allocationId);
    this.allocations.delete(allocationId);

    this.emit('resources:released', allocation);
    this.logger.debug(`Released resources in pool ${allocation.poolId} for ${allocation.consumerId}`);
  }

  async resizeAllocation(allocationId: string, newResources: Partial<ResourceUsage>): Promise<void> {
    const allocation = this.allocations.get(allocationId);
    if (!allocation) {
      throw new Error(`Allocation ${allocationId} not found`);
    }

    const pool = this.pools.get(allocation.poolId);
    if (!pool) {
      throw new Error(`Resource pool ${allocation.poolId} not found`);
    }

    // Calculate delta
    const delta: Partial<ResourceUsage> = {};
    for (const [key, newValue] of Object.entries(newResources)) {
      const oldValue = (allocation.resources as any)[key] || 0;
      (delta as any)[key] = (newValue as number) - oldValue;
    }

    // Check if resize is possible
    if (!this.canAllocate(pool, delta)) {
      if (this.enforcementMode === 'strict') {
        throw new Error(`Insufficient resources for resize in pool ${allocation.poolId}`);
      } else if (this.enforcementMode === 'soft') {
        this.logger.warn(`Resource quota exceeded during resize, but allowing due to soft enforcement`);
      }
    }

    // Update pool usage with delta
    this.updatePoolUsage(pool, delta, 'allocate');

    // Update allocation
    allocation.resources = { ...allocation.resources, ...newResources };

    this.emit('allocation:resized', allocation);
    this.logger.debug(`Resized allocation ${allocationId} in pool ${allocation.poolId}`);
  }

  getPoolUsagePercentage(poolId: string): Record<string, number> {
    const pool = this.pools.get(poolId);
    if (!pool) {
      throw new Error(`Resource pool ${poolId} not found`);
    }

    const percentages: Record<string, number> = {};

    for (const [resource, quota] of Object.entries(pool.quota)) {
      if (typeof quota === 'number' && quota > 0) {
        const usage = (pool.usage as any)[resource] || 0;
        percentages[resource] = (usage / quota) * 100;
      }
    }

    return percentages;
  }

  getAllocationsByConsumer(consumerId: string): ResourceAllocation[] {
    return Array.from(this.allocations.values())
      .filter(alloc => alloc.consumerId === consumerId);
  }

  getPoolAllocations(poolId: string): ResourceAllocation[] {
    const pool = this.pools.get(poolId);
    if (!pool) {
      return [];
    }

    return Array.from(pool.allocated.values());
  }

  async waitForResources(
    poolId: string, 
    request: ResourceRequest, 
    timeout: number = 30000
  ): Promise<ResourceAllocation> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        return await this.requestResources(poolId, request);
      } catch (error) {
        // If strict mode and insufficient resources, wait and retry
        if (this.enforcementMode === 'strict' && error instanceof Error && 
            error.message.includes('Insufficient resources')) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          throw error;
        }
      }
    }

    throw new Error(`Timeout waiting for resources in pool ${poolId}`);
  }

  private canAllocate(pool: ResourcePool, resources: Partial<ResourceUsage>): boolean {
    for (const [resource, requested] of Object.entries(resources)) {
      const quota = (pool.quota as any)[resource];
      const usage = (pool.usage as any)[resource] || 0;
      const available = quota - usage;

      if (typeof quota === 'number' && typeof requested === 'number' && available < requested) {
        return false;
      }
    }

    return true;
  }

  private updatePoolUsage(
    pool: ResourcePool, 
    resources: Partial<ResourceUsage>, 
    operation: 'allocate' | 'release'
  ): void {
    for (const [resource, amount] of Object.entries(resources)) {
      if (typeof amount === 'number') {
        const current = (pool.usage as any)[resource] || 0;
        (pool.usage as any)[resource] = operation === 'allocate' 
          ? current + amount 
          : Math.max(0, current - amount);
      }
    }

    this.emit('pool:usage-updated', pool);
  }

  private startMonitoring(interval: number): void {
    this.monitoringInterval = setInterval(() => {
      for (const pool of this.pools.values()) {
        const percentages = this.getPoolUsagePercentage(pool.id);
        
        // Check for high usage
        for (const [resource, percentage] of Object.entries(percentages)) {
          if (percentage > 90) {
            this.emit('resource:high-usage', {
              pool,
              resource,
              percentage
            });
          }
        }

        // Clean up expired allocations
        const now = Date.now();
        for (const [allocId, allocation] of pool.allocated.entries()) {
          if (allocation.metadata?.expiresAt && 
              new Date(allocation.metadata.expiresAt).getTime() < now) {
            this.releaseResources(allocId).catch(err => {
              this.logger.error(`Failed to release expired allocation ${allocId}: ${err}`);
            });
          }
        }
      }
    }, interval);
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }

  // Export current state
  exportState(): {
    pools: Array<{
      pool: ResourcePool;
      allocations: ResourceAllocation[];
    }>;
  } {
    return {
      pools: this.getAllPools().map(pool => ({
        pool,
        allocations: Array.from(pool.allocated.values())
      }))
    };
  }

  // Import state (useful for recovery)
  importState(state: ReturnType<ResourceManager['exportState']>): void {
    // Clear existing state
    this.pools.clear();
    this.allocations.clear();

    // Import pools and allocations
    for (const { pool, allocations } of state.pools) {
      this.pools.set(pool.id, {
        ...pool,
        allocated: new Map()
      });

      for (const allocation of allocations) {
        this.pools.get(pool.id)!.allocated.set(allocation.id, allocation);
        this.allocations.set(allocation.id, allocation);
      }
    }
  }
}

// Global instance
let globalResourceManager: ResourceManager | null = null;

export function getResourceManager(): ResourceManager {
  if (!globalResourceManager) {
    globalResourceManager = new ResourceManager();
  }
  return globalResourceManager;
}

export function setResourceManager(manager: ResourceManager): void {
  if (globalResourceManager) {
    globalResourceManager.stop();
  }
  globalResourceManager = manager;
}