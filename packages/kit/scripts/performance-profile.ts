#!/usr/bin/env node
/**
 * Performance profiling script for @xec-sh/kit
 * 
 * Measures and reports performance metrics for:
 * - Stream handler operations
 * - Render cycles
 * - Memory usage
 * - Prompt lifecycle transitions
 */

import { performance } from 'perf_hooks';
import { TextPrompt, SelectPrompt, MultiSelectPrompt } from '../src/index.js';
import { StreamHandler } from '../src/core/stream-handler.js';
import { ReactivePrompt } from '../src/core/reactive/reactive-prompt.js';

interface PerformanceMetrics {
  operation: string;
  duration: number;
  memory: {
    before: number;
    after: number;
    delta: number;
  };
}

class PerformanceProfiler {
  private metrics: PerformanceMetrics[] = [];

  async measure<T>(
    operation: string, 
    fn: () => Promise<T> | T
  ): Promise<T> {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const memBefore = process.memoryUsage().heapUsed;
    const startTime = performance.now();
    
    const result = await fn();
    
    const endTime = performance.now();
    const memAfter = process.memoryUsage().heapUsed;
    
    this.metrics.push({
      operation,
      duration: endTime - startTime,
      memory: {
        before: memBefore,
        after: memAfter,
        delta: memAfter - memBefore
      }
    });
    
    return result;
  }

  report(): void {
    console.log('\n📊 Performance Report\n');
    console.log('═'.repeat(80));
    
    // Duration metrics
    console.log('\n⏱️  Operation Timing:\n');
    console.log('Operation'.padEnd(40) + 'Duration (ms)'.padEnd(20) + 'Memory Δ (MB)');
    console.log('─'.repeat(80));
    
    for (const metric of this.metrics) {
      const memDeltaMB = (metric.memory.delta / 1024 / 1024).toFixed(2);
      console.log(
        metric.operation.padEnd(40) +
        metric.duration.toFixed(3).padEnd(20) +
        memDeltaMB
      );
    }
    
    // Summary statistics
    const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    const avgDuration = totalDuration / this.metrics.length;
    const totalMemory = this.metrics.reduce((sum, m) => sum + m.memory.delta, 0);
    
    console.log('─'.repeat(80));
    console.log(
      'TOTAL'.padEnd(40) +
      totalDuration.toFixed(3).padEnd(20) +
      (totalMemory / 1024 / 1024).toFixed(2)
    );
    console.log(
      'AVERAGE'.padEnd(40) +
      avgDuration.toFixed(3).padEnd(20) +
      (totalMemory / this.metrics.length / 1024 / 1024).toFixed(2)
    );
    
    console.log('\n═'.repeat(80));
  }
}

async function profileStreamHandler(profiler: PerformanceProfiler) {
  console.log('\n🔄 Profiling StreamHandler...\n');
  
  // Test exclusive stream
  await profiler.measure('Create exclusive StreamHandler', () => {
    return new StreamHandler();
  });
  
  // Test shared stream
  const sharedStream = await profiler.measure('Create shared StreamHandler', () => {
    return new StreamHandler({ shared: true });
  });
  
  // Test acquire/release
  await profiler.measure('Acquire shared stream (x100)', () => {
    for (let i = 0; i < 100; i++) {
      sharedStream.acquire();
    }
  });
  
  await profiler.measure('Release shared stream (x100)', () => {
    for (let i = 0; i < 100; i++) {
      sharedStream.release();
    }
  });
  
  // Test start/stop cycles
  const exclusiveStream = new StreamHandler();
  await profiler.measure('Start/stop exclusive stream (x10)', () => {
    for (let i = 0; i < 10; i++) {
      exclusiveStream.start();
      exclusiveStream.stop();
    }
  });
}

async function profilePromptLifecycle(profiler: PerformanceProfiler) {
  console.log('\n🎯 Profiling Prompt Lifecycle...\n');
  
  // Profile prompt creation
  const prompt = await profiler.measure('Create TextPrompt', () => {
    return new TextPrompt({ message: 'Test prompt' });
  });
  
  // Profile initialization
  await profiler.measure('Initialize prompt (renderOnly)', async () => {
    await prompt.renderOnly();
  });
  
  // Profile multiple renders
  await profiler.measure('Render prompt (x100)', async () => {
    for (let i = 0; i < 100; i++) {
      await prompt.renderOnly();
    }
  });
  
  // Profile input handling
  await profiler.measure('Handle input (x100)', async () => {
    for (let i = 0; i < 100; i++) {
      await prompt.handleInputOnly({
        sequence: 'a',
        name: 'a',
        ctrl: false,
        meta: false,
        shift: false
      });
    }
  });
  
  // Profile getValue
  await profiler.measure('Get value (x1000)', () => {
    for (let i = 0; i < 1000; i++) {
      prompt.getValue();
    }
  });
}

async function profileSharedPrompts(profiler: PerformanceProfiler) {
  console.log('\n🔗 Profiling Shared Stream Prompts...\n');
  
  const sharedStream = new StreamHandler({ shared: true });
  
  // Create multiple prompts with shared stream
  const prompts = await profiler.measure('Create 10 prompts with shared stream', () => {
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(new TextPrompt({
        message: `Prompt ${i}`,
        stream: sharedStream
      }));
    }
    return results;
  });
  
  // Render all prompts
  await profiler.measure('Render 10 shared prompts', async () => {
    for (const prompt of prompts) {
      await prompt.renderOnly();
    }
  });
  
  // Handle input on all prompts
  await profiler.measure('Handle input on 10 shared prompts', async () => {
    for (const prompt of prompts) {
      await prompt.handleInputOnly({
        sequence: 'test',
        name: 'test',
        ctrl: false,
        meta: false,
        shift: false
      });
    }
  });
}

async function profileReactivePrompt(profiler: PerformanceProfiler) {
  console.log('\n⚡ Profiling ReactivePrompt...\n');
  
  // Create reactive prompt
  const reactive = await profiler.measure('Create ReactivePrompt', () => {
    return new ReactivePrompt({
      initialValues: {
        field1: '',
        field2: '',
        field3: 0,
        field4: false,
        field5: []
      },
      prompts: (state) => [
        {
          id: 'field1',
          type: 'text',
          message: 'Field 1'
        },
        {
          id: 'field2',
          type: 'text',
          message: 'Field 2',
          when: () => state.get('field1') !== ''
        },
        {
          id: 'field3',
          type: 'number',
          message: 'Field 3'
        },
        {
          id: 'field4',
          type: 'confirm',
          message: 'Field 4'
        },
        {
          id: 'field5',
          type: 'multiselect',
          message: 'Field 5',
          options: ['A', 'B', 'C', 'D', 'E']
        }
      ]
    });
  });
  
  // Profile state updates
  await profiler.measure('Update reactive state (x100)', () => {
    const state = (reactive as any).state;
    for (let i = 0; i < 100; i++) {
      state.set('field1', `value${i}`);
    }
  });
  
  // Profile prompt re-evaluation
  await profiler.measure('Re-evaluate prompts (x50)', () => {
    const state = (reactive as any).state;
    for (let i = 0; i < 50; i++) {
      (reactive as any).evaluatePrompts();
    }
  });
}

async function profileMemoryLeaks(profiler: PerformanceProfiler) {
  console.log('\n💾 Profiling Memory Management...\n');
  
  // Test prompt creation/disposal cycles
  await profiler.measure('Create/dispose 100 prompts', async () => {
    for (let i = 0; i < 100; i++) {
      const prompt = new TextPrompt({ message: `Prompt ${i}` });
      await prompt.renderOnly();
      // Prompt should be garbage collected after this scope
    }
  });
  
  // Test shared stream with many acquisitions
  await profiler.measure('Shared stream lifecycle (1000 acquire/release)', () => {
    const stream = new StreamHandler({ shared: true });
    for (let i = 0; i < 1000; i++) {
      stream.acquire();
      stream.release();
    }
  });
  
  // Force garbage collection and measure final memory
  if (global.gc) {
    global.gc();
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function main() {
  console.log('🚀 @xec-sh/kit Performance Profiler');
  console.log('====================================\n');
  
  const profiler = new PerformanceProfiler();
  
  try {
    await profileStreamHandler(profiler);
    await profilePromptLifecycle(profiler);
    await profileSharedPrompts(profiler);
    await profileReactivePrompt(profiler);
    await profileMemoryLeaks(profiler);
    
    profiler.report();
    
    // Memory usage summary
    const memUsage = process.memoryUsage();
    console.log('\n💾 Final Memory Usage:\n');
    console.log(`  RSS:        ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Heap Used:  ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  External:   ${(memUsage.external / 1024 / 1024).toFixed(2)} MB`);
    
  } catch (error) {
    console.error('❌ Profiling error:', error);
    process.exit(1);
  }
}

// Run with --expose-gc flag for accurate memory measurements
if (!global.gc) {
  console.log('⚠️  Warning: Run with --expose-gc flag for accurate memory measurements');
  console.log('   node --expose-gc scripts/performance-profile.js\n');
}

main();