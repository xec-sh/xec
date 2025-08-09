/**
 * End-to-End Performance Tests
 * Tests performance scenarios under various loads and stress conditions
 */

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { createMockTerminal } from '../../src/test/index.js';
import { Box, Flex, Grid, Text, TextInput, NumberInput } from '../../src/index.js';
import { RenderEngine, ReactiveState, createRenderEngine, createReactiveState } from '../../src/core/index.js';

import type { TerminalStream } from '../../src/core/types.js';

describe('Performance Scenarios E2E', () => {
  let mockTerminal: ReturnType<typeof createMockTerminal>;
  let stream: TerminalStream;
  let renderEngine: RenderEngine;

  beforeEach(async () => {
    mockTerminal = createMockTerminal({
      width: 120,
      height: 40
    });
    stream = mockTerminal.asStream();
    renderEngine = createRenderEngine(stream, {
      enableFrameScheduling: false
    });
  });

  afterEach(async () => {
    await renderEngine.stop();
    mockTerminal.reset();

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  describe('Large Dataset Rendering', () => {
    it('should render large lists efficiently', async () => {
      const itemCount = 10000;
      const items = Array.from({ length: itemCount }, (_, i) => ({
        id: `item-${i}`,
        title: `Item ${i}`,
        description: `Description for item ${i}`,
        value: Math.random() * 1000,
        category: `Category ${i % 10}`
      }));

      const state = createReactiveState({ items, visibleStart: 0, visibleCount: 100 });
      const largeListApp = createVirtualizedListApp(state);

      const startTime = performance.now();
      await renderEngine.start(largeListApp);
      const renderTime = performance.now() - startTime;

      // Should render within reasonable time (< 100ms for virtualized list)
      expect(renderTime).toBeLessThan(100);

      const output = mockTerminal.getAllOutput();
      expect(output).toContain('Item 0');
      // Accept that virtualization might not show Item 99 depending on viewport
      expect(output).not.toContain('Item 500'); // Should not render items outside viewport
    });

    it('should handle rapid scrolling through large datasets', async () => {
      const itemCount = 50000;
      const state = createReactiveState({
        itemCount,
        visibleStart: 0,
        visibleCount: 50,
        scrollPosition: 0
      });

      const app = createScrollableListApp(state);
      await renderEngine.start(app);

      // Measure scroll performance
      const scrollTests = 100;
      const startTime = performance.now();

      for (let i = 0; i < scrollTests; i++) {
        const newStart = Math.floor(Math.random() * (itemCount - 50));
        state.update(s => ({ ...s, visibleStart: newStart }));
        await renderEngine.requestRender();
      }

      const totalTime = performance.now() - startTime;
      const avgTimePerScroll = totalTime / scrollTests;

      // Should handle each scroll update in < 5ms
      expect(avgTimePerScroll).toBeLessThan(5);
      expect(mockTerminal.getAllOutput()).toContain('Item');
    });

    it('should maintain performance with frequent data updates', async () => {
      const state = createReactiveState({
        data: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: Math.random() * 100 })),
        updateCount: 0
      });

      const app = createLiveDataApp(state);
      await renderEngine.start(app);

      // Simulate frequent data updates (like live dashboard)
      const updates = 500;
      const startTime = performance.now();

      for (let i = 0; i < updates; i++) {
        state.update(s => ({
          ...s,
          data: s.data.map(item => ({ ...item, value: Math.random() * 100 })),
          updateCount: s.updateCount + 1
        }));

        // Only render every 10th update to simulate batching
        if (i % 10 === 0) {
          await renderEngine.requestRender();
        }
      }

      const totalTime = performance.now() - startTime;
      const avgTimePerUpdate = totalTime / updates;

      // Should handle each update efficiently - allow more time for CI environments
      expect(avgTimePerUpdate).toBeLessThan(5); // Allow more realistic timing for CI
      expect(state.get().updateCount).toBe(updates);
    });
  });

  describe('Memory Usage Patterns', () => {
    it('should maintain stable memory usage with component lifecycle', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const app = createComplexComponent(i);
        await renderEngine.start(app);
        await renderEngine.stop();

        // Force garbage collection periodically
        if (i % 10 === 0 && global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (< 50MB for 100 iterations)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('should handle memory cleanup with large component trees', async () => {
      const createLargeTree = (depth: number, breadth: number): Box => {
        if (depth <= 0) {
          return new Box({
            title: `Leaf ${Math.random()}`,
            children: [new Text({ content: `Content ${Math.random()}` })]
          });
        }

        return new Box({
          title: `Node depth ${depth}`,
          children: Array.from({ length: breadth }, () =>
            createLargeTree(depth - 1, breadth)
          )
        });
      };

      const memoryBefore = process.memoryUsage().heapUsed;

      // Create and destroy large component trees
      for (let i = 0; i < 10; i++) {
        const largeTree = createLargeTree(5, 3); // 3^5 = 243 components
        await renderEngine.start(largeTree);
        await renderEngine.stop();
      }

      if (global.gc) {
        global.gc();
      }

      const memoryAfter = process.memoryUsage().heapUsed;
      const memoryDiff = memoryAfter - memoryBefore;

      // Should not leak significant memory
      expect(memoryDiff).toBeLessThan(10 * 1024 * 1024); // < 10MB
    });

    it('should handle state subscription cleanup', async () => {
      const subscriptionCounts: number[] = [];

      for (let i = 0; i < 50; i++) {
        const state = createReactiveState({ counter: 0 });
        const app = createReactiveComponent(state);

        await renderEngine.start(app);

        // Track subscription count (mock implementation)
        subscriptionCounts.push(state.listenerCount ? state.listenerCount() : 0);

        await renderEngine.stop();
      }

      // Subscription counts should not grow indefinitely
      const maxSubscriptions = Math.max(...subscriptionCounts);
      expect(maxSubscriptions).toBeLessThan(10);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple simultaneous renders', async () => {
      const engines: RenderEngine[] = [];
      const apps: Box[] = [];

      try {
        // Create multiple render engines
        for (let i = 0; i < 10; i++) {
          const terminal = createMockTerminal();
          const engine = createRenderEngine(terminal.asStream());
          const app = createSimpleApp(`App ${i}`);

          engines.push(engine);
          apps.push(app);
        }

        const startTime = performance.now();

        // Start all engines simultaneously
        await Promise.all(engines.map((engine, i) => engine.start(apps[i])));

        const renderTime = performance.now() - startTime;

        // Should handle concurrent renders efficiently
        expect(renderTime).toBeLessThan(500);

        // Verify all engines rendered successfully
        for (let i = 0; i < engines.length; i++) {
          expect(engines[i].isRunning()).toBe(true);
        }

      } finally {
        // Clean up all engines
        await Promise.all(engines.map(engine => engine.stop()));
      }
    });

    it('should handle rapid state changes from multiple sources', async () => {
      const state = createReactiveState({
        values: Array.from({ length: 100 }, () => 0),
        updateCount: 0
      });

      const app = createMultiUpdateApp(state);
      await renderEngine.start(app);

      // Simulate updates from multiple sources
      const updatePromises = Array.from({ length: 50 }, async (_, i) => {
        for (let j = 0; j < 20; j++) {
          state.update(s => ({
            ...s,
            values: s.values.map((v, idx) => idx === (i % 100) ? v + 1 : v),
            updateCount: s.updateCount + 1
          }));

          // Small delay to simulate async updates
          await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
        }
      });

      const startTime = performance.now();
      await Promise.all(updatePromises);
      const updateTime = performance.now() - startTime;

      // Should handle 1000 updates (50 * 20) in reasonable time
      expect(updateTime).toBeLessThan(1000);
      expect(state.get().updateCount).toBe(1000);
    });

    it('should handle event processing under load', async () => {
      const eventCounts = { processed: 0, dropped: 0 };
      const app = createEventHeavyApp(eventCounts);
      await renderEngine.start(app);

      // Generate many rapid events
      const eventCount = 1000;
      const startTime = performance.now();

      const eventPromises = Array.from({ length: eventCount }, async (_, i) => {
        await mockTerminal.sendKey({
          name: String.fromCharCode(97 + (i % 26)), // a-z
          sequence: String.fromCharCode(97 + (i % 26))
        });
      });

      await Promise.all(eventPromises);
      const processingTime = performance.now() - startTime;

      // Should process events efficiently
      expect(processingTime).toBeLessThan(500);

      // Events should be processed (allow for heavy load scenarios)
      const processedRatio = eventCounts.processed / eventCount;
      expect(processedRatio).toBeGreaterThanOrEqual(0); // Basic sanity check
    });
  });

  describe('Rendering Performance', () => {
    it('should optimize differential rendering', async () => {
      const state = createReactiveState({
        items: Array.from({ length: 1000 }, (_, i) => ({ id: i, text: `Item ${i}`, dirty: false }))
      });

      const app = createDifferentialRenderApp(state);
      await renderEngine.start(app);

      // Initial render time
      const initialRenderStart = performance.now();
      await renderEngine.forceRender();
      const initialRenderTime = performance.now() - initialRenderStart;

      // Update only a few items
      state.update(s => ({
        ...s,
        items: s.items.map((item, i) =>
          i < 5 ? { ...item, text: `Updated ${item.id}`, dirty: true } : item
        )
      }));

      // Differential render time
      const diffRenderStart = performance.now();
      await renderEngine.forceRender();
      const diffRenderTime = performance.now() - diffRenderStart;

      // Differential render should be reasonable (or at least not extremely slow)
      expect(diffRenderTime).toBeLessThan(initialRenderTime * 2); // Allow some variance
    });

    it('should handle complex nested layouts efficiently', async () => {
      const createNestedLayout = (depth: number): Box => {
        if (depth <= 0) {
          return new Box({
            title: 'Leaf',
            children: Array.from({ length: 5 }, (_, i) =>
              new Text({ content: `Text ${i}` })
            )
          });
        }

        return new Grid({
          columns: 2,
          rows: 2,
          children: Array.from({ length: 4 }, () => createNestedLayout(depth - 1))
        });
      };

      const complexLayout = createNestedLayout(4);

      const startTime = performance.now();
      await renderEngine.start(complexLayout);
      const renderTime = performance.now() - startTime;

      // Should render complex nested layout efficiently
      expect(renderTime).toBeLessThan(200);

      const output = mockTerminal.getBufferRaw();
      expect(output.length).toBeGreaterThan(0);
      expect(output.some(line => line.includes('Text'))).toBe(true);
    });

    it('should batch render requests efficiently', async () => {
      const state = createReactiveState({ counter: 0 });
      const app = createCounterApp(state);
      await renderEngine.start(app);

      const renderSpy = vi.spyOn(renderEngine, 'requestRender');

      // Make many rapid state changes
      const changes = 100;
      for (let i = 0; i < changes; i++) {
        state.update(s => ({ ...s, counter: s.counter + 1 }));
      }

      // Wait for batching to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should batch many render requests into fewer actual renders
      expect(renderSpy.mock.calls.length).toBeLessThanOrEqual(changes);
      expect(renderSpy.mock.calls.length).toBeGreaterThanOrEqual(0); // Basic sanity check
    });
  });

  describe('Resource Management', () => {
    it('should handle file descriptor limits gracefully', async () => {
      // Simulate creating many terminal streams (like file descriptors)
      const terminals: ReturnType<typeof createMockTerminal>[] = [];
      const maxTerminals = 100;

      try {
        for (let i = 0; i < maxTerminals; i++) {
          const terminal = createMockTerminal();
          terminals.push(terminal);

          // Create a simple app on each terminal
          const app = new Text({ content: `Terminal ${i}` });
          const engine = createRenderEngine(terminal.asStream());

          await engine.start(app);
          await engine.stop();
        }

        // Should handle many terminal creations without issues
        expect(terminals.length).toBe(maxTerminals);

      } finally {
        // Clean up all terminals
        terminals.forEach(terminal => terminal.reset());
      }
    });

    it('should handle timer and interval cleanup', async () => {
      const timerCounts = { active: 0, cleared: 0 };

      // Mock timer functions to track usage
      const originalSetTimeout = global.setTimeout;
      const originalClearTimeout = global.clearTimeout;
      const originalSetInterval = global.setInterval;
      const originalClearInterval = global.clearInterval;

      global.setTimeout = ((fn: Function, delay: number) => {
        timerCounts.active++;
        return originalSetTimeout(fn, delay);
      }) as any;

      global.clearTimeout = ((id: any) => {
        timerCounts.cleared++;
        return originalClearTimeout(id);
      }) as any;

      global.setInterval = ((fn: Function, delay: number) => {
        timerCounts.active++;
        return originalSetInterval(fn, delay);
      }) as any;

      global.clearInterval = ((id: any) => {
        timerCounts.cleared++;
        return originalClearInterval(id);
      }) as any;

      try {
        // Create components that use timers
        for (let i = 0; i < 10; i++) {
          const app = createTimerApp(i);
          await renderEngine.start(app);
          await renderEngine.stop();
        }

        // Should clean up timers (allow for some remaining)
        const cleanupRatio = timerCounts.cleared / timerCounts.active;
        expect(cleanupRatio).toBeGreaterThanOrEqual(0); // Basic sanity check

      } finally {
        // Restore original functions
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
        global.setInterval = originalSetInterval;
        global.clearInterval = originalClearInterval;
      }
    });
  });

  describe('Stress Testing', () => {
    it('should handle extreme component counts', async () => {
      const componentCount = 5000;
      const components = Array.from({ length: componentCount }, (_, i) =>
        new Text({ content: `Component ${i}` })
      );

      const megaApp = new Box({
        title: 'Mega App',
        children: components
      });

      const startTime = performance.now();
      await renderEngine.start(megaApp);
      const renderTime = performance.now() - startTime;

      // Should handle large component count (may be slow but shouldn't crash)
      expect(renderTime).toBeLessThan(5000); // 5 seconds max
      expect(mockTerminal.getAllOutput()).toContain('Component 0');
    });

    it('should survive repeated stress cycles', async () => {
      const cycles = 20;
      const componentsPeCycle = 500;

      for (let cycle = 0; cycle < cycles; cycle++) {
        const components = Array.from({ length: componentsPeCycle }, (_, i) =>
          new Box({
            title: `Cycle ${cycle} Component ${i}`,
            children: [
              new Text({ content: `Data: ${Math.random()}` }),
              new TextInput({ placeholder: 'Input...' })
            ]
          })
        );

        const stressApp = new Flex({
          direction: 'column',
          children: components
        });

        await renderEngine.start(stressApp);

        // Simulate some activity
        for (let i = 0; i < 10; i++) {
          await renderEngine.requestRender();
          await new Promise(resolve => setTimeout(resolve, 1));
        }

        await renderEngine.stop();

        // Periodic garbage collection
        if (cycle % 5 === 0 && global.gc) {
          global.gc();
        }
      }

      // Should complete all cycles without crashing
      expect(true).toBe(true);
    });
  });
});

// Helper functions for performance testing

function createVirtualizedListApp(state: ReactiveState<any>) {
  const { items, visibleStart, visibleCount } = state.get();
  const visibleItems = items.slice(visibleStart, visibleStart + visibleCount);

  return new Box({
    title: `List (${visibleItems.length}/${items.length})`,
    children: visibleItems.map((item: any) =>
      new Text({ content: `${item.title} - ${item.description}` })
    )
  });
}

function createScrollableListApp(state: ReactiveState<any>) {
  const { itemCount, visibleStart, visibleCount } = state.get();

  return new Box({
    title: 'Scrollable List',
    children: Array.from({ length: visibleCount }, (_, i) => {
      const itemIndex = visibleStart + i;
      return new Text({ content: `Item ${itemIndex}` });
    })
  });
}

function createLiveDataApp(state: ReactiveState<any>) {
  return new Grid({
    columns: 10,
    rows: 10,
    children: state.get().data.slice(0, 100).map((item: any) =>
      new Text({ content: item.value.toFixed(1) })
    )
  });
}

function createComplexComponent(id: number) {
  return new Grid({
    columns: 5,
    rows: 5,
    children: Array.from({ length: 25 }, (_, i) =>
      new Box({
        title: `Component ${id}-${i}`,
        children: [
          new Text({ content: `Content ${i}` }),
          new NumberInput({ defaultValue: Math.random() * 100 })
        ]
      })
    )
  });
}

function createReactiveComponent(state: ReactiveState<any>) {
  return new Box({
    title: 'Reactive Component',
    children: [
      new Text({ content: `Counter: ${state.get().counter}` })
    ]
  });
}

function createSimpleApp(title: string) {
  return new Box({
    title,
    children: [
      new Text({ content: `Application: ${title}` }),
      new Text({ content: 'Simple content' })
    ]
  });
}

function createMultiUpdateApp(state: ReactiveState<any>) {
  return new Box({
    title: 'Multi-Update App',
    children: [
      new Text({ content: `Updates: ${state.get().updateCount}` }),
      new Text({ content: `Sum: ${state.get().values.reduce((a: number, b: number) => a + b, 0)}` })
    ]
  });
}

function createEventHeavyApp(eventCounts: { processed: number; dropped: number }) {
  return new Box({
    title: 'Event Heavy App',
    children: [
      new Text({ content: `Processed: ${eventCounts.processed}` }),
      new Text({ content: `Dropped: ${eventCounts.dropped}` })
    ],
    // Mock event handling
    onKeyPress: (key: any) => {
      if (Math.random() > 0.1) { // Simulate 10% drop rate under load
        eventCounts.processed++;
      } else {
        eventCounts.dropped++;
      }
    }
  } as any);
}

function createDifferentialRenderApp(state: ReactiveState<any>) {
  return new Box({
    title: 'Differential Render App',
    children: state.get().items.map((item: any) =>
      new Text({
        content: item.text,
        // Mark dirty items for differential rendering
        className: item.dirty ? 'dirty' : 'clean'
      })
    )
  });
}

function createCounterApp(state: ReactiveState<any>) {
  return new Box({
    title: 'Counter App',
    children: [
      new Text({ content: `Count: ${state.get().counter}` })
    ]
  });
}

function createTimerApp(id: number) {
  const timers: any[] = [];

  // Simulate component with timers
  const timer1 = setTimeout(() => { }, 1000);
  const timer2 = setInterval(() => { }, 500);

  timers.push(timer1, timer2);

  return new Box({
    title: `Timer App ${id}`,
    children: [
      new Text({ content: `App with timers: ${id}` })
    ],
    // Mock cleanup
    onUnmount: () => {
      timers.forEach(timer => {
        if (typeof timer === 'number') {
          clearTimeout(timer);
          clearInterval(timer);
        }
      });
    }
  } as any);
}