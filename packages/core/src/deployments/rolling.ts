import { BaseDeployment } from './base.js';
import { ExecutionContext } from '../execution/context.js';
import { Orchestrator } from '../orchestration/orchestrator.js';

export interface RollingConfig {
  targetEnvironment: string;
  instanceCount?: number;
  batchSize?: number;
  batchSizePercentage?: number;
  healthCheckDelay?: number;
  maxFailureRate?: number;
  maxSurge?: number;
  minAvailable?: number;
  healthCheck?: (instance: any) => Promise<boolean>;
}

export class RollingDeployment extends BaseDeployment {
  protected rollingConfig: RollingConfig;
  protected progress: number = 0;

  constructor(
    name: string,
    config: RollingConfig,
    orchestrator: Orchestrator,
    context: ExecutionContext
  ) {
    super(name, config, orchestrator, context);
    this.rollingConfig = this.validateConfig(config);
  }

  private validateConfig(config: RollingConfig): RollingConfig {
    const instanceCount = config.instanceCount || 1;
    let batchSize = config.batchSize;

    if (config.batchSizePercentage) {
      batchSize = Math.ceil((config.batchSizePercentage / 100) * instanceCount);
    }

    if (batchSize && batchSize > instanceCount) {
      throw new Error('Batch size cannot be larger than instance count');
    }

    if (config.minAvailable && config.minAvailable >= instanceCount) {
      throw new Error('Min available must be less than instance count');
    }

    if (config.maxFailureRate && (config.maxFailureRate < 0 || config.maxFailureRate > 1)) {
      throw new Error('Max failure rate must be between 0 and 1');
    }

    return {
      instanceCount,
      batchSize: batchSize || 1,
      healthCheckDelay: config.healthCheckDelay || 30000,
      maxFailureRate: config.maxFailureRate || 0.1,
      ...config,
    };
  }

  async deploy(): Promise<void> {
    this.updateStatus('deploying', 'Starting rolling deployment');
    this.emit('rollingStarted');

    try {
      const instances = await this.getInstances();
      const totalInstances = instances.length;
      const batchSize = this.rollingConfig.batchSize || 1;
      let failedInstances = 0;

      for (let i = 0; i < totalInstances; i += batchSize) {
        const batch = instances.slice(i, Math.min(i + batchSize, totalInstances));
        
        // Check minimum availability
        if (this.rollingConfig.minAvailable) {
          const currentRunning = await this.getRunningInstanceCount();
          if (currentRunning - batch.length < this.rollingConfig.minAvailable) {
            throw new Error('Cannot update batch: would violate minimum availability');
          }
        }

        // Update batch
        const batchResults = await this.updateBatch(batch);
        
        // Count failures
        const batchFailures = batchResults.filter(r => !r.success).length;
        failedInstances += batchFailures;

        // Check failure rate
        const failureRate = failedInstances / (i + batch.length);
        if (failureRate > (this.rollingConfig.maxFailureRate || 0.1)) {
          await this.rollback();
          this.updateStatus('failed', `Deployment failed: failure rate ${failureRate} exceeds threshold`);
          return;
        }

        // Update progress
        this.progress = Math.round(((i + batch.length) / totalInstances) * 100);
        this.emit('progress', this.progress);

        // Wait before next batch if not the last batch
        if (i + batchSize < totalInstances) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      this.updateStatus('completed', 'Rolling deployment completed successfully');
      this.emit('rollingCompleted');
    } catch (error) {
      this.updateStatus('failed', `Rolling deployment error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  protected async getInstances(): Promise<any[]> {
    // Override in implementation
    const count = this.rollingConfig.instanceCount || 1;
    return Array.from({ length: count }, (_, i) => ({
      id: `instance-${i}`,
      status: 'running',
      version: 'v1',
    }));
  }

  protected async getRunningInstanceCount(): Promise<number> {
    const instances = await this.getInstances();
    return instances.filter(i => i.status === 'running').length;
  }

  protected async updateBatch(instances: any[]): Promise<Array<{ instance: any; success: boolean }>> {
    const results = [];

    for (const instance of instances) {
      try {
        await this.updateInstance(instance);
        
        // Perform health check
        const healthy = await this.performHealthCheck(instance);
        
        results.push({ instance, success: healthy });
      } catch (error) {
        results.push({ instance, success: false });
      }
    }

    return results;
  }

  protected async updateInstance(instance: any): Promise<void> {
    // Override in implementation
    instance.status = 'updating';
    await new Promise(resolve => setTimeout(resolve, 100));
    instance.version = 'v2';
    instance.status = 'running';
  }

  protected async performHealthCheck(instance: any): Promise<boolean> {
    if (this.rollingConfig.healthCheck) {
      return await this.rollingConfig.healthCheck(instance);
    }

    // Default health check
    await new Promise(resolve => setTimeout(resolve, 100));
    return instance.status === 'running';
  }

  protected async rollback(): Promise<void> {
    this.emit('rollbackStarted');
    
    const instances = await this.getInstances();
    for (const instance of instances) {
      if (instance.version === 'v2') {
        instance.version = 'v1';
        instance.status = 'running';
      }
    }

    this.emit('rollbackCompleted');
  }
}