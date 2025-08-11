import path from 'path';
import { fileURLToPath } from 'url';
import { it, expect, describe } from 'vitest';
import { TmuxTester, createTester } from '@xec-sh/tui-tester';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Color Modes Integration', () => {
  let tester: TmuxTester;

  it('should render colors correctly', async () => {
    const fixturesDir = path.join(__dirname, '../fixtures');
    
    tester = createTester(`node ${fixturesDir}/test-colors.cjs`, {
      sessionName: `trm-colors-${Date.now()}`
    });
    
    await tester.start();
    await tester.waitForText('Color Test', { timeout: 5000 });
    
    const screen = await tester.getScreenText();
    
    // Verify the test output
    expect(screen).toContain('Color Test');
    expect(screen).toContain('Red Text');
    expect(screen).toContain('Green Text');
    expect(screen).toContain('Blue Text');
    expect(screen).toContain('Yellow Text');
    expect(screen).toContain('White on Blue');
    expect(screen).toContain('Custom RGB');
    expect(screen).toContain('256 Color');
    expect(screen).toContain('Colors rendered successfully');
    
    await tester.stop();
  });

  it('should handle different color depths', async () => {
    const fixturesDir = path.join(__dirname, '../fixtures');
    
    // Create a test that exercises different color depths
    const testScript = `
      const { createTerminal, ColorSystem, ColorDepth, x, y } = require('../../dist/index.cjs');
      
      async function test() {
        const terminal = createTerminal({ mode: 'inline' });
        await terminal.init();
        
        // Test different color depths
        const depths = [
          { depth: ColorDepth.None, name: 'Monochrome' },
          { depth: ColorDepth.Basic, name: '16 Colors' },
          { depth: ColorDepth.Extended, name: '256 Colors' },
          { depth: ColorDepth.TrueColor, name: 'True Color' }
        ];
        
        for (const { depth, name } of depths) {
          const colors = new ColorSystem(depth);
          console.log(\`Testing \${name}\`);
          
          // Test that color methods work for each depth
          const red = colors.red;
          const green = colors.green;
          const blue = colors.blue;
          
          // These should all return valid color codes
          expect(red).toBeTruthy();
          expect(green).toBeTruthy();
          expect(blue).toBeTruthy();
        }
        
        console.log('Color depth test complete');
        await terminal.close();
        process.exit(0);
      }
      
      test().catch(err => {
        console.error(err);
        process.exit(1);
      });
    `;
    
    // Write temporary test file
    const fs = await import('fs/promises');
    const testFile = path.join(fixturesDir, 'test-color-depths.cjs');
    await fs.writeFile(testFile, testScript);
    
    tester = createTester(`node ${testFile}`, {
      sessionName: `trm-depth-${Date.now()}`
    });
    
    await tester.start();
    await tester.waitForText('Color depth test complete', { timeout: 5000 });
    
    const screen = await tester.getScreenText();
    expect(screen).toContain('Testing Monochrome');
    expect(screen).toContain('Testing 16 Colors');
    expect(screen).toContain('Testing 256 Colors');
    expect(screen).toContain('Testing True Color');
    expect(screen).toContain('Color depth test complete');
    
    await tester.stop();
    
    // Clean up temp file
    await fs.unlink(testFile);
  });

  it('should handle styles with colors', async () => {
    const fixturesDir = path.join(__dirname, '../fixtures');
    
    // Create a test for styles
    const testScript = `
      const { createTerminal, ColorSystem, ColorDepth, x, y } = require('../../dist/index.cjs');
      
      async function test() {
        const terminal = createTerminal({ mode: 'inline' });
        await terminal.init();
        
        const colors = new ColorSystem(ColorDepth.TrueColor);
        const buffer = terminal.buffer.create(80, 10);
        
        console.log('=== Style Test ===');
        
        // Test different styles
        buffer.writeText(x(0), y(0), 'Bold Text', { 
          fg: colors.red, 
          bold: true 
        });
        
        buffer.writeText(x(0), y(1), 'Italic Text', { 
          fg: colors.green, 
          italic: true 
        });
        
        buffer.writeText(x(0), y(2), 'Underlined', { 
          fg: colors.blue, 
          underline: true 
        });
        
        buffer.writeText(x(0), y(3), 'Strikethrough', { 
          fg: colors.yellow, 
          strikethrough: true 
        });
        
        buffer.writeText(x(0), y(4), 'Dim Text', { 
          fg: colors.cyan, 
          dim: true 
        });
        
        buffer.writeText(x(0), y(5), 'Inverse', { 
          fg: colors.white, 
          bg: colors.black,
          inverse: true 
        });
        
        terminal.buffer.render(buffer);
        
        console.log('\\nStyles rendered successfully');
        await terminal.close();
        
        setTimeout(() => process.exit(0), 100);
      }
      
      test().catch(err => {
        console.error(err);
        process.exit(1);
      });
    `;
    
    // Write temporary test file
    const fs = await import('fs/promises');
    const testFile = path.join(fixturesDir, 'test-styles.cjs');
    await fs.writeFile(testFile, testScript);
    
    tester = createTester(`node ${testFile}`, {
      sessionName: `trm-styles-${Date.now()}`
    });
    
    await tester.start();
    await tester.waitForText('Style Test', { timeout: 5000 });
    
    const screen = await tester.getScreenText();
    expect(screen).toContain('Style Test');
    expect(screen).toContain('Bold Text');
    expect(screen).toContain('Italic Text');
    expect(screen).toContain('Underlined');
    expect(screen).toContain('Strikethrough');
    expect(screen).toContain('Dim Text');
    expect(screen).toContain('Inverse');
    expect(screen).toContain('Styles rendered successfully');
    
    await tester.stop();
    
    // Clean up temp file
    await fs.unlink(testFile);
  });

  it('should handle gradients and complex colors', async () => {
    const fixturesDir = path.join(__dirname, '../fixtures');
    
    // Create a test for gradients
    const testScript = `
      const { createTerminal, ColorSystem, ColorDepth, x, y, cols } = require('../../dist/index.cjs');
      
      async function test() {
        const terminal = createTerminal({ mode: 'inline' });
        await terminal.init();
        
        const colors = new ColorSystem(ColorDepth.TrueColor);
        const buffer = terminal.buffer.create(80, 10);
        
        console.log('=== Gradient Test ===');
        
        // Create a horizontal gradient
        const gradientWidth = 40;
        for (let i = 0; i < gradientWidth; i++) {
          const hue = (i * 360) / gradientWidth;
          const color = colors.hsl(hue, 100, 50);
          buffer.writeText(x(i), y(0), '█', { fg: color });
        }
        
        // Create RGB gradient
        for (let i = 0; i < gradientWidth; i++) {
          const intensity = Math.floor((i / gradientWidth) * 255);
          const color = colors.rgb(intensity, 0, 255 - intensity);
          buffer.writeText(x(i), y(1), '█', { fg: color });
        }
        
        // Create grayscale gradient
        for (let i = 0; i < gradientWidth; i++) {
          const gray = Math.floor((i / gradientWidth) * 255);
          const color = colors.rgb(gray, gray, gray);
          buffer.writeText(x(i), y(2), '█', { fg: color });
        }
        
        terminal.buffer.render(buffer);
        
        console.log('\\nGradients rendered successfully');
        await terminal.close();
        
        setTimeout(() => process.exit(0), 100);
      }
      
      test().catch(err => {
        console.error(err);
        process.exit(1);
      });
    `;
    
    // Write temporary test file
    const fs = await import('fs/promises');
    const testFile = path.join(fixturesDir, 'test-gradients.cjs');
    await fs.writeFile(testFile, testScript);
    
    tester = createTester(`node ${testFile}`, {
      sessionName: `trm-gradient-${Date.now()}`
    });
    
    await tester.start();
    await tester.waitForText('Gradient Test', { timeout: 5000 });
    
    const screen = await tester.getScreenText();
    expect(screen).toContain('Gradient Test');
    expect(screen).toContain('█'); // Should contain gradient blocks
    expect(screen).toContain('Gradients rendered successfully');
    
    await tester.stop();
    
    // Clean up temp file
    await fs.unlink(testFile);
  });
});