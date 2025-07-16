import { task } from '../../dsl/task';
import { Task, Phase, Recipe } from '../../core/types';
import { setState, getState } from '../../context/globals';
import { RecreateOptions, DeploymentPattern } from '../types';

export class RecreateDeployment implements DeploymentPattern {
  name = 'recreate';
  description = 'Recreate deployment pattern - stops all instances before creating new ones';
  category = 'deployment' as const;
  tags = ['simple', 'downtime', 'stateful'];

  constructor(private options: RecreateOptions) {}

  build(): Recipe {
    const phasesMap = new Map<string, Phase>();
    const tasksMap = new Map<string, Task>();

    // Phase 1: Pre-stop hooks
    if (this.options.preStopHook) {
      tasksMap.set(this.options.preStopHook.name, this.options.preStopHook);
      phasesMap.set('pre-stop', {
        name: 'pre-stop',
        tasks: [this.options.preStopHook.name],
        parallel: false
      });
    }

    // Phase 2: Stop all instances
    const stopAllTask = this.createStopAllInstancesTask();
    tasksMap.set(stopAllTask.name, stopAllTask);

    phasesMap.set('stop-all', {
      name: 'stop-all',
      tasks: [stopAllTask.name],
      parallel: false,
      dependsOn: this.options.preStopHook ? ['pre-stop'] : undefined
    });

    // Phase 3: Wait for graceful shutdown
    const waitShutdownTask = this.createWaitForShutdownTask();
    tasksMap.set(waitShutdownTask.name, waitShutdownTask);

    phasesMap.set('wait-shutdown', {
      name: 'wait-shutdown',
      tasks: [waitShutdownTask.name],
      parallel: false,
      dependsOn: ['stop-all']
    });

    // Phase 4: Deploy new version
    const deployNewTask = this.createDeployNewVersionTask();
    tasksMap.set(deployNewTask.name, deployNewTask);

    phasesMap.set('deploy-new', {
      name: 'deploy-new',
      tasks: [deployNewTask.name],
      parallel: false,
      dependsOn: ['wait-shutdown']
    });

    // Phase 5: Health check
    const healthCheckTask = this.createHealthCheckTask();
    tasksMap.set(healthCheckTask.name, healthCheckTask);

    phasesMap.set('health-check', {
      name: 'health-check',
      tasks: [healthCheckTask.name],
      parallel: false,
      dependsOn: ['deploy-new']
    });

    // Phase 6: Post-start hooks
    if (this.options.postStartHook) {
      tasksMap.set(this.options.postStartHook.name, this.options.postStartHook);
      phasesMap.set('post-start', {
        name: 'post-start',
        tasks: [this.options.postStartHook.name],
        parallel: false,
        dependsOn: ['health-check']
      });
    }

    return {
      id: `recreate-${this.options.service}`,
      name: `Recreate Deployment - ${this.options.service}`,
      description: `Recreate deployment for ${this.options.service}`,
      tasks: tasksMap,
      phases: phasesMap
    };
  }

  private createStopAllInstancesTask(): Task {
    return task('stop-all-instances')
      .description(`Stop all instances of ${this.options.service}`)
      .handler(async (context) => {
        context.logger.info(`Stopping all instances of ${this.options.service}`);
        
        // Initialize deployment state
        await setState('recreate:state', {
          service: this.options.service,
          startTime: new Date().toISOString(),
          status: 'stopping',
          oldInstances: [],
          newInstances: []
        });

        // Get current instances (simulation)
        const instances = [
          { id: 'instance-1', status: 'running' },
          { id: 'instance-2', status: 'running' },
          { id: 'instance-3', status: 'running' }
        ];

        // Store old instances
        const state = await getState('recreate:state');
        await setState('recreate:state', {
          ...state,
          oldInstances: instances
        });

        // Send stop signal to all instances
        for (const instance of instances) {
          context.logger.info(`Sending stop signal to ${instance.id}`);
          // In real implementation, call orchestrator API
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        return {
          stoppedInstances: instances.length,
          status: 'stop-signal-sent'
        };
      })
      .build();
  }

  private createWaitForShutdownTask(): Task {
    return task('wait-for-graceful-shutdown')
      .description('Wait for all instances to shutdown gracefully')
      .handler(async (context) => {
        const timeout = this.options.gracefulShutdownTimeout || 30; // seconds
        const checkInterval = 2; // seconds
        const maxChecks = Math.ceil(timeout / checkInterval);
        
        context.logger.info(`Waiting up to ${timeout} seconds for graceful shutdown`);
        
        const state = await getState('recreate:state');
        const instances = state.oldInstances;
        
        for (let check = 0; check < maxChecks; check++) {
          let allStopped = true;
          
          // Check instance statuses
          for (const instance of instances) {
            // In real implementation, query orchestrator for instance status
            const isRunning = check < 3; // Simulate gradual shutdown
            
            if (isRunning) {
              allStopped = false;
              context.logger.debug(`Instance ${instance.id} is still running`);
            }
          }
          
          if (allStopped) {
            context.logger.info('All instances have stopped gracefully');
            await setState('recreate:state', {
              ...state,
              status: 'stopped'
            });
            return { status: 'all-stopped', duration: check * checkInterval };
          }
          
          await new Promise(resolve => setTimeout(resolve, checkInterval * 1000));
        }
        
        // Force stop if timeout reached
        context.logger.warn('Graceful shutdown timeout reached, forcing stop');
        for (const instance of instances) {
          context.logger.warn(`Force stopping ${instance.id}`);
          // In real implementation, force kill the instance
        }
        
        await setState('recreate:state', {
          ...state,
          status: 'force-stopped'
        });
        
        return { status: 'force-stopped', duration: timeout };
      })
      .build();
  }

  private createDeployNewVersionTask(): Task {
    return task('deploy-new-version')
      .description(`Deploy new version of ${this.options.service}`)
      .handler(async (context) => {
        context.logger.info(`Deploying new version of ${this.options.service}`);
        
        const state = await getState('recreate:state');
        const instanceCount = state.oldInstances.length || 3;
        
        // Update deployment status
        await setState('recreate:state', {
          ...state,
          status: 'deploying'
        });
        
        // Create new instances
        const newInstances = [];
        for (let i = 0; i < instanceCount; i++) {
          const instanceId = `instance-new-${i + 1}`;
          context.logger.info(`Creating instance ${instanceId}`);
          
          // In real implementation, call orchestrator API to create instance
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          newInstances.push({
            id: instanceId,
            status: 'starting',
            createdAt: new Date().toISOString()
          });
        }
        
        // Update state with new instances
        await setState('recreate:state', {
          ...state,
          newInstances,
          status: 'deployed'
        });
        
        return {
          deployedInstances: newInstances.length,
          instances: newInstances.map(i => i.id)
        };
      })
      .build();
  }

  private createHealthCheckTask(): Task {
    return task('health-check-new-instances')
      .description('Perform health checks on new instances')
      .handler(async (context) => {
        context.logger.info('Starting health checks on new instances');
        
        const state = await getState('recreate:state');
        const instances = state.newInstances;
        const healthCheckUrl = this.options.healthCheckUrl;
        
        const healthResults = [];
        const maxRetries = 5;
        const retryDelay = 3000; // 3 seconds
        
        for (const instance of instances) {
          let healthy = false;
          let attempts = 0;
          
          while (!healthy && attempts < maxRetries) {
            attempts++;
            context.logger.info(`Health check attempt ${attempts}/${maxRetries} for ${instance.id}`);
            
            try {
              if (healthCheckUrl) {
                // In real implementation, make HTTP request to instance
                // For simulation, succeed after 2 attempts
                if (attempts >= 2) {
                  healthy = true;
                }
              } else {
                // Basic instance status check
                healthy = true;
              }
              
              if (!healthy && attempts < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              }
            } catch (error) {
              context.logger.warn(`Health check failed for ${instance.id}: ${(error as Error).message}`);
              if (attempts < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              }
            }
          }
          
          healthResults.push({
            instance: instance.id,
            healthy,
            attempts
          });
          
          if (!healthy) {
            throw new Error(`Instance ${instance.id} failed health checks after ${maxRetries} attempts`);
          }
        }
        
        context.logger.info('All instances passed health checks');
        
        // Update deployment status
        await setState('recreate:state', {
          ...state,
          status: 'healthy'
        });
        
        return {
          healthyInstances: healthResults.filter(r => r.healthy).length,
          totalInstances: instances.length,
          results: healthResults
        };
      })
      .build();
  }
}

export function recreate(options: RecreateOptions): DeploymentPattern {
  return new RecreateDeployment(options);
}