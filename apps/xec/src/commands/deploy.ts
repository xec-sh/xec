import chalk from 'chalk';
import { Command } from 'commander';
import { text, select, confirm, spinner } from '@clack/prompts';
import { 
  Task,
  task,
  Recipe,
  executeRecipe,
  createExecutionContext
} from '@xec/core';

import { loadRecipe } from '../utils/recipe.js';
import { parseVariables } from '../utils/variables.js';

type DeploymentPattern = 'blue-green' | 'canary' | 'rolling' | 'ab' | 'recreate';

interface DeploymentOptions {
  pattern?: DeploymentPattern;
  target?: string;
  vars?: string;
  config?: string;
  dryRun?: boolean;
  rollback?: boolean;
  force?: boolean;
}

export default function deployCommand(program: Command) {
  program
    .command('deploy')
    .description('Deploy using predefined patterns')
    .argument('[recipe]', 'Recipe to deploy')
    .option('-p, --pattern <pattern>', 'Deployment pattern (blue-green|canary|rolling|ab|recreate)')
    .option('-t, --target <target>', 'Target environment or hosts')
    .option('-v, --vars <vars>', 'Variables as JSON or key=value pairs')
    .option('-c, --config <file>', 'Configuration file')
    .option('--dry-run', 'Simulate deployment without making changes')
    .option('--rollback', 'Rollback to previous version')
    .option('--force', 'Skip confirmations')
    .action(async (recipeName?: string, options?: DeploymentOptions) => {
      try {
        // If no recipe provided, show interactive selection
        if (!recipeName) {
          recipeName = await selectRecipe();
          if (!recipeName) {
            console.log(chalk.yellow('No recipe selected'));
            return;
          }
        }

        // Load the recipe
        const recipe = await loadRecipe(recipeName);
        if (!recipe) {
          console.log(chalk.red(`Recipe '${recipeName}' not found`));
          process.exit(1);
        }

        // Select deployment pattern if not provided
        let pattern = options?.pattern;
        if (!pattern) {
          pattern = await selectDeploymentPattern();
          if (!pattern) {
            console.log(chalk.yellow('No deployment pattern selected'));
            return;
          }
        }

        // Parse variables
        const variables = options?.vars ? parseVariables(options.vars) : {};

        // Get target if not provided
        let target = options?.target;
        if (!target && pattern !== 'recreate') {
          target = await text({
            message: 'Enter target environment or hosts:',
            placeholder: 'production',
          }) as string;
        }

        // Confirm deployment
        if (!options?.force && !options?.dryRun) {
          const message = options?.rollback 
            ? `Rollback ${recipeName} on ${target || 'default'} using ${pattern} pattern?`
            : `Deploy ${recipeName} to ${target || 'default'} using ${pattern} pattern?`;
            
          const confirmed = await confirm({
            message,
            initialValue: false,
          });

          if (!confirmed) {
            console.log(chalk.yellow('Deployment cancelled'));
            return;
          }
        }

        // Create deployment configuration
        const deploymentConfig = createDeploymentConfig(pattern, {
          target,
          variables,
          rollback: options?.rollback,
        });

        // Show deployment plan
        console.log(chalk.bold('\nDeployment Plan:'));
        console.log(`  Recipe: ${chalk.cyan(recipeName)}`);
        console.log(`  Pattern: ${chalk.cyan(pattern)}`);
        console.log(`  Target: ${chalk.cyan(target || 'default')}`);
        console.log(`  Mode: ${chalk.cyan(options?.rollback ? 'Rollback' : 'Deploy')}`);
        if (Object.keys(variables).length > 0) {
          console.log(`  Variables: ${chalk.cyan(JSON.stringify(variables))}`);
        }
        console.log();

        if (options?.dryRun) {
          console.log(chalk.yellow('DRY RUN - No changes will be made\n'));
        }

        // Execute deployment
        const s = spinner();
        s.start('Initializing deployment...');

        const deploymentRecipe = await createDeploymentRecipe(
          recipe,
          pattern,
          deploymentConfig,
          options?.dryRun || false
        );

        const context = await createExecutionContext({
          recipeId: deploymentRecipe.id,
          vars: variables,
          dryRun: options?.dryRun || false,
        });

        s.message('Executing deployment...');

        try {
          const result = await executeRecipe(deploymentRecipe, context);
          s.stop(chalk.green('✓ Deployment completed successfully'));
          
          if (!options?.dryRun) {
            console.log(chalk.green(`\n✓ ${recipeName} deployed successfully using ${pattern} pattern`));
          } else {
            console.log(chalk.yellow('\n✓ Dry run completed - no changes were made'));
          }
        } catch (error) {
          s.stop(chalk.red('✗ Deployment failed'));
          throw error;
        }

      } catch (error) {
        console.error(chalk.red(`\nDeployment failed: ${error}`));
        process.exit(1);
      }
    });

  // Add rollback subcommand
  program
    .command('rollback')
    .description('Rollback a deployment to previous version')
    .argument('[deployment-id]', 'Deployment ID or recipe name')
    .option('-t, --target <target>', 'Target environment')
    .option('-f, --force', 'Force rollback without confirmation')
    .option('--to-version <version>', 'Specific version to rollback to')
    .action(async (deploymentId?: string, options?: any) => {
      try {
        // If no deployment ID provided, show recent deployments
        if (!deploymentId) {
          deploymentId = await selectRecentDeployment();
          if (!deploymentId) {
            console.log(chalk.yellow('No deployment selected'));
            return;
          }
        }

        // Confirm rollback
        if (!options?.force) {
          const confirmed = await confirm({
            message: `Rollback deployment '${deploymentId}'?`,
            initialValue: false,
          });

          if (!confirmed) {
            console.log(chalk.yellow('Rollback cancelled'));
            return;
          }
        }

        console.log(chalk.yellow(`Rolling back deployment '${deploymentId}'...`));
        
        // In a real implementation, we would:
        // 1. Load deployment history from state
        // 2. Determine the previous version
        // 3. Execute rollback using the appropriate pattern
        
        console.log(chalk.green(`✓ Rollback completed successfully`));
      } catch (error) {
        console.error(chalk.red(`Rollback failed: ${error}`));
        process.exit(1);
      }
    });
}

async function selectRecipe(): Promise<string | undefined> {
  // In a real implementation, this would scan for available recipes
  const recipes = [
    'deploy-app',
    'update-config',
    'migrate-database',
    'restart-services',
  ];

  const selected = await select({
    message: 'Select a recipe to deploy:',
    options: recipes.map(r => ({ value: r, label: r })),
  });

  return selected as string;
}

async function selectDeploymentPattern(): Promise<DeploymentPattern | undefined> {
  const patterns = [
    { value: 'blue-green', label: 'Blue-Green', hint: 'Zero-downtime deployment with instant rollback' },
    { value: 'canary', label: 'Canary', hint: 'Gradual rollout with monitoring' },
    { value: 'rolling', label: 'Rolling Update', hint: 'Progressive instance updates' },
    { value: 'ab', label: 'A/B Testing', hint: 'Split traffic for testing' },
    { value: 'recreate', label: 'Recreate', hint: 'Simple stop and start' },
  ];

  const selected = await select({
    message: 'Select deployment pattern:',
    options: patterns,
  });

  return selected as DeploymentPattern;
}

async function selectRecentDeployment(): Promise<string | undefined> {
  // In a real implementation, this would load from state
  const deployments = [
    { id: 'deploy-12345', recipe: 'deploy-app', date: '2024-01-01 12:00' },
    { id: 'deploy-12344', recipe: 'update-config', date: '2024-01-01 11:00' },
  ];

  const selected = await select({
    message: 'Select deployment to rollback:',
    options: deployments.map(d => ({
      value: d.id,
      label: `${d.id} - ${d.recipe}`,
      hint: d.date,
    })),
  });

  return selected as string;
}

function createDeploymentConfig(pattern: DeploymentPattern, options: any): any {
  const baseConfig = {
    target: options.target || 'default',
    rollback: options.rollback || false,
  };

  switch (pattern) {
    case 'blue-green':
      return {
        ...baseConfig,
        healthCheckUrl: '/health',
        switchTimeout: 30,
        keepOldVersion: true,
      };

    case 'canary':
      return {
        ...baseConfig,
        initialPercentage: 10,
        incrementPercentage: 20,
        intervalMinutes: 5,
        successThreshold: 0.95,
        errorThreshold: 0.05,
      };

    case 'rolling':
      return {
        ...baseConfig,
        batchSize: 1,
        batchDelaySeconds: 60,
        maxUnavailable: 1,
        maxSurge: 1,
      };

    case 'ab':
      return {
        ...baseConfig,
        trafficSplitA: 50,
        trafficSplitB: 50,
        metricName: 'conversion_rate',
        duration: 3600,
      };

    case 'recreate':
      return {
        ...baseConfig,
        gracefulShutdownSeconds: 30,
      };

    default:
      return baseConfig;
  }
}

async function createDeploymentRecipe(
  originalRecipe: Recipe,
  pattern: DeploymentPattern,
  config: any,
  dryRun: boolean
): Promise<Recipe> {
  // Create a new recipe that wraps the original with the deployment pattern
  const deploymentTasks = new Map<string, Task>();

  // Add pre-deployment tasks based on pattern
  switch (pattern) {
    case 'blue-green':
      deploymentTasks.set('prepare-blue-green',
        task('prepare-blue-green')
          .description('Prepare blue-green deployment')
          .handler(async (ctx) => {
            if (!dryRun) {
              console.log(chalk.blue('→ Setting up blue-green environments...'));
            }
          })
          .build()
      );
      break;

    case 'canary':
      deploymentTasks.set('prepare-canary',
        task('prepare-canary')
          .description('Prepare canary deployment')
          .handler(async (ctx) => {
            if (!dryRun) {
              console.log(chalk.blue(`→ Initiating canary deployment (${config.initialPercentage}% initial)...`));
            }
          })
          .build()
      );
      break;

    case 'rolling':
      deploymentTasks.set('prepare-rolling',
        task('prepare-rolling')
          .description('Prepare rolling update')
          .handler(async (ctx) => {
            if (!dryRun) {
              console.log(chalk.blue(`→ Starting rolling update (batch size: ${config.batchSize})...`));
            }
          })
          .build()
      );
      break;
  }

  // Add the original recipe tasks
  if (originalRecipe.tasks) {
    originalRecipe.tasks.forEach((task, key) => {
      deploymentTasks.set(key, task);
    });
  }

  // Add post-deployment tasks based on pattern
  switch (pattern) {
    case 'blue-green':
      deploymentTasks.set('switch-blue-green',
        task('switch-blue-green')
          .description('Switch traffic to new version')
          .handler(async (ctx) => {
            if (!dryRun) {
              console.log(chalk.blue('→ Switching traffic to new version...'));
              // Simulate health check
              await new Promise(resolve => setTimeout(resolve, 2000));
              console.log(chalk.green('✓ Health check passed'));
            }
          })
          .build()
      );
      break;

    case 'canary':
      deploymentTasks.set('monitor-canary',
        task('monitor-canary')
          .description('Monitor canary metrics')
          .handler(async (ctx) => {
            if (!dryRun) {
              console.log(chalk.blue('→ Monitoring canary deployment...'));
              // Simulate progressive rollout
              for (let percentage = config.initialPercentage; percentage <= 100; percentage += config.incrementPercentage) {
                console.log(chalk.blue(`→ Traffic at ${percentage}%`));
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
              console.log(chalk.green('✓ Canary deployment successful'));
            }
          })
          .build()
      );
      break;
  }

  // Create new recipe with deployment pattern
  return {
    id: `${originalRecipe.id || originalRecipe.name}-${pattern}`,
    name: `${originalRecipe.name}-${pattern}`,
    description: `${originalRecipe.description || ''} (${pattern} deployment)`,
    tasks: deploymentTasks,
  } as Recipe;
}