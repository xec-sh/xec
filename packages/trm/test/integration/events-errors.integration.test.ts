import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { it, expect, describe, afterEach } from 'vitest';
import { TmuxTester, createTester } from '@xec-sh/tui-tester';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures');

describe('Events and Error Handling Integration Tests', { timeout: 30000 }, () => {
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

  describe('Event System', () => {
    it('should handle terminal events', async () => {
      const testScript = `
        import { createTerminal } from '../../dist/index.js';
        
        async function main() {
          const term = createTerminal({ rawMode: true });
          await term.init();
          
          term.screen.clear();
          term.screen.writeAt(0, 0, 'Event System Test');
          
          let eventLog = [];
          
          // Subscribe to all events
          term.input.on('key', (event) => {
            eventLog.push(\`key: \${event.key}\`);
            term.screen.writeAt(0, 2, \`Last key: \${event.key}     \`);
            
            if (event.key === 'q') {
              // Display event log
              term.screen.writeAt(0, 4, 'Event Log:');
              eventLog.slice(-5).forEach((log, i) => {
                term.screen.writeAt(0, 5 + i, log + '     ');
              });
              
              setTimeout(() => {
                term.close();
                process.exit(0);
              }, 500);
            }
          });
          
          term.input.on('mouse', (event) => {
            eventLog.push(\`mouse: \${event.action} at (\${event.x},\${event.y})\`);
            term.screen.writeAt(0, 3, \`Last mouse: \${event.action} at (\${event.x},\${event.y})     \`);
          });
          
          term.input.on('resize', (event) => {
            eventLog.push(\`resize: \${event.cols}x\${event.rows}\`);
            term.screen.clear();
            term.screen.writeAt(0, 0, \`Resized to \${event.cols}x\${event.rows}\`);
          });
          
          term.input.on('focus', (event) => {
            eventLog.push(\`focus: \${event.focused}\`);
            term.screen.writeAt(0, 1, \`Focus: \${event.focused ? 'gained' : 'lost'}     \`);
          });
          
          term.input.on('paste', (event) => {
            eventLog.push(\`paste: \${event.text.length} chars\`);
            term.screen.writeAt(0, 1, \`Pasted: \${event.text}     \`);
          });
        }
        
        main().catch(console.error);
      `;
      
      const tempFile = path.join(fixturesDir, 'test-events.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-events-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Event System Test', { timeout: 5000 });
      
      // Test keyboard events
      await tester.sendKey('a');
      await tester.sleep(100);
      let screen = await tester.getScreenText();
      expect(screen).toContain('Last key: a');
      
      await tester.sendKey('Enter');
      await tester.sleep(100);
      screen = await tester.getScreenText();
      expect(screen).toContain('Last key: Enter');
      
      // Test mouse events
      await tester.enableMouse();
      await tester.click(10, 5);
      await tester.sleep(100);
      screen = await tester.getScreenText();
      expect(screen).toContain('Last mouse:');
      
      // Test paste event
      await tester.paste('Hello World');
      await tester.sleep(100);
      screen = await tester.getScreenText();
      expect(screen).toContain('Pasted: Hello World');
      
      // Test resize event
      await tester.resize({ cols: 100, rows: 30 });
      await tester.sleep(200);
      screen = await tester.getScreenText();
      expect(screen).toContain('Resized to 100x30');
      
      // Quit and check event log
      await tester.sendKey('q');
      await tester.sleep(600);
      screen = await tester.getScreenText();
      expect(screen).toContain('Event Log:');
    });

    it('should handle event emitter patterns', async () => {
      const testScript = `
        import { createTerminal, TypedEventEmitter } from '../../dist/index.js';
        
        async function main() {
          const term = createTerminal();
          await term.init();
          
          term.screen.clear();
          term.screen.writeAt(0, 0, 'Event Emitter Test');
          
          // Create custom event emitter
          const emitter = new TypedEventEmitter();
          
          let eventCount = 0;
          
          // Test once
          emitter.once('test', (data) => {
            term.screen.writeAt(0, 2, \`Once event: \${data}\`);
          });
          
          // Test on
          emitter.on('test', (data) => {
            eventCount++;
            term.screen.writeAt(0, 3, \`On event #\${eventCount}: \${data}\`);
          });
          
          // Test multiple listeners
          const listener1 = () => term.screen.writeAt(0, 4, 'Listener 1 called');
          const listener2 = () => term.screen.writeAt(0, 5, 'Listener 2 called');
          
          emitter.on('multi', listener1);
          emitter.on('multi', listener2);
          
          // Emit events
          emitter.emit('test', 'first');
          emitter.emit('test', 'second');
          emitter.emit('multi', null);
          
          // Remove listener
          emitter.off('multi', listener1);
          emitter.emit('multi', null);
          
          // Test removeAllListeners
          emitter.removeAllListeners('test');
          emitter.emit('test', 'should not appear');
          
          // Display results
          term.screen.writeAt(0, 7, \`Total events: \${eventCount}\`);
          term.screen.writeAt(0, 8, \`Listener count for 'multi': \${emitter.listenerCount('multi')}\`);
          
          setTimeout(() => {
            term.close();
            process.exit(0);
          }, 1000);
        }
        
        main();
      `;
      
      const tempFile = path.join(fixturesDir, 'test-emitter.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-emitter-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Event Emitter Test', { timeout: 5000 });
      await tester.sleep(500);
      
      const screen = await tester.getScreenText();
      
      // Check once event (should only appear once)
      expect(screen).toContain('Once event: first');
      expect(screen).not.toContain('Once event: second');
      
      // Check on events
      expect(screen).toContain('On event #1: first');
      expect(screen).toContain('On event #2: second');
      
      // Check multiple listeners
      expect(screen).toContain('Listener 1 called');
      expect(screen).toContain('Listener 2 called');
      
      // Check listener count
      expect(screen).toContain('Listener count for \'multi\': 1');
      expect(screen).toContain('Total events: 2');
    });
  });

  describe('Error Handling', () => {
    it('should handle terminal errors gracefully', async () => {
      const testScript = `
        import { createTerminal, TerminalError, ErrorCode } from '../../dist/index.js';
        
        async function main() {
          const term = createTerminal();
          await term.init();
          
          term.screen.clear();
          term.screen.writeAt(0, 0, 'Error Handling Test');
          
          const errors = [];
          
          // Test various error conditions
          try {
            // Try invalid cursor position
            term.cursor.moveTo(-1, -1);
          } catch (error) {
            errors.push('Invalid cursor position caught');
          }
          
          try {
            // Try writing at invalid position
            term.screen.writeAt(1000, 1000, 'Out of bounds');
          } catch (error) {
            errors.push('Out of bounds write caught');
          }
          
          try {
            // Create TerminalError
            throw new TerminalError('Custom error', ErrorCode.OPERATION_FAILED);
          } catch (error) {
            if (error instanceof TerminalError) {
              errors.push(\`TerminalError: \${error.code}\`);
            }
          }
          
          try {
            // Try to use terminal after closing
            const term2 = createTerminal();
            await term2.init();
            await term2.close();
            term2.screen.write('Should fail');
          } catch (error) {
            errors.push('Write after close caught');
          }
          
          // Display caught errors
          term.screen.writeAt(0, 2, 'Errors caught:');
          errors.forEach((err, i) => {
            term.screen.writeAt(0, 3 + i, \`- \${err}\`);
          });
          
          term.screen.writeAt(0, 8, \`Total errors: \${errors.length}\`);
          
          setTimeout(() => {
            term.close();
            process.exit(0);
          }, 1000);
        }
        
        main().catch((error) => {
          console.error('Fatal error:', error);
          process.exit(1);
        });
      `;
      
      const tempFile = path.join(fixturesDir, 'test-errors.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-errors-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Error Handling Test', { timeout: 5000 });
      await tester.sleep(500);
      
      const screen = await tester.getScreenText();
      
      expect(screen).toContain('Errors caught:');
      expect(screen).toContain('TerminalError:');
      expect(screen).toContain('Total errors:');
    });

    it('should handle stream errors', async () => {
      const testScript = `
        import { createTerminal, createTerminalStream } from '../../dist/index.js';
        
        async function main() {
          const term = createTerminal();
          await term.init();
          
          term.screen.clear();
          term.screen.writeAt(0, 0, 'Stream Error Test');
          
          // Test stream error handling
          const stream = createTerminalStream(process.stdout, process.stdin);
          
          let errorHandled = false;
          
          // Simulate stream error
          stream.on('error', (error) => {
            errorHandled = true;
            term.screen.writeAt(0, 2, \`Stream error handled: \${error.message}\`);
          });
          
          // Test write to closed stream
          try {
            const closedStream = createTerminalStream(null, null);
            closedStream.write('test');
          } catch (error) {
            term.screen.writeAt(0, 3, 'Closed stream write caught');
          }
          
          // Test input stream errors
          term.input.on('error', (error) => {
            term.screen.writeAt(0, 4, \`Input error: \${error.message}\`);
          });
          
          term.screen.writeAt(0, 6, 'Error handling complete');
          
          setTimeout(() => {
            term.close();
            process.exit(0);
          }, 1000);
        }
        
        main();
      `;
      
      const tempFile = path.join(fixturesDir, 'test-stream-errors.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-stream-errors-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Stream Error Test', { timeout: 5000 });
      await tester.sleep(500);
      
      const screen = await tester.getScreenText();
      
      expect(screen).toContain('Stream Error Test');
      expect(screen).toContain('Error handling complete');
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid input', async () => {
      const testScript = `
        import { createTerminal } from '../../dist/index.js';
        
        async function main() {
          const term = createTerminal({ rawMode: true });
          await term.init();
          
          term.screen.clear();
          term.screen.writeAt(0, 0, 'Rapid Input Test');
          
          let keyCount = 0;
          let lastKey = '';
          
          term.input.on('key', (event) => {
            keyCount++;
            lastKey = event.key;
            term.screen.writeAt(0, 2, \`Keys pressed: \${keyCount}     \`);
            term.screen.writeAt(0, 3, \`Last key: \${lastKey}     \`);
            
            if (keyCount >= 10) {
              term.screen.writeAt(0, 5, 'Rapid input handled successfully');
              setTimeout(() => {
                term.close();
                process.exit(0);
              }, 500);
            }
          });
        }
        
        main();
      `;
      
      const tempFile = path.join(fixturesDir, 'test-rapid-input.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-rapid-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Rapid Input Test', { timeout: 5000 });
      
      // Send rapid key presses
      for (let i = 0; i < 10; i++) {
        await tester.sendKey(String(i));
        await tester.sleep(10); // Very short delay
      }
      
      await tester.waitForText('Rapid input handled successfully', { timeout: 5000 });
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Keys pressed: 10');
    });

    it('should handle very long text', async () => {
      const testScript = `
        import { createTerminal } from '../../dist/index.js';
        
        async function main() {
          const term = createTerminal();
          await term.init();
          
          term.screen.clear();
          term.screen.writeAt(0, 0, 'Long Text Test');
          
          // Generate very long text
          const longText = 'A'.repeat(1000);
          
          // Write long text (should wrap or truncate)
          term.screen.writeAt(0, 2, longText);
          
          // Write multiline text
          const multiline = Array(50).fill('Line of text').join('\\n');
          term.screen.write(multiline);
          
          // Test buffer with long content
          const buffer = term.screen.createBuffer();
          buffer.fill('X');
          const rendered = buffer.render();
          
          term.screen.writeAt(0, 1, \`Buffer size: \${rendered.length} chars\`);
          
          setTimeout(() => {
            term.close();
            process.exit(0);
          }, 1000);
        }
        
        main();
      `;
      
      const tempFile = path.join(fixturesDir, 'test-long-text.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-long-text-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Long Text Test', { timeout: 5000 });
      await tester.sleep(500);
      
      const screen = await tester.getScreenText();
      
      expect(screen).toContain('Long Text Test');
      expect(screen).toContain('Buffer size:');
      expect(screen).toContain('AAAA'); // Part of long text
    });

    it('should handle special characters and Unicode', async () => {
      const testScript = `
        import { createTerminal } from '../../dist/index.js';
        
        async function main() {
          const term = createTerminal();
          await term.init();
          
          term.screen.clear();
          term.screen.writeAt(0, 0, 'Unicode Test');
          
          // Test various Unicode characters
          term.screen.writeAt(0, 2, 'Emoji: 😀 🎉 🚀');
          term.screen.writeAt(0, 3, 'Symbols: ♠ ♣ ♥ ♦');
          term.screen.writeAt(0, 4, 'Math: ∑ ∏ √ ∞');
          term.screen.writeAt(0, 5, 'Arrows: ← → ↑ ↓');
          term.screen.writeAt(0, 6, 'Box: ┌─┐│└┘');
          term.screen.writeAt(0, 7, 'CJK: 你好 こんにちは 안녕하세요');
          
          // Test escape sequences
          term.screen.writeAt(0, 9, 'Escaped: \\\\n \\\\t \\\\r');
          
          setTimeout(() => {
            term.close();
            process.exit(0);
          }, 1000);
        }
        
        main();
      `;
      
      const tempFile = path.join(fixturesDir, 'test-unicode.js');
      await fs.writeFile(tempFile, testScript);
      tempFiles.push(tempFile);
      
      tester = createTester(`node ${tempFile}`, {
        sessionName: `trm-unicode-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Unicode Test', { timeout: 5000 });
      await tester.sleep(500);
      
      const screen = await tester.getScreenText();
      
      expect(screen).toContain('Unicode Test');
      expect(screen).toContain('Emoji:');
      expect(screen).toContain('Symbols:');
      expect(screen).toContain('Math:');
      expect(screen).toContain('Arrows:');
      expect(screen).toContain('Box:');
      expect(screen).toContain('CJK:');
    });
  });
});