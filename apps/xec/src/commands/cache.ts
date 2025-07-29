import path from 'path';
import chalk from 'chalk';
import { Command } from 'commander';
import * as clack from '@clack/prompts';

import { getModuleLoader } from '../utils/unified-module-loader.js';
import { formatBytes, formatRelativeTime } from '../utils/formatters.js';

export default function (program: Command) {
  const cache = program
    .command('cache')
    .description('Manage module cache');

  cache
    .command('clear')
    .description('Clear all cached modules')
    .option('--cache-dir <dir>', 'Custom cache directory')
    .action(async (options) => {
      const s = clack.spinner();
      s.start('Clearing module cache...');

      try {
        const loader = getModuleLoader({
          cacheDir: options.cacheDir,
          verbose: false
        });

        await loader.clearCache();
        s.stop('Module cache cleared successfully');
        clack.log.success(chalk.green('✔') + ' Cache cleared');
      } catch (error) {
        s.stop('Failed to clear cache');
        clack.log.error(chalk.red(`Failed to clear cache: ${error}`));
        process.exit(1);
      }
    });

  cache
    .command('stats')
    .alias('status')
    .description('Show cache statistics')
    .option('--cache-dir <dir>', 'Custom cache directory')
    .action(async (options) => {
      try {
        const loader = getModuleLoader({
          cacheDir: options.cacheDir,
          verbose: false
        });

        const stats = await loader.getCacheStats();

        clack.log.info(chalk.cyan('Module Cache Statistics:'));
        console.log();
        console.log(`  ${chalk.bold('Memory Entries:')} ${stats.memoryEntries}`);
        console.log(`  ${chalk.bold('File Entries:')} ${stats.fileEntries}`);
        console.log(`  ${chalk.bold('Total Size:')} ${formatBytes(stats.totalSize)}`);
        
        
        console.log();
        console.log(`  ${chalk.dim('Cache Dir:')} ${options.cacheDir || path.join(process.env['HOME'] || '', '.xec', 'module-cache')}`);
      } catch (error) {
        clack.log.error(chalk.red(`Failed to get cache stats: ${error}`));
        process.exit(1);
      }
    });

  cache
    .command('list')
    .alias('ls')
    .description('List cached modules')
    .option('--cache-dir <dir>', 'Custom cache directory')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const loader = getModuleLoader({
          cacheDir: options.cacheDir,
          verbose: false
        });

        const stats = await loader.getCacheStats();
        
        clack.log.info(chalk.cyan(`Module Cache Summary:`));
        console.log();
        console.log(`  ${chalk.bold('Memory Entries:')} ${stats.memoryEntries}`);
        console.log(`  ${chalk.bold('File Entries:')} ${stats.fileEntries}`);
        console.log(`  ${chalk.bold('Total Size:')} ${formatBytes(stats.totalSize)}`);
        console.log();
        console.log(`  ${chalk.dim('Use "xec cache stats" for more details')}`);
      } catch (error) {
        clack.log.error(chalk.red(`Failed to list cache: ${error}`));
        process.exit(1);
      }
    });

  cache
    .command('preload <modules...>')
    .description('Preload modules into cache')
    .option('--cache-dir <dir>', 'Custom cache directory')
    .option('--cdn <cdn>', 'Preferred CDN (esm.sh, jsr.io)', 'esm.sh')
    .action(async (modules, options) => {
      const s = clack.spinner();
      s.start(`Preloading ${modules.length} module(s)...`);

      try {
        const loader = getModuleLoader({
          cacheDir: options.cacheDir,
          preferredCDN: options.cdn as 'esm.sh' | 'jsr.io',
          verbose: false
        });

        // Initialize module context
        await (globalThis as any).__xecModuleContext || await loader.init();

        let loaded = 0;
        let failed = 0;

        for (const module of modules) {
          try {
            s.message(`Loading ${module}...`);
            // Try to import through module context
            await (globalThis as any).__xecModuleContext.importNPM(module);
            loaded++;
          } catch (error) {
            failed++;
            clack.log.warn(`Failed to load ${module}: ${error}`);
          }
        }

        s.stop(`Preloaded ${loaded} module(s)`);
        
        if (loaded > 0) {
          clack.log.success(`${chalk.green('✔')} Successfully cached ${loaded} module(s)`);
        }
        
        if (failed > 0) {
          clack.log.warn(`${chalk.yellow('⚠')} Failed to cache ${failed} module(s)`);
        }
      } catch (error) {
        s.stop('Preload failed');
        clack.log.error(chalk.red(`Failed to preload modules: ${error}`));
        process.exit(1);
      }
    });
}