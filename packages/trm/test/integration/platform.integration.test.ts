import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { it, expect, describe, afterEach } from 'vitest';
import { TmuxTester, createTester } from '@xec-sh/tui-tester';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures');

describe('Platform Detection Integration Tests', { timeout: 30000 }, () => {
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

  describe('Runtime Detection', () => {
    it('should detect Node.js runtime', async () => {
      const testScript = `
        import { detectRuntime, getPlatform, isTerminalSupported } from '../../dist/index.js';
        
        console.log('Runtime Detection Test');
        console.log('======================');
        
        const runtime = detectRuntime();
        const platform = getPlatform();
        
        console.log('Runtime:', runtime);
        console.log('OS:', platform.os);
        console.log('Terminal:', platform.terminal);
        console.log('Shell:', platform.shell || 'not detected');
        console.log('Is WSL:', platform.isWSL);
        console.log('Is SSH:', platform.isSSH);
        console.log('Terminal Supported:', isTerminalSupported());
        
        // Check Node-specific
        if (typeof process !== 'undefined' && process.versions) {
          console.log('Node Version:', process.versions.node);
        }
        
        process.exit(0);
      `;
      
      const tempFile = path.join(fixturesDir, 'test-runtime.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-runtime-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Runtime Detection Test', { timeout: 5000 });
      await tester.sleep(500);
      
      const screen = await tester.getScreenText();
      
      // Should detect Node.js
      expect(screen).toContain('Runtime: node');
      expect(screen).toContain('OS:');
      expect(screen).toContain('Terminal:');
      expect(screen).toContain('Terminal Supported:');
      expect(screen).toContain('Node Version:');
    });

    it('should detect terminal capabilities', async () => {
      const testScript = `
        import { 
          isTTY, 
          getTerminalSize, 
          getColorSupport,
          getTerminalType,
          getEnv 
        } from '../../dist/index.js';
        
        console.log('Terminal Capabilities');
        console.log('====================');
        
        console.log('Is TTY:', isTTY());
        
        const size = getTerminalSize();
        if (size) {
          console.log('Terminal Size:', size.cols + 'x' + size.rows);
        }
        
        console.log('Color Support:', getColorSupport());
        console.log('Terminal Type:', getTerminalType());
        console.log('TERM env:', getEnv('TERM') || 'not set');
        console.log('COLORTERM env:', getEnv('COLORTERM') || 'not set');
        
        // Check CI environment
        if (getEnv('CI')) {
          console.log('Running in CI');
        }
        
        process.exit(0);
      `;
      
      const tempFile = path.join(fixturesDir, 'test-capabilities.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-capabilities-${Date.now()}`,
        env: {
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor'
        }
      });
      
      await tester.start();
      await tester.waitForText('Terminal Capabilities', { timeout: 5000 });
      await tester.sleep(500);
      
      const screen = await tester.getScreenText();
      
      expect(screen).toContain('Is TTY:');
      expect(screen).toContain('Terminal Size:');
      expect(screen).toContain('Color Support:');
      expect(screen).toContain('Terminal Type: xterm-256color');
      expect(screen).toContain('TERM env: xterm-256color');
    });
  });

  describe('Cross-Platform Utilities', () => {
    it('should provide high-resolution timing', async () => {
      const testScript = `
        import { hrtime, setTimeout, clearTimeout } from '../../dist/index.js';
        
        console.log('Timing Utilities Test');
        console.log('====================');
        
        const start = hrtime();
        
        // Test setTimeout
        const timeoutId = setTimeout(() => {
          const end = hrtime();
          const duration = Number(end - start) / 1000000; // Convert to ms
          
          console.log('Timeout executed');
          console.log('Duration:', duration.toFixed(2) + 'ms');
          
          process.exit(0);
        }, 100);
        
        console.log('Timer started');
        console.log('Timeout ID:', typeof timeoutId);
      `;
      
      const tempFile = path.join(fixturesDir, 'test-timing.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-timing-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Timing Utilities Test', { timeout: 5000 });
      await tester.waitForText('Timeout executed', { timeout: 2000 });
      
      const screen = await tester.getScreenText();
      
      expect(screen).toContain('Timer started');
      expect(screen).toContain('Timeout ID:');
      expect(screen).toContain('Timeout executed');
      expect(screen).toContain('Duration:');
    });

    it('should handle intervals', async () => {
      const testScript = `
        import { setInterval, clearInterval } from '../../dist/index.js';
        
        console.log('Interval Test');
        console.log('=============');
        
        let count = 0;
        const intervalId = setInterval(() => {
          count++;
          console.log('Tick', count);
          
          if (count >= 3) {
            clearInterval(intervalId);
            console.log('Interval cleared');
            process.exit(0);
          }
        }, 100);
        
        console.log('Interval started');
      `;
      
      const tempFile = path.join(fixturesDir, 'test-interval.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-interval-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Interval Test', { timeout: 5000 });
      await tester.waitForText('Interval cleared', { timeout: 2000 });
      
      const screen = await tester.getScreenText();
      
      expect(screen).toContain('Interval started');
      expect(screen).toContain('Tick 1');
      expect(screen).toContain('Tick 2');
      expect(screen).toContain('Tick 3');
      expect(screen).toContain('Interval cleared');
    });
  });

  describe('Platform Initialization', () => {
    it('should initialize platform properly', async () => {
      const testScript = `
        import { initPlatform, createTerminal } from '../../dist/index.js';
        
        async function main() {
          console.log('Platform Initialization');
          console.log('======================');
          
          // Initialize platform
          await initPlatform();
          console.log('Platform initialized');
          
          // Create terminal with platform init
          const term = createTerminal();
          await term.init();
          
          console.log('Terminal initialized');
          console.log('Raw mode available:', term.isRawMode !== undefined);
          console.log('Alternate buffer available:', term.useAlternateBuffer !== undefined);
          
          await term.close();
          console.log('Terminal closed');
          
          process.exit(0);
        }
        
        main().catch(console.error);
      `;
      
      const tempFile = path.join(fixturesDir, 'test-init.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-init-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Platform Initialization', { timeout: 5000 });
      await tester.waitForText('Terminal closed', { timeout: 5000 });
      
      const screen = await tester.getScreenText();
      
      expect(screen).toContain('Platform initialized');
      expect(screen).toContain('Terminal initialized');
      expect(screen).toContain('Raw mode available:');
      expect(screen).toContain('Alternate buffer available:');
      expect(screen).toContain('Terminal closed');
    });
  });

  describe('QuickStart Function', () => {
    it('should create terminal with quickStart', async () => {
      const testScript = `
        import { quickStart } from '../../dist/index.js';
        
        async function main() {
          console.log('QuickStart Test');
          console.log('===============');
          
          const term = await quickStart({
            rawMode: true,
            alternateBuffer: true
          });
          
          console.log('Terminal created with quickStart');
          
          term.screen.clear();
          term.screen.writeAt(0, 0, 'QuickStart Terminal');
          term.screen.writeAt(0, 1, 'Raw mode: ' + (term.isRawMode ? 'enabled' : 'disabled'));
          term.screen.writeAt(0, 2, 'Press any key to exit');
          
          term.input.once('key', () => {
            term.screen.clear();
            term.close();
            console.log('Terminal closed');
            process.exit(0);
          });
        }
        
        main().catch(console.error);
      `;
      
      const tempFile = path.join(fixturesDir, 'test-quickstart.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-quickstart-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('QuickStart Terminal', { timeout: 5000 });
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('QuickStart Terminal');
      expect(screen).toContain('Raw mode:');
      expect(screen).toContain('Press any key to exit');
      
      // Press a key to exit
      await tester.sendKey('q');
      await tester.sleep(200);
    });
  });

  describe('Environment Detection', () => {
    it('should detect SSH session', async () => {
      const testScript = `
        import { isSSH, getEnv } from '../../dist/index.js';
        
        console.log('SSH Detection Test');
        console.log('==================');
        
        // Check if in SSH
        console.log('Is SSH session:', isSSH());
        
        // Check SSH environment variables
        console.log('SSH_CLIENT:', getEnv('SSH_CLIENT') || 'not set');
        console.log('SSH_TTY:', getEnv('SSH_TTY') || 'not set');
        console.log('SSH_CONNECTION:', getEnv('SSH_CONNECTION') || 'not set');
        
        process.exit(0);
      `;
      
      const tempFile = path.join(fixturesDir, 'test-ssh.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      // Test without SSH
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-ssh-1-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('SSH Detection Test', { timeout: 5000 });
      await tester.sleep(500);
      
      let screen = await tester.getScreenText();
      expect(screen).toContain('Is SSH session: false');
      
      await tester.stop();
      
      // Test with SSH environment
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-ssh-2-${Date.now()}`,
        env: {
          SSH_CLIENT: '192.168.1.100 12345 22',
          SSH_TTY: '/dev/pts/1',
          SSH_CONNECTION: '192.168.1.100 12345 192.168.1.1 22'
        }
      });
      
      await tester.start();
      await tester.waitForText('SSH Detection Test', { timeout: 5000 });
      await tester.sleep(500);
      
      screen = await tester.getScreenText();
      expect(screen).toContain('Is SSH session: true');
      expect(screen).toContain('SSH_CLIENT: 192.168.1.100');
    });

    it('should detect color support levels', async () => {
      const testScript = `
        import { getColorSupport, getEnv } from '../../dist/index.js';
        
        console.log('Color Support Detection');
        console.log('=======================');
        
        const colorLevel = getColorSupport();
        
        console.log('Color support level:', colorLevel);
        
        if (colorLevel === 0) {
          console.log('No color support');
        } else if (colorLevel === 4) {
          console.log('Basic 16 colors');
        } else if (colorLevel === 8) {
          console.log('256 colors');
        } else if (colorLevel === 24) {
          console.log('True color (16 million colors)');
        }
        
        console.log('TERM:', getEnv('TERM') || 'not set');
        console.log('COLORTERM:', getEnv('COLORTERM') || 'not set');
        console.log('NO_COLOR:', getEnv('NO_COLOR') || 'not set');
        console.log('FORCE_COLOR:', getEnv('FORCE_COLOR') || 'not set');
        
        process.exit(0);
      `;
      
      const tempFile = path.join(fixturesDir, 'test-color-support.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      // Test with true color
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-color-${Date.now()}`,
        env: {
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor'
        }
      });
      
      await tester.start();
      await tester.waitForText('Color Support Detection', { timeout: 5000 });
      await tester.sleep(500);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Color support level:');
      expect(screen).toContain('TERM: xterm-256color');
      expect(screen).toContain('COLORTERM: truecolor');
    });
  });

  describe('Cross-Runtime Compatibility', () => {
    it('should handle different stream types', async () => {
      const testScript = `
        import { createTerminal, createTerminalStream } from '../../dist/index.js';
        
        async function main() {
          console.log('Stream Compatibility Test');
          console.log('=========================');
          
          // Create stream
          const stream = createTerminalStream(process.stdout, process.stdin);
          console.log('Stream created:', stream.constructor.name);
          
          // Create terminal with stream
          const term = createTerminal({ stream });
          await term.init();
          
          console.log('Terminal initialized with stream');
          
          // Test stream operations
          term.screen.clear();
          term.screen.writeAt(0, 0, 'Stream Test');
          
          // Test raw write
          stream.write('\\x1b[2;0HRaw write through stream');
          
          setTimeout(() => {
            term.close();
            console.log('Test complete');
            process.exit(0);
          }, 500);
        }
        
        main().catch(console.error);
      `;
      
      const tempFile = path.join(fixturesDir, 'test-streams.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-streams-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Stream Test', { timeout: 5000 });
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Stream Test');
      expect(screen).toContain('Raw write through stream');
      
      await tester.waitForText('Test complete', { timeout: 2000 });
    });
  });
});