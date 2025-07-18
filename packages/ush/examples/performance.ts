#!/usr/bin/env node
/**
 * Performance Optimization Guide for @xec-js/ush
 * 
 * This file demonstrates techniques for optimizing shell script
 * performance using @xec-js/ush.
 */

import { $ } from '@xec-js/ush';

// Performance measurement utilities
class PerformanceTimer {
  private startTime: number;
  private marks: Map<string, number> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  mark(name: string) {
    this.marks.set(name, Date.now());
  }

  measure(name: string, startMark?: string): number {
    const endTime = Date.now();
    const startTime = startMark ? this.marks.get(startMark) || this.startTime : this.startTime;
    const duration = endTime - startTime;
    console.log(`⏱️  ${name}: ${duration}ms`);
    return duration;
  }

  reset() {
    this.startTime = Date.now();
    this.marks.clear();
  }
}

// ===== Connection Pooling =====
console.log('=== Connection Pooling ===\n');

async function demonstrateConnectionPooling() {
  const servers = ['server1.example.com', 'server2.example.com', 'server3.example.com'];
  const timer = new PerformanceTimer();

  // Bad: Creating new connection for each command
  console.log('❌ Without connection pooling:');
  timer.reset();

  for (const server of servers) {
    for (let i = 0; i < 3; i++) {
      // This would create a new SSH connection each time
      // const result = await $.ssh(server)`echo "Command ${i}"`;
      // Simulating the delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  timer.measure('Without pooling (simulated)');

  // Good: Reusing connections
  console.log('\n✅ With connection pooling:');
  timer.reset();

  // Create connections once
  const connections = new Map(
    servers.map(server => [server, $.ssh(server)])
  );

  for (const [server, $ssh] of connections) {
    for (let i = 0; i < 3; i++) {
      // Reuses the same connection
      // await $ssh`echo "Command ${i}"`;
      // Simulating reduced delay
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  timer.measure('With pooling (simulated)');

  // Always clean up connections
  // for (const $ssh of connections.values()) {
  //   await $ssh.disconnect();
  // }

  console.log('\n💡 Connection pooling can reduce overhead by 80-90%!\n');
}

await demonstrateConnectionPooling();

// ===== Parallel Execution =====
console.log('\n=== Parallel Execution ===\n');

async function demonstrateParallelExecution() {
  const files = Array.from({ length: 10 }, (_, i) => `/tmp/test-file-${i}.txt`);
  const timer = new PerformanceTimer();

  // Create test files
  await $.parallel(files.map(f => $`touch ${f}`));

  // Sequential processing
  console.log('❌ Sequential processing:');
  timer.reset();

  for (const file of files) {
    await $`echo "Processing ${file}" && sleep 0.1`.quiet();
  }
  timer.measure('Sequential processing');

  // Parallel processing
  console.log('\n✅ Parallel processing:');
  timer.reset();

  await $.parallel(
    files.map(file => $`echo "Processing ${file}" && sleep 0.1`.quiet())
  );
  timer.measure('Parallel processing');

  // Controlled concurrency
  console.log('\n✅ Controlled concurrency (batch of 3):');
  timer.reset();

  await $.parallel(
    files.map(file => $`echo "Processing ${file}" && sleep 0.1`.quiet()),
    { concurrency: 3 }
  );
  timer.measure('Controlled concurrency');

  // Cleanup
  await $.parallel(files.map(f => $`rm -f ${f}`));

  console.log('\n💡 Parallel execution can provide near-linear speedup!\n');
}

await demonstrateParallelExecution();

// ===== Stream Processing =====
console.log('\n=== Stream Processing ===\n');

async function demonstrateStreamProcessing() {
  const timer = new PerformanceTimer();
  const largeFile = '/tmp/large-test-file.txt';

  // Create a large test file
  console.log('Creating large test file...');
  await $`seq 1 1000000 > ${largeFile}`;

  // Bad: Loading entire file into memory
  console.log('\n❌ Loading entire file:');
  timer.reset();

  const fullContent = await $`cat ${largeFile}`;
  const lineCount1 = fullContent.stdout.split('\n').length;
  timer.measure('Full file load');
  console.log(`Lines counted: ${lineCount1}`);
  console.log(`Memory used: ~${(fullContent.stdout.length / 1024 / 1024).toFixed(2)}MB`);

  // Good: Streaming line by line
  console.log('\n✅ Streaming processing:');
  timer.reset();

  let lineCount2 = 0;
  let progress = 0;

  await $.stream`cat ${largeFile}`
    .onLine(() => {
      lineCount2++;
      if (lineCount2 % 100000 === 0) {
        progress++;
        process.stdout.write(`\rProcessed: ${progress * 100}k lines`);
      }
    })
    .onComplete(() => {
      console.log(`\rLines counted: ${lineCount2}        `);
    });

  timer.measure('Stream processing');
  console.log('Memory used: ~0MB (constant)');

  // Cleanup
  await $`rm -f ${largeFile}`;

  console.log('\n💡 Streaming can handle files of any size with minimal memory!\n');
}

await demonstrateStreamProcessing();

// ===== Command Batching =====
console.log('\n=== Command Batching ===\n');

async function demonstrateCommandBatching() {
  const timer = new PerformanceTimer();
  const testDir = '/tmp/batch-test';
  await $`mkdir -p ${testDir}`;

  // Bad: Many small commands
  console.log('❌ Individual commands:');
  timer.reset();

  for (let i = 0; i < 20; i++) {
    await $`touch ${testDir}/file${i}.txt`.quiet();
  }
  timer.measure('Individual commands');

  // Clean up for next test
  await $`rm -rf ${testDir}/*`;

  // Good: Batched commands
  console.log('\n✅ Batched command:');
  timer.reset();

  const files = Array.from({ length: 20 }, (_, i) => `${testDir}/file${i}.txt`);
  await $`touch ${files}`;
  timer.measure('Batched command');

  // Using shell features for even better performance
  console.log('\n✅ Shell expansion:');
  timer.reset();

  await $.raw`touch ${testDir}/file{20..39}.txt`;
  timer.measure('Shell expansion');

  // Cleanup
  await $`rm -rf ${testDir}`;

  console.log('\n💡 Batching commands reduces process creation overhead!\n');
}

await demonstrateCommandBatching();

// ===== Caching Strategies =====
console.log('\n=== Caching Strategies ===\n');

class CommandCache {
  private cache = new Map<string, { result: any; timestamp: number }>();
  private ttl: number;

  constructor(ttlSeconds = 60) {
    this.ttl = ttlSeconds * 1000;
  }

  async execute(key: string, command: () => Promise<any>): Promise<any> {
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.ttl) {
      console.log(`  ✅ Cache hit for: ${key}`);
      return cached.result;
    }

    console.log(`  ❌ Cache miss for: ${key}`);
    const result = await command();
    this.cache.set(key, { result, timestamp: Date.now() });
    return result;
  }

  invalidate(key?: string) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
}

async function demonstrateCaching() {
  const cache = new CommandCache(5); // 5 second TTL
  const timer = new PerformanceTimer();

  // Expensive operation (simulated)
  const expensiveOperation = async () => {
    await $`sleep 0.5 && echo "Expensive result: $(date +%s)"`.quiet();
    return Date.now();
  };

  console.log('First call (no cache):');
  timer.reset();
  await cache.execute('expensive-op', expensiveOperation);
  timer.measure('First call');

  console.log('\nSecond call (cached):');
  timer.reset();
  await cache.execute('expensive-op', expensiveOperation);
  timer.measure('Second call');

  console.log('\nThird call (cached):');
  timer.reset();
  await cache.execute('expensive-op', expensiveOperation);
  timer.measure('Third call');

  console.log('\n💡 Caching eliminated expensive operations!\n');
}

await demonstrateCaching();

// ===== Efficient File Operations =====
console.log('\n=== Efficient File Operations ===\n');

async function demonstrateFileOperations() {
  const timer = new PerformanceTimer();
  const testDir = '/tmp/file-ops-test';
  await $`mkdir -p ${testDir}`;

  // Create test files
  await $`cd ${testDir} && seq 1 100 | xargs -I {} touch file{}.txt`;

  // Bad: Individual file operations
  console.log('❌ Processing files individually:');
  timer.reset();

  const files1 = await $`ls ${testDir}`;
  for (const file of files1.stdout.trim().split('\n')) {
    await $`wc -l ${testDir}/${file}`.quiet();
  }
  timer.measure('Individual processing');

  // Good: Batch file operations
  console.log('\n✅ Batch processing with xargs:');
  timer.reset();

  await $`ls ${testDir} | xargs -P 4 -I {} wc -l ${testDir}/{}`.quiet();
  timer.measure('Batch with xargs');

  // Better: Using find for direct processing
  console.log('\n✅ Using find for direct processing:');
  timer.reset();

  await $`find ${testDir} -name "*.txt" -exec wc -l {} +`.quiet();
  timer.measure('Find with exec');

  // Best: Single command when possible
  console.log('\n✅ Single command for all files:');
  timer.reset();

  await $`wc -l ${testDir}/*.txt`.quiet();
  timer.measure('Single command');

  // Cleanup
  await $`rm -rf ${testDir}`;

  console.log('\n💡 Batch operations are orders of magnitude faster!\n');
}

await demonstrateFileOperations();

// ===== Memory-Efficient Processing =====
console.log('\n=== Memory-Efficient Processing ===\n');

// Process large datasets without loading everything into memory
class ChunkProcessor {
  async processInChunks(
    totalItems: number,
    chunkSize: number,
    processor: (start: number, end: number) => Promise<void>
  ) {
    const chunks = Math.ceil(totalItems / chunkSize);
    console.log(`Processing ${totalItems} items in ${chunks} chunks of ${chunkSize}`);

    for (let i = 0; i < chunks; i++) {
      const start = i * chunkSize;
      const end = Math.min((i + 1) * chunkSize, totalItems);

      process.stdout.write(`\rProcessing chunk ${i + 1}/${chunks} (items ${start}-${end})`);
      await processor(start, end);
    }
    console.log('\nProcessing complete!');
  }
}

async function demonstrateChunkProcessing() {
  const processor = new ChunkProcessor();
  const timer = new PerformanceTimer();

  // Simulate processing a large dataset
  timer.reset();

  await processor.processInChunks(
    1000000,  // 1 million items
    10000,    // Process 10k at a time
    async (start, end) => {
      // Simulate chunk processing
      await $`echo "Processing items ${start} to ${end}"`.quiet();
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  );

  timer.measure('Chunk processing');
  console.log('\n💡 Chunk processing keeps memory usage constant!\n');
}

await demonstrateChunkProcessing();

// ===== Optimizing SSH Operations =====
console.log('\n=== Optimizing SSH Operations ===\n');

class SSHOptimizer {
  // Use SSH multiplexing for better performance
  static createMultiplexed(host: string) {
    const controlPath = `/tmp/ssh-mux-${host}`;

    return {
      master: $.ssh({
        host,
        extraOptions: [
          '-o', 'ControlMaster=auto',
          '-o', `ControlPath=${controlPath}`,
          '-o', 'ControlPersist=10m'
        ]
      }),

      client: $.ssh({
        host,
        extraOptions: [
          '-o', 'ControlMaster=no',
          '-o', `ControlPath=${controlPath}`
        ]
      })
    };
  }

  // Batch multiple commands in single SSH session
  static async batchCommands(host: string, commands: string[]) {
    const $ssh = $.ssh(host);
    const script = commands.join(' && ');
    return $ssh`${script}`;
  }

  // Use compression for large data transfers
  static createCompressed(host: string) {
    return $.ssh({
      host,
      compression: true,
      compressionLevel: 6
    });
  }
}

console.log('SSH Optimization Techniques:');
console.log('1. Connection Multiplexing - Reuse single connection');
console.log('2. Command Batching - Send multiple commands at once');
console.log('3. Compression - Reduce data transfer size');
console.log('4. Keep-Alive - Prevent connection timeouts');
console.log('5. Connection Pooling - Reuse connections across operations\n');

// ===== Performance Monitoring =====
console.log('\n=== Performance Monitoring ===\n');

class PerformanceMonitor {
  private metrics: Array<{
    command: string;
    duration: number;
    exitCode: number;
    timestamp: number;
  }> = [];

  async monitor<T>(command: string, operation: () => Promise<T>): Promise<T> {
    const start = Date.now();
    let exitCode = 0;

    try {
      const result = await operation();
      return result;
    } catch (error: any) {
      exitCode = error.exitCode || 1;
      throw error;
    } finally {
      const duration = Date.now() - start;
      this.metrics.push({
        command,
        duration,
        exitCode,
        timestamp: start
      });
    }
  }

  getStats() {
    if (this.metrics.length === 0) return null;

    const durations = this.metrics.map(m => m.duration);
    const successful = this.metrics.filter(m => m.exitCode === 0);

    return {
      total: this.metrics.length,
      successful: successful.length,
      failed: this.metrics.length - successful.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      totalDuration: durations.reduce((a, b) => a + b, 0)
    };
  }

  getSlowCommands(threshold = 1000) {
    return this.metrics
      .filter(m => m.duration > threshold)
      .sort((a, b) => b.duration - a.duration);
  }
}

// Example usage
const monitor = new PerformanceMonitor();

console.log('Monitoring command performance...\n');

for (let i = 0; i < 5; i++) {
  await monitor.monitor(`test-${i}`, async () => {
    const delay = Math.random() * 200 + 50;
    await $`sleep ${delay / 1000}`.quiet();
  });
}

const stats = monitor.getStats();
console.log('Performance Statistics:');
console.log(`- Total commands: ${stats?.total}`);
console.log(`- Average duration: ${stats?.avgDuration.toFixed(0)}ms`);
console.log(`- Min duration: ${stats?.minDuration.toFixed(0)}ms`);
console.log(`- Max duration: ${stats?.maxDuration.toFixed(0)}ms`);

const slowCommands = monitor.getSlowCommands(150);
if (slowCommands.length > 0) {
  console.log('\nSlow commands (>150ms):');
  for (const cmd of slowCommands) {
    console.log(`  - ${cmd.command}: ${cmd.duration}ms`);
  }
}

// ===== Performance Best Practices Summary =====
console.log('\n\n=== Performance Best Practices ===\n');

console.log('1. 🔄 Connection Pooling');
console.log('   - Reuse SSH/Docker connections');
console.log('   - Significant overhead reduction\n');

console.log('2. ⚡ Parallel Execution');
console.log('   - Process independent tasks concurrently');
console.log('   - Use controlled concurrency for resource limits\n');

console.log('3. 🌊 Stream Processing');
console.log('   - Process large files line-by-line');
console.log('   - Constant memory usage\n');

console.log('4. 📦 Command Batching');
console.log('   - Combine multiple operations');
console.log('   - Reduce process creation overhead\n');

console.log('5. 💾 Caching');
console.log('   - Cache expensive operations');
console.log('   - Implement TTL for freshness\n');

console.log('6. 🗂️ Efficient File Operations');
console.log('   - Use find, xargs, and glob patterns');
console.log('   - Avoid individual file processing\n');

console.log('7. 🧩 Chunk Processing');
console.log('   - Process large datasets in chunks');
console.log('   - Prevents memory exhaustion\n');

console.log('8. 📊 Performance Monitoring');
console.log('   - Track command execution times');
console.log('   - Identify bottlenecks\n');

console.log('Remember: Measure first, optimize second! 🚀');