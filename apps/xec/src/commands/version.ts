import path from 'path';
import chalk from 'chalk';
import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import * as clack from '@clack/prompts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

export default function (program: Command) {
  // Version is already handled by Commander's .version() in cli.ts
  // This adds a more detailed version command

  program
    .command('version')
    .alias('v')
    .description('Show detailed version information')
    .action(async () => {
      try {
        // Get CLI package info
        const cliPkg = require(path.join(__dirname, '../../package.json'));

        console.log(chalk.bold('\nXec:'));

        // cli version
        console.log(`${chalk.blue('cli:')}  ${cliPkg.version}`);

        // Try to get core version
        try {
          const fs = await import('fs');
          const corePath = path.dirname(require.resolve('@xec-sh/core'));
          const corePkgPath = path.join(corePath, '../package.json');
          const corePkg = JSON.parse(await fs.promises.readFile(corePkgPath, 'utf-8'));
          console.log(`${chalk.blue('core:')}  ${corePkg.version}`);
        } catch {
          console.log(`${chalk.blue('ush:')}  not installed`);
        }

        // System info
        console.log(chalk.bold('\nSystem:'));
        console.log(`${chalk.blue('node.js:')}  ${process.version}`);
        console.log(`${chalk.blue('platform:')} ${process.platform} ${process.arch}`);

        // Project info if in a project
        try {
          const projectConfig = require(path.join(process.cwd(), '.xec/config.json'));
          console.log(chalk.bold('\nProject:\n'));
          console.log(`${chalk.blue('Project:')}         ${projectConfig.name}`);
          console.log(`${chalk.blue('Version:')}         ${projectConfig.version}`);
          console.log(`${chalk.blue('Template:')}        ${projectConfig.template}`);
          if (projectConfig.features && projectConfig.features.length > 0) {
            console.log(`${chalk.blue('Features:')}        ${projectConfig.features.join(', ')}`);
          }
        } catch {
          // Not in an Xec project
        }

        console.log();

      } catch (error) {
        clack.log.error('Failed to retrieve version information');
        if (process.env['XEC_DEBUG']) {
          console.error(error);
        }
      }
    });
}