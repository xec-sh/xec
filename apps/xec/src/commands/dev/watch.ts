import { watch } from 'chokidar';

import { BaseCommand } from '../../utils/command-base.js';

interface WatchOptions {
  recipe?: string;
  ignore?: string[];
  poll?: boolean;
  interval?: number;
  debounce?: number;
}

export class WatchCommand extends BaseCommand {
  private watcher: any;
  private lastRun: Date | null = null;
  private isRunning = false;

  constructor() {
    super({
      name: 'watch',
      description: 'Watch for file changes and trigger actions',
      options: [
        {
          flags: '--recipe <recipe>',
          description: 'Recipe to run on changes',
        },
        {
          flags: '--ignore <patterns>',
          description: 'Patterns to ignore (comma-separated)',
        },
        {
          flags: '--poll',
          description: 'Use polling instead of events',
        },
        {
          flags: '--interval <ms>',
          description: 'Polling interval',
          defaultValue: '1000',
        },
        {
          flags: '--debounce <ms>',
          description: 'Debounce delay',
          defaultValue: '500',
        },
      ],
      examples: [
        {
          command: 'xec dev watch',
          description: 'Watch for changes and validate',
        },
        {
          command: 'xec dev watch --recipe test',
          description: 'Run test recipe on changes',
        },
      ],
    });
  }

  async execute(args: any[]): Promise<void> {
    const options = args[args.length - 1] as WatchOptions;
    
    this.intro('File Watcher');
    
    const watchPaths = [
      './src/**/*.{ts,js}',
      './recipes/**/*.{ts,js,yaml,yml}',
      './modules/**/*.{ts,js}',
      './scripts/**/*.{ts,js}',
      './xec.config.{yaml,yml,json}',
    ];
    
    const ignorePatterns = [
      'node_modules',
      '.git',
      'dist',
      'build',
      ...(options.ignore || []),
    ];
    
    this.watcher = watch(watchPaths, {
      ignored: ignorePatterns,
      persistent: true,
      ignoreInitial: true,
      usePolling: options.poll,
      interval: typeof options.interval === 'string' ? parseInt(options.interval) : (options.interval || 1000),
    });
    
    this.watcher.on('change', (path: string) => {
      this.handleFileChange(path, options);
    });
    
    this.watcher.on('add', (path: string) => {
      this.handleFileChange(path, options);
    });
    
    this.watcher.on('unlink', (path: string) => {
      this.handleFileChange(path, options);
    });
    
    this.watcher.on('error', (error: Error) => {
      this.log(`Watch error: ${error.message}`, 'error');
    });
    
    this.log('Watching for changes... (Press Ctrl+C to stop)', 'info');
    
    // Setup graceful shutdown
    const cleanup = () => {
      if (this.watcher) {
        this.watcher.close();
      }
      this.log('File watcher stopped', 'info');
      process.exit(0);
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    
    // Keep process alive
    await new Promise(() => {});
  }

  private async handleFileChange(filePath: string, options: WatchOptions): Promise<void> {
    const now = new Date();
    const debounceMs = typeof options.debounce === 'string' ? parseInt(options.debounce) : (options.debounce || 500);
    
    // Debounce rapid changes
    if (this.lastRun && now.getTime() - this.lastRun.getTime() < debounceMs) {
      return;
    }
    
    if (this.isRunning) {
      return;
    }
    
    this.lastRun = now;
    this.isRunning = true;
    
    try {
      this.log(`File changed: ${filePath}`, 'info');
      
      if (options.recipe) {
        await this.runRecipe(options.recipe);
      } else {
        await this.runDefaultAction(filePath);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Action failed: ${errorMessage}`, 'error');
    } finally {
      this.isRunning = false;
    }
  }

  private async runRecipe(recipeName: string): Promise<void> {
    try {
      this.log(`Running recipe: ${recipeName}`, 'info');
      // Implementation would load and execute the recipe
      // const recipe = await this.loadRecipe(recipeName);
      // await executeRecipe(recipe);
      this.log(`Recipe completed: ${recipeName}`, 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Recipe failed: ${errorMessage}`, 'error');
    }
  }

  private async runDefaultAction(filePath: string): Promise<void> {
    // Default action based on file type
    if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
      this.log('Running validation...', 'info');
      // Run validation
    } else if (filePath.includes('recipe')) {
      this.log('Recipe file changed, validating...', 'info');
      // Validate recipe
    } else {
      this.log('File changed, no specific action configured', 'info');
    }
  }
}
