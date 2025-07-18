#!/usr/bin/env node
/**
 * Common Patterns for @xec/ush
 * 
 * This file demonstrates idiomatic usage patterns and best practices
 * for common scenarios you'll encounter when using @xec/ush.
 */

import { $ } from '@xec/ush';

// ===== Pattern 1: Configuration Management =====
console.log('=== Configuration Management Patterns ===\n');

// Create environment-specific configurations
const environments = {
  development: $.env({ NODE_ENV: 'development', DEBUG: 'true' })
    .cd('./dev')
    .timeout(30000),
    
  staging: $.env({ NODE_ENV: 'staging', DEBUG: 'false' })
    .cd('./staging')
    .timeout(60000),
    
  production: $.env({ NODE_ENV: 'production', DEBUG: 'false' })
    .cd('./prod')
    .timeout(120000)
    .quiet()  // Suppress output in production
};

// Use based on current environment
async function runInEnvironment(env: keyof typeof environments) {
  const $ = environments[env];
  console.log(`Running in ${env} environment:`);
  await $`echo "Environment: $NODE_ENV, Debug: $DEBUG"`;
}

// ===== Pattern 2: Safe Command Building =====
console.log('\n=== Safe Command Building ===\n');

// Building commands with user input
class CommandBuilder {
  private args: string[] = [];
  private flags: Record<string, string | boolean> = {};
  
  addArg(arg: string): this {
    this.args.push(arg);
    return this;
  }
  
  addFlag(flag: string, value?: string | boolean): this {
    this.flags[flag] = value ?? true;
    return this;
  }
  
  build(command: string): string[] {
    const parts = [command];
    
    // Add flags
    for (const [flag, value] of Object.entries(this.flags)) {
      if (value === true) {
        parts.push(`--${flag}`);
      } else if (value !== false) {
        parts.push(`--${flag}=${value}`);
      }
    }
    
    // Add arguments
    parts.push(...this.args);
    
    return parts;
  }
}

// Example usage
async function safeGrep(pattern: string, files: string[], options: {
  ignoreCase?: boolean;
  lineNumbers?: boolean;
  recursive?: boolean;
} = {}) {
  const builder = new CommandBuilder();
  
  if (options.ignoreCase) builder.addFlag('ignore-case');
  if (options.lineNumbers) builder.addFlag('line-number');
  if (options.recursive) builder.addFlag('recursive');
  
  const command = builder.build('grep');
  await $`${command} ${pattern} ${files}`;
}

// ===== Pattern 3: Resource Cleanup =====
console.log('\n=== Resource Cleanup Patterns ===\n');

// Ensure cleanup happens even on error
async function withTempResource<T>(
  setup: () => Promise<string>,
  use: (resource: string) => Promise<T>,
  cleanup: (resource: string) => Promise<void>
): Promise<T> {
  const resource = await setup();
  try {
    return await use(resource);
  } finally {
    await cleanup(resource).catch(err => 
      console.error('Cleanup failed:', err)
    );
  }
}

// Example: Working with temporary files
async function processWithTempFile() {
  return withTempResource(
    // Setup
    async () => {
      const tempFile = `/tmp/process-${Date.now()}.tmp`;
      await $`touch ${tempFile}`;
      return tempFile;
    },
    // Use
    async (tempFile) => {
      await $`echo "Processing data..." > ${tempFile}`;
      const result = await $`cat ${tempFile}`;
      return result.stdout;
    },
    // Cleanup
    async (tempFile) => {
      await $`rm -f ${tempFile}`;
    }
  );
}

// ===== Pattern 4: Retry with Backoff =====
console.log('\n=== Retry Patterns ===\n');

// Custom retry logic for specific scenarios
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
    shouldRetry?: (error: any, attempt: number) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2,
    shouldRetry = () => true
  } = options;
  
  let lastError: any;
  let delay = initialDelay;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * factor, maxDelay);
    }
  }
  
  throw lastError;
}

// Example: Retry network operations
async function fetchWithRetry(url: string) {
  return retryWithBackoff(
    () => $`curl -f ${url}`,
    {
      maxAttempts: 5,
      shouldRetry: (error) => 
        // Only retry on network errors
         error.stderr?.includes('Could not resolve host') ||
               error.stderr?.includes('Connection refused')
      
    }
  );
}

// ===== Pattern 5: Parallel Operations =====
console.log('\n=== Parallel Execution Patterns ===\n');

// Process items in batches
async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 5
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(item => processor(item))
    );
    results.push(...batchResults);
    
    // Progress indicator
    const progress = Math.min(i + batchSize, items.length);
    console.log(`Processed ${progress}/${items.length} items`);
  }
  
  return results;
}

// Example: Process multiple files in parallel
async function optimizeImages(imagePaths: string[]) {
  return processBatch(
    imagePaths,
    async (image) => {
      const output = image.replace(/\.(jpg|png)$/, '-optimized.$1');
      await $`convert ${image} -quality 85 -strip ${output}`;
      return output;
    },
    3  // Process 3 images at a time
  );
}

// ===== Pattern 6: Command Pipelines =====
console.log('\n=== Pipeline Patterns ===\n');

// Build complex pipelines safely
class Pipeline {
  private steps: Array<() => Promise<any>> = [];
  
  add(step: () => Promise<any>): this {
    this.steps.push(step);
    return this;
  }
  
  addIf(condition: boolean, step: () => Promise<any>): this {
    if (condition) {
      this.steps.push(step);
    }
    return this;
  }
  
  async execute(): Promise<void> {
    for (const [index, step] of this.steps.entries()) {
      console.log(`Executing step ${index + 1}/${this.steps.length}`);
      await step();
    }
  }
}

// Example: Conditional deployment pipeline
async function deployApplication(options: {
  runTests?: boolean;
  buildDocs?: boolean;
  deployToStaging?: boolean;
  deployToProduction?: boolean;
}) {
  const pipeline = new Pipeline()
    .add(async () => {
      console.log('Installing dependencies...');
      await $`npm ci`;
    })
    .addIf(options.runTests ?? true, async () => {
      console.log('Running tests...');
      await $`npm test`;
    })
    .add(async () => {
      console.log('Building application...');
      await $`npm run build`;
    })
    .addIf(options.buildDocs ?? false, async () => {
      console.log('Building documentation...');
      await $`npm run docs:build`;
    })
    .addIf(options.deployToStaging ?? false, async () => {
      console.log('Deploying to staging...');
      await $`npm run deploy:staging`;
    })
    .addIf(options.deployToProduction ?? false, async () => {
      console.log('Deploying to production...');
      await $`npm run deploy:production`;
    });
  
  await pipeline.execute();
}

// ===== Pattern 7: Output Processing =====
console.log('\n=== Output Processing Patterns ===\n');

// Parse structured output
async function parseJsonOutput<T>(command: string): Promise<T> {
  const result = await $`${command}`;
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Failed to parse JSON output: ${error}`);
  }
}

// Process output line by line
async function* readLines(command: string): AsyncGenerator<string> {
  const result = await $`${command}`;
  const lines = result.stdout.split('\n').filter(line => line.trim());
  for (const line of lines) {
    yield line;
  }
}

// Example: Process log file
async function analyzeLogFile(logPath: string) {
  const stats = {
    total: 0,
    errors: 0,
    warnings: 0,
    info: 0
  };
  
  for await (const line of readLines(`cat ${logPath}`)) {
    stats.total++;
    if (line.includes('ERROR')) stats.errors++;
    else if (line.includes('WARN')) stats.warnings++;
    else if (line.includes('INFO')) stats.info++;
  }
  
  return stats;
}

// ===== Pattern 8: Cross-Environment Execution =====
console.log('\n=== Cross-Environment Patterns ===\n');

// Abstract environment differences
interface ExecutionContext {
  execute(command: string): Promise<any>;
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
}

class LocalContext implements ExecutionContext {
  async execute(command: string) {
    return $`${command}`;
  }
  
  async exists(path: string) {
    const result = await $`test -e ${path}`.nothrow();
    return result.exitCode === 0;
  }
  
  async readFile(path: string) {
    const result = await $`cat ${path}`;
    return result.stdout;
  }
  
  async writeFile(path: string, content: string) {
    await $`echo ${content} > ${path}`;
  }
}

class SSHContext implements ExecutionContext {
  constructor(private $ssh: typeof $) {}
  
  async execute(command: string) {
    return this.$ssh`${command}`;
  }
  
  async exists(path: string) {
    const result = await this.$ssh`test -e ${path}`.nothrow();
    return result.exitCode === 0;
  }
  
  async readFile(path: string) {
    const result = await this.$ssh`cat ${path}`;
    return result.stdout;
  }
  
  async writeFile(path: string, content: string) {
    await this.$ssh`echo ${content} > ${path}`;
  }
}

// Use the abstraction
async function deployToContext(ctx: ExecutionContext, appPath: string) {
  // Check if app directory exists
  if (!await ctx.exists(appPath)) {
    throw new Error(`Application path ${appPath} does not exist`);
  }
  
  // Read version
  const version = await ctx.readFile(`${appPath}/version.txt`);
  console.log(`Deploying version: ${version.trim()}`);
  
  // Run deployment
  await ctx.execute(`cd ${appPath} && ./deploy.sh`);
}

// ===== Pattern 9: Error Context =====
console.log('\n=== Error Context Patterns ===\n');

// Enhance errors with context
class CommandContext {
  private context: Record<string, any> = {};
  
  add(key: string, value: any): this {
    this.context[key] = value;
    return this;
  }
  
  async execute(command: string): Promise<any> {
    try {
      return await $`${command}`;
    } catch (error: any) {
      // Enhance error with context
      error.context = this.context;
      error.contextString = Object.entries(this.context)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      throw error;
    }
  }
}

// Example usage
async function deployService(serviceName: string, version: string) {
  const ctx = new CommandContext()
    .add('service', serviceName)
    .add('version', version)
    .add('timestamp', new Date().toISOString());
  
  try {
    await ctx.execute(`deploy-service ${serviceName} ${version}`);
  } catch (error: any) {
    console.error(`Deployment failed: ${error.message}`);
    console.error(`Context: ${error.contextString}`);
    throw error;
  }
}

// ===== Pattern 10: Monitoring and Progress =====
console.log('\n=== Monitoring Patterns ===\n');

// Progress tracking for long operations
class ProgressTracker {
  private startTime = Date.now();
  private lastUpdate = Date.now();
  
  constructor(
    private total: number,
    private updateInterval: number = 1000
  ) {}
  
  update(current: number, message?: string) {
    const now = Date.now();
    if (now - this.lastUpdate < this.updateInterval && current < this.total) {
      return;
    }
    
    this.lastUpdate = now;
    const elapsed = (now - this.startTime) / 1000;
    const progress = (current / this.total) * 100;
    const rate = current / elapsed;
    const remaining = (this.total - current) / rate;
    
    process.stdout.write(`\r[${progress.toFixed(1)}%] ${current}/${this.total} `);
    process.stdout.write(`(${rate.toFixed(1)}/s, ~${remaining.toFixed(0)}s remaining)`);
    if (message) process.stdout.write(` - ${message}`);
    
    if (current >= this.total) {
      process.stdout.write('\n');
    }
  }
}

// Example: Process large dataset with progress
async function processLargeDataset(items: string[]) {
  const tracker = new ProgressTracker(items.length);
  const results = [];
  
  for (const [index, item] of items.entries()) {
    const result = await $`process-item ${item}`.quiet();
    results.push(result);
    tracker.update(index + 1, `Processing ${item}`);
  }
  
  return results;
}

// ===== Demo execution =====
async function runDemo() {
  console.log('Common Patterns Demo\n');
  console.log('This file demonstrates patterns - check the source code!');
  console.log('\nSome patterns you\'ll find here:');
  console.log('- Configuration management');
  console.log('- Safe command building');
  console.log('- Resource cleanup');
  console.log('- Retry with backoff');
  console.log('- Parallel execution');
  console.log('- Command pipelines');
  console.log('- Output processing');
  console.log('- Cross-environment execution');
  console.log('- Error context enhancement');
  console.log('- Progress tracking');
  console.log('\nExplore the source code to learn these patterns!');
}

if (require.main === module) {
  runDemo().catch(console.error);
}