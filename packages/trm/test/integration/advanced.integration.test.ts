import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { it, expect, describe, afterEach } from 'vitest';
import { TmuxTester, createTester } from '@xec-sh/tui-tester';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures');

describe('Advanced Features Integration Tests', { timeout: 30000 }, () => {
  let tester: TmuxTester;
  let tempFiles: string[] = [];

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
    
    // Cleanup temp files
    for (const file of tempFiles) {
      try {
        await fs.unlink(file);
      } catch (e) {
        // Ignore
      }
    }
    tempFiles = [];
  });

  describe('Animation System', () => {
    it('should run animations smoothly', async () => {
      const testScript = `
        import { createTerminal } from '../../dist/index.js';
        import { AnimationManager, FPSCounter } from '../../dist/advanced/animation.js';
        
        async function main() {
          const term = createTerminal({ rawMode: true });
          await term.init();
          
          term.screen.clear();
          term.screen.writeAt(0, 0, 'Animation Test');
          
          const animManager = new AnimationManager();
          const fpsCounter = new FPSCounter();
          
          let x = 0;
          let direction = 1;
          const maxX = 30;
          
          // Create animation
          const animation = animManager.createAnimation((progress, deltaTime) => {
            // Update position
            x += direction * deltaTime * 10; // 10 chars per second
            
            if (x >= maxX || x <= 0) {
              direction *= -1;
            }
            
            // Clear line and draw
            term.screen.write('\\x1b[2;0H\\x1b[K'); // Clear line 2
            term.screen.writeAt(Math.floor(x), 2, 'O'); // Draw ball
            
            // Update FPS
            fpsCounter.update(deltaTime);
            term.screen.writeAt(0, 4, \`FPS: \${fpsCounter.getFPS().toFixed(0)}  \`);
            
            // Stop after 2 seconds
            if (progress > 2000) {
              animation.stop();
              term.screen.writeAt(0, 6, 'Animation Complete');
              setTimeout(() => {
                term.close();
                process.exit(0);
              }, 500);
            }
          });
          
          animation.start();
        }
        
        main().catch(console.error);
      `;
      
      const tempFile = path.join(fixturesDir, 'test-animation.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-animation-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Animation Test', { timeout: 5000 });
      
      // Wait for animation to run
      await tester.sleep(1000);
      
      // Check FPS counter
      const screen = await tester.getScreenText();
      expect(screen).toContain('FPS:');
      
      // Wait for completion
      await tester.waitForText('Animation Complete', { timeout: 5000 });
    });

    it('should support easing functions', async () => {
      const testScript = `
        import { createTerminal } from '../../dist/index.js';
        import { AnimationManager, easeInOutCubic, easeOutBounce } from '../../dist/advanced/animation.js';
        
        async function main() {
          const term = createTerminal();
          await term.init();
          
          term.screen.clear();
          term.screen.writeAt(0, 0, 'Easing Functions Test');
          
          const animManager = new AnimationManager();
          
          // Test different easings
          const easings = [
            { name: 'Linear', fn: (t) => t },
            { name: 'InOutCubic', fn: easeInOutCubic },
            { name: 'OutBounce', fn: easeOutBounce }
          ];
          
          let currentEasing = 0;
          
          function showEasing(index) {
            const easing = easings[index];
            term.screen.writeAt(0, 2, \`Current: \${easing.name}     \`);
            
            // Draw easing curve
            const width = 40;
            const height = 10;
            
            for (let y = 0; y < height; y++) {
              term.screen.writeAt(0, 4 + y, ' '.repeat(width));
            }
            
            for (let x = 0; x < width; x++) {
              const t = x / width;
              const value = easing.fn(t);
              const y = Math.floor((1 - value) * (height - 1));
              term.screen.writeAt(x, 4 + y, '*');
            }
          }
          
          showEasing(0);
          
          // Cycle through easings
          let count = 0;
          const interval = setInterval(() => {
            currentEasing = (currentEasing + 1) % easings.length;
            showEasing(currentEasing);
            
            count++;
            if (count >= 3) {
              clearInterval(interval);
              term.screen.writeAt(0, 15, 'Test Complete');
              setTimeout(() => {
                term.close();
                process.exit(0);
              }, 500);
            }
          }, 1000);
        }
        
        main();
      `;
      
      const tempFile = path.join(fixturesDir, 'test-easing.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-easing-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Easing Functions Test', { timeout: 5000 });
      
      // Check different easings are shown
      await tester.sleep(500);
      let screen = await tester.getScreenText();
      expect(screen).toContain('Linear');
      
      await tester.sleep(1000);
      screen = await tester.getScreenText();
      expect(screen).toContain('InOutCubic');
      
      await tester.waitForText('Test Complete', { timeout: 5000 });
    });
  });

  describe('Layout System', () => {
    it('should create flex layouts', async () => {
      const testScript = `
        import { createTerminal } from '../../dist/index.js';
        import { FlexLayout } from '../../dist/advanced/layout.js';
        
        async function main() {
          const term = createTerminal();
          await term.init();
          
          term.screen.clear();
          
          // Create flex layout
          const layout = new FlexLayout({
            direction: 'horizontal',
            gap: 1,
            padding: 1
          });
          
          // Add items
          layout.addItem({ flex: 1, content: 'Item 1 (flex: 1)' });
          layout.addItem({ flex: 2, content: 'Item 2 (flex: 2)' });
          layout.addItem({ width: 20, content: 'Item 3 (fixed: 20)' });
          
          // Render layout
          const { cols, rows } = term.screen.getSize();
          const rendered = layout.render(cols, rows);
          
          term.screen.writeAt(0, 0, 'Flex Layout Test');
          term.screen.writeAt(0, 2, rendered);
          
          // Show layout info
          const items = layout.getItems();
          term.screen.writeAt(0, 10, \`Total items: \${items.length}\`);
          
          setTimeout(() => {
            term.close();
            process.exit(0);
          }, 1000);
        }
        
        main();
      `;
      
      const tempFile = path.join(fixturesDir, 'test-flex-layout.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-flex-layout-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Flex Layout Test', { timeout: 5000 });
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Item 1');
      expect(screen).toContain('Item 2');
      expect(screen).toContain('Item 3');
      expect(screen).toContain('Total items: 3');
    });

    it('should create grid layouts', async () => {
      const testScript = `
        import { createTerminal } from '../../dist/index.js';
        import { GridLayout } from '../../dist/advanced/layout.js';
        
        async function main() {
          const term = createTerminal();
          await term.init();
          
          term.screen.clear();
          
          // Create grid layout
          const grid = new GridLayout({
            columns: 3,
            rows: 2,
            gap: 1
          });
          
          // Add cells
          for (let i = 0; i < 6; i++) {
            grid.setCell(i % 3, Math.floor(i / 3), \`Cell \${i + 1}\`);
          }
          
          // Render grid
          const rendered = grid.render(60, 10);
          
          term.screen.writeAt(0, 0, 'Grid Layout Test');
          term.screen.writeAt(0, 2, rendered);
          
          setTimeout(() => {
            term.close();
            process.exit(0);
          }, 1000);
        }
        
        main();
      `;
      
      const tempFile = path.join(fixturesDir, 'test-grid-layout.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-grid-layout-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Grid Layout Test', { timeout: 5000 });
      
      const screen = await tester.getScreenText();
      for (let i = 1; i <= 6; i++) {
        expect(screen).toContain(`Cell ${i}`);
      }
    });
  });

  describe('State Management', () => {
    it('should manage reactive state', async () => {
      const testScript = `
        import { createTerminal } from '../../dist/index.js';
        import { Store } from '../../dist/advanced/state.js';
        
        async function main() {
          const term = createTerminal({ rawMode: true });
          await term.init();
          
          term.screen.clear();
          term.screen.writeAt(0, 0, 'State Management Test');
          
          // Create store
          const store = new Store({
            count: 0,
            message: 'Initial'
          });
          
          // Subscribe to changes
          store.subscribe((state, prevState) => {
            term.screen.writeAt(0, 2, \`Count: \${state.count}  \`);
            term.screen.writeAt(0, 3, \`Message: \${state.message}  \`);
            
            if (prevState) {
              term.screen.writeAt(0, 5, \`Previous count: \${prevState.count}  \`);
            }
          });
          
          // Initial render
          const state = store.getState();
          term.screen.writeAt(0, 2, \`Count: \${state.count}\`);
          term.screen.writeAt(0, 3, \`Message: \${state.message}\`);
          
          // Update state
          let updates = 0;
          const interval = setInterval(() => {
            updates++;
            store.setState({
              count: updates,
              message: \`Update #\${updates}\`
            });
            
            if (updates >= 3) {
              clearInterval(interval);
              term.screen.writeAt(0, 7, 'State updates complete');
              setTimeout(() => {
                term.close();
                process.exit(0);
              }, 500);
            }
          }, 500);
        }
        
        main();
      `;
      
      const tempFile = path.join(fixturesDir, 'test-state.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-state-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('State Management Test', { timeout: 5000 });
      
      // Wait for state updates
      await tester.sleep(1000);
      
      let screen = await tester.getScreenText();
      expect(screen).toContain('Count:');
      expect(screen).toContain('Message:');
      expect(screen).toContain('Previous count:');
      
      await tester.waitForText('State updates complete', { timeout: 5000 });
      
      screen = await tester.getScreenText();
      expect(screen).toContain('Count: 3');
      expect(screen).toContain('Update #3');
    });

    it('should support computed values', async () => {
      const testScript = `
        import { createTerminal } from '../../dist/index.js';
        import { Store, createSelector } from '../../dist/advanced/state.js';
        
        async function main() {
          const term = createTerminal();
          await term.init();
          
          term.screen.clear();
          term.screen.writeAt(0, 0, 'Computed Values Test');
          
          // Create store with items
          const store = new Store({
            items: [
              { id: 1, name: 'Item 1', price: 10 },
              { id: 2, name: 'Item 2', price: 20 },
              { id: 3, name: 'Item 3', price: 30 }
            ],
            filter: ''
          });
          
          // Create selectors
          const filteredItems = createSelector(
            state => state.items,
            state => state.filter,
            (items, filter) => {
              if (!filter) return items;
              return items.filter(item => 
                item.name.toLowerCase().includes(filter.toLowerCase())
              );
            }
          );
          
          const totalPrice = createSelector(
            state => filteredItems(state),
            items => items.reduce((sum, item) => sum + item.price, 0)
          );
          
          // Display computed values
          function render() {
            const state = store.getState();
            const filtered = filteredItems(state);
            const total = totalPrice(state);
            
            term.screen.writeAt(0, 2, \`Filter: "\${state.filter}"     \`);
            term.screen.writeAt(0, 3, \`Items shown: \${filtered.length}  \`);
            term.screen.writeAt(0, 4, \`Total price: $\${total}  \`);
            
            filtered.forEach((item, i) => {
              term.screen.writeAt(0, 6 + i, \`- \${item.name}: $\${item.price}  \`);
            });
            
            // Clear unused lines
            for (let i = filtered.length; i < 3; i++) {
              term.screen.writeAt(0, 6 + i, '                    ');
            }
          }
          
          render();
          
          // Apply filters
          setTimeout(() => {
            store.setState({ ...store.getState(), filter: '2' });
            render();
          }, 500);
          
          setTimeout(() => {
            store.setState({ ...store.getState(), filter: '' });
            render();
            term.screen.writeAt(0, 10, 'Test complete');
          }, 1000);
          
          setTimeout(() => {
            term.close();
            process.exit(0);
          }, 1500);
        }
        
        main();
      `;
      
      const tempFile = path.join(fixturesDir, 'test-computed.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-computed-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Computed Values Test', { timeout: 5000 });
      
      // Initial state
      let screen = await tester.getScreenText();
      expect(screen).toContain('Items shown: 3');
      expect(screen).toContain('Total price: $60');
      
      // Wait for filter
      await tester.sleep(600);
      screen = await tester.getScreenText();
      expect(screen).toContain('Filter: "2"');
      expect(screen).toContain('Items shown: 1');
      expect(screen).toContain('Total price: $20');
      
      await tester.waitForText('Test complete', { timeout: 3000 });
    });
  });

  describe('Performance Monitoring', () => {
    it('should track performance metrics', async () => {
      const testScript = `
        import { createTerminal } from '../../dist/index.js';
        import { PerformanceMonitor, MemoryMonitor } from '../../dist/advanced/performance.js';
        
        async function main() {
          const term = createTerminal();
          await term.init();
          
          term.screen.clear();
          term.screen.writeAt(0, 0, 'Performance Monitoring');
          
          const perfMon = new PerformanceMonitor();
          const memMon = new MemoryMonitor();
          
          // Start monitoring
          perfMon.startMeasure('operation');
          
          // Simulate work
          const data = [];
          for (let i = 0; i < 10000; i++) {
            data.push({ id: i, value: Math.random() });
          }
          
          perfMon.endMeasure('operation');
          
          // Get metrics
          const metrics = perfMon.getMetrics();
          const memory = memMon.getUsage();
          
          term.screen.writeAt(0, 2, \`Operation time: \${metrics.operation.toFixed(2)}ms\`);
          term.screen.writeAt(0, 3, \`Memory used: \${(memory.heapUsed / 1024 / 1024).toFixed(2)}MB\`);
          term.screen.writeAt(0, 4, \`Total heap: \${(memory.heapTotal / 1024 / 1024).toFixed(2)}MB\`);
          
          // Mark for GC
          perfMon.mark('beforeGC');
          if (global.gc) global.gc();
          perfMon.mark('afterGC');
          
          const gcTime = perfMon.measure('gc', 'beforeGC', 'afterGC');
          if (gcTime !== null) {
            term.screen.writeAt(0, 6, \`GC time: \${gcTime.toFixed(2)}ms\`);
          }
          
          term.screen.writeAt(0, 8, 'Monitoring complete');
          
          setTimeout(() => {
            term.close();
            process.exit(0);
          }, 1000);
        }
        
        main();
      `;
      
      const tempFile = path.join(fixturesDir, 'test-performance.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-performance-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Performance Monitoring', { timeout: 5000 });
      await tester.waitForText('Monitoring complete', { timeout: 5000 });
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Operation time:');
      expect(screen).toContain('Memory used:');
      expect(screen).toContain('Total heap:');
    });
  });

  describe('Console Redirection', () => {
    it('should redirect console output to terminal', async () => {
      const testScript = `
        import { createTerminal } from '../../dist/index.js';
        import { ConsoleRedirect } from '../../dist/advanced/console.js';
        
        async function main() {
          const term = createTerminal();
          await term.init();
          
          term.screen.clear();
          term.screen.writeAt(0, 0, 'Console Redirect Test');
          
          // Create console redirect
          const redirect = new ConsoleRedirect(term);
          redirect.enable();
          
          // These will be redirected to terminal
          console.log('This is a log message');
          console.info('This is an info message');
          console.warn('This is a warning');
          console.error('This is an error');
          
          // Object logging
          console.log({ test: 'object', value: 123 });
          
          // Disable redirect
          setTimeout(() => {
            redirect.disable();
            term.screen.writeAt(0, 10, 'Redirect disabled');
            
            setTimeout(() => {
              term.close();
              process.exit(0);
            }, 500);
          }, 1000);
        }
        
        main();
      `;
      
      const tempFile = path.join(fixturesDir, 'test-console.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-console-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Console Redirect Test', { timeout: 5000 });
      
      await tester.sleep(500);
      const screen = await tester.getScreenText();
      
      // Check console messages are shown
      expect(screen).toContain('This is a log message');
      expect(screen).toContain('This is an info message');
      expect(screen).toContain('This is a warning');
      expect(screen).toContain('This is an error');
      expect(screen).toContain('test');
      expect(screen).toContain('123');
      
      await tester.waitForText('Redirect disabled', { timeout: 3000 });
    });
  });
});