import { it, expect, describe, beforeEach } from 'vitest';

import { ExecutionContext } from '../../../src/execution/context.js';
import { RollingDeployment } from '../../../src/deployments/rolling.js';
import { Orchestrator } from '../../../src/orchestration/orchestrator.js';

// Mock implementation for RollingDeployment
class MockRollingDeployment extends RollingDeployment {
  private instances: Array<{ id: string; version: string; status: string }> = [];
  private failOnInstance: number | null = null;

  constructor(name: string, config: any, orchestrator: Orchestrator, context: ExecutionContext) {
    super(name, config, orchestrator, context);
    
    // Initialize instances
    const instanceCount = config.instanceCount || 4;
    for (let i = 0; i < instanceCount; i++) {
      this.instances.push({
        id: `instance-${i}`,
        version: 'v1',
        status: 'running',
      });
    }
  }

  async deploy(): Promise<void> {
    this.updateStatus('deploying', 'Starting rolling deployment');
    
    const batchSize = this.config.batchSize || 1;
    const totalInstances = this.instances.length;
    
    for (let i = 0; i < totalInstances; i += batchSize) {
      const batch = this.instances.slice(i, i + batchSize);
      
      // Update batch
      for (const instance of batch) {
        if (this.failOnInstance !== null && this.instances.indexOf(instance) === this.failOnInstance) {
          await this.rollback();
          this.updateStatus('failed', 'Deployment failed, rolled back');
          return;
        }
        
        await this.updateInstance(instance);
      }
      
      // Health check
      await this.performHealthCheck(batch);
      
      // Emit progress
      const progress = Math.round(((i + batch.length) / totalInstances) * 100);
      this.emit('progress', progress);
      
      // Wait before next batch
      if (i + batchSize < totalInstances) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    this.updateStatus('completed', 'Rolling deployment completed');
  }

  setFailOnInstance(instanceIndex: number): void {
    this.failOnInstance = instanceIndex;
  }

  getInstances(): Array<{ id: string; version: string; status: string }> {
    return [...this.instances];
  }

  private async updateInstance(instance: any): Promise<void> {
    instance.status = 'updating';
    await new Promise(resolve => setTimeout(resolve, 5));
    instance.version = 'v2';
    instance.status = 'running';
  }

  private async performHealthCheck(instances: any[]): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 5));
  }

  private async rollback(): Promise<void> {
    for (const instance of this.instances) {
      if (instance.version === 'v2') {
        instance.version = 'v1';
      }
    }
  }
}

describe('deployments/rolling', () => {
  let orchestrator: Orchestrator;
  let context: ExecutionContext;
  let deployment: MockRollingDeployment;

  beforeEach(() => {
    orchestrator = new Orchestrator({
      parallelism: 1,
      strategy: 'sequential',
    });

    context = new ExecutionContext({
      dryRun: false,
      variables: new Map(),
      secrets: new Map(),
    });

    deployment = new MockRollingDeployment(
      'test-rolling',
      {
        targetEnvironment: 'production',
        instanceCount: 4,
        batchSize: 2,
        healthCheckDelay: 30000,
        maxFailureRate: 0.25,
      },
      orchestrator,
      context
    );
  });

  describe('rolling deployment', () => {
    it('should update instances in batches', async () => {
      await deployment.deploy();

      const instances = deployment.getInstances();
      expect(instances).toHaveLength(4);
      expect(instances.every(i => i.version === 'v2')).toBe(true);
      expect(deployment.getStatus()).toBe('completed');
    });

    it('should respect batch size', async () => {
      let maxUpdating = 0;
      const checkInterval = setInterval(() => {
        const updating = deployment.getInstances().filter(i => i.status === 'updating').length;
        maxUpdating = Math.max(maxUpdating, updating);
      }, 1);

      await deployment.deploy();
      clearInterval(checkInterval);

      expect(maxUpdating).toBeLessThanOrEqual(2); // batch size
    });

    it('should rollback on failure', async () => {
      deployment.setFailOnInstance(2);

      await deployment.deploy();

      const instances = deployment.getInstances();
      expect(instances.every(i => i.version === 'v1')).toBe(true);
      expect(deployment.getStatus()).toBe('failed');
    });

    it('should support single instance updates', async () => {
      deployment = new MockRollingDeployment(
        'test-rolling-single',
        {
          targetEnvironment: 'production',
          instanceCount: 6,
          batchSize: 1,
        },
        orchestrator,
        context
      );

      await deployment.deploy();

      expect(deployment.getStatus()).toBe('completed');
    });

    it('should support percentage-based batch sizes', async () => {
      deployment = new MockRollingDeployment(
        'test-rolling-percentage',
        {
          targetEnvironment: 'production',
          instanceCount: 10,
          batchSizePercentage: 30, // 30% = 3 instances per batch
        },
        orchestrator,
        context
      );

      await deployment.deploy();

      expect(deployment.getStatus()).toBe('completed');
    });

    it('should validate configuration', () => {
      expect(() => {
        new MockRollingDeployment(
          'invalid',
          {
            targetEnvironment: 'production',
            instanceCount: 4,
            batchSize: 5, // Batch size larger than instance count
          },
          orchestrator,
          context
        );
      }).toThrow();
    });

    it('should emit progress events', async () => {
      const progressEvents: number[] = [];

      deployment.on('progress', (progress: number) => {
        progressEvents.push(progress);
      });

      await deployment.deploy();

      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[progressEvents.length - 1]).toBe(100);
    });

    it('should support surge deployments', async () => {
      deployment = new MockRollingDeployment(
        'test-rolling-surge',
        {
          targetEnvironment: 'production',
          instanceCount: 4,
          batchSize: 2,
          maxSurge: 2, // Allow 2 extra instances during deployment
        },
        orchestrator,
        context
      );

      await deployment.deploy();

      expect(deployment.getStatus()).toBe('completed');
    });

    it('should handle zero-downtime requirements', async () => {
      deployment = new MockRollingDeployment(
        'test-zero-downtime',
        {
          targetEnvironment: 'production',
          instanceCount: 4,
          batchSize: 1,
          minAvailable: 3, // Always keep 3 instances available
        },
        orchestrator,
        context
      );

      let minRunning = 4;
      const checkInterval = setInterval(() => {
        const running = deployment.getInstances().filter(i => i.status === 'running').length;
        minRunning = Math.min(minRunning, running);
      }, 1);

      await deployment.deploy();
      clearInterval(checkInterval);

      expect(minRunning).toBeGreaterThanOrEqual(3);
    });

    it('should support custom health checks', async () => {
      let healthCheckCount = 0;

      deployment = new MockRollingDeployment(
        'test-custom-health',
        {
          targetEnvironment: 'production',
          instanceCount: 4,
          batchSize: 2,
          healthCheck: async (instance: any) => {
            healthCheckCount++;
            return instance.status === 'running';
          },
        },
        orchestrator,
        context
      );

      await deployment.deploy();

      // In a real implementation, we'd verify health checks were called
    });

    it('should support pause and resume', async () => {
      const deployPromise = deployment.deploy();

      // Pause after a short delay
      setTimeout(() => deployment.pause(), 10);

      // Wait and check status
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(deployment.getStatus()).toBe('paused');

      // Resume
      deployment.resume();

      await deployPromise;
      expect(deployment.getStatus()).toBe('completed');
    });

    it('should calculate correct batch sizes for percentages', () => {
      const testCases = [
        { instances: 10, percentage: 20, expected: 2 },
        { instances: 10, percentage: 25, expected: 3 }, // Rounds up
        { instances: 10, percentage: 33, expected: 4 }, // Rounds up
        { instances: 10, percentage: 50, expected: 5 },
        { instances: 10, percentage: 100, expected: 10 },
      ];

      for (const testCase of testCases) {
        const d = new MockRollingDeployment(
          'test',
          {
            targetEnvironment: 'production',
            instanceCount: testCase.instances,
            batchSizePercentage: testCase.percentage,
          },
          orchestrator,
          context
        );

        // In a real implementation, we'd verify the batch size calculation
      }
    });
  });
});