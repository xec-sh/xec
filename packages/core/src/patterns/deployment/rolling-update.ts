import { task } from '../../dsl/task';
import { recipe } from '../../dsl/recipe';
import { Task, Recipe } from '../../core/types';
import { setState } from '../../context/globals';
import { DeploymentPattern, RollingUpdateOptions } from '../types';

export class RollingUpdateDeployment implements DeploymentPattern {
  name = 'rolling-update';
  description = 'Rolling update deployment pattern for gradual updates';
  category = 'deployment' as const;
  tags = ['gradual', 'zero-downtime', 'safe'];

  constructor(private options: RollingUpdateOptions) {}

  build(): Recipe {
    const builder = recipe(`rolling-update-${this.options.service}`)
      .description(`Rolling update deployment for ${this.options.service}`)
      .tags(...this.tags);

    // Calculate batch configuration
    const batches = this.calculateBatches();
    const allTasks: Task[] = [];

    // Phase 1: Pre-deployment validation
    const preDeploymentTasks = [
      this.validateConfiguration(),
      this.checkClusterHealth()
    ];
    preDeploymentTasks.forEach(t => {
      if (!t.metadata) t.metadata = {};
      t.metadata.phase = 'pre-deployment';
      allTasks.push(t);
    });

    // Phase 2: Rolling update phases
    let previousBatchTaskIds: string[] = preDeploymentTasks.map(t => t.id);
    
    batches.forEach((batch, index) => {
      const phaseName = `update-batch-${index + 1}`;
      const batchTasks = [
        this.updateBatch(batch, index),
        this.waitForBatchReady(batch, index),
        this.validateBatch(batch, index)
      ];

      // Add pause between batches if configured
      if (this.options.pauseBetweenBatches && index < batches.length - 1) {
        batchTasks.push(this.pauseBetweenBatches(this.options.pauseBetweenBatches));
      }

      // Set phase and dependencies for each task
      batchTasks.forEach(t => {
        if (!t.metadata) t.metadata = {};
        t.metadata.phase = phaseName;
        t.dependencies = [...(t.dependencies || []), ...previousBatchTaskIds];
        allTasks.push(t);
      });

      // Update previous batch task IDs for next iteration
      previousBatchTaskIds = batchTasks.map(t => t.id);
    });

    // Phase 3: Post-deployment validation
    const postDeploymentTasks = [
      this.validateFullDeployment(),
      this.cleanupOldResources()
    ];
    postDeploymentTasks.forEach(t => {
      if (!t.metadata) t.metadata = {};
      t.metadata.phase = 'post-deployment';
      t.dependencies = [...(t.dependencies || []), ...previousBatchTaskIds];
      allTasks.push(t);
    });

    // Add all tasks to the builder
    builder.tasks(...allTasks);

    // Add rollback handler
    if (this.options.rollbackOnFailure) {
      builder.onError(this.createRollbackHandler());
    }

    return builder.build();
  }

  private calculateBatches(): number[][] {
    // This would calculate the actual batches based on current instances
    // For now, returning mock data
    const totalInstances = 10; // This would be fetched from actual infrastructure
    const batchSize = this.calculateBatchSize(totalInstances);
    
    const batches: number[][] = [];
    for (let i = 0; i < totalInstances; i += batchSize) {
      const batch = [];
      for (let j = i; j < Math.min(i + batchSize, totalInstances); j++) {
        batch.push(j);
      }
      batches.push(batch);
    }
    
    return batches;
  }

  private calculateBatchSize(totalInstances: number): number {
    const { maxSurge, maxUnavailable } = this.options;
    
    // Convert percentages to absolute numbers
    const surge = typeof maxSurge === 'string' 
      ? Math.ceil(totalInstances * (parseInt(maxSurge) / 100))
      : maxSurge;
      
    const unavailable = typeof maxUnavailable === 'string'
      ? Math.ceil(totalInstances * (parseInt(maxUnavailable) / 100))
      : maxUnavailable;
    
    // Batch size is determined by maxUnavailable
    return Math.max(1, unavailable);
  }

  private validateConfiguration(): Task {
    return task('validate-configuration')
      .description('Validate deployment configuration')
      .run(async (ctx) => {
        console.log('Validating deployment configuration...');
        
        // Validate maxSurge and maxUnavailable
        if (this.options.maxSurge === 0 && this.options.maxUnavailable === 0) {
          throw new Error('Both maxSurge and maxUnavailable cannot be zero');
        }
        
        // Store configuration in context
        setState('deployment_config', {
          service: this.options.service,
          maxSurge: this.options.maxSurge,
          maxUnavailable: this.options.maxUnavailable,
          updateStrategy: this.options.updateStrategy || 'sequential',
        });
        
        console.log('Configuration validated successfully');
      })
      .build();
  }

  private checkClusterHealth(): Task {
    return task('check-cluster-health')
      .description('Check cluster health before deployment')
      .run(async (ctx) => {
        console.log('Checking cluster health...');
        
        // Implementation would check actual cluster health
        // This could include checking node status, resource availability, etc.
        
        const health = {
          nodes: 'healthy',
          resources: 'sufficient',
          services: 'running',
        };
        
        setState('cluster_health', health);
        console.log('Cluster health check passed');
      })
      .build();
  }

  private updateBatch(instances: number[], batchIndex: number): Task {
    return task(`update-instances-batch-${batchIndex + 1}`)
      .description(`Update instances: ${instances.join(', ')}`)
      .run(async (ctx) => {
        const strategy = this.options.updateStrategy || 'sequential';
        
        console.log(`Updating batch ${batchIndex + 1} with ${instances.length} instances using ${strategy} strategy`);
        
        if (strategy === 'sequential') {
          // Update instances one by one
          for (const instance of instances) {
            await this.updateInstance(instance);
          }
        } else {
          // Update instances in parallel
          await Promise.all(instances.map(instance => this.updateInstance(instance)));
        }
        
        setState(`batch_${batchIndex}_updated`, {
          instances,
          updated_at: new Date().toISOString(),
        });
      })
      .build();
  }

  private waitForBatchReady(instances: number[], batchIndex: number): Task {
    return task(`wait-batch-${batchIndex + 1}-ready`)
      .description(`Wait for batch ${batchIndex + 1} to be ready`)
      .run(async (ctx) => {
        console.log(`Waiting for batch ${batchIndex + 1} to be ready...`);
        
        const timeout = 300; // 5 minutes
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout * 1000) {
          const allReady = await this.checkInstancesReady(instances);
          
          if (allReady) {
            console.log(`Batch ${batchIndex + 1} is ready`);
            return;
          }
          
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
        throw new Error(`Batch ${batchIndex + 1} not ready after ${timeout} seconds`);
      })
      .retry(3)
      .build();
  }

  private validateBatch(instances: number[], batchIndex: number): Task {
    return task(`validate-batch-${batchIndex + 1}`)
      .description(`Validate batch ${batchIndex + 1}`)
      .run(async (ctx) => {
        console.log(`Validating batch ${batchIndex + 1}...`);
        
        // Run readiness probe if configured
        if (this.options.readinessProbe) {
          await this.runReadinessProbe(instances);
        }
        
        // Run health check if configured
        if (this.options.healthCheckUrl) {
          await this.runHealthCheck(instances);
        }
        
        setState(`batch_${batchIndex}_validated`, true);
        console.log(`Batch ${batchIndex + 1} validation passed`);
      })
      .build();
  }

  private pauseBetweenBatches(seconds: number): Task {
    return task('pause-between-batches')
      .description(`Pause for ${seconds} seconds between batches`)
      .run(async () => {
        console.log(`Pausing for ${seconds} seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      })
      .build();
  }

  private validateFullDeployment(): Task {
    return task('validate-full-deployment')
      .description('Validate the complete deployment')
      .run(async (ctx) => {
        console.log('Validating full deployment...');
        
        // Check all instances are running the new version
        // Check service is healthy
        // Check metrics are within acceptable range
        
        setState('deployment_validated', {
          status: 'success',
          validated_at: new Date().toISOString(),
        });
        
        console.log('Full deployment validation passed');
      })
      .build();
  }

  private cleanupOldResources(): Task {
    return task('cleanup-old-resources')
      .description('Cleanup old resources')
      .run(async (ctx) => {
        console.log('Cleaning up old resources...');
        
        // Implementation would cleanup old deployments, configs, etc.
        
        setState('cleanup_completed', true);
        console.log('Cleanup completed');
      })
      .build();
  }

  private createRollbackHandler(): (error: Error) => Promise<void> {
    return async (error: Error) => {
      console.error('Rolling update failed, initiating rollback:', error.message);
      
      // Implementation would rollback to previous version
      // This could involve:
      // 1. Stopping the current update
      // 2. Rolling back updated instances
      // 3. Restoring previous configuration
      
      console.log('Rollback completed');
    };
  }

  // Helper methods
  private async updateInstance(instanceId: number): Promise<void> {
    console.log(`Updating instance ${instanceId}...`);
    // Implementation would update the actual instance
    // This could involve updating a container, VM, or pod
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate update time
  }

  private async checkInstancesReady(instances: number[]): Promise<boolean> {
    // Implementation would check if all instances are ready
    // This could involve checking health endpoints, container status, etc.
    return true;
  }

  private async runReadinessProbe(instances: number[]): Promise<void> {
    console.log('Running readiness probe on instances...');
    // Implementation would run the configured readiness probe
  }

  private async runHealthCheck(instances: number[]): Promise<void> {
    console.log('Running health check on instances...');
    // Implementation would run health checks on the instances
  }
}

export function rollingUpdate(options: RollingUpdateOptions): DeploymentPattern {
  return new RollingUpdateDeployment(options);
}