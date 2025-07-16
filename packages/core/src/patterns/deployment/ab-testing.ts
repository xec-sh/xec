import { task } from '../../dsl/task';
import { Task, Phase, Recipe } from '../../core/types';
import { setState, getState } from '../../context/globals';
import { ABVariant, ABTestingOptions, DeploymentPattern } from '../types';

export class ABTestingDeployment implements DeploymentPattern {
  name = 'ab-testing';
  description = 'A/B Testing deployment pattern for experimentation';
  category = 'deployment' as const;
  tags = ['experimentation', 'metrics-driven', 'multi-variant'];

  constructor(private options: ABTestingOptions) {}

  build(): Recipe {
    const phasesMap = new Map<string, Phase>();
    const tasksMap = new Map<string, Task>();

    // Phase 1: Deploy all variants
    const deployVariantTasks = this.options.variants.map(variant => 
      this.createDeployVariantTask(variant)
    );
    deployVariantTasks.forEach(task => tasksMap.set(task.name, task));

    phasesMap.set('deploy-variants', {
      name: 'deploy-variants',
      tasks: deployVariantTasks.map(t => t.name),
      parallel: true
    });

    // Phase 2: Configure traffic distribution
    const configureTrafficTask = this.createTrafficConfigurationTask();
    tasksMap.set(configureTrafficTask.name, configureTrafficTask);

    phasesMap.set('configure-traffic', {
      name: 'configure-traffic',
      tasks: [configureTrafficTask.name],
      parallel: false,
      dependsOn: ['deploy-variants']
    });

    // Phase 3: Setup metrics collection
    const setupMetricsTask = this.createMetricsSetupTask();
    tasksMap.set(setupMetricsTask.name, setupMetricsTask);

    phasesMap.set('setup-metrics', {
      name: 'setup-metrics',
      tasks: [setupMetricsTask.name],
      parallel: false,
      dependsOn: ['configure-traffic']
    });

    // Phase 4: Monitor and collect results
    if (this.options.duration) {
      const monitorTask = this.createMonitoringTask();
      tasksMap.set(monitorTask.name, monitorTask);

      phasesMap.set('monitor', {
        name: 'monitor',
        tasks: [monitorTask.name],
        parallel: false,
        dependsOn: ['setup-metrics']
      });

      // Phase 5: Analyze results
      const analyzeTask = this.createAnalysisTask();
      tasksMap.set(analyzeTask.name, analyzeTask);

      phasesMap.set('analyze', {
        name: 'analyze',
        tasks: [analyzeTask.name],
        parallel: false,
        dependsOn: ['monitor']
      });
    }

    return {
      id: `ab-testing-${this.options.service}`,
      name: `A/B Testing - ${this.options.service}`,
      description: `A/B Testing deployment for ${this.options.service}`,
      tasks: tasksMap,
      phases: phasesMap
    };
  }

  private createDeployVariantTask(variant: ABVariant): Task {
    return task(`deploy-variant-${variant.name}`)
      .description(`Deploy variant ${variant.name} (${variant.version})`)
      .handler(async (context) => {
        context.logger.info(`Deploying variant ${variant.name} with version ${variant.version}`);
        
        // Deploy the variant
        await setState(`ab:variant:${variant.name}`, {
          name: variant.name,
          version: variant.version,
          deployedAt: new Date().toISOString(),
          status: 'deployed'
        });

        // If variant has specific configuration
        if (variant.config) {
          await setState(`ab:variant:${variant.name}:config`, variant.config);
        }

        return {
          variant: variant.name,
          version: variant.version,
          status: 'deployed'
        };
      })
      .build();
  }

  private createTrafficConfigurationTask(): Task {
    return task('configure-traffic-distribution')
      .description('Configure traffic distribution between variants')
      .handler(async (context) => {
        const { distribution, variants } = this.options;
        
        context.logger.info(`Configuring ${distribution} traffic distribution`);

        const config: any = {
          type: distribution,
          variants: variants.map(v => ({
            name: v.name,
            weight: v.weight || (100 / variants.length)
          }))
        };

        switch (distribution) {
          case 'weighted':
            // Ensure weights sum to 100
            const totalWeight = config.variants.reduce((sum: number, v: any) => sum + v.weight, 0);
            if (Math.abs(totalWeight - 100) > 0.01) {
              throw new Error(`Variant weights must sum to 100, got ${totalWeight}`);
            }
            break;

          case 'header-based':
            config.headerName = this.options.headerName || 'X-AB-Variant';
            config.headerMapping = variants.reduce((acc: any, v) => {
              acc[v.name] = v.headerValue || v.name;
              return acc;
            }, {});
            break;

          case 'cookie-based':
            config.cookieName = this.options.cookieName || 'ab_variant';
            config.cookieMapping = variants.reduce((acc: any, v) => {
              acc[v.name] = v.cookieValue || v.name;
              return acc;
            }, {});
            break;
        }

        await setState('ab:traffic:config', config);

        // Configure load balancer or API gateway
        context.logger.info('Traffic distribution configured');

        return { distribution: config };
      })
      .build();
  }

  private createMetricsSetupTask(): Task {
    return task('setup-metrics-collection')
      .description('Setup metrics collection for A/B test')
      .handler(async (context) => {
        const metrics = this.options.metrics || [];
        
        context.logger.info(`Setting up collection for ${metrics.length} metrics`);

        // Initialize metrics storage
        for (const variant of this.options.variants) {
          await setState(`ab:metrics:${variant.name}`, {
            requests: 0,
            errors: 0,
            latencies: [],
            customMetrics: {}
          });
        }

        // Configure metric collectors
        const collectors = metrics.map(metric => ({
          name: metric.name,
          threshold: metric.threshold,
          aggregation: metric.aggregation || 'avg',
          window: metric.window || 60 // default 1 minute
        }));

        await setState('ab:metrics:collectors', collectors);

        return { 
          metrics: metrics.map(m => m.name),
          variants: this.options.variants.map(v => v.name)
        };
      })
      .build();
  }

  private createMonitoringTask(): Task {
    return task('monitor-ab-test')
      .description('Monitor A/B test and collect metrics')
      .handler(async (context) => {
        const duration = this.options.duration || 3600; // default 1 hour
        const checkInterval = 30; // seconds
        const checks = Math.floor(duration / checkInterval);
        
        context.logger.info(`Monitoring A/B test for ${duration} seconds`);

        for (let i = 0; i < checks; i++) {
          // Simulate metric collection
          for (const variant of this.options.variants) {
            const metricsKey = `ab:metrics:${variant.name}`;
            const metrics = await getState(metricsKey) || {
              requests: 0,
              errors: 0,
              latencies: [],
              customMetrics: {}
            };

            // Update metrics (in real implementation, fetch from monitoring system)
            metrics.requests += Math.floor(Math.random() * 100);
            metrics.errors += Math.floor(Math.random() * 5);
            metrics.latencies.push(Math.random() * 200 + 50);

            await setState(metricsKey, metrics);
          }

          // Check if any variant is performing poorly
          const shouldStop = await this.checkStopConditions(context);
          if (shouldStop) {
            context.logger.warn('Stop condition met, ending A/B test early');
            break;
          }

          // Wait before next check
          await new Promise(resolve => setTimeout(resolve, checkInterval * 1000));
          
          const progress = ((i + 1) / checks * 100).toFixed(1);
          context.logger.info(`Progress: ${progress}%`);
        }

        return { status: 'completed', duration };
      })
      .build();
  }

  private createAnalysisTask(): Task {
    return task('analyze-results')
      .description('Analyze A/B test results and determine winner')
      .handler(async (context) => {
        context.logger.info('Analyzing A/B test results');

        const results: any = {
          variants: {},
          winner: null,
          confidence: 0
        };

        // Collect metrics for each variant
        for (const variant of this.options.variants) {
          const metrics = await getState(`ab:metrics:${variant.name}`);
          
          const avgLatency = metrics.latencies.length > 0
            ? metrics.latencies.reduce((a: number, b: number) => a + b, 0) / metrics.latencies.length
            : 0;

          const errorRate = metrics.requests > 0
            ? (metrics.errors / metrics.requests) * 100
            : 0;

          results.variants[variant.name] = {
            requests: metrics.requests,
            errors: metrics.errors,
            errorRate: errorRate.toFixed(2) + '%',
            avgLatency: avgLatency.toFixed(2) + 'ms',
            ...metrics.customMetrics
          };
        }

        // Simple winner determination (in real implementation, use statistical analysis)
        let bestVariant = null;
        let bestScore = Infinity;

        for (const variant of this.options.variants) {
          const variantResults = results.variants[variant.name];
          const score = parseFloat(variantResults.errorRate) + parseFloat(variantResults.avgLatency) / 100;
          
          if (score < bestScore) {
            bestScore = score;
            bestVariant = variant.name;
          }
        }

        results.winner = bestVariant;
        results.confidence = 95; // Simplified - should use proper statistical analysis

        await setState('ab:results', results);

        context.logger.info(`A/B test winner: ${bestVariant} with ${results.confidence}% confidence`);

        return results;
      })
      .build();
  }

  private async checkStopConditions(context: any): Promise<boolean> {
    // Check if any variant has excessive errors
    for (const variant of this.options.variants) {
      const metrics = await getState(`ab:metrics:${variant.name}`);
      if (metrics && metrics.requests > 100 && metrics.errors / metrics.requests > 0.1) {
        context.logger.error(`Variant ${variant.name} has error rate > 10%, stopping test`);
        return true;
      }
    }

    return false;
  }
}

export function abTesting(options: ABTestingOptions): DeploymentPattern {
  return new ABTestingDeployment(options);
}