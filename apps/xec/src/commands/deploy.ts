import type { Recipe } from '@xec/core';

import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import { spinner } from '@clack/prompts';
import { Command, Argument } from 'commander';
import { task, recipe, phaseRecipe, createLogger, executeRecipe, createExecutionContext } from '@xec/core';

import { success, getStdlib, handleError, error as showError } from '../utils/helpers.js';

interface DeployOptions {
  pattern?: 'blue-green' | 'canary' | 'rolling' | 'recreate' | 'ab-testing';
  target?: string;
  config?: string;
  vars?: string;
  var?: string[];
  dryRun?: boolean;
  rollback?: boolean;
  wait?: boolean;
  timeout?: number;
  healthCheck?: boolean;
  autoRollback?: boolean;
}

export default function (program: Command) {
  const deployCommand = program
    .command('deploy [recipe]')
    .description('Deploy applications using various deployment patterns')
  .option('-p, --pattern <pattern>', 'deployment pattern (blue-green|canary|rolling|recreate|ab-testing)', 'rolling')
  .option('-t, --target <target>', 'deployment target environment')
  .option('-c, --config <path>', 'deployment configuration file')
  .option('-v, --vars <json>', 'variables as JSON')
  .option('--var <key=value>', 'set individual variables', (val, prev: string[]) => prev ? [...prev, val] : [val], [])
  .option('-d, --dry-run', 'simulate deployment without making changes')
  .option('--rollback', 'rollback to previous deployment')
  .option('--wait', 'wait for deployment to complete')
  .option('--timeout <ms>', 'deployment timeout in milliseconds', parseInt)
  .option('--health-check', 'perform health checks during deployment', true)
  .option('--auto-rollback', 'automatically rollback on failure', false)
  .action(async (recipe, options: DeployOptions) => {
    const s = spinner();
    
    try {
      if (!recipe && !options.config) {
        throw new Error('Either a recipe name or config file must be provided');
      }

      s.start(`Preparing ${options.pattern} deployment...`);

      // Load deployment configuration
      let deployConfig: any = {};
      if (options.config) {
        const configPath = path.resolve(options.config);
        if (await fs.pathExists(configPath)) {
          deployConfig = await fs.readJson(configPath);
        }
      }

      // Parse variables
      const vars: Record<string, any> = {};
      if (options.vars) {
        Object.assign(vars, JSON.parse(options.vars));
      }
      if (options.var) {
        for (const v of options.var) {
          const [key, value] = v.split('=');
          if (key) vars[key] = value;
        }
      }

      // Merge with deploy config
      Object.assign(vars, {
        deploymentPattern: options.pattern,
        deploymentTarget: options.target || deployConfig.target || 'production',
        healthCheckEnabled: options.healthCheck,
        autoRollback: options.autoRollback,
        timeout: options.timeout || deployConfig.timeout || 300000,
        ...deployConfig.vars
      });

      // Create deployment recipe based on pattern
      const deployRecipe = await createDeploymentRecipe(recipe || deployConfig.recipe, options.pattern!, vars);

      s.stop(`Deployment prepared`);

      // Execute deployment
      const context = createExecutionContext({
        vars,
        dryRun: options.dryRun,
        logger: createLogger({
          name: 'deploy',
          level: 'info',
          json: false,
          colorize: true
        })
      });

      if (options.rollback) {
        console.log(pc.yellow('🔄 Rolling back deployment...'));
        await executeRollback(context, vars);
      } else {
        console.log(pc.blue(`🚀 Starting ${options.pattern} deployment...`));
        const startTime = Date.now();
        
        await executeRecipe(deployRecipe, context);
        
        const duration = Date.now() - startTime;
        success(`Deployment completed successfully in ${(duration / 1000).toFixed(2)}s`);
      }

      if (options.wait) {
        console.log(pc.blue('⏳ Waiting for deployment to stabilize...'));
        await waitForDeployment(context, vars);
      }

    } catch (err) {
      handleError(err, 'Deployment failed');
      
      if (options.autoRollback) {
        console.log(pc.yellow('🔄 Auto-rollback initiated...'));
        try {
          const context = createExecutionContext({ vars: {} });
          await executeRollback(context, {});
          success('Rollback completed successfully');
        } catch (rollbackError) {
          showError(`Rollback failed: ${rollbackError}`);
        }
      }
      
      process.exit(1);
    }
  });

  // Add subcommands to deploy
  deployCommand
    .command('strategy')
    .description('Manage deployment strategies')
    .addCommand(
      new Command()
        .name('list')
        .description('list available deployment strategies')
        .action(async () => {
          console.log(pc.bold('Available Deployment Strategies:'));
          console.log();
          console.log(pc.blue('blue-green') + '    - Zero-downtime deployment with environment swap');
          console.log(pc.blue('canary') + '        - Gradual rollout to a subset of users');
          console.log(pc.blue('rolling') + '       - Sequential update of instances');
          console.log(pc.blue('recreate') + '      - Stop old version, start new version');
          console.log(pc.blue('ab-testing') + '    - Deploy multiple versions for testing');
        })
    )
    .addCommand(
      new Command()
        .name('describe')
        .description('describe a deployment strategy')
        .addArgument(new Argument('<strategy>', 'strategy name'))
        .action(async (strategy) => {
          const descriptions: Record<string, string> = {
            'blue-green': 'Blue-Green deployment maintains two identical production environments. Only one is live at any time. The new version is deployed to the inactive environment, tested, and then traffic is switched.',
            'canary': 'Canary deployment gradually rolls out changes to a small subset of users before rolling it out to the entire infrastructure.',
            'rolling': 'Rolling deployment updates instances sequentially, ensuring zero downtime by keeping some instances running the old version while others are updated.',
            'recreate': 'Recreate deployment stops all instances of the old version and then starts instances of the new version. This causes downtime.',
            'ab-testing': 'A/B Testing deployment runs multiple versions simultaneously to test and compare their performance with real users.'
          };
          
          if (descriptions[strategy]) {
            console.log(pc.bold(`${strategy} Deployment Strategy:`));
            console.log();
            console.log(descriptions[strategy]);
          } else {
            console.error(pc.red(`Unknown strategy: ${strategy}`));
          }
        })
    );

  deployCommand
    .command('status')
    .description('Check deployment status')
    .option('-d, --deployment <id>', 'specific deployment ID')
    .option('--json', 'output as JSON')
    .action(async (options) => {
      try {
        const lib = await getStdlib('deploy');
        
        // Check deployment status from state
        const state = await lib.fs.exists('.xec/deployments/current.json') 
          ? await lib.fs.read('.xec/deployments/current.json')
          : null;
          
        if (!state) {
          console.log(pc.yellow('No active deployments found'));
          return;
        }
        
        const deployment = JSON.parse(state);
        
        if (options.json) {
          console.log(JSON.stringify(deployment, null, 2));
        } else {
          console.log(pc.bold('Current Deployment Status:'));
          console.log(`ID:       ${deployment.id}`);
          console.log(`Pattern:  ${deployment.pattern}`);
          console.log(`Status:   ${deployment.status}`);
          console.log(`Version:  ${deployment.version}`);
          console.log(`Started:  ${new Date(deployment.startedAt).toLocaleString()}`);
          if (deployment.completedAt) {
            console.log(`Completed: ${new Date(deployment.completedAt).toLocaleString()}`);
          }
        }
      } catch (err) {
        showError(`Failed to get deployment status: ${err}`);
      }
    });

  deployCommand
    .command('history')
    .description('View deployment history')
    .option('-n, --limit <n>', 'number of deployments to show', '10')
    .option('--json', 'output as JSON')
    .action(async (options) => {
      try {
        const lib = await getStdlib('deploy');
        
        const historyPath = '.xec/deployments/history.json';
        if (!await lib.fs.exists(historyPath)) {
          console.log(pc.yellow('No deployment history found'));
          return;
        }
        
        const history = JSON.parse(await lib.fs.read(historyPath));
        const limit = parseInt(options.limit);
        const deployments = history.slice(0, limit);
        
        if (options.json) {
          console.log(JSON.stringify(deployments, null, 2));
        } else {
          console.log(pc.bold('Deployment History:'));
          console.log();
          
          for (const deployment of deployments) {
            const status = deployment.status === 'success' ? pc.green('✓') : pc.red('✗');
            console.log(`${status} ${deployment.id} - ${deployment.pattern} - ${new Date(deployment.startedAt).toLocaleString()}`);
          }
        }
      } catch (err) {
        showError(`Failed to get deployment history: ${err}`);
      }
    });

  deployCommand
    .command('rollback [deployment-id]')
    .description('Rollback to a previous deployment')
    .option('--force', 'force rollback without confirmation')
    .action(async (deploymentId, options) => {
      const s = spinner();
      
      try {
        s.start('Preparing rollback...');
        
        const context = createExecutionContext({
          vars: { rollbackDeploymentId: deploymentId }
        });
        
        await executeRollback(context, { deploymentId });
        
        s.stop('Rollback completed successfully');
      } catch (err) {
        handleError(err, 'Rollback failed');
      }
    });

  deployCommand
    .command('promote')
    .description('Promote a canary deployment to full production')
    .option('--percentage <n>', 'traffic percentage to promote to', '100')
    .action(async (options) => {
      const s = spinner();
      
      try {
        s.start('Promoting deployment...');
        
        const lib = await getStdlib('deploy');
        const state = await lib.fs.read('.xec/deployments/current.json');
        const deployment = JSON.parse(state);
        
        if (deployment.pattern !== 'canary') {
          throw new Error('Can only promote canary deployments');
        }
        
        // Update traffic split
        deployment.trafficSplit = parseInt(options.percentage);
        await lib.fs.write('.xec/deployments/current.json', JSON.stringify(deployment, null, 2));
        
        s.stop(`Deployment promoted to ${options.percentage}% traffic`);
      } catch (err) {
        handleError(err, 'Promotion failed');
      }
    });

async function createDeploymentRecipe(
  recipeName: string,
  pattern: string,
  vars: Record<string, any>
): Promise<Recipe> {
  // Create deployment recipe based on pattern
  switch (pattern) {
    case 'blue-green':
      return createBlueGreenRecipe(recipeName, vars);
    case 'canary':
      return createCanaryRecipe(recipeName, vars);
    case 'rolling':
      return createRollingRecipe(recipeName, vars);
    case 'recreate':
      return createRecreateRecipe(recipeName, vars);
    case 'ab-testing':
      return createABTestingRecipe(recipeName, vars);
    default:
      throw new Error(`Unknown deployment pattern: ${pattern}`);
  }
}

function createBlueGreenRecipe(app: string, vars: Record<string, any>): Recipe {
  return recipe(`blue-green-${app}`)
    .description('Blue-Green deployment')
    .vars(vars)
    // Add all tasks first
    .task('check-health', task('check-health')
      .handler(async ({ logger }) => {
        logger.info('Checking current environment health...');
      })
    )
    .task('determine-target', task('determine-target')
      .handler(async ({ vars: taskVars, logger }) => {
        const current = taskVars['currentEnv'] || vars['currentEnv'] || 'blue';
        const target = current === 'blue' ? 'green' : 'blue';
        taskVars['targetEnv'] = target;
        logger.info(`Current: ${current}, Target: ${target}`);
      })
    )
    .task('deploy-to-target', task('deploy-to-target')
      .handler(async ({ vars: taskVars, logger }) => {
        const target = taskVars['targetEnv'] || vars['targetEnv'];
        logger.info(`Deploying to ${target} environment...`);
      })
    )
    .task('run-tests', task('run-tests')
      .handler(async ({ logger }) => {
        logger.info('Running smoke tests on new environment...');
      })
    )
    .task('switch-traffic', task('switch-traffic')
      .handler(async ({ vars: taskVars, logger }) => {
        const target = taskVars['targetEnv'] || vars['targetEnv'];
        logger.info(`Switching traffic to ${target} environment...`);
      })
    )
    .task('verify-switch', task('verify-switch')
      .handler(async ({ logger }) => {
        logger.info('Verifying traffic switch...');
      })
    )
    .task('cleanup-old', task('cleanup-old')
      .handler(async ({ logger }) => {
        logger.info('Cleaning up old environment...');
      })
    )
    // Then create phases with task names
    .addPhase('prepare', ['check-health', 'determine-target'])
    .addPhase('deploy', ['deploy-to-target', 'run-tests'])
    .addPhase('switch', ['switch-traffic', 'verify-switch'])
    .addPhase('cleanup', ['cleanup-old'])
    .build();
}

function createCanaryRecipe(app: string, vars: Record<string, any>): Recipe {
  const stages = vars['canaryStages'] || [10, 25, 50, 100];
  
  const tasks: any = {
    prepare: [
      task('prepare-canary', async ({ vars: taskVars, logger }) => {
        logger.info('Preparing canary deployment...');
        taskVars['canaryStages'] = stages;
        taskVars['currentStage'] = 0;
      })
    ],
    deploy: [],
    finalize: [
      task('complete-rollout', async ({ logger }) => {
        logger.info('Canary deployment completed successfully');
      })
    ]
  };
  
  // Add tasks for each stage
  stages.forEach((percentage: number, index: number) => {
    tasks.deploy.push(
      task(`deploy-${percentage}pct`, async ({ vars: taskVars, logger }) => {
        logger.info(`Deploying to ${percentage}% of traffic...`);
        taskVars['currentStage'] = index;
      }),
      task(`monitor-${percentage}pct`, async ({ logger }) => {
        logger.info(`Monitoring ${percentage}% deployment...`);
        // Add actual monitoring logic
      }),
      task(`validate-${percentage}pct`, async ({ logger }) => {
        logger.info(`Validating ${percentage}% deployment metrics...`);
        // Add validation logic
      })
    );
  });
  
  return phaseRecipe(`canary-${app}`, tasks, {
    description: 'Canary deployment',
    vars
  });
}

function createRollingRecipe(app: string, vars: Record<string, any>): Recipe {
  const batchSize = vars['batchSize'] || 1;
  const pauseBetweenBatches = vars['pauseBetweenBatches'] || 30000;
  
  return phaseRecipe(`rolling-${app}`, {
    prepare: [
      task('get-instances', async ({ vars: taskVars, logger }) => {
        logger.info('Getting instance list...');
        // Get instances from infrastructure
        const instances = vars['instances'] || ['instance-1', 'instance-2', 'instance-3'];
        taskVars['instances'] = instances;
        taskVars['totalBatches'] = Math.ceil(instances.length / batchSize);
      })
    ],
    deploy: [
      task('rolling-update', async ({ vars: taskVars, logger }) => {
        const instances = taskVars['instances'] || vars['instances'] || [];
        const batches: any[] = [];
        
        if (Array.isArray(instances)) {
          for (let i = 0; i < instances.length; i += batchSize) {
            batches.push(instances.slice(i, i + batchSize));
          }
        }
        
        for (let i = 0; i < batches.length; i++) {
          logger.info(`Updating batch ${i + 1}/${batches.length}: ${batches[i].join(', ')}`);
          
          // Update instances in batch
          for (const instance of batches[i]) {
            logger.info(`  Updating ${instance}...`);
            // Add actual update logic
          }
          
          if (i < batches.length - 1) {
            logger.info(`  Waiting ${pauseBetweenBatches}ms before next batch...`);
            await new Promise(resolve => setTimeout(resolve, pauseBetweenBatches));
          }
        }
      })
    ],
    verify: [
      task('verify-deployment', async ({ logger }) => {
        logger.info('Verifying all instances are healthy...');
      })
    ]
  }, {
    description: 'Rolling deployment',
    vars
  });
}

function createRecreateRecipe(app: string, vars: Record<string, any>): Recipe {
  return phaseRecipe(`recreate-${app}`, {
    stop: [
      task('stop-old-version', async ({ logger }) => {
        logger.info('Stopping all instances of old version...');
        // Add logic to stop services
      })
    ],
    deploy: [
      task('start-new-version', async ({ logger }) => {
        logger.info('Starting new version...');
        // Add logic to start new services
      })
    ],
    verify: [
      task('verify-new-version', async ({ logger }) => {
        logger.info('Verifying new version is running...');
      })
    ]
  }, {
    description: 'Recreate deployment',
    vars
  });
}

function createABTestingRecipe(app: string, vars: Record<string, any>): Recipe {
  const variants = vars['variants'] || ['control', 'variant-a'];
  const trafficSplit = vars['trafficSplit'] || { control: 50, 'variant-a': 50 };
  
  const tasks: any = {
    prepare: [
      task('prepare-variants', async ({ vars: taskVars, logger }) => {
        logger.info('Preparing A/B test variants...');
        taskVars['variants'] = variants;
        taskVars['trafficSplit'] = trafficSplit;
      })
    ],
    deploy: variants.map((variant: string) => 
      task(`deploy-${variant}`, async ({ logger }) => {
        const split = trafficSplit[variant] || 0;
        logger.info(`Deploying ${variant} with ${split}% traffic allocation...`);
      })
    ),
    configure: [
      task('configure-routing', async ({ vars: taskVars, logger }) => {
        logger.info('Configuring traffic routing rules...');
        const split = taskVars['trafficSplit'] || trafficSplit;
        for (const [variant, percentage] of Object.entries(split)) {
          logger.info(`  ${variant}: ${percentage}%`);
        }
      })
    ],
    monitor: [
      task('setup-monitoring', async ({ logger }) => {
        logger.info('Setting up A/B test monitoring...');
      })
    ]
  };
  
  return phaseRecipe(`ab-testing-${app}`, tasks, {
    description: 'A/B Testing deployment',
    vars
  });
}

async function executeRollback(context: any, vars: Record<string, any>) {
  const lib = await getStdlib('deploy');
  
  // Get previous deployment from history
  const historyPath = '.xec/deployments/history.json';
  if (!await lib.fs.exists(historyPath)) {
    throw new Error('No deployment history found for rollback');
  }
  
  const history = JSON.parse(await lib.fs.read(historyPath));
  const targetDeployment = vars['deploymentId'] 
    ? history.find((d: any) => d.id === vars['deploymentId'])
    : history[1]; // Previous deployment
    
  if (!targetDeployment) {
    throw new Error('No valid deployment found for rollback');
  }
  
  context.logger.info(`Rolling back to deployment ${targetDeployment.id}...`);
  
  // Execute rollback recipe
  const rollbackRecipe = phaseRecipe('rollback', {
    prepare: [
      task('prepare-rollback', async ({ logger }) => {
        logger.info('Preparing rollback...');
      })
    ],
    execute: [
      task('execute-rollback', async ({ logger }) => {
        logger.info(`Restoring deployment ${targetDeployment.id}...`);
        // Add actual rollback logic
      })
    ],
    verify: [
      task('verify-rollback', async ({ logger }) => {
        logger.info('Verifying rollback...');
      })
    ]
  });
    
  await executeRecipe(rollbackRecipe, context);
}

async function waitForDeployment(context: any, vars: Record<string, any>) {
  const timeout = vars['timeout'] || 300000;
  const checkInterval = 5000;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    // Check deployment status
    const isReady = await checkDeploymentHealth(context, vars);
    
    if (isReady) {
      context.logger.info('Deployment is stable and healthy');
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  
  throw new Error('Deployment did not stabilize within timeout period');
}

async function checkDeploymentHealth(context: any, vars: Record<string, any>): Promise<boolean> {
  // Implement actual health check logic
  // This is a placeholder
  return true;
}
}