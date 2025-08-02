/**
 * Tests for Task API
 * Using real file operations and command execution
 */

import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { TaskAPI } from '../../src/api/task-api.js';

describe('Task API', () => {
  let tempDir: string;
  let projectDir: string;
  let configPath: string;
  let api: TaskAPI;
  let outputFile: string;

  beforeEach(async () => {
    // Create temporary directory structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-task-api-test-'));
    projectDir = path.join(tempDir, 'project');
    
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, '.xec'), { recursive: true });
    
    configPath = path.join(projectDir, '.xec', 'config.yaml');
    outputFile = path.join(tempDir, 'output.txt');
    
    // Change to project directory
    process.chdir(projectDir);
    
    // Create fresh API instance for each test
    api = new TaskAPI();
  });

  afterEach(async () => {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('list()', () => {
    it('should list all tasks', async () => {
      const config = {
        version: '2.0',
        tasks: {
          test: 'echo "Running tests"',
          build: {
            command: 'echo "Building app"',
            description: 'Build the application'
          },
          deploy: {
            command: 'echo "Deploying"',
            target: 'hosts.prod'
          }
        }
      };
      
      await fs.writeFile(configPath, yaml.dump(config));
      
      const tasks = await api.list();
      
      expect(tasks).toHaveLength(3);
      expect(tasks.map(t => t.name)).toContain('test');
      expect(tasks.map(t => t.name)).toContain('build');
      expect(tasks.map(t => t.name)).toContain('deploy');
      
      const buildTask = tasks.find(t => t.name === 'build');
      expect(buildTask?.description).toBe('Build the application');
    });

    it('should filter tasks by pattern', async () => {
      const config = {
        version: '2.0',
        tasks: {
          'test:unit': 'echo "Unit tests"',
          'test:integration': 'echo "Integration tests"',
          'build': 'echo "Build"',
          'deploy:staging': 'echo "Deploy staging"',
          'deploy:prod': 'echo "Deploy prod"'
        }
      };
      
      await fs.writeFile(configPath, yaml.dump(config));
      
      const testTasks = await api.list('test');
      expect(testTasks).toHaveLength(2);
      expect(testTasks.every(t => t.name.includes('test'))).toBe(true);
      
      const deployTasks = await api.list('deploy');
      expect(deployTasks).toHaveLength(2);
      expect(deployTasks.every(t => t.name.includes('deploy'))).toBe(true);
    });

    it('should handle empty task list', async () => {
      const config = { version: '2.0' };
      await fs.writeFile(configPath, yaml.dump(config));
      
      const tasks = await api.list();
      expect(tasks).toHaveLength(0);
    });
  });

  describe('get()', () => {
    beforeEach(async () => {
      const config = {
        version: '2.0',
        tasks: {
          simple: 'echo "Simple task"',
          complex: {
            command: 'echo "Complex task"',
            description: 'A complex task',
            target: 'local',
            timeout: 30000
          }
        }
      };
      
      await fs.writeFile(configPath, yaml.dump(config));
    });

    it('should get simple task definition', async () => {
      const task = await api.get('simple');
      
      expect(task).toBeDefined();
      expect(task?.name).toBe('simple');
      expect(task?.command).toBe('echo "Simple task"');
    });

    it('should get complex task definition', async () => {
      const task = await api.get('complex');
      
      expect(task).toBeDefined();
      expect(task?.name).toBe('complex');
      expect(task?.command).toBe('echo "Complex task"');
      expect(task?.description).toBe('A complex task');
      expect(task?.target).toBe('local');
      expect(task?.timeout).toBe(30000);
    });

    it('should return undefined for non-existent task', async () => {
      const task = await api.get('nonexistent');
      expect(task).toBeUndefined();
    });
  });

  describe('run()', () => {
    it('should execute simple command task', async () => {
      const config = {
        version: '2.0',
        tasks: {
          write: `echo "Task executed" > ${outputFile}`
        }
      };
      
      await fs.writeFile(configPath, yaml.dump(config));
      
      const result = await api.run('write');
      
      expect(result.success).toBe(true);
      
      // Verify file was created
      const content = await fs.readFile(outputFile, 'utf-8');
      expect(content.trim()).toBe('Task executed');
    });

    it('should execute task with parameters', async () => {
      const config = {
        version: '2.0',
        tasks: {
          greet: {
            command: `echo "Hello, \${params.name}!" > ${outputFile}`,
            params: [
              { name: 'name', default: 'World' }
            ]
          }
        }
      };
      
      await fs.writeFile(configPath, yaml.dump(config));
      
      const result = await api.run('greet', { name: 'Alice' });
      
      expect(result.success).toBe(true);
      
      const content = await fs.readFile(outputFile, 'utf-8');
      expect(content.trim()).toBe('Hello, Alice!');
    });

    it('should execute multi-step task', async () => {
      const step1File = path.join(tempDir, 'step1.txt');
      const step2File = path.join(tempDir, 'step2.txt');
      
      const config = {
        version: '2.0',
        tasks: {
          multi: {
            steps: [
              { name: 'Step 1', command: `echo "Step 1" > ${step1File}` },
              { name: 'Step 2', command: `echo "Step 2" > ${step2File}` }
            ]
          }
        }
      };
      
      await fs.writeFile(configPath, yaml.dump(config));
      
      const result = await api.run('multi');
      
      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(2);
      expect(result.steps?.[0].name).toBe('Step 1');
      expect(result.steps?.[0].success).toBe(true);
      expect(result.steps?.[1].name).toBe('Step 2');
      expect(result.steps?.[1].success).toBe(true);
      
      // Verify both files were created
      const content1 = await fs.readFile(step1File, 'utf-8');
      const content2 = await fs.readFile(step2File, 'utf-8');
      expect(content1.trim()).toBe('Step 1');
      expect(content2.trim()).toBe('Step 2');
    });

    it('should handle task failure', async () => {
      const config = {
        version: '2.0',
        tasks: {
          fail: 'exit 1'
        }
      };
      
      await fs.writeFile(configPath, yaml.dump(config));
      
      const result = await api.run('fail');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should throw for non-existent task', async () => {
      const config = { version: '2.0', tasks: {} };
      await fs.writeFile(configPath, yaml.dump(config));
      
      await expect(api.run('nonexistent')).rejects.toThrow("Task 'nonexistent' not found");
    });
  });

  describe('create()', () => {
    it('should create new task', async () => {
      const config = { version: '2.0' };
      await fs.writeFile(configPath, yaml.dump(config));
      
      await api.create('new-task', {
        command: 'echo "New task"',
        description: 'A newly created task'
      });
      
      // Verify task was saved to config
      const savedContent = await fs.readFile(configPath, 'utf-8');
      const savedConfig = yaml.load(savedContent) as any;
      
      expect(savedConfig.tasks['new-task']).toBeDefined();
      expect(savedConfig.tasks['new-task'].command).toBe('echo "New task"');
      expect(savedConfig.tasks['new-task'].description).toBe('A newly created task');
      
      // Verify task can be retrieved
      const task = await api.get('new-task');
      expect(task?.command).toBe('echo "New task"');
    });
  });

  describe('update()', () => {
    beforeEach(async () => {
      const config = {
        version: '2.0',
        tasks: {
          existing: {
            command: 'echo "Original"',
            description: 'Original description'
          }
        }
      };
      
      await fs.writeFile(configPath, yaml.dump(config));
    });

    it('should update existing task', async () => {
      await api.update('existing', {
        command: 'echo "Updated"',
        timeout: 60000
      });
      
      const task = await api.get('existing');
      expect(task?.command).toBe('echo "Updated"');
      expect(task?.description).toBe('Original description'); // Preserved
      expect(task?.timeout).toBe(60000); // Added
    });

    it('should throw when updating non-existent task', async () => {
      await expect(api.update('nonexistent', { command: 'test' }))
        .rejects.toThrow("Task 'nonexistent' not found");
    });
  });

  describe('delete()', () => {
    beforeEach(async () => {
      const config = {
        version: '2.0',
        tasks: {
          'to-delete': 'echo "Delete me"',
          'to-keep': 'echo "Keep me"'
        }
      };
      
      await fs.writeFile(configPath, yaml.dump(config));
    });

    it('should delete task', async () => {
      await api.delete('to-delete');
      
      const tasks = await api.list();
      expect(tasks.map(t => t.name)).not.toContain('to-delete');
      expect(tasks.map(t => t.name)).toContain('to-keep');
      
      // Verify in config file
      const savedContent = await fs.readFile(configPath, 'utf-8');
      const savedConfig = yaml.load(savedContent) as any;
      expect(savedConfig.tasks['to-delete']).toBeUndefined();
      expect(savedConfig.tasks['to-keep']).toBeDefined();
    });

    it('should throw when deleting non-existent task', async () => {
      await expect(api.delete('nonexistent'))
        .rejects.toThrow("Task 'nonexistent' not found");
    });
  });

  describe('exists()', () => {
    beforeEach(async () => {
      const config = {
        version: '2.0',
        tasks: {
          existing: 'echo "I exist"'
        }
      };
      
      await fs.writeFile(configPath, yaml.dump(config));
    });

    it('should check task existence', async () => {
      expect(await api.exists('existing')).toBe(true);
      expect(await api.exists('nonexistent')).toBe(false);
    });
  });

  describe('runSequence()', () => {
    it('should run tasks in sequence', async () => {
      const file1 = path.join(tempDir, '1.txt');
      const file2 = path.join(tempDir, '2.txt');
      const file3 = path.join(tempDir, '3.txt');
      
      const config = {
        version: '2.0',
        tasks: {
          task1: `echo "1" > ${file1}`,
          task2: `echo "2" > ${file2}`,
          task3: `echo "3" > ${file3}`
        }
      };
      
      await fs.writeFile(configPath, yaml.dump(config));
      
      const results = await api.runSequence(['task1', 'task2', 'task3']);
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      
      // Verify files were created in order
      expect(await fs.readFile(file1, 'utf-8')).toBe('1\n');
      expect(await fs.readFile(file2, 'utf-8')).toBe('2\n');
      expect(await fs.readFile(file3, 'utf-8')).toBe('3\n');
    });

    it('should stop on failure by default', async () => {
      const file1 = path.join(tempDir, 'seq1.txt');
      const file3 = path.join(tempDir, 'seq3.txt');
      
      const config = {
        version: '2.0',
        tasks: {
          first: `echo "first" > ${file1}`,
          failing: 'exit 1',
          third: `echo "should not run" > ${file3}`
        }
      };
      
      await fs.writeFile(configPath, yaml.dump(config));
      
      const results = await api.runSequence(['first', 'failing', 'third']);
      
      expect(results).toHaveLength(2); // Should stop after failure
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      
      // Verify third task didn't run
      await expect(fs.access(file3)).rejects.toThrow();
    });
  });

  describe('runParallel()', () => {
    it('should run tasks in parallel', async () => {
      const startTime = Date.now();
      
      const config = {
        version: '2.0',
        tasks: {
          // Each task sleeps for 100ms
          task1: 'sleep 0.1',
          task2: 'sleep 0.1',
          task3: 'sleep 0.1'
        }
      };
      
      await fs.writeFile(configPath, yaml.dump(config));
      
      const results = await api.runParallel(['task1', 'task2', 'task3']);
      
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      
      // Should take ~100ms if parallel, would take ~300ms if sequential
      expect(duration).toBeLessThan(200);
    });
  });

  describe('dryRun()', () => {
    it('should show commands without executing', async () => {
      const config = {
        version: '2.0',
        tasks: {
          simple: 'echo "Should not execute"',
          multi: {
            steps: [
              { command: 'echo "Step 1"' },
              { command: 'echo "Step 2"' },
              { task: 'simple' }
            ]
          }
        }
      };
      
      await fs.writeFile(configPath, yaml.dump(config));
      
      const simpleCommands = await api.dryRun('simple');
      expect(simpleCommands).toEqual(['echo "Should not execute"']);
      
      const multiCommands = await api.dryRun('multi');
      expect(multiCommands).toEqual([
        'echo "Step 1"',
        'echo "Step 2"',
        '[Task: simple]'
      ]);
      
      // Verify nothing was executed (no output file)
      await expect(fs.access(outputFile)).rejects.toThrow();
    });
  });

  describe('Task execution with environment variables', () => {
    it('should pass environment variables to tasks', async () => {
      const envFile = path.join(tempDir, 'env.txt');
      
      const config = {
        version: '2.0',
        tasks: {
          'env-test': `echo "$TEST_ENV_VAR" > ${envFile}`
        }
      };
      
      await fs.writeFile(configPath, yaml.dump(config));
      
      await api.run('env-test', {}, {
        env: { TEST_ENV_VAR: 'custom-value' }
      });
      
      const content = await fs.readFile(envFile, 'utf-8');
      expect(content.trim()).toBe('custom-value');
    });
  });

  describe('Task with script execution', () => {
    it('should execute task with script', async () => {
      const scriptFile = path.join(projectDir, 'test-script.js');
      const scriptOutput = path.join(tempDir, 'script-output.txt');
      
      // Create a simple script
      await fs.writeFile(scriptFile, `
        import { writeFileSync } from 'fs';
        writeFileSync('${scriptOutput}', 'Script executed');
      `);
      
      const config = {
        version: '2.0',
        tasks: {
          'run-script': {
            script: scriptFile
          }
        }
      };
      
      await fs.writeFile(configPath, yaml.dump(config));
      
      const result = await api.run('run-script');
      
      expect(result.success).toBe(true);
      
      // Verify script output
      const content = await fs.readFile(scriptOutput, 'utf-8');
      expect(content).toBe('Script executed');
    });
  });
});