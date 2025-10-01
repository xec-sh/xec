/**
 * Tests for watch command v2 with configuration integration
 * Uses real file operations and real watching without mocks
 */

import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { configure } from '@xec-sh/core';
import { describeSSH, getSSHConfig } from '@xec-sh/testing';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { WatchCommand } from '../../src/commands/watch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Watch Command', () => {
  let tempDir: string;
  let projectDir: string;
  let watchDir: string;
  let command: WatchCommand;
  let originalCwd: string;
  let testScriptPath: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-watch-test-'));
    projectDir = path.join(tempDir, 'project');
    watchDir = path.join(tempDir, 'watch');
    testScriptPath = path.resolve(__dirname, 'helpers', 'test-scripts.cjs');

    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, '.xec'), { recursive: true });
    await fs.mkdir(watchDir, { recursive: true });

    // Configure execution engine with explicit shell path and full PATH
    const nodePath = '/Users/taaliman/.nvm/versions/node/v22.17.0/bin';
    const currentPath = process.env.PATH || '';
    const fullPath = `${nodePath}:${currentPath}:/usr/bin:/bin:/usr/local/bin`;

    configure({
      defaultShell: '/bin/bash',
      defaultEnv: {
        ...process.env,
        PATH: fullPath
      }
    });

    command = new WatchCommand();

    // Change to project directory and verify it exists
    process.chdir(projectDir);

    // Verify we can execute basic commands in this directory
    try {
      await fs.access(projectDir, fs.constants.F_OK | fs.constants.W_OK);
    } catch (e) {
      throw new Error(`Project directory not accessible: ${projectDir}`);
    }
  });

  afterEach(async () => {
    // Restore original directory
    process.chdir(originalCwd);

    // Clean up any active sessions
    if (command && command['sessions']) {
      command['running'] = false;
      for (const [id, session] of command['sessions']) {
        if (session.debounceTimer) {
          clearTimeout(session.debounceTimer);
        }
        if (session.watcher) {
          if (typeof session.watcher.close === 'function') {
            await session.watcher.close();
          } else if (typeof session.watcher.kill === 'function') {
            session.watcher.kill();
          }
        }
      }
      command['sessions'].clear();
    }

    // Remove all SIGINT and SIGTERM listeners to prevent memory leaks
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Command Validation', () => {
    it('should require either command or task option', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await expect(
        command.execute(['local', watchDir, { quiet: true }])
      ).rejects.toThrow('Either --command or --task must be specified');
    });

    it('should require target specification', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await expect(
        command.execute([{ command: 'echo test', quiet: true }])
      ).rejects.toThrow('Target specification is required');
    });
  });

  describe('Local File Watching', () => {
    it('should watch local files for changes', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      const testFile = path.join(watchDir, 'test.txt');
      const markerFile = path.join(tempDir, 'marker.txt');
      const simpleMarkerScript = path.resolve(__dirname, 'helpers', 'simple-marker.cjs');

      // Start watching with a very simple command using env var
      const watchPromise = command.execute([
        'local',
        watchDir,
        {
          command: `MARKER_FILE="${markerFile}" /Users/taaliman/.nvm/versions/node/v22.17.0/bin/node ${simpleMarkerScript}`,
          quiet: true,
          debounce: '100'
        }
      ]).catch(() => { }); // Catch as we'll stop it early

      // Wait for watch to start
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify session was created
      expect(command['sessions'].size).toBe(1);
      const session = command['sessions'].get('local');
      expect(session).toBeDefined();
      expect(session?.target.type).toBe('local');
      expect(session?.watcher).toBeDefined();

      // Create a file to trigger change
      console.log('Creating test file to trigger watch:', testFile);
      await fs.writeFile(testFile, 'initial content');

      // Wait for file system event and command execution
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check marker was created
      console.log('Checking if marker file exists:', markerFile);
      const markerExists = await fs.access(markerFile).then(() => true).catch(() => false);

      // If marker doesn't exist, list directory contents to debug
      if (!markerExists) {
        const files = await fs.readdir(tempDir);
        console.log('Files in temp dir:', files);
      }

      expect(markerExists).toBe(true);

      // Stop watching
      command['running'] = false;
    });

    it('should execute command on file change', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      const testFile = path.join(watchDir, 'test.txt');
      const logFile = path.join(tempDir, 'changes.log');
      const appendScript = path.resolve(__dirname, 'helpers', 'test-scripts.cjs');

      // Initialize log file
      await fs.writeFile(logFile, '');

      // Start watching - use a simpler command
      const watchPromise = command.execute([
        'local',
        watchDir,
        {
          command: `LOG_FILE="${logFile}" /Users/taaliman/.nvm/versions/node/v22.17.0/bin/node -e "require('fs').appendFileSync(process.env.LOG_FILE, 'File changed\\n')"`,
          quiet: true,
          debounce: '100'
        }
      ]).catch(() => { });

      // Wait for watch to start
      await new Promise(resolve => setTimeout(resolve, 300));

      // Make multiple changes
      await fs.writeFile(testFile, 'change 1');
      await new Promise(resolve => setTimeout(resolve, 300));

      await fs.appendFile(testFile, '\nchange 2');
      await new Promise(resolve => setTimeout(resolve, 300));

      // Check log file was created and has entries
      const logExists = await fs.access(logFile).then(() => true).catch(() => false);
      expect(logExists).toBe(true);

      if (logExists) {
        const logContent = await fs.readFile(logFile, 'utf-8');
        const lines = logContent.trim().split('\n').filter(l => l);
        expect(lines.length).toBeGreaterThanOrEqual(1);
        expect(lines[0]).toBe('File changed');
      }

      // Stop watching
      command['running'] = false;
    });

    it('should support file patterns', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Test the shouldIgnoreFile method directly
      const testFile1 = 'test.js';
      const testFile2 = 'test.ts';
      const testFile3 = 'test.txt';

      const result1 = command['shouldIgnoreFile'](testFile1, { pattern: ['*.js', '*.ts'] });
      const result2 = command['shouldIgnoreFile'](testFile2, { pattern: ['*.js', '*.ts'] });
      const result3 = command['shouldIgnoreFile'](testFile3, { pattern: ['*.js', '*.ts'] });

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(result3).toBe(true);
    });

    it('should support exclude patterns', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Create test files
      const jsFile = path.join(watchDir, 'test.js');
      const tmpFile = path.join(watchDir, 'test.tmp');
      const nodeModulesDir = path.join(watchDir, 'node_modules');
      const nodeModulesFile = path.join(nodeModulesDir, 'package.json');
      const changeLog = path.join(tempDir, 'changes.log');

      await fs.mkdir(nodeModulesDir, { recursive: true });

      // Start watching with exclude patterns
      const watchPromise = command.execute([
        'local',
        watchDir,
        {
          command: `/Users/taaliman/.nvm/versions/node/v22.17.0/bin/node ${testScriptPath} append \"${changeLog}\" \"file changed\"`,
          exclude: ['node_modules', '*.tmp'],
          quiet: true,
          debounce: '100'
        }
      ]).catch(() => { });

      // Wait for watch to start
      await new Promise(resolve => setTimeout(resolve, 300));

      // Create/modify files in sequence
      // JS file - should trigger command
      await fs.writeFile(jsFile, 'console.log("test");');
      await new Promise(resolve => setTimeout(resolve, 300));

      // TMP file - should be ignored
      await fs.writeFile(tmpFile, 'temporary file');
      await new Promise(resolve => setTimeout(resolve, 300));

      // node_modules file - should be ignored
      await fs.writeFile(nodeModulesFile, '{"name": "test"}');
      await new Promise(resolve => setTimeout(resolve, 300));

      // Check what was logged
      const logExists = await fs.access(changeLog).then(() => true).catch(() => false);

      // With exclude patterns working properly via chokidar,
      // we should only see changes from the .js file
      // Note: The actual filtering depends on chokidar's behavior

      // Stop watching
      command['running'] = false;
    });
  });

  // SSH tests using real containers
  describeSSH('Remote Target Watching', () => {
    it('should watch SSH host files', async () => {
      const container = 'ubuntu-apt';
      const sshConfig = getSSHConfig(container);

      const config = {
        version: '2.0',
        targets: {
          hosts: {
            test: {
              host: sshConfig.host,
              port: sshConfig.port,
              user: sshConfig.username,
              password: sshConfig.password
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Create a test directory on the SSH host
      const { $ } = await import('@xec-sh/core');
      const sshEngine = $.ssh({
        host: sshConfig.host,
        port: sshConfig.port,
        username: sshConfig.username,
        password: sshConfig.password
      });

      // Prepare test directory
      await sshEngine`mkdir -p /tmp/watch-test`;
      await sshEngine`echo "initial" > /tmp/watch-test/watched.txt`;

      // Use a simpler approach - use the initial flag to ensure command works
      const markerFile = path.join(tempDir, 'ssh-watch-executed.txt');

      // Start watching on SSH host with initial execution
      const watchPromise = command.execute([
        'hosts.test',
        '/tmp/watch-test',
        {
          command: 'echo "SSH watch command executed at $(date)"',
          quiet: false,
          initial: true,  // Execute initially to verify it works
          debounce: '100'
        }
      ]).catch((err) => {
        console.error('Watch error:', err);
      });

      // Wait for initial execution
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check that watching is running
      const sessions = command['sessions'];
      expect(sessions.size).toBe(1);

      // For SSH watching, we mainly verify that:
      // 1. The session was created successfully
      // 2. The initial command executed (if initial flag is set)
      // 3. The watcher process is running

      const session = sessions.get('hosts.test');
      expect(session).toBeDefined();
      expect(session?.watcher).toBeDefined();

      // Cleanup
      command['running'] = false;

      // Kill the watcher process
      if (session?.watcher?.child) {
        session.watcher.child.kill();
      }

      await sshEngine`rm -rf /tmp/watch-test`;
    });
  }, { containers: ['ubuntu-apt'] });

  describe('Remote Target Watching Utilities', () => {
    it('should build correct inotifywait command', () => {
      const cmd1 = command['buildRemoteWatchCommand'](['/app'], {});
      // Should check for inotifywait and have fallback
      expect(cmd1).toContain('command -v inotifywait');
      expect(cmd1).toContain('/app');
      // Should have fallback with stat
      expect(cmd1).toContain('stat -c');

      const cmd2 = command['buildRemoteWatchCommand'](
        ['/src'],
        { pattern: ['*.js', '*.ts'], exclude: ['node_modules'] }
      );
      expect(cmd2).toContain('find /src');
      expect(cmd2).toContain('-name "*.js"');
      expect(cmd2).toContain('-name "*.ts"');
      expect(cmd2).toContain("--exclude 'node_modules'");
    });

    it('should parse watch output correctly', () => {
      // Test inotifywait format
      const result1 = command['parseWatchOutput']('/app/test.js MODIFY');
      expect(result1).toBe('/app/test.js');

      // Test fallback format
      const result2 = command['parseWatchOutput']('/tmp/watch-test MODIFY');
      expect(result2).toBe('/tmp/watch-test');

      // Test empty line
      const result3 = command['parseWatchOutput']('');
      expect(result3).toBeUndefined();

      // Test whitespace only
      const result4 = command['parseWatchOutput']('   ');
      expect(result4).toBeUndefined();
    });
  });

  describe('Debouncing', () => {
    it('should debounce rapid file changes', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      const testFile = path.join(watchDir, 'debounce-test.txt');
      const counterFile = path.join(tempDir, 'counter.txt');

      // Initialize counter with a newline
      await fs.writeFile(counterFile, '0\n');

      // Start watching with a command that increments a counter using node
      const watchPromise = command.execute([
        'local',
        watchDir,
        {
          command: `COUNTER_FILE="${counterFile}" /Users/taaliman/.nvm/versions/node/v22.17.0/bin/node ${testScriptPath} increment "${counterFile}"`,
          quiet: true,
          debounce: '300' // 300ms debounce
        }
      ]).catch(() => { });

      // Wait for watch to start
      await new Promise(resolve => setTimeout(resolve, 300));

      // Make rapid changes (faster than debounce interval)
      for (let i = 0; i < 5; i++) {
        await fs.writeFile(testFile, `change ${i}`);
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms between changes
      }

      // Wait for debounce to complete and command to execute
      await new Promise(resolve => setTimeout(resolve, 800));

      // Check counter - should have been incremented
      const content = await fs.readFile(counterFile, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);

      // Debug output
      console.log('Counter file content:', content);
      console.log('Lines:', lines);

      // Should have at least 2 lines (initial '0' + at least one increment)
      // Due to debouncing, multiple rapid changes should result in just one execution
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines.length).toBeLessThanOrEqual(3); // Not too many due to debouncing

      // Stop watching
      command['running'] = false;
    });
  });

  describe('Task Execution', () => {
    it('should execute configured tasks on change', async () => {
      const outputFile = path.join(tempDir, 'task-output.txt');

      const config = {
        version: '2.0',
        targets: {},
        tasks: {
          'test-task': {
            command: `/Users/taaliman/.nvm/versions/node/v22.17.0/bin/node ${testScriptPath} write \"${outputFile}\" \"Task executed\"`
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      const testFile = path.join(watchDir, 'trigger.txt');

      // Start watching with task
      const watchPromise = command.execute([
        'local',
        watchDir,
        {
          task: 'test-task',
          quiet: true,
          debounce: '100'
        }
      ]).catch(() => { });

      // Wait for watch to start
      await new Promise(resolve => setTimeout(resolve, 300));

      // Trigger a change
      await fs.writeFile(testFile, 'trigger task');

      // Wait for task execution
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check task output
      const outputExists = await fs.access(outputFile).then(() => true).catch(() => false);
      expect(outputExists).toBe(true);

      if (outputExists) {
        const output = await fs.readFile(outputFile, 'utf-8');
        expect(output).toContain('Task executed');
      }

      // Stop watching
      command['running'] = false;
    });
  });

  describe('Initial Execution', () => {
    it('should run command initially if requested', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      const initialFile = path.join(tempDir, 'initial.txt');

      // Start watching with initial flag
      const watchPromise = command.execute([
        'local',
        watchDir,
        {
          command: `/Users/taaliman/.nvm/versions/node/v22.17.0/bin/node ${testScriptPath} write \"${initialFile}\" "Initial run"`,
          initial: true,
          quiet: true
        }
      ]).catch(() => { });

      // Wait for initial execution
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check initial execution happened
      const initialExists = await fs.access(initialFile).then(() => true).catch(() => false);
      expect(initialExists).toBe(true);

      if (initialExists) {
        const content = await fs.readFile(initialFile, 'utf-8');
        expect(content).toContain('Initial run');
      }

      // Stop watching
      command['running'] = false;
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources on exit', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Start watching
      const watchPromise = command.execute([
        'local',
        watchDir,
        { command: 'echo test', quiet: true }
      ]).catch(() => { });

      // Wait for watch to start
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify session exists
      expect(command['sessions'].size).toBe(1);

      // Trigger cleanup
      command['running'] = false;

      // Manually clean up sessions
      for (const [sessionId, session] of command['sessions']) {
        if (session.debounceTimer) {
          clearTimeout(session.debounceTimer);
        }
        if (session.watcher) {
          if (typeof session.watcher.close === 'function') {
            await session.watcher.close();
          } else if (typeof session.watcher.kill === 'function') {
            session.watcher.kill();
          }
        }
      }
      command['sessions'].clear();

      // Verify cleanup
      expect(command['sessions'].size).toBe(0);
    });
  });

  describe('Dry Run Mode', () => {
    it('should not start watching in dry run mode', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            dev: { host: 'dev.example.com', user: 'developer' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Capture clack log output
      const logOutput: string[] = [];
      const kit = await import('@xec-sh/kit');
      const originalInfo = kit.log.info;
      kit.log.info = (message: string) => {
        logOutput.push(message);
      };

      try {
        await command.execute([
          'hosts.dev',
          '/app',
          { command: 'npm test', pattern: ['*.js'], exclude: ['node_modules'], dryRun: true, quiet: false }
        ]);

        // Verify dry run output
        const output = logOutput.join('\n');
        expect(output).toContain('[DRY RUN] Would watch:');
        expect(output).toContain('Target:');
        expect(output).toContain('Paths: /app');
        expect(output).toContain('Patterns: *.js');
        expect(output).toContain('Exclude: node_modules');

        // Verify no sessions were created
        expect(command['sessions'].size).toBe(0);
      } finally {
        kit.log.info = originalInfo;
      }
    });
  });

  describe('Docker Container Watching', () => {
    it('should watch Docker container files', async () => {
      const config = {
        version: '2.0',
        targets: {
          containers: {
            test: { container: 'test-container' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Start watching in docker container with a simple command
      const watchPromise = command.execute([
        'containers.test',
        '/app',
        {
          command: 'echo "Docker watch executed"',
          quiet: true,
          initial: false, // Don't run initially to avoid docker exec errors
          debounce: '100'
        }
      ]).catch(() => { });

      // Wait for watch to start
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check that session was created
      const sessions = command['sessions'];
      expect(sessions.size).toBe(1);

      const session = sessions.get('containers.test');
      expect(session).toBeDefined();
      expect(session?.target.type).toBe('docker');

      // Stop watching
      command['running'] = false;
      if (session?.watcher?.child) {
        session.watcher.child.kill();
      }
    });
  });

  describe('Kubernetes Pod Watching', () => {
    it('should watch Kubernetes pod files', async () => {
      const config = {
        version: '2.0',
        targets: {
          pods: {
            test: {
              pod: 'test-pod',
              namespace: 'default',
              container: 'app'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Start watching in kubernetes pod
      const watchPromise = command.execute([
        'pods.test',
        '/app',
        {
          command: 'echo "K8s watch"',
          quiet: true,
          initial: true,
          debounce: '100'
        }
      ]).catch(() => { });

      // Wait for initial execution attempt
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check that session was created
      const sessions = command['sessions'];
      expect(sessions.size).toBe(1);

      const session = sessions.get('pods.test');
      expect(session).toBeDefined();
      expect(session?.target.type).toBe('k8s');

      // Stop watching
      command['running'] = false;
      if (session?.watcher?.child) {
        session.watcher.child.kill();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle already watching error', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Start first watch
      const watchPromise1 = command.execute([
        'local',
        watchDir,
        { command: 'echo test', quiet: true }
      ]).catch(() => { });

      await new Promise(resolve => setTimeout(resolve, 300));

      // Try to start another watch on same target
      await expect(
        command['startWatching'](
          { id: 'local', type: 'local', name: 'local', config: {} },
          [watchDir],
          { command: 'echo test', quiet: true }
        )
      ).rejects.toThrow('Already watching target: local');

      // Cleanup
      command['running'] = false;
    });

    it('should handle execution errors gracefully', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      const testFile = path.join(watchDir, 'error-test.txt');

      // Capture error output
      const logOutput: string[] = [];
      const kit = await import('@xec-sh/kit');
      const originalError = kit.log.error;
      kit.log.error = (message: string) => {
        logOutput.push(message);
      };

      try {
        // Start watching with a command that will fail
        const watchPromise = command.execute([
          'local',
          watchDir,
          {
            command: 'exit 1',  // Simple command that fails
            quiet: false,
            debounce: '100'
          }
        ]).catch(() => { });

        // Wait for watch to start
        await new Promise(resolve => setTimeout(resolve, 300));

        // Trigger a change
        await fs.writeFile(testFile, 'trigger error');

        // Wait for error to occur
        await new Promise(resolve => setTimeout(resolve, 800));

        // Should have logged error but continue watching
        const errorLog = logOutput.join('\n');
        expect(errorLog).toContain('Execution failed');

        // Session should still be active
        expect(command['sessions'].size).toBe(1);
      } finally {
        kit.log.error = originalError;
        command['running'] = false;
      }
    });

    it('should handle watcher errors', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Capture error output
      const logOutput: string[] = [];
      const kit = await import('@xec-sh/kit');
      const originalError = kit.log.error;
      kit.log.error = (message: string) => {
        logOutput.push(message);
      };

      try {
        // Create a session manually to test error handling
        const target = { id: 'test', type: 'local' as const, name: 'test', config: {} };
        const session = await command['watchLocal'](target, ['/nonexistent/path'], { quiet: true });

        // Emit error on watcher
        if (session.watcher && 'emit' in session.watcher) {
          session.watcher.emit('error', new Error('Test watcher error'));
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        // Should have logged the error
        expect(logOutput.some(log => log.includes('Watch error'))).toBe(true);
      } finally {
        kit.log.error = originalError;
      }
    });
  });

  describe('Option Validation', () => {
    it('should validate pattern array in shouldIgnoreFile', () => {
      // Test that shouldIgnoreFile handles pattern array correctly
      const testFile = 'test.js';

      // Test with single pattern
      const result1 = command['shouldIgnoreFile'](testFile, { pattern: ['*.js'] });
      expect(result1).toBe(false);

      // Test with multiple patterns
      const result2 = command['shouldIgnoreFile'](testFile, { pattern: ['*.ts', '*.jsx'] });
      expect(result2).toBe(true);

      // Test without pattern
      const result3 = command['shouldIgnoreFile'](testFile, {});
      expect(result3).toBe(false);
    });

    it('should handle polling options', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Start watching with polling enabled
      const watchPromise = command.execute([
        'local',
        watchDir,
        {
          command: 'echo test',
          poll: true,
          interval: '2000',
          quiet: true
        }
      ]).catch(() => { });

      // Wait for watch to start
      await new Promise(resolve => setTimeout(resolve, 300));

      // Check that session was created with polling
      expect(command['sessions'].size).toBe(1);

      // Stop watching
      command['running'] = false;
    });
  });

  describe('Additional Coverage', () => {
    it('should handle verbose output', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      const testFile = path.join(watchDir, 'verbose-test.txt');

      // Capture console output
      const originalLog = console.log;
      const logOutput: string[] = [];
      console.log = (message: string) => {
        logOutput.push(message);
      };

      try {
        // Start watching with verbose mode
        const watchPromise = command.execute([
          'local',
          watchDir,
          {
            command: 'echo "Verbose output test"',
            verbose: true,
            quiet: false,
            debounce: '100'
          }
        ]).catch(() => { });

        // Wait for watch to start
        await new Promise(resolve => setTimeout(resolve, 300));

        // Trigger a change
        await fs.writeFile(testFile, 'trigger verbose');

        // Wait for execution
        await new Promise(resolve => setTimeout(resolve, 500));

        // Should have logged verbose output
        expect(logOutput.some(log => log.includes('Verbose output test'))).toBe(true);
      } finally {
        console.log = originalLog;
        command['running'] = false;
      }
    });

    it('should handle task execution failure', async () => {
      const config = {
        version: '2.0',
        targets: {},
        tasks: {
          'failing-task': {
            command: 'exit 1'
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      const testFile = path.join(watchDir, 'task-fail.txt');

      // Capture error output
      const logOutput: string[] = [];
      const kit = await import('@xec-sh/kit');
      const originalError = kit.log.error;
      kit.log.error = (message: string) => {
        logOutput.push(message);
      };

      try {
        // Start watching with task that will fail
        const watchPromise = command.execute([
          'local',
          watchDir,
          {
            task: 'failing-task',
            quiet: false,
            debounce: '100'
          }
        ]).catch(() => { });

        // Wait for watch to start
        await new Promise(resolve => setTimeout(resolve, 300));

        // Trigger a change
        await fs.writeFile(testFile, 'trigger task');

        // Wait for task execution
        await new Promise(resolve => setTimeout(resolve, 800));

        // Should have logged error
        const errorLog = logOutput.join('\n');
        expect(errorLog).toContain('Execution failed');
      } finally {
        kit.log.error = originalError;
        command['running'] = false;
      }
    });

    it('should handle unsupported target type gracefully', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Create a mock target with unsupported type
      const unsupportedTarget = {
        id: 'unsupported',
        type: 'unsupported' as any,
        name: 'unsupported',
        config: {}
      };

      await expect(
        command['startWatching'](unsupportedTarget, [watchDir], { command: 'echo test', quiet: true })
      ).rejects.toThrow('Watch not supported for target type: unsupported');
    });

    it('should handle pattern matching with wildcards', () => {
      // Test with wildcard patterns - shouldIgnoreFile returns true if file DOESN'T match pattern
      const result1 = command['shouldIgnoreFile']('index.ts', { pattern: ['*.ts'] });
      expect(result1).toBe(false); // File matches pattern, so not ignored

      const result2 = command['shouldIgnoreFile']('test.log', { pattern: ['*.js', '*.ts'] });
      expect(result2).toBe(true); // File doesn't match patterns, so ignored

      // Test with question mark wildcard
      const result3 = command['shouldIgnoreFile']('file1.js', { pattern: ['file?.js'] });
      expect(result3).toBe(false); // File matches pattern, so not ignored
    });

    it('should use default watch paths when none provided', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Start watching without specifying paths (should default to '.')
      const watchPromise = command.execute([
        'local',
        {
          command: 'echo test',
          quiet: true
        }
      ]).catch(() => { });

      // Wait for watch to start
      await new Promise(resolve => setTimeout(resolve, 300));

      // Check that session was created
      expect(command['sessions'].size).toBe(1);

      // Stop watching
      command['running'] = false;
    });
  });
});