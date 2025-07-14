import path from 'path';
import chalk from 'chalk';
import { Command } from 'commander';
import * as clack from '@clack/prompts';
import { Recipe, executeRecipe, loadStandardLibrary } from '@xec/core';

export default function (program: Command) {
  program
    .command('run <recipe>')
    .description('Run a recipe')
    .option('-v, --vars <json>', 'Variables in JSON format', '{}')
    .option('--var <key=value>', 'Set variable (can be used multiple times)', (value, previous: string[]) => previous.concat([value]), [])
    .option('-d, --dry-run', 'Perform a dry run without making changes')
    .option('-f, --file <path>', 'Recipe file to load')
    .option('--verbose', 'Enable verbose output')
    .action(async (recipeName, options) => {
      const spinner = clack.spinner();

      try {
        spinner.start(`Loading recipe: ${recipeName}`);

        // Load standard library
        await loadStandardLibrary();

        // Parse variables
        let vars = {};
        try {
          vars = JSON.parse(options.vars);
        } catch (error) {
          spinner.stop(`Invalid JSON in --vars option`);
          clack.log.error('Invalid JSON in --vars option');
          process.exit(1);
        }

        // Merge with individual --var options
        if (options.var && options.var.length > 0) {
          for (const varStr of options.var) {
            const [key, ...valueParts] = varStr.split('=');
            const value = valueParts.join('=');
            try {
              (vars as any)[key] = JSON.parse(value);
            } catch {
              (vars as any)[key] = value;
            }
          }
        }

        // Load recipe
        let recipeInstance: Recipe | undefined;

        if (options.file) {
          // Load from file
          const filePath = path.resolve(options.file);
          const module = await import(filePath);
          recipeInstance = module[recipeName] || module.default;

          if (!recipeInstance) {
            spinner.stop(`Recipe '${recipeName}' not found`);
            clack.log.error(`Recipe '${recipeName}' not found in ${options.file}`);
            process.exit(1);
          }
        } else {
          // Try to load from common locations
          const possiblePaths = [
            `./recipes/${recipeName}.js`,
            `./recipes/${recipeName}/index.js`,
            `./${recipeName}.recipe.js`,
            `./.xec/recipes/${recipeName}.js`,
            `./.xec/recipes/${recipeName}/index.js`
          ];

          let loaded = false;
          for (const recipePath of possiblePaths) {
            try {
              const fullPath = path.resolve(recipePath);
              const module = await import(fullPath);
              recipeInstance = module[recipeName] || module.default;
              if (recipeInstance) {
                loaded = true;
                break;
              }
            } catch {
              // Continue to next path
            }
          }

          if (!loaded || !recipeInstance) {
            spinner.stop(`Recipe '${recipeName}' not found`);
            clack.log.error(`Recipe '${recipeName}' not found`);
            process.exit(1);
          }
        }

        spinner.stop(`Recipe loaded: ${recipeName}`);

        // Execute recipe
        if (options.dryRun) {
          clack.log.info('Running in dry-run mode');
        }

        const execSpinner = clack.spinner();
        execSpinner.start(`Executing recipe: ${recipeName}`);

        const result = await executeRecipe(recipeInstance!, {
          vars,
          dryRun: options.dryRun,
          verbose: options.verbose || program.opts()['verbose']
        });

        if (result.success) {
          execSpinner.stop(`Recipe completed: ${recipeName}`);
          clack.log.success(`Recipe '${recipeName}' completed successfully`);
          clack.log.info(`Duration: ${result.duration}ms`);

          const taskResults = (result as any).taskResults || result.results;
          if ((options.verbose || program.opts()['verbose']) && taskResults) {
            console.log(chalk.dim('\nTask Results:'));
            console.log(JSON.stringify(taskResults, null, 2));
          }
        } else {
          const error = (result as any).error;
          const errorMessage = error?.message ||
            (result.errors.size > 0 ? Array.from(result.errors.values())[0]?.message || 'Unknown error' : 'Unknown error');
          execSpinner.stop(`Recipe failed: ${recipeName}`);
          clack.log.error(`Recipe '${recipeName}' failed: ${errorMessage}`);
          process.exit(1);
        }
      } catch (error) {
        spinner.stop('Error');
        clack.log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}