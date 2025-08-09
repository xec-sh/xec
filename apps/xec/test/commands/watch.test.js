import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { configure } from '@xec-sh/core';
import { describeSSH, getSSHConfig } from '@xec-sh/test-utils';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { WatchCommand } from '../../src/commands/watch.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
describe('Watch Command', () => {
    let tempDir;
    let projectDir;
    let watchDir;
    let command;
    let originalCwd;
    let testScriptPath;
    beforeEach(async () => {
        originalCwd = process.cwd();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-watch-test-'));
        projectDir = path.join(tempDir, 'project');
        watchDir = path.join(tempDir, 'watch');
        testScriptPath = path.resolve(__dirname, 'helpers', 'test-scripts.cjs');
        await fs.mkdir(projectDir, { recursive: true });
        await fs.mkdir(path.join(projectDir, '.xec'), { recursive: true });
        await fs.mkdir(watchDir, { recursive: true });
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
        process.chdir(projectDir);
        try {
            await fs.access(projectDir, fs.constants.F_OK | fs.constants.W_OK);
        }
        catch (e) {
            throw new Error(`Project directory not accessible: ${projectDir}`);
        }
    });
    afterEach(async () => {
        process.chdir(originalCwd);
        if (command && command['sessions']) {
            command['running'] = false;
            for (const [id, session] of command['sessions']) {
                if (session.debounceTimer) {
                    clearTimeout(session.debounceTimer);
                }
                if (session.watcher) {
                    if (typeof session.watcher.close === 'function') {
                        await session.watcher.close();
                    }
                    else if (typeof session.watcher.kill === 'function') {
                        session.watcher.kill();
                    }
                }
            }
            command['sessions'].clear();
        }
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
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await expect(command.execute(['local', watchDir, { quiet: true }])).rejects.toThrow('Either --command or --task must be specified');
        });
        it('should require target specification', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await expect(command.execute([{ command: 'echo test', quiet: true }])).rejects.toThrow('Target specification is required');
        });
    });
    describe('Local File Watching', () => {
        it('should watch local files for changes', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const testFile = path.join(watchDir, 'test.txt');
            const markerFile = path.join(tempDir, 'marker.txt');
            const simpleMarkerScript = path.resolve(__dirname, 'helpers', 'simple-marker.cjs');
            const watchPromise = command.execute([
                'local',
                watchDir,
                {
                    command: `MARKER_FILE="${markerFile}" /Users/taaliman/.nvm/versions/node/v22.17.0/bin/node ${simpleMarkerScript}`,
                    quiet: true,
                    debounce: '100'
                }
            ]).catch(() => { });
            await new Promise(resolve => setTimeout(resolve, 500));
            expect(command['sessions'].size).toBe(1);
            const session = command['sessions'].get('local');
            expect(session).toBeDefined();
            expect(session?.target.type).toBe('local');
            expect(session?.watcher).toBeDefined();
            console.log('Creating test file to trigger watch:', testFile);
            await fs.writeFile(testFile, 'initial content');
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log('Checking if marker file exists:', markerFile);
            const markerExists = await fs.access(markerFile).then(() => true).catch(() => false);
            if (!markerExists) {
                const files = await fs.readdir(tempDir);
                console.log('Files in temp dir:', files);
            }
            expect(markerExists).toBe(true);
            command['running'] = false;
        });
        it('should execute command on file change', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const testFile = path.join(watchDir, 'test.txt');
            const logFile = path.join(tempDir, 'changes.log');
            const appendScript = path.resolve(__dirname, 'helpers', 'test-scripts.cjs');
            await fs.writeFile(logFile, '');
            const watchPromise = command.execute([
                'local',
                watchDir,
                {
                    command: `LOG_FILE="${logFile}" /Users/taaliman/.nvm/versions/node/v22.17.0/bin/node -e "require('fs').appendFileSync(process.env.LOG_FILE, 'File changed\\n')"`,
                    quiet: true,
                    debounce: '100'
                }
            ]).catch(() => { });
            await new Promise(resolve => setTimeout(resolve, 300));
            await fs.writeFile(testFile, 'change 1');
            await new Promise(resolve => setTimeout(resolve, 300));
            await fs.appendFile(testFile, '\nchange 2');
            await new Promise(resolve => setTimeout(resolve, 300));
            const logExists = await fs.access(logFile).then(() => true).catch(() => false);
            expect(logExists).toBe(true);
            if (logExists) {
                const logContent = await fs.readFile(logFile, 'utf-8');
                const lines = logContent.trim().split('\n').filter(l => l);
                expect(lines.length).toBeGreaterThanOrEqual(1);
                expect(lines[0]).toBe('File changed');
            }
            command['running'] = false;
        });
        it('should support file patterns', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
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
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const jsFile = path.join(watchDir, 'test.js');
            const tmpFile = path.join(watchDir, 'test.tmp');
            const nodeModulesDir = path.join(watchDir, 'node_modules');
            const nodeModulesFile = path.join(nodeModulesDir, 'package.json');
            const changeLog = path.join(tempDir, 'changes.log');
            await fs.mkdir(nodeModulesDir, { recursive: true });
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
            await new Promise(resolve => setTimeout(resolve, 300));
            await fs.writeFile(jsFile, 'console.log("test");');
            await new Promise(resolve => setTimeout(resolve, 300));
            await fs.writeFile(tmpFile, 'temporary file');
            await new Promise(resolve => setTimeout(resolve, 300));
            await fs.writeFile(nodeModulesFile, '{"name": "test"}');
            await new Promise(resolve => setTimeout(resolve, 300));
            const logExists = await fs.access(changeLog).then(() => true).catch(() => false);
            command['running'] = false;
        });
    });
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
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const { $ } = await import('@xec-sh/core');
            const sshEngine = $.ssh({
                host: sshConfig.host,
                port: sshConfig.port,
                username: sshConfig.username,
                password: sshConfig.password
            });
            await sshEngine `mkdir -p /tmp/watch-test`;
            await sshEngine `echo "initial" > /tmp/watch-test/watched.txt`;
            const markerFile = path.join(tempDir, 'ssh-watch-executed.txt');
            const watchPromise = command.execute([
                'hosts.test',
                '/tmp/watch-test',
                {
                    command: 'echo "SSH watch command executed at $(date)"',
                    quiet: false,
                    initial: true,
                    debounce: '100'
                }
            ]).catch((err) => {
                console.error('Watch error:', err);
            });
            await new Promise(resolve => setTimeout(resolve, 1500));
            const sessions = command['sessions'];
            expect(sessions.size).toBe(1);
            const session = sessions.get('hosts.test');
            expect(session).toBeDefined();
            expect(session?.watcher).toBeDefined();
            command['running'] = false;
            if (session?.watcher?.child) {
                session.watcher.child.kill();
            }
            await sshEngine `rm -rf /tmp/watch-test`;
        });
    }, { containers: ['ubuntu-apt'] });
    describe('Remote Target Watching Utilities', () => {
        it('should build correct inotifywait command', () => {
            const cmd1 = command['buildRemoteWatchCommand'](['/app'], {});
            expect(cmd1).toContain('command -v inotifywait');
            expect(cmd1).toContain('/app');
            expect(cmd1).toContain('stat -c');
            const cmd2 = command['buildRemoteWatchCommand'](['/src'], { pattern: ['*.js', '*.ts'], exclude: ['node_modules'] });
            expect(cmd2).toContain('find /src');
            expect(cmd2).toContain('-name "*.js"');
            expect(cmd2).toContain('-name "*.ts"');
            expect(cmd2).toContain("--exclude 'node_modules'");
        });
        it('should parse watch output correctly', () => {
            const result1 = command['parseWatchOutput']('/app/test.js MODIFY');
            expect(result1).toBe('/app/test.js');
            const result2 = command['parseWatchOutput']('/tmp/watch-test MODIFY');
            expect(result2).toBe('/tmp/watch-test');
            const result3 = command['parseWatchOutput']('');
            expect(result3).toBeUndefined();
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
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const testFile = path.join(watchDir, 'debounce-test.txt');
            const counterFile = path.join(tempDir, 'counter.txt');
            await fs.writeFile(counterFile, '0\n');
            const watchPromise = command.execute([
                'local',
                watchDir,
                {
                    command: `COUNTER_FILE="${counterFile}" /Users/taaliman/.nvm/versions/node/v22.17.0/bin/node ${testScriptPath} increment "${counterFile}"`,
                    quiet: true,
                    debounce: '300'
                }
            ]).catch(() => { });
            await new Promise(resolve => setTimeout(resolve, 300));
            for (let i = 0; i < 5; i++) {
                await fs.writeFile(testFile, `change ${i}`);
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            await new Promise(resolve => setTimeout(resolve, 800));
            const content = await fs.readFile(counterFile, 'utf-8');
            const lines = content.trim().split('\n').filter(l => l);
            console.log('Counter file content:', content);
            console.log('Lines:', lines);
            expect(lines.length).toBeGreaterThanOrEqual(2);
            expect(lines.length).toBeLessThanOrEqual(3);
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
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const testFile = path.join(watchDir, 'trigger.txt');
            const watchPromise = command.execute([
                'local',
                watchDir,
                {
                    task: 'test-task',
                    quiet: true,
                    debounce: '100'
                }
            ]).catch(() => { });
            await new Promise(resolve => setTimeout(resolve, 300));
            await fs.writeFile(testFile, 'trigger task');
            await new Promise(resolve => setTimeout(resolve, 500));
            const outputExists = await fs.access(outputFile).then(() => true).catch(() => false);
            expect(outputExists).toBe(true);
            if (outputExists) {
                const output = await fs.readFile(outputFile, 'utf-8');
                expect(output).toContain('Task executed');
            }
            command['running'] = false;
        });
    });
    describe('Initial Execution', () => {
        it('should run command initially if requested', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const initialFile = path.join(tempDir, 'initial.txt');
            const watchPromise = command.execute([
                'local',
                watchDir,
                {
                    command: `/Users/taaliman/.nvm/versions/node/v22.17.0/bin/node ${testScriptPath} write \"${initialFile}\" "Initial run"`,
                    initial: true,
                    quiet: true
                }
            ]).catch(() => { });
            await new Promise(resolve => setTimeout(resolve, 500));
            const initialExists = await fs.access(initialFile).then(() => true).catch(() => false);
            expect(initialExists).toBe(true);
            if (initialExists) {
                const content = await fs.readFile(initialFile, 'utf-8');
                expect(content).toContain('Initial run');
            }
            command['running'] = false;
        });
    });
    describe('Cleanup', () => {
        it('should clean up resources on exit', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const watchPromise = command.execute([
                'local',
                watchDir,
                { command: 'echo test', quiet: true }
            ]).catch(() => { });
            await new Promise(resolve => setTimeout(resolve, 300));
            expect(command['sessions'].size).toBe(1);
            command['running'] = false;
            for (const [sessionId, session] of command['sessions']) {
                if (session.debounceTimer) {
                    clearTimeout(session.debounceTimer);
                }
                if (session.watcher) {
                    if (typeof session.watcher.close === 'function') {
                        await session.watcher.close();
                    }
                    else if (typeof session.watcher.kill === 'function') {
                        session.watcher.kill();
                    }
                }
            }
            command['sessions'].clear();
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
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const logOutput = [];
            const clack = await import('@clack/prompts');
            const originalInfo = clack.log.info;
            clack.log.info = (message) => {
                logOutput.push(message);
            };
            try {
                await command.execute([
                    'hosts.dev',
                    '/app',
                    { command: 'npm test', pattern: ['*.js'], exclude: ['node_modules'], dryRun: true, quiet: false }
                ]);
                const output = logOutput.join('\n');
                expect(output).toContain('[DRY RUN] Would watch:');
                expect(output).toContain('Target:');
                expect(output).toContain('Paths: /app');
                expect(output).toContain('Patterns: *.js');
                expect(output).toContain('Exclude: node_modules');
                expect(command['sessions'].size).toBe(0);
            }
            finally {
                clack.log.info = originalInfo;
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
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const watchPromise = command.execute([
                'containers.test',
                '/app',
                {
                    command: 'echo "Docker watch executed"',
                    quiet: true,
                    initial: false,
                    debounce: '100'
                }
            ]).catch(() => { });
            await new Promise(resolve => setTimeout(resolve, 500));
            const sessions = command['sessions'];
            expect(sessions.size).toBe(1);
            const session = sessions.get('containers.test');
            expect(session).toBeDefined();
            expect(session?.target.type).toBe('docker');
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
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
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
            await new Promise(resolve => setTimeout(resolve, 500));
            const sessions = command['sessions'];
            expect(sessions.size).toBe(1);
            const session = sessions.get('pods.test');
            expect(session).toBeDefined();
            expect(session?.target.type).toBe('k8s');
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
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const watchPromise1 = command.execute([
                'local',
                watchDir,
                { command: 'echo test', quiet: true }
            ]).catch(() => { });
            await new Promise(resolve => setTimeout(resolve, 300));
            await expect(command['startWatching']({ id: 'local', type: 'local', name: 'local', config: {} }, [watchDir], { command: 'echo test', quiet: true })).rejects.toThrow('Already watching target: local');
            command['running'] = false;
        });
        it('should handle execution errors gracefully', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const testFile = path.join(watchDir, 'error-test.txt');
            const logOutput = [];
            const clack = await import('@clack/prompts');
            const originalError = clack.log.error;
            clack.log.error = (message) => {
                logOutput.push(message);
            };
            try {
                const watchPromise = command.execute([
                    'local',
                    watchDir,
                    {
                        command: 'exit 1',
                        quiet: false,
                        debounce: '100'
                    }
                ]).catch(() => { });
                await new Promise(resolve => setTimeout(resolve, 300));
                await fs.writeFile(testFile, 'trigger error');
                await new Promise(resolve => setTimeout(resolve, 800));
                const errorLog = logOutput.join('\n');
                expect(errorLog).toContain('Execution failed');
                expect(command['sessions'].size).toBe(1);
            }
            finally {
                clack.log.error = originalError;
                command['running'] = false;
            }
        });
        it('should handle watcher errors', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const logOutput = [];
            const clack = await import('@clack/prompts');
            const originalError = clack.log.error;
            clack.log.error = (message) => {
                logOutput.push(message);
            };
            try {
                const target = { id: 'test', type: 'local', name: 'test', config: {} };
                const session = await command['watchLocal'](target, ['/nonexistent/path'], { quiet: true });
                if (session.watcher && 'emit' in session.watcher) {
                    session.watcher.emit('error', new Error('Test watcher error'));
                }
                await new Promise(resolve => setTimeout(resolve, 100));
                expect(logOutput.some(log => log.includes('Watch error'))).toBe(true);
            }
            finally {
                clack.log.error = originalError;
            }
        });
    });
    describe('Option Validation', () => {
        it('should validate pattern array in shouldIgnoreFile', () => {
            const testFile = 'test.js';
            const result1 = command['shouldIgnoreFile'](testFile, { pattern: ['*.js'] });
            expect(result1).toBe(false);
            const result2 = command['shouldIgnoreFile'](testFile, { pattern: ['*.ts', '*.jsx'] });
            expect(result2).toBe(true);
            const result3 = command['shouldIgnoreFile'](testFile, {});
            expect(result3).toBe(false);
        });
        it('should handle polling options', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
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
            await new Promise(resolve => setTimeout(resolve, 300));
            expect(command['sessions'].size).toBe(1);
            command['running'] = false;
        });
    });
    describe('Additional Coverage', () => {
        it('should handle verbose output', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const testFile = path.join(watchDir, 'verbose-test.txt');
            const originalLog = console.log;
            const logOutput = [];
            console.log = (message) => {
                logOutput.push(message);
            };
            try {
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
                await new Promise(resolve => setTimeout(resolve, 300));
                await fs.writeFile(testFile, 'trigger verbose');
                await new Promise(resolve => setTimeout(resolve, 500));
                expect(logOutput.some(log => log.includes('Verbose output test'))).toBe(true);
            }
            finally {
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
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const testFile = path.join(watchDir, 'task-fail.txt');
            const logOutput = [];
            const clack = await import('@clack/prompts');
            const originalError = clack.log.error;
            clack.log.error = (message) => {
                logOutput.push(message);
            };
            try {
                const watchPromise = command.execute([
                    'local',
                    watchDir,
                    {
                        task: 'failing-task',
                        quiet: false,
                        debounce: '100'
                    }
                ]).catch(() => { });
                await new Promise(resolve => setTimeout(resolve, 300));
                await fs.writeFile(testFile, 'trigger task');
                await new Promise(resolve => setTimeout(resolve, 800));
                const errorLog = logOutput.join('\n');
                expect(errorLog).toContain('Execution failed');
            }
            finally {
                clack.log.error = originalError;
                command['running'] = false;
            }
        });
        it('should handle unsupported target type gracefully', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const unsupportedTarget = {
                id: 'unsupported',
                type: 'unsupported',
                name: 'unsupported',
                config: {}
            };
            await expect(command['startWatching'](unsupportedTarget, [watchDir], { command: 'echo test', quiet: true })).rejects.toThrow('Watch not supported for target type: unsupported');
        });
        it('should handle pattern matching with wildcards', () => {
            const result1 = command['shouldIgnoreFile']('index.ts', { pattern: ['*.ts'] });
            expect(result1).toBe(false);
            const result2 = command['shouldIgnoreFile']('test.log', { pattern: ['*.js', '*.ts'] });
            expect(result2).toBe(true);
            const result3 = command['shouldIgnoreFile']('file1.js', { pattern: ['file?.js'] });
            expect(result3).toBe(false);
        });
        it('should use default watch paths when none provided', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const watchPromise = command.execute([
                'local',
                {
                    command: 'echo test',
                    quiet: true
                }
            ]).catch(() => { });
            await new Promise(resolve => setTimeout(resolve, 300));
            expect(command['sessions'].size).toBe(1);
            command['running'] = false;
        });
    });
});
//# sourceMappingURL=watch.test.js.map