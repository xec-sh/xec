#!/usr/bin/env node
/**
 * Error Handling Patterns for @xec/ush
 * 
 * This file demonstrates comprehensive error handling strategies
 * for robust shell scripting with @xec/ush.
 */

import { $ } from '@xec/ush';

// ===== Understanding Error Types =====
console.log('=== Understanding Error Types ===\n');

// CommandError - The main error type
async function demonstrateCommandError() {
  console.log('1. CommandError - when a command fails:');
  
  try {
    await $`exit 42`;  // Non-zero exit code
  } catch (error: any) {
    console.log('\nCommandError properties:');
    console.log(`- name: ${error.name}`);
    console.log(`- message: ${error.message}`);
    console.log(`- command: ${error.command}`);
    console.log(`- exitCode: ${error.exitCode}`);
    console.log(`- stdout: ${JSON.stringify(error.stdout)}`);
    console.log(`- stderr: ${JSON.stringify(error.stderr)}`);
    console.log(`- duration: ${error.duration}ms`);
  }
}

await demonstrateCommandError();

// TimeoutError - When commands exceed time limit
async function demonstrateTimeoutError() {
  console.log('\n2. TimeoutError - when a command times out:');
  
  try {
    await $`sleep 5`.timeout(1000);  // 1 second timeout
  } catch (error: any) {
    console.log('\nTimeoutError properties:');
    console.log(`- name: ${error.name}`);
    console.log(`- message: ${error.message}`);
    console.log(`- timeout: ${error.timeout}ms`);
    console.log(`- killed: ${error.killed}`);
  }
}

await demonstrateTimeoutError();

// ConnectionError - SSH/Remote connection failures
console.log('\n3. ConnectionError - for SSH/remote connections');
console.log('(Shown in SSH examples)\n');

// ===== Basic Error Handling Patterns =====
console.log('\n=== Basic Error Handling Patterns ===\n');

// Pattern 1: Try-Catch
async function tryCatchPattern() {
  console.log('Pattern 1: Try-Catch Block');
  
  try {
    await $`cat /nonexistent/file.txt`;
  } catch (error: any) {
    console.log(`✓ Caught error: ${error.message}`);
    // Handle the error appropriately
    if (error.exitCode === 1) {
      console.log('  → File not found, creating default...');
      await $`echo "default content" > /tmp/file.txt`;
    }
  }
}

await tryCatchPattern();

// Pattern 2: Nothrow Mode
async function nothrowPattern() {
  console.log('\nPattern 2: Nothrow Mode');
  
  const result = await $`grep "pattern" /nonexistent/file.txt`.nothrow();
  
  if (result.exitCode === 0) {
    console.log('✓ Pattern found');
  } else if (result.exitCode === 1) {
    console.log('✓ Pattern not found (this is OK)');
  } else {
    console.log(`✗ Error occurred: ${result.stderr}`);
  }
}

await nothrowPattern();

// Pattern 3: Error Recovery
async function errorRecoveryPattern() {
  console.log('\nPattern 3: Error Recovery with Fallbacks');
  
  const readConfig = async () => {
    // Try primary location
    let result = await $`cat /etc/myapp/config.json`.nothrow();
    if (result.exitCode === 0) return result.stdout;
    
    // Try secondary location
    result = await $`cat ~/.myapp/config.json`.nothrow();
    if (result.exitCode === 0) return result.stdout;
    
    // Try current directory
    result = await $`cat ./config.json`.nothrow();
    if (result.exitCode === 0) return result.stdout;
    
    // Return default config
    return JSON.stringify({ defaultConfig: true });
  };
  
  const config = await readConfig();
  console.log('✓ Config loaded (using fallback chain)');
}

await errorRecoveryPattern();

// ===== Advanced Error Handling =====
console.log('\n\n=== Advanced Error Handling ===\n');

// Custom error handler with context
class ErrorHandler {
  private context: Map<string, any> = new Map();
  
  setContext(key: string, value: any) {
    this.context.set(key, value);
  }
  
  async execute<T>(
    operation: () => Promise<T>,
    options: {
      retries?: number;
      onError?: (error: any, attempt: number) => void;
      fallback?: () => Promise<T>;
    } = {}
  ): Promise<T> {
    const { retries = 0, onError, fallback } = options;
    let lastError: any;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Enhance error with context
        error.context = Object.fromEntries(this.context);
        error.attempt = attempt + 1;
        
        if (onError) {
          onError(error, attempt + 1);
        }
        
        // Log detailed error information
        console.error(`\nError on attempt ${attempt + 1}:`);
        console.error(`- Operation: ${this.context.get('operation')}`);
        console.error(`- Error: ${error.message}`);
        
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          console.log(`  → Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // Try fallback if all retries failed
    if (fallback) {
      console.log('  → Attempting fallback...');
      try {
        return await fallback();
      } catch (fallbackError: any) {
        console.error('  → Fallback also failed');
        throw lastError; // Throw original error
      }
    }
    
    throw lastError;
  }
}

// Example usage of advanced error handler
const handler = new ErrorHandler();
handler.setContext('operation', 'fetch-data');
handler.setContext('timestamp', new Date().toISOString());

await handler.execute(
  async () => {
    console.log('Attempting to fetch data...');
    await $`curl -f http://api.example.com/data`.quiet();
  },
  {
    retries: 2,
    onError: (error, attempt) => {
      console.log(`  Custom handler: Attempt ${attempt} failed`);
    },
    fallback: async () => {
      console.log('  Using cached data as fallback');
      return { cached: true, data: [] };
    }
  }
).catch(() => console.log('✓ Error handling demo complete'));

// ===== Error Aggregation =====
console.log('\n\n=== Error Aggregation ===\n');

// Collect errors from multiple operations
class ErrorCollector {
  private errors: Array<{ operation: string; error: any }> = [];
  
  async tryOperation(name: string, operation: () => Promise<any>) {
    try {
      await operation();
      console.log(`✓ ${name} succeeded`);
      return true;
    } catch (error) {
      console.log(`✗ ${name} failed`);
      this.errors.push({ operation: name, error });
      return false;
    }
  }
  
  hasErrors(): boolean {
    return this.errors.length > 0;
  }
  
  getErrors() {
    return this.errors;
  }
  
  getSummary(): string {
    if (this.errors.length === 0) return 'All operations succeeded';
    
    const summary = [`${this.errors.length} operation(s) failed:`];
    for (const { operation, error } of this.errors) {
      summary.push(`  - ${operation}: ${error.message}`);
    }
    return summary.join('\n');
  }
}

// Example: Run multiple operations and collect errors
const collector = new ErrorCollector();

await collector.tryOperation('Create directory', async () => {
  await $`mkdir /tmp/test-error-handling`;
});

await collector.tryOperation('Create file', async () => {
  await $`touch /tmp/test-error-handling/test.txt`;
});

await collector.tryOperation('Invalid operation', async () => {
  await $`false`;  // Always fails
});

await collector.tryOperation('Another invalid operation', async () => {
  await $`exit 1`;  // Also fails
});

console.log('\n' + collector.getSummary());

// Cleanup
await $`rm -rf /tmp/test-error-handling`.nothrow();

// ===== Error Transformation =====
console.log('\n\n=== Error Transformation ===\n');

// Transform low-level errors into domain-specific errors
class DomainError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

async function transformErrors() {
  const deployApp = async (appName: string) => {
    try {
      // Check if app exists
      await $`test -d /apps/${appName}`;
    } catch (error: any) {
      throw new DomainError(
        `Application '${appName}' not found`,
        'APP_NOT_FOUND',
        { appName, originalError: error.message }
      );
    }
    
    try {
      // Check if port is available
      await $`lsof -i :3000`.quiet();
      throw new Error('Port in use'); // Simulate failure
    } catch (error: any) {
      if (error.message.includes('Port in use')) {
        throw new DomainError(
          'Port 3000 is already in use',
          'PORT_UNAVAILABLE',
          { port: 3000, suggestion: 'Stop the existing service or use a different port' }
        );
      }
    }
    
    // Continue deployment...
  };
  
  try {
    await deployApp('myapp');
  } catch (error: any) {
    if (error instanceof DomainError) {
      console.log(`Domain Error: ${error.message}`);
      console.log(`Code: ${error.code}`);
      console.log(`Details:`, error.details);
    } else {
      console.log(`Unexpected error: ${error.message}`);
    }
  }
}

await transformErrors();

// ===== Graceful Degradation =====
console.log('\n\n=== Graceful Degradation ===\n');

// Build functionality that degrades gracefully
class GracefulService {
  private capabilities = {
    color: true,
    unicode: true,
    advanced: true
  };
  
  async checkCapabilities() {
    // Check if terminal supports colors
    const colorCheck = await $`tput colors`.nothrow();
    this.capabilities.color = colorCheck.exitCode === 0 && 
                             parseInt(colorCheck.stdout) > 8;
    
    // Check if unicode is supported
    const unicodeCheck = await $`locale | grep UTF`.nothrow();
    this.capabilities.unicode = unicodeCheck.exitCode === 0;
    
    // Check for advanced features
    const advancedCheck = await $.which('jq');
    this.capabilities.advanced = advancedCheck !== null;
    
    console.log('System capabilities:', this.capabilities);
  }
  
  format(message: string, type: 'success' | 'error' | 'info') {
    if (this.capabilities.color && this.capabilities.unicode) {
      // Full featured
      const symbols = { success: '✅', error: '❌', info: 'ℹ️' };
      const colors = { success: '\x1b[32m', error: '\x1b[31m', info: '\x1b[34m' };
      return `${symbols[type]} ${colors[type]}${message}\x1b[0m`;
    } else if (this.capabilities.color) {
      // Colors only
      const colors = { success: '\x1b[32m', error: '\x1b[31m', info: '\x1b[34m' };
      const prefixes = { success: '[OK]', error: '[ERROR]', info: '[INFO]' };
      return `${colors[type]}${prefixes[type]} ${message}\x1b[0m`;
    } else {
      // Plain text
      const prefixes = { success: '[OK]', error: '[ERROR]', info: '[INFO]' };
      return `${prefixes[type]} ${message}`;
    }
  }
  
  async parseJson(data: string) {
    if (this.capabilities.advanced) {
      // Use jq for pretty formatting
      const result = await $`echo ${data} | jq .`.nothrow();
      return result.exitCode === 0 ? result.stdout : data;
    } else {
      // Fallback to basic parsing
      try {
        return JSON.stringify(JSON.parse(data), null, 2);
      } catch {
        return data;
      }
    }
  }
}

const service = new GracefulService();
await service.checkCapabilities();

console.log(service.format('Operation successful', 'success'));
console.log(service.format('Operation failed', 'error'));
console.log(service.format('Information message', 'info'));

// ===== Error Recovery Strategies =====
console.log('\n\n=== Error Recovery Strategies ===\n');

// Different strategies for handling errors
class RecoveryStrategies {
  // Strategy 1: Retry with exponential backoff
  static async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error: any) {
        if (i === maxRetries - 1) throw error;
        
        const delay = baseDelay * Math.pow(2, i);
        console.log(`  Retry ${i + 1}/${maxRetries} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Should not reach here');
  }
  
  // Strategy 2: Circuit breaker pattern
  static createCircuitBreaker(threshold = 5, resetTime = 60000) {
    let failures = 0;
    let lastFailureTime = 0;
    let isOpen = false;
    
    return async function<T>(operation: () => Promise<T>): Promise<T> {
      // Check if circuit should be reset
      if (isOpen && Date.now() - lastFailureTime > resetTime) {
        console.log('  Circuit breaker: Attempting reset...');
        isOpen = false;
        failures = 0;
      }
      
      // If circuit is open, fail fast
      if (isOpen) {
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
      
      try {
        const result = await operation();
        failures = 0; // Reset on success
        return result;
      } catch (error) {
        failures++;
        lastFailureTime = Date.now();
        
        if (failures >= threshold) {
          isOpen = true;
          console.log(`  Circuit breaker: OPENED after ${failures} failures`);
        }
        
        throw error;
      }
    };
  }
  
  // Strategy 3: Bulkhead pattern (isolation)
  static createBulkhead(maxConcurrent = 3) {
    let active = 0;
    const queue: Array<() => void> = [];
    
    return async function<T>(operation: () => Promise<T>): Promise<T> {
      if (active >= maxConcurrent) {
        // Wait in queue
        await new Promise<void>(resolve => queue.push(resolve));
      }
      
      active++;
      try {
        return await operation();
      } finally {
        active--;
        const next = queue.shift();
        if (next) next();
      }
    };
  }
}

// Example: Retry with backoff
console.log('Testing retry with backoff:');
try {
  await RecoveryStrategies.retryWithBackoff(
    async () => {
      console.log('  Attempting operation...');
      await $`curl -f http://flaky-service.example.com`;
    },
    3,
    500
  );
} catch (error) {
  console.log('  All retries exhausted');
}

// Example: Circuit breaker
console.log('\nTesting circuit breaker:');
const breaker = RecoveryStrategies.createCircuitBreaker(3, 5000);

for (let i = 0; i < 5; i++) {
  try {
    await breaker(async () => {
      console.log(`  Attempt ${i + 1}`);
      await $`false`; // Always fails
    });
  } catch (error: any) {
    console.log(`  Failed: ${error.message}`);
  }
}

// ===== Cleanup and Resource Management =====
console.log('\n\n=== Cleanup on Error ===\n');

// Ensure cleanup happens even when errors occur
class ResourceManager {
  private cleanupTasks: Array<() => Promise<void>> = [];
  
  register(cleanup: () => Promise<void>) {
    this.cleanupTasks.push(cleanup);
  }
  
  async cleanup() {
    console.log('Running cleanup tasks...');
    const errors: Error[] = [];
    
    // Run all cleanup tasks, collecting any errors
    for (const task of this.cleanupTasks.reverse()) {
      try {
        await task();
      } catch (error: any) {
        errors.push(error);
      }
    }
    
    if (errors.length > 0) {
      console.error(`${errors.length} cleanup task(s) failed`);
    }
    
    this.cleanupTasks = [];
  }
  
  async withCleanup<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } finally {
      await this.cleanup();
    }
  }
}

// Example usage
const resources = new ResourceManager();

await resources.withCleanup(async () => {
  // Create temporary resources
  const tempFile = '/tmp/resource-test.txt';
  await $`touch ${tempFile}`;
  resources.register(async () => {
    console.log('  Cleaning up temp file...');
    await $`rm -f ${tempFile}`;
  });
  
  const tempDir = '/tmp/resource-test-dir';
  await $`mkdir -p ${tempDir}`;
  resources.register(async () => {
    console.log('  Cleaning up temp directory...');
    await $`rm -rf ${tempDir}`;
  });
  
  // Simulate an error
  throw new Error('Something went wrong!');
}).catch(error => {
  console.log(`✓ Error caught: ${error.message}`);
  console.log('✓ But cleanup was still performed!');
});

// ===== Summary =====
console.log('\n\n=== Error Handling Best Practices ===\n');
console.log('1. Always handle errors explicitly - use try/catch or .nothrow()');
console.log('2. Provide meaningful error messages with context');
console.log('3. Implement retry logic for transient failures');
console.log('4. Use circuit breakers for external dependencies');
console.log('5. Always clean up resources, even on error');
console.log('6. Transform low-level errors into domain-specific ones');
console.log('7. Implement graceful degradation for optional features');
console.log('8. Log errors with enough detail for debugging');
console.log('9. Consider error aggregation for batch operations');
console.log('10. Test error paths as thoroughly as success paths');
console.log('\nRemember: Errors are not failures, they\'re information! 🛠️');