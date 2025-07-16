import { task } from '../../dsl/task';
import { Task, Phase, Recipe } from '../../core/types';
import { setState, getState } from '../../context/globals';
import { CanaryOptions, DeploymentPattern } from '../types';

export class CanaryDeployment implements DeploymentPattern {
  name = 'canary';
  description = 'Canary deployment pattern for gradual rollout with monitoring';
  category = 'deployment' as const;
  tags = ['progressive', 'monitored', 'safe'];

  constructor(private options: CanaryOptions) {}

  build(): Recipe {
    const phasesMap = new Map<string, Phase>();
    const tasksMap = new Map<string, Task>();

    // Phase 1: Deploy canary version
    const deployCanaryTask = this.createDeployCanaryTask();
    tasksMap.set(deployCanaryTask.name, deployCanaryTask);

    phasesMap.set('deploy-canary', {
      name: 'deploy-canary',
      tasks: [deployCanaryTask.name],
      parallel: false
    });

    // Phase 2: Initial traffic routing
    const initialRoutingTask = this.createInitialRoutingTask();
    tasksMap.set(initialRoutingTask.name, initialRoutingTask);

    phasesMap.set('initial-routing', {
      name: 'initial-routing',
      tasks: [initialRoutingTask.name],
      parallel: false,
      dependsOn: ['deploy-canary']
    });

    // Phase 3: Progressive rollout
    const rolloutPhases = this.createProgressiveRolloutPhases();
    rolloutPhases.forEach((phase, index) => {
      phase.tasks.forEach(task => tasksMap.set(task.name, task));
      
      const phaseName = `rollout-${index + 1}`;
      phasesMap.set(phaseName, {
        name: phaseName,
        tasks: phase.tasks.map(t => t.name),
        parallel: false,
        dependsOn: index === 0 ? ['initial-routing'] : [`rollout-${index}`]
      });
    });

    // Phase 4: Finalize deployment
    const finalizeTask = this.createFinalizeTask();
    tasksMap.set(finalizeTask.name, finalizeTask);

    const lastRolloutPhase = `rollout-${rolloutPhases.length}`;
    phasesMap.set('finalize', {
      name: 'finalize',
      tasks: [finalizeTask.name],
      parallel: false,
      dependsOn: [lastRolloutPhase]
    });

    return {
      id: `canary-${this.options.service}`,
      name: `Canary Deployment - ${this.options.service}`,
      description: `Canary deployment for ${this.options.service}`,
      tasks: tasksMap,
      phases: phasesMap
    };
  }

  private createDeployCanaryTask(): Task {
    return task('deploy-canary-version')
      .description('Deploy canary version alongside stable version')
      .handler(async (context) => {
        context.logger.info(`Deploying canary version of ${this.options.service}`);
        
        // Initialize canary state
        await setState('canary:state', {
          service: this.options.service,
          startTime: new Date().toISOString(),
          currentPercentage: 0,
          targetPercentage: this.options.targetPercentage,
          status: 'deploying',
          metrics: {
            requests: 0,
            errors: 0,
            latencies: []
          }
        });

        // Deploy canary (simulation)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Health check canary
        if (this.options.healthCheckUrl) {
          context.logger.info('Performing health check on canary...');
          // In real implementation, make HTTP request
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await setState('canary:state', await getState('canary:state').then((s: any) => ({
          ...s,
          status: 'deployed'
        })));

        return { status: 'deployed' };
      })
      .build();
  }

  private createInitialRoutingTask(): Task {
    return task('configure-initial-routing')
      .description(`Route ${this.options.initialPercentage}% traffic to canary`)
      .handler(async (context) => {
        const percentage = this.options.initialPercentage;
        
        context.logger.info(`Routing ${percentage}% of traffic to canary`);
        
        // Configure load balancer or service mesh
        await setState('canary:routing', {
          stable: 100 - percentage,
          canary: percentage
        });

        // Update state
        const state = await getState('canary:state');
        await setState('canary:state', {
          ...state,
          currentPercentage: percentage,
          status: 'active'
        });

        return { canaryTraffic: percentage };
      })
      .build();
  }

  private createProgressiveRolloutPhases(): Array<{ tasks: Task[] }> {
    const phases = [];
    let currentPercentage = this.options.initialPercentage;
    
    while (currentPercentage < this.options.targetPercentage) {
      const nextPercentage = Math.min(
        currentPercentage + this.options.incrementPercentage,
        this.options.targetPercentage
      );
      
      phases.push({
        tasks: [
          this.createMonitoringTask(currentPercentage),
          this.createAnalysisTask(currentPercentage),
          this.createTrafficIncreaseTask(currentPercentage, nextPercentage)
        ]
      });
      
      currentPercentage = nextPercentage;
    }
    
    return phases;
  }

  private createMonitoringTask(currentPercentage: number): Task {
    return task(`monitor-at-${currentPercentage}`)
      .description(`Monitor canary at ${currentPercentage}% traffic`)
      .handler(async (context) => {
        const duration = this.options.incrementInterval * 1000; // Convert to ms
        const checkInterval = 5000; // Check every 5 seconds
        const checks = Math.floor(duration / checkInterval);
        
        context.logger.info(`Monitoring canary for ${this.options.incrementInterval} seconds at ${currentPercentage}% traffic`);
        
        for (let i = 0; i < checks; i++) {
          const state = await getState('canary:state');
          
          // Simulate metric collection
          state.metrics.requests += Math.floor(Math.random() * 100);
          state.metrics.errors += Math.floor(Math.random() * 5);
          state.metrics.latencies.push(Math.random() * 200 + 50);
          
          await setState('canary:state', state);
          
          // Check metrics against thresholds
          const errorRate = state.metrics.requests > 0 
            ? (state.metrics.errors / state.metrics.requests) * 100 
            : 0;
          
          if (this.options.metrics?.errorRateThreshold && errorRate > this.options.metrics.errorRateThreshold) {
            throw new Error(`Error rate ${errorRate.toFixed(2)}% exceeds threshold ${this.options.metrics.errorRateThreshold}%`);
          }
          
          await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        
        return { monitored: true };
      })
      .build();
  }

  private createAnalysisTask(currentPercentage: number): Task {
    return task(`analyze-at-${currentPercentage}`)
      .description(`Analyze canary metrics at ${currentPercentage}% traffic`)
      .handler(async (context) => {
        context.logger.info('Analyzing canary metrics...');
        
        const state = await getState('canary:state');
        const metrics = state.metrics;
        
        // Calculate metrics
        const errorRate = metrics.requests > 0 
          ? (metrics.errors / metrics.requests) * 100 
          : 0;
        
        const avgLatency = metrics.latencies.length > 0
          ? metrics.latencies.reduce((a: number, b: number) => a + b, 0) / metrics.latencies.length
          : 0;
        
        const analysis = {
          errorRate: errorRate.toFixed(2) + '%',
          avgLatency: avgLatency.toFixed(2) + 'ms',
          requests: metrics.requests,
          healthy: true
        };
        
        // Check against thresholds
        if (this.options.metrics?.errorRateThreshold && errorRate > this.options.metrics.errorRateThreshold) {
          analysis.healthy = false;
          context.logger.error(`Error rate exceeds threshold: ${errorRate}% > ${this.options.metrics.errorRateThreshold}%`);
        }
        
        if (this.options.metrics?.latencyThreshold && avgLatency > this.options.metrics.latencyThreshold) {
          analysis.healthy = false;
          context.logger.error(`Latency exceeds threshold: ${avgLatency}ms > ${this.options.metrics.latencyThreshold}ms`);
        }
        
        // Check custom metrics
        if (this.options.metrics?.customMetrics) {
          for (const metric of this.options.metrics.customMetrics) {
            // In real implementation, query metric value
            const value = Math.random() * 100;
            const passes = this.evaluateMetric(value, metric.operator, metric.threshold);
            
            if (!passes) {
              analysis.healthy = false;
              context.logger.error(`Custom metric ${metric.name} failed: ${value} ${metric.operator} ${metric.threshold}`);
            }
          }
        }
        
        if (!analysis.healthy && this.options.rollbackOnFailure) {
          throw new Error('Canary analysis failed, triggering rollback');
        }
        
        await setState('canary:analysis', analysis);
        
        return analysis;
      })
      .build();
  }

  private createTrafficIncreaseTask(currentPercentage: number, nextPercentage: number): Task {
    return task(`increase-to-${nextPercentage}`)
      .description(`Increase canary traffic from ${currentPercentage}% to ${nextPercentage}%`)
      .handler(async (context) => {
        context.logger.info(`Increasing canary traffic to ${nextPercentage}%`);
        
        // Update routing configuration
        await setState('canary:routing', {
          stable: 100 - nextPercentage,
          canary: nextPercentage
        });
        
        // Update state
        const state = await getState('canary:state');
        await setState('canary:state', {
          ...state,
          currentPercentage: nextPercentage,
          metrics: {
            requests: 0,
            errors: 0,
            latencies: []
          }
        });
        
        // Wait for traffic to stabilize
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        return { canaryTraffic: nextPercentage };
      })
      .build();
  }

  private createFinalizeTask(): Task {
    return task('finalize-canary-deployment')
      .description('Finalize canary deployment')
      .handler(async (context) => {
        const state = await getState('canary:state');
        
        if (state.currentPercentage >= this.options.targetPercentage) {
          context.logger.info(`Canary deployment successful! Reached target ${this.options.targetPercentage}% traffic`);
          
          // If target is 100%, replace stable with canary
          if (this.options.targetPercentage === 100) {
            context.logger.info('Promoting canary to stable version');
            await setState('canary:state', {
              ...state,
              status: 'promoted'
            });
          } else {
            await setState('canary:state', {
              ...state,
              status: 'completed'
            });
          }
        }
        
        return { 
          status: 'completed',
          finalPercentage: state.currentPercentage,
          duration: new Date().getTime() - new Date(state.startTime).getTime()
        };
      })
      .build();
  }

  private evaluateMetric(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '<': return value < threshold;
      case '>': return value > threshold;
      case '<=': return value <= threshold;
      case '>=': return value >= threshold;
      case '==': return value === threshold;
      case '!=': return value !== threshold;
      default: return false;
    }
  }
}

export function canary(options: CanaryOptions): DeploymentPattern {
  return new CanaryDeployment(options);
}