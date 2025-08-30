/**
 * Tests for TaskManager with real implementations
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { TaskManager } from '../../src/config/task-manager.js';
import { ConfigurationManager } from '../../src/config/configuration-manager.js';

import type { TaskConfig, Configuration } from '../../src/config/types.js';

describe('TaskManager', () => {
  let taskManager: TaskManager;
  let configManager: ConfigurationManager;
  let testDir: string;
  let configPath: string;
  let testConfig: Configuration;

  beforeEach(async () => {
    // Create a temporary directory for tests
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-task-manager-test-'));
    configPath = path.join(testDir, '.xec', 'config.yaml');

    // Create .xec directory
    await fs.mkdir(path.join(testDir, '.xec'), { recursive: true });

    // Create test output directory for file-based tests
    await fs.mkdir(path.join(testDir, 'test-output'), { recursive: true });

    testConfig = {
      version: '2.0',
      tasks: {
        test: `echo "test output" > ${path.join(testDir, 'test-output', 'test.txt')}`,
        build: {
          command: `echo "building..." > ${path.join(testDir, 'test-output', 'build.txt')}`,
          description: 'Build the project',
        },
        deploy: {
          description: 'Deploy application',
          steps: [
            { name: 'Build', task: 'build' },
            { name: 'Upload', command: `echo "uploading..." > ${path.join(testDir, 'test-output', 'upload.txt')}` },
          ],
        },
        greet: {
          command: `echo "Hello \${params.name}" > ${path.join(testDir, 'test-output', 'greet.txt')}`,
          params: [
            {
              name: 'name',
              type: 'string',
              required: true,
              description: 'Name to greet',
            },
          ],
        },
      },
    };

    // Write the configuration file
    await fs.writeFile(
      configPath,
      `version: '2.0'
tasks:
  test: 'echo "test output" > ${path.join(testDir, 'test-output', 'test.txt')}'
  build:
    command: 'echo "building..." > ${path.join(testDir, 'test-output', 'build.txt')}'
    description: 'Build the project'
  deploy:
    description: 'Deploy application'
    steps:
      - name: 'Build'
        task: 'build'
      - name: 'Upload'
        command: 'echo "uploading..." > ${path.join(testDir, 'test-output', 'upload.txt')}'
  greet:
    command: 'echo "Hello \${params.name}" > ${path.join(testDir, 'test-output', 'greet.txt')}'
    params:
      - name: 'name'
        type: 'string'
        required: true
        description: 'Name to greet'
`
    );

    configManager = new ConfigurationManager({
      projectRoot: testDir,
      debug: false,
    });

    taskManager = new TaskManager({
      configManager,
      debug: false,
      dryRun: false,
    });
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => { });
    }
  });

  describe('load', () => {
    it('should load tasks from configuration', async () => {
      await taskManager.load();

      const tasks = await taskManager.list();
      expect(tasks).toHaveLength(4);
      expect(tasks.map(t => t.name)).toEqual(['build', 'deploy', 'greet', 'test']);
    });

    it('should handle missing tasks section', async () => {
      // Create a config file without tasks
      await fs.writeFile(configPath, `version: '2.0'\n`);

      // Create new manager with this config
      const emptyConfigManager = new ConfigurationManager({ projectRoot: testDir });
      const emptyTaskManager = new TaskManager({
        configManager: emptyConfigManager,
        debug: false,
        dryRun: false,
      });

      await emptyTaskManager.load();

      const tasks = await emptyTaskManager.list();
      expect(tasks).toHaveLength(0);
    });
  });

  describe('list', () => {
    it('should list all tasks with info', async () => {
      await taskManager.load();

      const tasks = await taskManager.list();

      const testTask = tasks.find(t => t.name === 'test');
      expect(testTask).toBeDefined();
      expect(testTask?.name).toBe('test');
      expect(testTask?.hasCommand).toBe(true);
      expect(testTask?.hasSteps).toBe(false);
      expect(testTask?.hasScript).toBe(false);
      expect(testTask?.isPrivate).toBeUndefined();
      expect(testTask?.params).toBeUndefined();
      expect(testTask?.target).toBeUndefined();
      expect(testTask?.targets).toBeUndefined();

      const deployTask = tasks.find(t => t.name === 'deploy');
      expect(deployTask?.hasSteps).toBe(true);
      expect(deployTask?.hasCommand).toBe(false);
    });

    it('should hide private tasks by default', async () => {
      // Write config with private task
      await fs.writeFile(
        configPath,
        `version: '2.0'
tasks:
  test: 'echo "test"'
  private:
    command: 'echo "private" > ${path.join(testDir, 'test-output', 'private.txt')}'
    private: true
`
      );

      await taskManager.load();

      const tasks = await taskManager.list();
      expect(tasks.find(t => t.name === 'private')).toBeUndefined();
    });

    it('should show private tasks in debug mode', async () => {
      // Write config with private task
      await fs.writeFile(
        configPath,
        `version: '2.0'
tasks:
  test: 'echo "test"'
  private:
    command: 'echo "private" > ${path.join(testDir, 'test-output', 'private.txt')}'
    private: true
`
      );

      // Create manager in debug mode
      const debugConfigManager = new ConfigurationManager({
        projectRoot: testDir,
        debug: true,
      });
      const debugTaskManager = new TaskManager({
        configManager: debugConfigManager,
        debug: true,
        dryRun: false,
      });

      await debugTaskManager.load();

      const tasks = await debugTaskManager.list();
      expect(tasks.find(t => t.name === 'private')).toBeDefined();
    });
  });

  describe('get', () => {
    it('should get a specific task', async () => {
      await taskManager.load();

      const task = await taskManager.get('build');

      expect(task).toBeDefined();
      expect(task?.command).toContain('building...');
      expect(task?.description).toBe('Build the project');
    });

    it('should return null for non-existent task', async () => {
      await taskManager.load();

      const task = await taskManager.get('nonexistent');
      expect(task).toBeNull();
    });
  });

  describe('exists', () => {
    it('should check if task exists', async () => {
      await taskManager.load();

      expect(await taskManager.exists('test')).toBe(true);
      expect(await taskManager.exists('nonexistent')).toBe(false);
    });
  });

  describe('run', () => {
    it('should execute a simple task', async () => {
      await taskManager.load();

      const result = await taskManager.run('test');

      expect(result.success).toBe(true);
      expect(result.task).toBe('test');

      // Verify the command actually executed
      const content = await fs.readFile(path.join(testDir, 'test-output', 'test.txt'), 'utf8');
      expect(content.trim()).toBe('test output');
    });


    it('should execute task with parameters', async () => {
      await taskManager.load();

      const result = await taskManager.run('greet', { name: 'World' });

      expect(result.success).toBe(true);

      // Verify the command actually executed with the parameter
      const content = await fs.readFile(path.join(testDir, 'test-output', 'greet.txt'), 'utf8');
      expect(content.trim()).toBe('Hello World');
    });

    it('should validate required parameters', async () => {
      await taskManager.load();

      await expect(taskManager.run('greet'))
        .rejects.toThrow('Missing required parameter: name');
    });

    it('should throw for non-existent task', async () => {
      await taskManager.load();

      await expect(taskManager.run('nonexistent'))
        .rejects.toThrow("Task 'nonexistent' not found");
    });
  });

  describe('runOnTarget', () => {
    it('should execute task on specific target', async () => {
      await taskManager.load();

      // Run on a "virtual" target - TaskExecutor will just execute locally
      const result = await taskManager.runOnTarget('test', 'local');

      expect(result.success).toBe(true);

      // Verify the command executed
      const content = await fs.readFile(path.join(testDir, 'test-output', 'test.txt'), 'utf8');
      expect(content.trim()).toBe('test output');
    });
  });

  describe('create', () => {
    it('should create a new task', async () => {
      await taskManager.load();

      const newTask: TaskConfig = {
        command: `echo "new task output" > ${path.join(testDir, 'test-output', 'newtask.txt')}`,
        description: 'A new task',
      };

      await taskManager.create('newtask', newTask);

      expect(await taskManager.exists('newtask')).toBe(true);

      const task = await taskManager.get('newtask');
      expect(task?.description).toBe('A new task');

      // Verify we can run the new task
      const result = await taskManager.run('newtask');
      expect(result.success).toBe(true);

      // Verify the command executed
      const content = await fs.readFile(path.join(testDir, 'test-output', 'newtask.txt'), 'utf8');
      expect(content.trim()).toBe('new task output');

      // Verify the config file was updated
      const savedConfig = await fs.readFile(configPath, 'utf8');
      expect(savedConfig).toContain('newtask:');
    });

    it('should validate task configuration', async () => {
      await taskManager.load();

      const invalidTask: TaskConfig = {
        // No command, steps, or script
        description: 'Invalid',
      } as any;

      await expect(taskManager.create('invalid', invalidTask))
        .rejects.toThrow('Invalid task configuration');
    });
  });

  describe('update', () => {
    it('should update an existing task', async () => {
      await taskManager.load();

      await taskManager.update('test', {
        command: `echo "updated test output" > ${path.join(testDir, 'test-output', 'test-updated.txt')}`,
        description: 'Run tests with coverage',
      });

      const task = await taskManager.get('test');
      expect(task?.command).toContain('updated test output');
      expect(task?.description).toBe('Run tests with coverage');

      // Verify the updated task works
      const result = await taskManager.run('test');
      expect(result.success).toBe(true);

      // Verify the command executed
      const content = await fs.readFile(path.join(testDir, 'test-output', 'test-updated.txt'), 'utf8');
      expect(content.trim()).toBe('updated test output');
    });

    it('should throw for non-existent task', async () => {
      await taskManager.load();

      await expect(taskManager.update('nonexistent', { command: 'echo' }))
        .rejects.toThrow("Task 'nonexistent' not found");
    });
  });

  describe('delete', () => {
    it('should delete a task', async () => {
      await taskManager.load();

      expect(await taskManager.exists('test')).toBe(true);

      await taskManager.delete('test');

      expect(await taskManager.exists('test')).toBe(false);

      // Verify the config file was updated
      const savedConfig = await fs.readFile(configPath, 'utf8');
      expect(savedConfig).not.toContain('test:');
    });

    it('should throw for non-existent task', async () => {
      await taskManager.load();

      await expect(taskManager.delete('nonexistent'))
        .rejects.toThrow("Task 'nonexistent' not found");
    });
  });

  describe('explain', () => {
    it('should explain a simple command task', async () => {
      await taskManager.load();

      const explanation = await taskManager.explain('test');

      const explanationText = explanation.join('\n');
      expect(explanationText).toContain('Task:');
      expect(explanationText).toContain('Execute:');
      expect(explanationText).toContain('echo "test output"');
    });

    it('should explain a task with steps', async () => {
      await taskManager.load();

      const explanation = await taskManager.explain('deploy');

      const explanationText = explanation.join('\n');
      expect(explanationText).toContain('Task: Deploy application');
      expect(explanationText).toContain('Execute 2 steps:');
      expect(explanationText).toContain('1. Build: Run task \'build\'');
      expect(explanationText).toContain('2. Upload:');
      expect(explanationText).toContain('uploading...');
    });

    it('should explain task with parameters', async () => {
      await taskManager.load();

      const explanation = await taskManager.explain('greet', { name: 'Alice' });

      const explanationText = explanation.join('\n');
      expect(explanationText).toContain('Parameters:');
      expect(explanationText).toContain('name: Alice (required)');
      expect(explanationText).toContain('Execute:');
      // The explain method shows the interpolated command
      expect(explanationText).toMatch(/Hello (Alice|\\\$\{params\.name\})/);
    });

    it('should show default parameter values', async () => {
      // Write config with default parameters
      await fs.writeFile(
        configPath,
        `version: '2.0'
tasks:
  withDefaults:
    command: 'echo "\${params.message}" > ${path.join(testDir, 'test-output', 'defaults.txt')}'
    params:
      - name: 'message'
        type: 'string'
        default: 'Hello World'
`
      );

      await taskManager.load();

      const explanation = await taskManager.explain('withDefaults');

      const explanationText = explanation.join('\n');
      expect(explanationText).toContain('message: Hello World');
    });
  });

  describe('parameter validation', () => {
    beforeEach(async () => {
      // Write config with validation rules
      await fs.writeFile(
        configPath,
        `version: '2.0'
tasks:
  validated:
    command: 'echo "validated \${params.count} \${params.env} \${params.tags} \${params.version}" > ${path.join(testDir, 'test-output', 'validated.txt')}'
    params:
      - name: 'count'
        type: 'number'
        min: 1
        max: 10
      - name: 'env'
        type: 'enum'
        values: ['dev', 'staging', 'prod']
      - name: 'tags'
        type: 'array'
        minItems: 1
        maxItems: 5
      - name: 'version'
        type: 'string'
        pattern: '^v\\d+\\.\\d+\\.\\d+$'
`
      );

      await taskManager.load();
    });

    it('should validate parameter types', async () => {
      await expect(taskManager.run('validated', { count: 'not a number' }))
        .rejects.toThrow('Invalid type for parameter \'count\'');
    });

    it('should validate number ranges', async () => {
      await expect(taskManager.run('validated', { count: 0 }))
        .rejects.toThrow('must be at least 1');

      await expect(taskManager.run('validated', { count: 11 }))
        .rejects.toThrow('must be at most 10');
    });

    it('should validate enum values', async () => {
      await expect(taskManager.run('validated', { env: 'production' }))
        .rejects.toThrow('must be one of: dev, staging, prod');
    });

    it('should validate array constraints', async () => {
      await expect(taskManager.run('validated', { tags: [] }))
        .rejects.toThrow('must have at least 1 items');

      await expect(taskManager.run('validated', { tags: [1, 2, 3, 4, 5, 6] }))
        .rejects.toThrow('must have at most 5 items');
    });

    it('should validate string patterns', async () => {
      await expect(taskManager.run('validated', { version: '1.2.3' }))
        .rejects.toThrow('does not match pattern');

      // This should succeed
      const result = await taskManager.run('validated', {
        version: 'v1.2.3',
        count: 5,
        env: 'dev',
        tags: ['tag1'],
      });
      expect(result.success).toBe(true);

      // Verify the command executed with all parameters
      const content = await fs.readFile(path.join(testDir, 'test-output', 'validated.txt'), 'utf8');
      expect(content.trim()).toContain('validated 5 dev tag1 v1.2.3');
    });
  });

  describe('event emission', () => {
    it('should forward executor events', async () => {
      await taskManager.load();

      const events: any[] = [];

      // Set up event listeners before running the task
      const startPromise = new Promise<void>(resolve => {
        taskManager.once('task:start', e => {
          events.push({ type: 'start', ...e });
          resolve();
        });
      });

      const completePromise = new Promise<void>(resolve => {
        taskManager.once('task:complete', e => {
          events.push({ type: 'complete', ...e });
          resolve();
        });
      });

      // Run the task
      const resultPromise = taskManager.run('test');

      // Wait for both events
      await Promise.all([startPromise, completePromise, resultPromise]);

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('start');
      expect(events[0].task).toBe('test');
      expect(events[1].type).toBe('complete');
      expect(events[1].result.success).toBe(true);
    });
  });

  describe('clearCache', () => {
    it('should clear cached tasks', async () => {
      await taskManager.load();
      expect(await taskManager.exists('test')).toBe(true);

      taskManager.clearCache();

      // Write a new config file with different tasks
      await fs.writeFile(
        configPath,
        `version: '2.0'
tasks:
  different: 'echo "different" > ${path.join(testDir, 'test-output', 'different.txt')}'
`
      );

      // Should reload on next access
      expect(await taskManager.exists('test')).toBe(false);
      expect(await taskManager.exists('different')).toBe(true);

      // Verify the new task works
      const result = await taskManager.run('different');
      expect(result.success).toBe(true);
      const content = await fs.readFile(path.join(testDir, 'test-output', 'different.txt'), 'utf8');
      expect(content.trim()).toBe('different');
    });
  });
});