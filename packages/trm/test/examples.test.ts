import { join } from 'path';
import { spawn } from 'child_process';
import { it, expect, describe } from 'vitest';

describe('Examples', () => {
  describe('01-basic-terminal.ts', () => {
    it('should run without errors', async () => {
      const examplePath = join(__dirname, '..', 'examples', '01-basic-terminal.ts');
      
      const output = await runExample(examplePath);
      
      // Check for expected output
      expect(output).toContain('Platform detected:');
      expect(output).toContain('Terminal initialized');
      expect(output).toContain('Clearing screen...');
      expect(output).toContain('Writing text at different positions...');
      expect(output).toContain('Moving cursor...');
      expect(output).toContain('Drawing a box...');
      expect(output).toContain('Scrolling demonstration...');
      expect(output).toContain('Terminal closed');
      
      // Should not contain error messages
      expect(output).not.toContain('Error:');
      expect(output).not.toContain('TypeError:');
      expect(output).not.toContain('is not a function');
    });
  });

  describe('02-cursor-control.ts', () => {
    it('should start without errors', async () => {
      const examplePath = join(__dirname, '..', 'examples', '02-cursor-control.ts');
      
      // Run for a short time to check it starts properly
      const output = await runExample(examplePath, 500);
      
      // Check for expected initial output
      expect(output).toContain('=== TRM Core Example: Cursor Control ===');
      expect(output).toContain('Demonstrating cursor operations...');
      
      // Should not contain error messages
      expect(output).not.toContain('Error:');
      expect(output).not.toContain('TypeError:');
      expect(output).not.toContain('is not a function');
    });
  });
});

/**
 * Helper to run an example and capture output
 */
function runExample(path: string, timeout = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', path], {
      env: { ...process.env, FORCE_COLOR: '0' }
    });
    
    let output = '';
    let error = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    child.on('error', (err) => {
      reject(err);
    });
    
    // Set timeout to kill long-running examples
    const timer = setTimeout(() => {
      child.kill();
      resolve(output + error);
    }, timeout);
    
    child.on('close', () => {
      clearTimeout(timer);
      resolve(output + error);
    });
  });
}