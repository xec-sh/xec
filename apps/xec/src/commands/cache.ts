import path from 'path';
import chalk from 'chalk';
import { Command } from 'commander';
import * as clack from '@clack/prompts';

import { createUniversalLoader } from '../utils/universal-loader.js';
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
        const loader = createUniversalLoader({
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
        const loader = createUniversalLoader({
          cacheDir: options.cacheDir,
          verbose: false
        });

        const stats = await loader.getCacheStats();

        clack.log.info(chalk.cyan('Module Cache Statistics:'));
        console.log();
        console.log(`  ${chalk.bold('Entries:')} ${stats.entries}`);
        console.log(`  ${chalk.bold('Total Size:')} ${formatBytes(stats.size)}`);
        
        if (stats.oldestEntry) {
          console.log(`  ${chalk.bold('Oldest Entry:')} ${formatRelativeTime(stats.oldestEntry)}`);
        }
        
        if (stats.newestEntry) {
          console.log(`  ${chalk.bold('Newest Entry:')} ${formatRelativeTime(stats.newestEntry)}`);
        }
        
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
        const loader = createUniversalLoader({
          cacheDir: options.cacheDir,
          verbose: false
        });

        // Access private method through prototype (for demonstration)
        const cacheEntries = (loader as any).moduleCache;
        
        if (cacheEntries.size === 0) {
          clack.log.info('No cached modules found');
          return;
        }

        if (options.json) {
          const entries = Array.from(cacheEntries.entries() as IterableIterator<[string, any]>).map(([key, entry]) => ({
            key,
            url: entry.url,
            size: (entry.content?.length || 0) + (entry.transformed?.length || 0),
            timestamp: new Date(entry.timestamp).toISOString(),
            age: Date.now() - entry.timestamp
          }));
          console.log(JSON.stringify(entries, null, 2));
        } else {
          clack.log.info(chalk.cyan(`Cached Modules (${cacheEntries.size} entries):`));
          console.log();
          
          for (const [key, entry] of cacheEntries.entries()) {
            const size = (entry.content?.length || 0) + (entry.transformed?.length || 0);
            const age = formatRelativeTime(new Date(entry.timestamp));
            
            console.log(`  ${chalk.bold(entry.url)}`);
            console.log(`    ${chalk.dim('Size:')} ${formatBytes(size)}`);
            console.log(`    ${chalk.dim('Cached:')} ${age}`);
            console.log(`    ${chalk.dim('Key:')} ${key.substring(0, 16)}...`);
            console.log();
          }
        }
      } catch (error) {
        clack.log.error(chalk.red(`Failed to list cache: ${error}`));
        process.exit(1);
      }
    });

  cache
    .command('preload <modules...>')
    .description('Preload modules into cache')
    .option('--cache-dir <dir>', 'Custom cache directory')
    .option('--cdn <cdn>', 'Preferred CDN (jsr, esm.sh, unpkg, skypack, jsdelivr)', 'jsr')
    .action(async (modules, options) => {
      const s = clack.spinner();
      s.start(`Preloading ${modules.length} module(s)...`);

      try {
        const loader = createUniversalLoader({
          cacheDir: options.cacheDir,
          preferredCDN: options.cdn,
          verbose: false
        });

        let loaded = 0;
        let failed = 0;

        for (const module of modules) {
          try {
            s.message(`Loading ${module}...`);
            // Use loadScript to trigger caching
            await loader.loadScript(module).catch(() => 
              // If it fails as a script, try as a module URL
               (loader as any).fetchModule(module)
            );
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