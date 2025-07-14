import path from 'path';
import chalk from 'chalk';
import { glob } from 'glob';
import { Command } from 'commander';
import * as clack from '@clack/prompts';

export default function (program: Command) {
  program
    .command('list')
    .alias('ls')
    .description('List available recipes')
    .option('-f, --file <path>', 'Recipe file to scan')
    .option('-d, --dir <path>', 'Directory to scan for recipes', './recipes')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const recipes: Array<{
        name: string;
        file: string;
        description?: string;
        location: 'project' | 'xec';
      }> = [];

      try {
        if (options.file) {
          // List from specific file
          const filePath = path.resolve(options.file);
          const module = await import(filePath);
          for (const [key, value] of Object.entries(module)) {
            if (value && typeof value === 'object' && 'tasks' in value) {
              recipes.push({
                name: key,
                file: options.file,
                description: (value as any).description,
                location: 'project'
              });
            }
          }
        } else {
          // Scan directories
          const searchDirs = [
            { path: options.dir, location: 'project' as const },
            { path: './.xec/recipes', location: 'xec' as const }
          ];

          for (const { path: searchDir, location } of searchDirs) {
            const pattern = path.join(searchDir, '**/*.{js,ts,mjs}');
            const files = await glob(pattern, { ignore: ['node_modules/**'] });

            for (const file of files) {
              try {
                const fullPath = path.resolve(file);
                const module = await import(fullPath);
                for (const [key, value] of Object.entries(module)) {
                  if (value && typeof value === 'object' && 'tasks' in value) {
                    recipes.push({
                      name: key,
                      file,
                      description: (value as any).description,
                      location
                    });
                  }
                }
              } catch {
                // Skip files that can't be imported
              }
            }
          }
        }

        // Output results
        if (options.json) {
          console.log(JSON.stringify(recipes, null, 2));
        } else {
          if (recipes.length === 0) {
            clack.log.info('No recipes found');
            clack.log.info(chalk.dim('Try creating a recipe in ./recipes or ./.xec/recipes'));
          } else {
            clack.log.info(chalk.bold(`Found ${recipes.length} recipe(s):\n`));

            // Group by location
            const projectRecipes = recipes.filter(r => r.location === 'project');
            const xecRecipes = recipes.filter(r => r.location === 'xec');

            if (projectRecipes.length > 0) {
              console.log(chalk.bold('Project Recipes:'));
              for (const recipe of projectRecipes) {
                console.log(`  ${chalk.green('●')} ${chalk.bold(recipe.name)}`);
                if (recipe.description) {
                  console.log(`    ${chalk.dim(recipe.description)}`);
                }
                console.log(`    ${chalk.dim(`File: ${recipe.file}`)}\n`);
              }
            }

            if (xecRecipes.length > 0) {
              console.log(chalk.bold('.xec Recipes:'));
              for (const recipe of xecRecipes) {
                console.log(`  ${chalk.blue('●')} ${chalk.bold(recipe.name)}`);
                if (recipe.description) {
                  console.log(`    ${chalk.dim(recipe.description)}`);
                }
                console.log(`    ${chalk.dim(`File: ${recipe.file}`)}\n`);
              }
            }
          }
        }
      } catch (error) {
        clack.log.error(error instanceof Error ? error.message : 'Failed to list recipes');
        process.exit(1);
      }
    });
}