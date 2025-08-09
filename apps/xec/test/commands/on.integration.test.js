import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import { DockerContainerManager } from '@xec-sh/test-utils';
import { it, expect, describe, afterAll, afterEach, beforeAll, beforeEach } from '@jest/globals';
import { OnCommand } from '../../src/commands/on.js';
class TestableOnCommand extends OnCommand {
    async initializeConfig(options) {
        await super.initializeConfig({
            ...options,
            configPath: options.configPath || path.join(process.cwd(), '.xec', 'config.yaml')
        });
    }
}
describe('On Command - Real SSH Integration', () => {
    let tempDir;
    let projectDir;
    let command;
    let dockerManager;
    const createOptions = (overrides = {}) => ({
        quiet: false,
        verbose: false,
        dryRun: false,
        configPath: path.join(projectDir, '.xec', 'config.yaml'),
        ...overrides
    });
    beforeAll(async () => {
        dockerManager = DockerContainerManager.getInstance();
        if (!dockerManager.isDockerAvailable()) {
            console.warn('Docker is not available, skipping integration tests');
            return;
        }
        const started = await dockerManager.startContainer('ubuntu-apt');
        if (!started) {
            throw new Error('Failed to start test container');
        }
        await dockerManager.waitForSSH(2201, 30);
    }, 60000);
    afterAll(async () => {
        if (dockerManager?.isDockerAvailable()) {
            await dockerManager.stopContainer('ubuntu-apt');
        }
    }, 30000);
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-on-integration-'));
        projectDir = path.join(tempDir, 'project');
        await fs.mkdir(projectDir, { recursive: true });
        await fs.mkdir(path.join(projectDir, '.xec'), { recursive: true });
        process.chdir(projectDir);
        command = new TestableOnCommand();
    });
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    describe('Real SSH Command Execution', () => {
        it('should execute simple commands on SSH host', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        'test-server': {
                            host: 'localhost',
                            port: 2201,
                            user: 'user',
                            password: 'password'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const testFile = path.join(tempDir, 'test-output.txt');
            await command.execute([
                'hosts.test-server',
                'echo "Hello from SSH" > /tmp/test-output.txt',
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                'cat /tmp/test-output.txt',
                createOptions()
            ]);
        });
        it('should execute commands with environment variables', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        'test-server': {
                            host: 'localhost',
                            port: 2201,
                            user: 'user',
                            password: 'password'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await command.execute([
                'hosts.test-server',
                'echo "$TEST_VAR" > /tmp/env-test.txt',
                createOptions({ env: ['TEST_VAR=HelloWorld'] })
            ]);
            await command.execute([
                'hosts.test-server',
                'cat /tmp/env-test.txt',
                createOptions()
            ]);
        });
        it('should handle command failures properly', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        'test-server': {
                            host: 'localhost',
                            port: 2201,
                            user: 'user',
                            password: 'password'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await expect(command.execute([
                'hosts.test-server',
                'exit 1',
                createOptions({ quiet: true })
            ])).rejects.toThrow();
        });
        it('should execute commands in specific directory', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        'test-server': {
                            host: 'localhost',
                            port: 2201,
                            user: 'user',
                            password: 'password'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await command.execute([
                'hosts.test-server',
                'mkdir -p /tmp/test-dir',
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                'pwd > pwd-output.txt',
                createOptions({ cwd: '/tmp/test-dir' })
            ]);
            await command.execute([
                'hosts.test-server',
                'cat /tmp/test-dir/pwd-output.txt',
                createOptions()
            ]);
        });
        it('should handle timeout correctly', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        'test-server': {
                            host: 'localhost',
                            port: 2201,
                            user: 'user',
                            password: 'password'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await expect(command.execute([
                'hosts.test-server',
                'sleep 10',
                createOptions({ timeout: '1s', quiet: true })
            ])).rejects.toThrow();
        });
    });
    describe('File Operations via SSH', () => {
        it('should create and verify files on remote host', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        'test-server': {
                            host: 'localhost',
                            port: 2201,
                            user: 'user',
                            password: 'password'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const testContent = 'This is a test file created via SSH';
            const fileName = `/tmp/test-${Date.now()}.txt`;
            await command.execute([
                'hosts.test-server',
                `echo "${testContent}" > ${fileName}`,
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                `test -f ${fileName} && echo "File exists"`,
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                `cat ${fileName}`,
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                `rm ${fileName}`,
                createOptions()
            ]);
        });
        it('should handle multiple files and directories', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        'test-server': {
                            host: 'localhost',
                            port: 2201,
                            user: 'user',
                            password: 'password'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const testDir = `/tmp/test-dir-${Date.now()}`;
            await command.execute([
                'hosts.test-server',
                `mkdir -p ${testDir}/subdir`,
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                `touch ${testDir}/file1.txt ${testDir}/file2.txt ${testDir}/subdir/file3.txt`,
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                `ls -la ${testDir}`,
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                `rm -rf ${testDir}`,
                createOptions()
            ]);
        });
    });
    describe('Script Execution via SSH', () => {
        it('should execute bash scripts on remote host', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        'test-server': {
                            host: 'localhost',
                            port: 2201,
                            user: 'user',
                            password: 'password'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const scriptPath = path.join(projectDir, 'test-script.sh');
            const scriptContent = `#!/bin/bash
echo "Starting script"
echo "Creating test file"
touch /tmp/script-test.txt
echo "Script completed" > /tmp/script-test.txt
echo "Script finished"
`;
            await fs.writeFile(scriptPath, scriptContent);
            await fs.chmod(scriptPath, 0o755);
            await command.execute([
                'hosts.test-server',
                scriptPath,
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                'cat /tmp/script-test.txt',
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                'rm /tmp/script-test.txt',
                createOptions()
            ]);
        });
    });
    describe('Multiple Host Execution', () => {
        let secondContainerStarted = false;
        beforeEach(async () => {
            if (dockerManager.isDockerAvailable()) {
                secondContainerStarted = await dockerManager.startContainer('centos7-yum');
                if (secondContainerStarted) {
                    await dockerManager.waitForSSH(2202, 30);
                }
            }
        });
        afterEach(async () => {
            if (secondContainerStarted) {
                await dockerManager.stopContainer('centos7-yum');
            }
        });
        it('should execute commands on multiple hosts', async () => {
            if (!secondContainerStarted) {
                console.warn('Second container not available, skipping multi-host test');
                return;
            }
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        'server1': {
                            host: 'localhost',
                            port: 2201,
                            user: 'user',
                            password: 'password'
                        },
                        'server2': {
                            host: 'localhost',
                            port: 2202,
                            user: 'user',
                            password: 'password'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const timestamp = Date.now();
            await command.execute([
                'hosts.*',
                `echo "Test from host at ${timestamp}" > /tmp/multi-host-test.txt`,
                createOptions()
            ]);
            await command.execute([
                'hosts.server1',
                'cat /tmp/multi-host-test.txt',
                createOptions()
            ]);
            await command.execute([
                'hosts.server2',
                'cat /tmp/multi-host-test.txt',
                createOptions()
            ]);
            await command.execute([
                'hosts.*',
                'rm /tmp/multi-host-test.txt',
                createOptions()
            ]);
        });
        it('should handle parallel execution', async () => {
            if (!secondContainerStarted) {
                console.warn('Second container not available, skipping parallel test');
                return;
            }
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        'server1': {
                            host: 'localhost',
                            port: 2201,
                            user: 'user',
                            password: 'password'
                        },
                        'server2': {
                            host: 'localhost',
                            port: 2202,
                            user: 'user',
                            password: 'password'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            const startTime = Date.now();
            await command.execute([
                'hosts.*',
                'sleep 2 && echo "Done"',
                createOptions({ parallel: true })
            ]);
            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(3000);
        });
    });
    describe('Task Execution via SSH', () => {
        it('should execute configured tasks on remote hosts', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        'test-server': {
                            host: 'localhost',
                            port: 2201,
                            user: 'user',
                            password: 'password'
                        }
                    }
                },
                tasks: {
                    'test-task': {
                        description: 'Test task that creates files',
                        steps: [
                            { command: 'mkdir -p /tmp/task-test' },
                            { command: 'echo "Step 1" > /tmp/task-test/step1.txt' },
                            { command: 'echo "Step 2" > /tmp/task-test/step2.txt' },
                            { command: 'ls -la /tmp/task-test' }
                        ]
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await command.execute([
                'hosts.test-server',
                createOptions({ task: 'test-task' })
            ]);
            await command.execute([
                'hosts.test-server',
                'cat /tmp/task-test/step1.txt /tmp/task-test/step2.txt',
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                'rm -rf /tmp/task-test',
                createOptions()
            ]);
        });
    });
    describe('Advanced SSH Features', () => {
        it('should handle complex command chains', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        'test-server': {
                            host: 'localhost',
                            port: 2201,
                            user: 'user',
                            password: 'password'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await command.execute([
                'hosts.test-server',
                'cd /tmp && mkdir -p complex-test && cd complex-test && echo "test" > file.txt && cat file.txt',
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                'test -f /tmp/complex-test/file.txt && echo "Success"',
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                'rm -rf /tmp/complex-test',
                createOptions()
            ]);
        });
        it('should handle pipes and redirections', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        'test-server': {
                            host: 'localhost',
                            port: 2201,
                            user: 'user',
                            password: 'password'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await command.execute([
                'hosts.test-server',
                'echo -e "line1\\nline2\\nline3" | grep line2 > /tmp/pipe-test.txt',
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                'cat /tmp/pipe-test.txt',
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                'echo "appended" >> /tmp/pipe-test.txt',
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                'cat /tmp/pipe-test.txt',
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                'rm /tmp/pipe-test.txt',
                createOptions()
            ]);
        });
        it('should handle background processes', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        'test-server': {
                            host: 'localhost',
                            port: 2201,
                            user: 'user',
                            password: 'password'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await command.execute([
                'hosts.test-server',
                'nohup sleep 5 > /tmp/bg-test.log 2>&1 & echo $! > /tmp/bg-test.pid',
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                'ps -p $(cat /tmp/bg-test.pid) || echo "Process not found"',
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                'kill $(cat /tmp/bg-test.pid) 2>/dev/null || true',
                createOptions()
            ]);
            await command.execute([
                'hosts.test-server',
                'rm -f /tmp/bg-test.log /tmp/bg-test.pid',
                createOptions()
            ]);
        });
    });
    describe('Error Recovery and Validation', () => {
        it('should validate SSH connectivity before executing commands', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        'invalid-server': {
                            host: 'localhost',
                            port: 9999,
                            user: 'user',
                            password: 'password'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await expect(command.execute([
                'hosts.invalid-server',
                'echo "test"',
                createOptions({ quiet: true, timeout: '5s' })
            ])).rejects.toThrow();
        });
        it('should handle permission denied errors', async () => {
            const config = {
                version: '2.0',
                targets: {
                    hosts: {
                        'test-server': {
                            host: 'localhost',
                            port: 2201,
                            user: 'user',
                            password: 'password'
                        }
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(config));
            await expect(command.execute([
                'hosts.test-server',
                'echo "test" > /root/test.txt',
                createOptions({ quiet: true })
            ])).rejects.toThrow();
        });
    });
});
//# sourceMappingURL=on.integration.test.js.map