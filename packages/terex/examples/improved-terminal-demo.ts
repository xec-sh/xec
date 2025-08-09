/**
 * Demo of improved terminal handling in terex
 * Shows log-update style rendering at current cursor position
 */

import {
  BaseComponent,
  createCustomRenderEngine,
  createDefaultInputManager,
  createDefaultTerminalManager
} from '../src/core/index.js';

// Simple counter component that updates at cursor position
class CounterComponent extends BaseComponent<{}> {
  private count = 0;
  private startTime = Date.now();
  private interval?: NodeJS.Timeout;
  private onStop?: () => void;

  constructor(options: any, onStop?: () => void) {
    super(options);
    this.onStop = onStop;
  }

  override async mount(): Promise<void> {
    await super.mount(); // IMPORTANT: Call parent mount to set mounted flag!

    // Update counter every 100ms
    this.interval = setInterval(() => {
      this.count++;
      this.invalidate();

      // Stop after 10 seconds
      if (Date.now() - this.startTime > 10000) {
        this.cleanup();
      }
    }, 100);
  }

  override async unmount(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    await super.unmount(); // Call parent unmount
  }

  // Handle keyboard input
  override handleKeypress(key: any): boolean {
    if (key.ctrl && key.name === 'c') {
      this.cleanup();
      return true;
    }
    return false;
  }

  render(): { lines: string[] } {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    return {
      lines: [
        `🎯 Terex Log-Update Demo`,
        `📊 Count: ${this.count}`,
        `⏱️  Time: ${elapsed}s`,
        `📍 Rendering at cursor position!`,
        `🔧 Press Ctrl+C to exit`
      ]
    };
  }

  private cleanup(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    if (this.onStop) {
      this.onStop();
    }
  }
}

// Demo function
async function runDemo(): Promise<void> {
  let shouldExit = false;
  let cleanupInProgress = false;

  // Create render engine with log-update style
  const engine = createCustomRenderEngine({
    mode: 'fullscreen',
    preserveState: true,
    enhancedInput: true, // This enables input handling
    enableFrameScheduling: true, // Enable render loop for continuous updates
    targetFps: 10, // 10 FPS is enough for a counter
  });

  // Create cleanup function
  const cleanup = async () => {
    if (cleanupInProgress) return;
    cleanupInProgress = true;

    shouldExit = true;

    // Stop the engine (this will also stop input handling)
    await engine.stop();

    process.exit(0);
  };

  // Create component with stop callback
  const component = new CounterComponent({}, cleanup);

  // Handle process signals
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    // Start rendering (this will also start input handling)
    await engine.start(component);

    // Keep the process alive until shouldExit is true
    while (!shouldExit) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (error) {
    console.error('Demo failed:', error);
    await cleanup();
  }
}

// Alternative demo with manual terminal manager usage
async function runManualDemo(): Promise<void> {
  console.log('Starting manual terminal manager demo...\n');
  console.log('This demonstrates direct terminal manager usage:');

  const terminalManager = createDefaultTerminalManager({
    logUpdateStyle: true,
    preserveState: true,
  });

  const inputManager = createDefaultInputManager({
    rawMode: true,
  });

  try {
    await terminalManager.initialize();

    let count = 0;
    const startTime = Date.now();

    // Handle input
    inputManager.onKeypress((event) => {
      if (event.key.ctrl && event.key.name === 'c') {
        cleanup();
      }
    });
    inputManager.start();

    // Render loop
    const interval = setInterval(async () => {
      count++;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);

      await terminalManager.renderAtPosition([
        `🎯 Manual Terminal Manager Demo`,
        `📊 Count: ${count}`,
        `⏱️  Time: ${elapsed}s`,
        `📍 Using TerminalManager directly`,
        `🔧 Press Ctrl+C to exit`
      ]);

      if (elapsed > 10) {
        cleanup();
      }
    }, 100);

    async function cleanup(): Promise<void> {
      clearInterval(interval);
      inputManager.stop();

      // Clear the rendered content properly
      await terminalManager.endRender();

      await terminalManager.cleanup();
      console.log('\nDemo completed!');
      process.exit(0);
    }

  } catch (error) {
    console.error('Manual demo failed:', error);
    inputManager.stop();
    await terminalManager.cleanup();
    process.exit(1);
  }
}

// Run demo based on command line argument
const demoType = process.argv[2] || 'engine';

if (demoType === 'manual') {
  runManualDemo().catch(console.error);
} else {
  runDemo().catch(console.error);
}

export { runDemo, runManualDemo };