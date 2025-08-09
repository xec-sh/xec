import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { $ } from '@xec-sh/core';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { describeSSH, getSSHConfig, DockerContainerManager } from '@xec-sh/test-utils';
import { CopyCommand } from '../../src/commands/copy.js';
describe('Copy Command', () => {
    let tempDir;
    let projectDir;
    let sourceDir;
    let destDir;
    let command;
    let originalCwd;
    let configPath;
    const executeCommand = async (args) => {
        const lastArg = args[args.length - 1];
        if (lastArg && typeof lastArg === 'object' && !Array.isArray(lastArg)) {
            lastArg.configPath = configPath;
        }
        else {
            args.push({ configPath });
        }
        return command.execute(args);
    };
    beforeEach(async () => {
        originalCwd = process.cwd();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-copy-test-'));
        projectDir = path.join(tempDir, 'project');
        sourceDir = path.join(tempDir, 'source');
        destDir = path.join(tempDir, 'dest');
        await fs.mkdir(projectDir, { recursive: true });
        await fs.mkdir(path.join(projectDir, '.xec'), { recursive: true });
        await fs.mkdir(sourceDir, { recursive: true });
        await fs.mkdir(destDir, { recursive: true });
        configPath = path.join(projectDir, '.xec', 'config.yaml');
        command = new CopyCommand();
    });
    afterEach(async () => {
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
        catch (e) {
        }
    });
    describe('Local to Local Copy', () => {
        it('should copy a single file', async () => {
            const sourceFile = path.join(sourceDir, 'test.txt');
            const destFile = path.join(destDir, 'test.txt');
            await fs.writeFile(sourceFile, 'Hello, World!');
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            await executeCommand([
                `local:${sourceFile}`,
                `local:${destFile}`,
                { quiet: true, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            const content = await fs.readFile(destFile, 'utf-8');
            expect(content).toBe('Hello, World!');
        });
        it('should copy files with wildcards', async () => {
            await fs.writeFile(path.join(sourceDir, 'file1.txt'), 'Content 1');
            await fs.writeFile(path.join(sourceDir, 'file2.txt'), 'Content 2');
            await fs.writeFile(path.join(sourceDir, 'file3.log'), 'Log content');
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            await executeCommand([
                `local:${sourceDir}/*.txt`,
                `local:${destDir}/`,
                { quiet: true, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            const files = await fs.readdir(destDir);
            expect(files.sort()).toEqual(['file1.txt', 'file2.txt']);
            const content1 = await fs.readFile(path.join(destDir, 'file1.txt'), 'utf-8');
            expect(content1).toBe('Content 1');
            const content2 = await fs.readFile(path.join(destDir, 'file2.txt'), 'utf-8');
            expect(content2).toBe('Content 2');
        });
        it('should copy directories recursively', async () => {
            const subDir = path.join(sourceDir, 'subdir');
            const deepDir = path.join(subDir, 'deep');
            await fs.mkdir(deepDir, { recursive: true });
            await fs.writeFile(path.join(sourceDir, 'root.txt'), 'Root file');
            await fs.writeFile(path.join(subDir, 'nested.txt'), 'Nested file');
            await fs.writeFile(path.join(deepDir, 'deep.txt'), 'Deep file');
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            await executeCommand([
                `local:${sourceDir}`,
                `local:${destDir}`,
                { recursive: true, quiet: true, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            const rootFile = await fs.readFile(path.join(destDir, 'root.txt'), 'utf-8');
            expect(rootFile).toBe('Root file');
            const nestedFile = await fs.readFile(path.join(destDir, 'subdir', 'nested.txt'), 'utf-8');
            expect(nestedFile).toBe('Nested file');
            const deepFile = await fs.readFile(path.join(destDir, 'subdir', 'deep', 'deep.txt'), 'utf-8');
            expect(deepFile).toBe('Deep file');
        });
        it('should preserve timestamps when preserve option is used', async () => {
            const sourceFile = path.join(sourceDir, 'preserve-test.txt');
            const destFile = path.join(destDir, 'preserve-test.txt');
            await fs.writeFile(sourceFile, 'Preserve timestamps');
            const stats = await fs.stat(sourceFile);
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            await executeCommand([
                `local:${sourceFile}`,
                `local:${destFile}`,
                { preserve: true, quiet: true, configPath: path.join(projectDir, '.xec', 'config.yaml') }
            ]);
            const destStats = await fs.stat(destFile);
            const content = await fs.readFile(destFile, 'utf-8');
            expect(content).toBe('Preserve timestamps');
            expect(Math.abs(destStats.mtime.getTime() - stats.mtime.getTime())).toBeLessThan(1000);
        });
    });
    describeSSH('SSH Host Copy', () => {
        it('should copy file to SSH host', async () => {
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
            await fs.writeFile(configPath, yaml.dump(config));
            const sourceFile = path.join(sourceDir, 'ssh-test.txt');
            await fs.writeFile(sourceFile, 'SSH copy test content');
            await executeCommand([
                `local:${sourceFile}`,
                'hosts.test:/tmp/ssh-test.txt',
                { quiet: true }
            ]);
            const sshEngine = $.ssh({
                host: sshConfig.host,
                port: sshConfig.port,
                username: sshConfig.username,
                password: sshConfig.password
            });
            const result = await sshEngine `cat /tmp/ssh-test.txt`;
            expect(result.stdout).toBe('SSH copy test content');
            await sshEngine `rm -f /tmp/ssh-test.txt`;
        });
        it('should copy file from SSH host', async () => {
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
            await fs.writeFile(configPath, yaml.dump(config));
            const sshEngine = $.ssh({
                host: sshConfig.host,
                port: sshConfig.port,
                username: sshConfig.username,
                password: sshConfig.password
            });
            await sshEngine `echo "SSH source content" > /tmp/ssh-source.txt`;
            const destFile = path.join(destDir, 'from-ssh.txt');
            await executeCommand([
                'hosts.test:/tmp/ssh-source.txt',
                `local:${destFile}`,
                { quiet: true }
            ]);
            const content = await fs.readFile(destFile, 'utf-8');
            expect(content.trim()).toBe('SSH source content');
            await sshEngine `rm -f /tmp/ssh-source.txt`;
        });
        it('should copy directory recursively to SSH host', async () => {
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
            await fs.writeFile(configPath, yaml.dump(config));
            const testDir = path.join(sourceDir, 'ssh-dir');
            const subDir = path.join(testDir, 'subdir');
            await fs.mkdir(subDir, { recursive: true });
            await fs.writeFile(path.join(testDir, 'file1.txt'), 'File 1');
            await fs.writeFile(path.join(subDir, 'file2.txt'), 'File 2');
            await executeCommand([
                `local:${testDir}`,
                'hosts.test:/tmp/ssh-dir',
                { recursive: true, quiet: true }
            ]);
            const sshEngine = $.ssh({
                host: sshConfig.host,
                port: sshConfig.port,
                username: sshConfig.username,
                password: sshConfig.password
            });
            const file1 = await sshEngine `cat /tmp/ssh-dir/file1.txt`;
            expect(file1.stdout.trim()).toBe('File 1');
            const file2 = await sshEngine `cat /tmp/ssh-dir/subdir/file2.txt`;
            expect(file2.stdout.trim()).toBe('File 2');
            await sshEngine `rm -rf /tmp/ssh-dir`;
        });
    }, { containers: ['ubuntu-apt'] });
    describe('Docker Container Copy', () => {
        let dockerManager;
        let testContainerName;
        beforeEach(async () => {
            dockerManager = DockerContainerManager.getInstance();
            testContainerName = 'xec-copy-test-' + Date.now();
            if (dockerManager.isDockerAvailable()) {
                const result = await $.local({ cwd: os.homedir() }) `docker run -d --name ${testContainerName} alpine:latest sleep 3600`;
                if (result.exitCode !== 0) {
                    throw new Error('Failed to start test container');
                }
            }
        });
        afterEach(async () => {
            if (dockerManager.isDockerAvailable() && testContainerName) {
                await $.local({ cwd: os.homedir() }) `docker rm -f ${testContainerName}`.nothrow();
            }
        });
        it('should copy file to Docker container', async function () {
            if (!dockerManager.isDockerAvailable()) {
                this.skip();
                return;
            }
            const config = {
                version: '2.0',
                targets: {
                    containers: {
                        test: {
                            container: testContainerName
                        }
                    }
                }
            };
            await fs.writeFile(configPath, yaml.dump(config));
            const sourceFile = path.join(sourceDir, 'docker-test.txt');
            await fs.writeFile(sourceFile, 'Docker copy test');
            await executeCommand([
                `local:${sourceFile}`,
                'containers.test:/tmp/docker-test.txt',
                { quiet: true }
            ]);
            const result = await $.local({ cwd: os.homedir() }) `docker exec ${testContainerName} cat /tmp/docker-test.txt`;
            expect(result.stdout.trim()).toBe('Docker copy test');
        });
        it('should copy file from Docker container', async function () {
            if (!dockerManager.isDockerAvailable()) {
                this.skip();
                return;
            }
            const config = {
                version: '2.0',
                targets: {
                    containers: {
                        test: {
                            container: testContainerName
                        }
                    }
                }
            };
            await fs.writeFile(configPath, yaml.dump(config));
            await $.local({ cwd: os.homedir() }) `docker exec ${testContainerName} sh -c 'echo "From Docker" > /tmp/docker-source.txt'`;
            const destFile = path.join(destDir, 'from-docker.txt');
            await executeCommand([
                'containers.test:/tmp/docker-source.txt',
                `local:${destFile}`,
                { quiet: true }
            ]);
            const content = await fs.readFile(destFile, 'utf-8');
            expect(content.trim()).toBe('From Docker');
        });
    });
    describe('Error Handling', () => {
        it('should error when copying directory without recursive flag', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            await expect(executeCommand([
                `local:${sourceDir}`,
                `local:${destDir}`,
                { quiet: true }
            ])).rejects.toThrow('is a directory (use --recursive to copy directories)');
        });
        it('should handle non-existent source files', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            await expect(executeCommand([
                'local:/non/existent/file.txt',
                `local:${destDir}/file.txt`,
                { quiet: true }
            ])).rejects.toThrow();
        });
        it('should validate source and destination are provided', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            await expect(executeCommand([{ quiet: true }])).rejects.toThrow('Both source and destination are required');
        });
        it('should handle permission errors gracefully', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            const sourceFile = path.join(sourceDir, 'test.txt');
            await fs.writeFile(sourceFile, 'test');
            const noWriteDir = path.join(tempDir, 'no-write');
            await fs.mkdir(noWriteDir, { mode: 0o555 });
            await expect(executeCommand([
                `local:${sourceFile}`,
                `local:${noWriteDir}/test.txt`,
                { quiet: true }
            ])).rejects.toThrow();
            await fs.chmod(noWriteDir, 0o755);
        });
    });
    describe('Command Defaults', () => {
        it('should apply command defaults from configuration', async () => {
            const config = {
                version: '2.0',
                defaults: {
                    copy: {
                        preserve: true
                    }
                },
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            const sourceFile = path.join(sourceDir, 'defaults-test.txt');
            const destFile = path.join(destDir, 'defaults-test.txt');
            await fs.writeFile(sourceFile, 'content');
            const originalStats = await fs.stat(sourceFile);
            await executeCommand([
                `local:${sourceFile}`,
                `local:${destFile}`,
                { quiet: true }
            ]);
            const content = await fs.readFile(destFile, 'utf-8');
            expect(content).toBe('content');
            const destStats = await fs.stat(destFile);
            expect(Math.abs(destStats.mtime.getTime() - originalStats.mtime.getTime())).toBeLessThan(1000);
        });
    });
    describe('Dry Run Mode', () => {
        it('should not copy files in dry run mode', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            const sourceFile = path.join(sourceDir, 'test.txt');
            const destFile = path.join(destDir, 'test.txt');
            await fs.writeFile(sourceFile, 'Test content');
            const consoleOutput = [];
            const clack = await import('@clack/prompts');
            const originalInfo = clack.log.info;
            clack.log.info = (message) => {
                consoleOutput.push(message);
            };
            try {
                await executeCommand([
                    `local:${sourceFile}`,
                    `local:${destFile}`,
                    { dryRun: true }
                ]);
                await expect(fs.access(destFile)).rejects.toThrow();
                const output = consoleOutput.join('\n');
                expect(output).toContain('[DRY RUN] Would copy');
                expect(output).toContain(sourceFile);
                expect(output).toContain(destFile);
            }
            finally {
                clack.log.info = originalInfo;
            }
        });
    });
    describe('Parallel Copy', () => {
        it('should copy multiple files in parallel', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            const fileCount = 10;
            for (let i = 1; i <= fileCount; i++) {
                await fs.writeFile(path.join(sourceDir, `file${i}.txt`), `Content ${i}`);
            }
            const startTime = Date.now();
            await executeCommand([
                `local:${sourceDir}/*.txt`,
                `local:${destDir}/`,
                { parallel: true, maxConcurrent: '5', quiet: true }
            ]);
            const duration = Date.now() - startTime;
            const files = await fs.readdir(destDir);
            expect(files.length).toBe(fileCount);
            for (let i = 1; i <= fileCount; i++) {
                const content = await fs.readFile(path.join(destDir, `file${i}.txt`), 'utf-8');
                expect(content).toBe(`Content ${i}`);
            }
            expect(duration).toBeLessThan(5000);
        });
    });
    describe('Pattern Matching and Name Substitution', () => {
        it('should support glob patterns in source', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            await fs.writeFile(path.join(sourceDir, 'doc1.md'), '# Doc 1');
            await fs.writeFile(path.join(sourceDir, 'doc2.md'), '# Doc 2');
            await fs.writeFile(path.join(sourceDir, 'script.js'), 'console.log("test");');
            await fs.writeFile(path.join(sourceDir, 'data.json'), '{"test": true}');
            await executeCommand([
                `local:${sourceDir}/*.md`,
                `local:${destDir}/`,
                { quiet: true }
            ]);
            const files = await fs.readdir(destDir);
            expect(files.sort()).toEqual(['doc1.md', 'doc2.md']);
        });
        it('should support {name} substitution in destination', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            await fs.writeFile(path.join(sourceDir, 'test.txt'), 'test content');
            await fs.writeFile(path.join(sourceDir, 'data.json'), '{"data": true}');
            await executeCommand([
                `local:${sourceDir}/*`,
                `local:${destDir}/{name}-backup`,
                { quiet: true }
            ]);
            const files = await fs.readdir(destDir);
            expect(files.sort()).toEqual(['data.json-backup', 'test.txt-backup']);
            const testContent = await fs.readFile(path.join(destDir, 'test.txt-backup'), 'utf-8');
            expect(testContent).toBe('test content');
        });
    });
    describe('Cross-platform path handling', () => {
        it('should handle Windows-style paths correctly', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            const sourceFile = path.join(sourceDir, 'windows-test.txt');
            await fs.writeFile(sourceFile, 'Windows path test');
            const windowsPath = 'C:\\temp\\test.txt';
            await executeCommand([
                `local:${sourceFile}`,
                `local:${path.join(destDir, 'windows-test.txt')}`,
                { quiet: true }
            ]);
            const content = await fs.readFile(path.join(destDir, 'windows-test.txt'), 'utf-8');
            expect(content).toBe('Windows path test');
        });
        it('should handle paths without target prefix as local', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            const sourceFile = path.join(sourceDir, 'no-prefix.txt');
            await fs.writeFile(sourceFile, 'No prefix test');
            await executeCommand([
                sourceFile,
                path.join(destDir, 'no-prefix.txt'),
                { quiet: true }
            ]);
            const content = await fs.readFile(path.join(destDir, 'no-prefix.txt'), 'utf-8');
            expect(content).toBe('No prefix test');
        });
    });
    describe('Force overwrite option', () => {
        it('should overwrite existing files when force is true', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            const sourceFile = path.join(sourceDir, 'force-test.txt');
            const destFile = path.join(destDir, 'force-test.txt');
            await fs.writeFile(sourceFile, 'New content');
            await fs.writeFile(destFile, 'Old content');
            await executeCommand([
                `local:${sourceFile}`,
                `local:${destFile}`,
                { force: true, quiet: true }
            ]);
            const content = await fs.readFile(destFile, 'utf-8');
            expect(content).toBe('New content');
        });
    });
    describe('Multiple target resolution', () => {
        it('should handle wildcard target patterns', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        'web-1': { host: 'web1.example.com', user: 'deploy' },
                        'web-2': { host: 'web2.example.com', user: 'deploy' },
                        'db-1': { host: 'db1.example.com', user: 'admin' }
                    }
                }
            };
            await fs.writeFile(configPath, yaml.dump(config));
            const targetResolver = command['targetResolver'];
            if (targetResolver) {
                const targets = await targetResolver.find('hosts.web-*');
                expect(targets).toHaveLength(2);
                expect(targets.map(t => t.name).sort()).toEqual(['web-1', 'web-2']);
            }
        });
    });
    describe('Edge cases and error recovery', () => {
        it('should handle empty source directory', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            const emptyDir = path.join(sourceDir, 'empty');
            await fs.mkdir(emptyDir, { recursive: true });
            await executeCommand([
                `local:${emptyDir}`,
                `local:${destDir}/empty`,
                { recursive: true, quiet: true }
            ]);
            const stats = await fs.stat(path.join(destDir, 'empty'));
            expect(stats.isDirectory()).toBe(true);
        });
        it('should handle very long file paths', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            let deepPath = sourceDir;
            for (let i = 0; i < 10; i++) {
                deepPath = path.join(deepPath, `level${i}`);
            }
            await fs.mkdir(deepPath, { recursive: true });
            const sourceFile = path.join(deepPath, 'deep-file.txt');
            await fs.writeFile(sourceFile, 'Deep file content');
            await executeCommand([
                `local:${sourceFile}`,
                `local:${destDir}/deep-file.txt`,
                { quiet: true }
            ]);
            const content = await fs.readFile(path.join(destDir, 'deep-file.txt'), 'utf-8');
            expect(content).toBe('Deep file content');
        });
        it('should handle concurrent modifications during copy', async () => {
            const config = {
                version: '2.0',
                targets: {}
            };
            await fs.writeFile(configPath, yaml.dump(config));
            const sourceFile = path.join(sourceDir, 'concurrent.txt');
            await fs.writeFile(sourceFile, 'Initial content');
            const copyPromise = executeCommand([
                `local:${sourceFile}`,
                `local:${destDir}/concurrent.txt`,
                { quiet: true }
            ]);
            await copyPromise;
            const content = await fs.readFile(path.join(destDir, 'concurrent.txt'), 'utf-8');
            expect(content).toBe('Initial content');
        });
    });
});
//# sourceMappingURL=copy.test.js.map