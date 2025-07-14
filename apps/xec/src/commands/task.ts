import chalk from 'chalk';
import { Command } from 'commander';
import * as clack from '@clack/prompts';
import { recipe, executeRecipe, stdlibModules, loadStandardLibrary } from '@xec/core';

export default function (program: Command) {
  program
    .command('task <task>')
    .description('Run a single task from the standard library')
    .option('-v, --vars <json>', 'Variables in JSON format', '{}')
    .option('-m, --module <name>', 'Module to load task from')
    .option('--list', 'List available tasks')
    .option('--json', 'Output as JSON')
    .action(async (taskName, options) => {
      try {
        // Load standard library
        await loadStandardLibrary();

        // List tasks if requested
        if (options.list || taskName === 'list') {
          listTasks(options.json);
          return;
        }

        const spinner = clack.spinner();
        spinner.start(`Looking for task: ${taskName}`);

        // Find task
        let taskInstance = null;
        let foundModule: string | null = null;

        if (options.module) {
          // Look in specific module
          const module = (stdlibModules as any)[options.module];
          if (!module) {
            spinner.stop(`Module not found: ${options.module}`);
            clack.log.error(`Module '${options.module}' not found`);
            clack.log.info('Run "xec task list" to see available modules and tasks');
            process.exit(1);
          }
          if (module.exports.tasks && (module.exports.tasks as Record<string, any>)[taskName]) {
            taskInstance = (module.exports.tasks as Record<string, any>)[taskName];
            foundModule = options.module;
          }
        } else {
          // Search all modules
          for (const [moduleName, module] of Object.entries(stdlibModules)) {
            if (module.exports.tasks && (module.exports.tasks as Record<string, any>)[taskName]) {
              taskInstance = (module.exports.tasks as Record<string, any>)[taskName];
              foundModule = moduleName;
              break;
            }
          }
        }

        if (!taskInstance) {
          spinner.stop(`Task not found: ${taskName}`);
          clack.log.error(`Task '${taskName}' not found`);
          clack.log.info('Run "xec task list" to see available tasks');
          process.exit(1);
        }

        spinner.stop(`Found task in module: ${foundModule}`);

        // Create a simple recipe with just this task
        const tempRecipe = recipe(`temp-${taskName}`)
          .task(taskInstance)
          .build();

        // Parse variables
        let vars = {};
        try {
          vars = JSON.parse(options.vars);
        } catch (error) {
          clack.log.error('Invalid JSON in --vars option');
          process.exit(1);
        }

        // Execute
        const execSpinner = clack.spinner();
        execSpinner.start(`Executing task: ${taskName}`);

        const result = await executeRecipe(tempRecipe, {
          vars,
          dryRun: false,
          verbose: program.opts()['verbose']
        });

        if (result.success) {
          execSpinner.stop(`Task completed: ${taskName}`);
          clack.log.success(`Task '${taskName}' completed successfully`);

          const results = (result as any).taskResults || result.results;
          if (results && results.size > 0) {
            const taskResult = Array.from(results.values())[0];
            if (options.json) {
              console.log(JSON.stringify(taskResult, null, 2));
            } else {
              console.log(chalk.dim('\nResult:'));
              console.log(JSON.stringify(taskResult, null, 2));
            }
          }
        } else {
          execSpinner.stop(`Task failed: ${taskName}`);
          const error = (result as any).error;
          const errorMessage = error?.message || 'Unknown error';
          clack.log.error(`Task '${taskName}' failed: ${errorMessage}`);
          process.exit(1);
        }
      } catch (error) {
        clack.log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

function listTasks(json: boolean) {
  const tasks: Array<{
    module: string;
    task: string;
    description?: string;
  }> = [];

  for (const [moduleName, module] of Object.entries(stdlibModules)) {
    if (module.exports.tasks) {
      for (const [taskName, task] of Object.entries(module.exports.tasks as Record<string, any>)) {
        tasks.push({
          module: moduleName,
          task: taskName,
          description: task.description
        });
      }
    }
  }

  if (json) {
    console.log(JSON.stringify(tasks, null, 2));
  } else {
    if (tasks.length === 0) {
      clack.log.info('No tasks found in standard library');
    } else {
      clack.log.info(chalk.bold(`Available tasks from standard library:\n`));

      // Group by module
      const moduleGroups = tasks.reduce((acc, task) => {
        if (!acc[task.module]) {
          acc[task.module] = [];
        }
        acc[task.module]!.push(task);
        return acc;
      }, {} as Record<string, typeof tasks>);

      for (const [module, moduleTasks] of Object.entries(moduleGroups)) {
        console.log(chalk.bold(`${module}:`));
        for (const task of moduleTasks) {
          console.log(`  ${chalk.green('●')} ${chalk.bold(task.task)}`);
          if (task.description) {
            console.log(`    ${chalk.dim(task.description)}`);
          }
        }
        console.log();
      }

      console.log(chalk.dim('Run a task with: xec task <task-name>'));
      console.log(chalk.dim('Run from specific module: xec task <task-name> -m <module>'));
    }
  }
}