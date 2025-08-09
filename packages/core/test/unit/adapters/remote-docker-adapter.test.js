import { test, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { DockerError, CommandError } from '../../../src/core/error';
import { RemoteDockerAdapter } from '../../../src/adapters/remote-docker/index';
const MockClient = jest.fn();
jest.mock('ssh2', () => ({
    Client: MockClient
}));
describe('RemoteDockerAdapter', () => {
    let adapter;
    let mockClient;
    let mockStream;
    const testConfig = {
        ssh: {
            host: 'test-host',
            username: 'test-user',
            port: 22,
            privateKey: Buffer.from('test-key')
        },
        dockerPath: 'docker'
    };
    const createMockStream = (exitCode = 0, signal) => {
        let transformStream;
        const stream = {
            write: jest.fn(),
            end: jest.fn(),
            pipe: jest.fn((transform) => {
                transformStream = transform;
                return stream;
            }),
            on: jest.fn((event, handler) => {
                if (event === 'close') {
                    process.nextTick(() => handler(exitCode, signal));
                }
                return stream;
            }),
            destroy: jest.fn(),
            stderr: {
                pipe: jest.fn().mockReturnThis()
            }
        };
        return stream;
    };
    beforeEach(() => {
        mockClient = {
            connect: jest.fn(),
            exec: jest.fn(),
            end: jest.fn(),
            once: jest.fn(),
            on: jest.fn(),
            destroy: jest.fn()
        };
        mockStream = {
            write: jest.fn(),
            end: jest.fn(),
            pipe: jest.fn().mockReturnThis(),
            on: jest.fn(),
            destroy: jest.fn(),
            stderr: {
                pipe: jest.fn().mockReturnThis()
            }
        };
        MockClient.mockImplementation(() => mockClient);
        mockClient.exec.mockImplementation((command, callback) => {
            const stream = createMockStream();
            process.nextTick(() => callback(null, stream));
        });
        let readyCallback;
        let errorCallback;
        mockClient.once.mockImplementation((event, callback) => {
            if (event === 'ready') {
                readyCallback = callback;
            }
            else if (event === 'error') {
                errorCallback = callback;
            }
            return mockClient;
        });
        mockClient.connect.mockImplementation(() => {
            process.nextTick(() => {
                if (readyCallback) {
                    readyCallback();
                }
            });
        });
        adapter = new RemoteDockerAdapter({
            ...testConfig,
            throwOnNonZeroExit: false
        });
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('isAvailable', () => {
        test('should return true when SSH connection and Docker are available', async () => {
            const getConnectionSpy = jest.spyOn(adapter, 'getConnection')
                .mockResolvedValue(mockClient);
            const executeSSHCommandSpy = jest.spyOn(adapter, 'executeSSHCommand')
                .mockResolvedValue({
                stdout: '{"Version":"20.10.0"}',
                stderr: '',
                exitCode: 0
            });
            const result = await adapter.isAvailable();
            expect(result).toBe(true);
            expect(executeSSHCommandSpy).toHaveBeenCalledWith(expect.anything(), 'docker version --format json');
            getConnectionSpy.mockRestore();
            executeSSHCommandSpy.mockRestore();
        });
        test('should return false when Docker is not available', async () => {
            const getConnectionSpy = jest.spyOn(adapter, 'getConnection')
                .mockResolvedValue(mockClient);
            const executeSSHCommandSpy = jest.spyOn(adapter, 'executeSSHCommand')
                .mockResolvedValue({
                stdout: '',
                stderr: 'docker: command not found',
                exitCode: 1
            });
            const result = await adapter.isAvailable();
            expect(result).toBe(false);
            getConnectionSpy.mockRestore();
            executeSSHCommandSpy.mockRestore();
        });
        test('should return false when SSH connection fails', async () => {
            const getConnectionSpy = jest.spyOn(adapter, 'getConnection')
                .mockRejectedValue(new Error('Connection failed'));
            const result = await adapter.isAvailable();
            expect(result).toBe(false);
            getConnectionSpy.mockRestore();
        });
    });
    describe('execute', () => {
        test('should execute command in remote Docker container', async () => {
            const getConnectionSpy = jest.spyOn(adapter, 'getConnection')
                .mockResolvedValue(mockClient);
            const executeSSHCommandSpy = jest.spyOn(adapter, 'executeSSHCommand')
                .mockResolvedValue({
                stdout: 'hello\n',
                stderr: '',
                exitCode: 0
            });
            const result = await adapter.execute({
                command: 'echo',
                args: ['hello'],
                adapterOptions: {
                    type: 'remote-docker',
                    ssh: testConfig.ssh,
                    docker: {
                        container: 'test-container'
                    }
                }
            });
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('hello\n');
            expect(executeSSHCommandSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('docker exec'), undefined, 120000, undefined);
            const dockerCommand = executeSSHCommandSpy.mock.calls[0]?.[1];
            expect(dockerCommand).toContain('test-container');
            expect(dockerCommand).toContain('echo hello');
            getConnectionSpy.mockRestore();
            executeSSHCommandSpy.mockRestore();
        });
        test('should handle docker exec with user option', async () => {
            const getConnectionSpy = jest.spyOn(adapter, 'getConnection')
                .mockResolvedValue(mockClient);
            const executeSSHCommandSpy = jest.spyOn(adapter, 'executeSSHCommand')
                .mockResolvedValue({
                stdout: 'testuser\n',
                stderr: '',
                exitCode: 0
            });
            await adapter.execute({
                command: 'whoami',
                adapterOptions: {
                    type: 'remote-docker',
                    ssh: testConfig.ssh,
                    docker: {
                        container: 'test-container',
                        user: 'testuser'
                    }
                }
            });
            expect(executeSSHCommandSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('docker exec'), undefined, 120000, undefined);
            const dockerCommand = executeSSHCommandSpy.mock.calls[0]?.[1];
            expect(dockerCommand).toContain('-u testuser');
            expect(dockerCommand).toContain('test-container');
            expect(dockerCommand).toContain('whoami');
            getConnectionSpy.mockRestore();
            executeSSHCommandSpy.mockRestore();
        });
        test('should handle docker exec with working directory', async () => {
            const getConnectionSpy = jest.spyOn(adapter, 'getConnection')
                .mockResolvedValue(mockClient);
            const executeSSHCommandSpy = jest.spyOn(adapter, 'executeSSHCommand')
                .mockResolvedValue({
                stdout: '/workspace\n',
                stderr: '',
                exitCode: 0
            });
            await adapter.execute({
                command: 'pwd',
                cwd: '/app',
                adapterOptions: {
                    type: 'remote-docker',
                    ssh: testConfig.ssh,
                    docker: {
                        container: 'test-container',
                        workdir: '/workspace'
                    }
                }
            });
            expect(executeSSHCommandSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('docker exec'), undefined, 120000, undefined);
            const dockerCommand = executeSSHCommandSpy.mock.calls[0]?.[1];
            expect(dockerCommand).toContain('-w /workspace');
            expect(dockerCommand).toContain('test-container');
            expect(dockerCommand).toContain('pwd');
            getConnectionSpy.mockRestore();
            executeSSHCommandSpy.mockRestore();
        });
        test('should handle environment variables', async () => {
            const getConnectionSpy = jest.spyOn(adapter, 'getConnection')
                .mockResolvedValue(mockClient);
            const executeSSHCommandSpy = jest.spyOn(adapter, 'executeSSHCommand')
                .mockResolvedValue({
                stdout: 'FOO=bar\nBAZ=qux\n',
                stderr: '',
                exitCode: 0
            });
            await adapter.execute({
                command: 'printenv',
                env: {
                    FOO: 'bar',
                    BAZ: 'qux'
                },
                adapterOptions: {
                    type: 'remote-docker',
                    ssh: testConfig.ssh,
                    docker: {
                        container: 'test-container'
                    }
                }
            });
            const callArgs = executeSSHCommandSpy.mock.calls[0];
            const dockerCommand = callArgs?.[1] || '';
            expect(dockerCommand).toContain('-e FOO=bar');
            expect(dockerCommand).toContain('-e BAZ=qux');
            getConnectionSpy.mockRestore();
            executeSSHCommandSpy.mockRestore();
        });
        test('should handle shell commands', async () => {
            const getConnectionSpy = jest.spyOn(adapter, 'getConnection')
                .mockResolvedValue(mockClient);
            const executeSSHCommandSpy = jest.spyOn(adapter, 'executeSSHCommand')
                .mockResolvedValue({
                stdout: '2\n',
                stderr: '',
                exitCode: 0
            });
            await adapter.execute({
                command: 'echo "hello world" | wc -w',
                shell: true,
                adapterOptions: {
                    type: 'remote-docker',
                    ssh: testConfig.ssh,
                    docker: {
                        container: 'test-container'
                    }
                }
            });
            expect(executeSSHCommandSpy).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/docker exec.*test-container.*\/bin\/sh -c/), undefined, 120000, undefined);
            getConnectionSpy.mockRestore();
            executeSSHCommandSpy.mockRestore();
        });
        test('should handle stdin input', async () => {
            const getConnectionSpy = jest.spyOn(adapter, 'getConnection')
                .mockResolvedValue(mockClient);
            const executeSSHCommandSpy = jest.spyOn(adapter, 'executeSSHCommand')
                .mockResolvedValue({
                stdout: 'test input',
                stderr: '',
                exitCode: 0
            });
            await adapter.execute({
                command: 'cat',
                stdin: 'test input',
                adapterOptions: {
                    type: 'remote-docker',
                    ssh: testConfig.ssh,
                    docker: {
                        container: 'test-container'
                    }
                }
            });
            expect(executeSSHCommandSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('docker exec'), 'test input', 120000, undefined);
            const dockerCommand = executeSSHCommandSpy.mock.calls[0]?.[1];
            expect(dockerCommand).toContain('-i');
            expect(dockerCommand).toContain('test-container');
            expect(dockerCommand).toContain('cat');
            getConnectionSpy.mockRestore();
            executeSSHCommandSpy.mockRestore();
        });
        test('should handle TTY option', async () => {
            const getConnectionSpy = jest.spyOn(adapter, 'getConnection')
                .mockResolvedValue(mockClient);
            const executeSSHCommandSpy = jest.spyOn(adapter, 'executeSSHCommand')
                .mockResolvedValue({
                stdout: '',
                stderr: '',
                exitCode: 0
            });
            await adapter.execute({
                command: 'bash',
                stdin: 'ls\n',
                adapterOptions: {
                    type: 'remote-docker',
                    ssh: testConfig.ssh,
                    docker: {
                        container: 'test-container',
                        tty: true
                    }
                }
            });
            expect(executeSSHCommandSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('docker exec'), 'ls\n', 120000, undefined);
            const dockerCommand = executeSSHCommandSpy.mock.calls[0]?.[1];
            expect(dockerCommand).toContain('-i');
            expect(dockerCommand).toContain('-t');
            expect(dockerCommand).toContain('test-container');
            expect(dockerCommand).toContain('bash');
            getConnectionSpy.mockRestore();
            executeSSHCommandSpy.mockRestore();
        });
        test('should throw CommandError on command failure', async () => {
            const throwAdapter = new RemoteDockerAdapter({
                ...testConfig,
                throwOnNonZeroExit: true
            });
            const getConnectionSpy = jest.spyOn(throwAdapter, 'getConnection')
                .mockResolvedValue(mockClient);
            const executeSSHCommandSpy = jest.spyOn(throwAdapter, 'executeSSHCommand')
                .mockResolvedValue({
                stdout: '',
                stderr: 'docker: Error response from daemon',
                exitCode: 125
            });
            await expect(throwAdapter.execute({
                command: 'invalid-command',
                adapterOptions: {
                    type: 'remote-docker',
                    ssh: testConfig.ssh,
                    docker: {
                        container: 'test-container'
                    }
                }
            })).rejects.toThrow(CommandError);
            getConnectionSpy.mockRestore();
            executeSSHCommandSpy.mockRestore();
        });
        test('should handle connection errors', async () => {
            const getConnectionSpy = jest.spyOn(adapter, 'getConnection')
                .mockRejectedValue(new Error('Connection refused'));
            await expect(adapter.execute({
                command: 'echo',
                adapterOptions: {
                    type: 'remote-docker',
                    ssh: testConfig.ssh,
                    docker: {
                        container: 'test-container'
                    }
                }
            })).rejects.toThrow(DockerError);
            getConnectionSpy.mockRestore();
        });
        test('should handle timeout', async () => {
            const executeSSHCommandSpy = jest.spyOn(adapter, 'executeSSHCommand')
                .mockImplementation(() => new Promise((resolve, reject) => {
                setTimeout(() => {
                    reject(new Error('Command timed out after 100ms'));
                }, 150);
            }));
            const promise = adapter.execute({
                command: 'sleep 10',
                timeout: 100,
                adapterOptions: {
                    type: 'remote-docker',
                    ssh: testConfig.ssh,
                    docker: {
                        container: 'test-container'
                    }
                }
            });
            await expect(promise).rejects.toThrow();
            executeSSHCommandSpy.mockRestore();
        });
    });
    describe('auto-create container', () => {
        beforeEach(() => {
            adapter = new RemoteDockerAdapter({
                ...testConfig,
                autoCreate: {
                    enabled: true,
                    image: 'alpine:latest',
                    autoRemove: true,
                    volumes: ['/data:/data']
                }
            });
        });
        test('should create temporary container if it does not exist', async () => {
            const getConnectionSpy = jest.spyOn(adapter, 'getConnection')
                .mockResolvedValue(mockClient);
            let callCount = 0;
            const executeSSHCommandSpy = jest.spyOn(adapter, 'executeSSHCommand')
                .mockImplementation((client, command) => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve({
                        stdout: '',
                        stderr: 'Error: No such container',
                        exitCode: 1
                    });
                }
                else if (callCount === 2) {
                    return Promise.resolve({
                        stdout: 'container-id',
                        stderr: '',
                        exitCode: 0
                    });
                }
                else {
                    return Promise.resolve({
                        stdout: 'hello',
                        stderr: '',
                        exitCode: 0
                    });
                }
            });
            await adapter.execute({
                command: 'echo hello',
                adapterOptions: {
                    type: 'remote-docker',
                    ssh: testConfig.ssh,
                    docker: {
                        container: 'test-container'
                    }
                }
            });
            expect(executeSSHCommandSpy).toHaveBeenCalledTimes(3);
            const calls = executeSSHCommandSpy.mock.calls;
            expect(calls[1]?.[1]).toMatch(/docker run -d --name xec-temp-.* --rm -v \/data:\/data alpine:latest tail -f \/dev\/null/);
            getConnectionSpy.mockRestore();
            executeSSHCommandSpy.mockRestore();
        });
    });
    describe('dispose', () => {
        test('should close SSH connection', async () => {
            await adapter.dispose();
            expect(mockClient.end).not.toHaveBeenCalled();
            const getConnectionSpy = jest.spyOn(adapter, 'getConnection')
                .mockResolvedValue(mockClient);
            adapter.sshClient = mockClient;
            await adapter.dispose();
            expect(mockClient.end).toHaveBeenCalled();
            getConnectionSpy.mockRestore();
        });
        test('should clean up temporary containers', async () => {
            adapter = new RemoteDockerAdapter({
                ...testConfig,
                autoCreate: {
                    enabled: true,
                    image: 'alpine:latest',
                    autoRemove: true
                }
            });
            const getConnectionSpy = jest.spyOn(adapter, 'getConnection')
                .mockResolvedValue(mockClient);
            let callCount = 0;
            const executeSSHCommandSpy = jest.spyOn(adapter, 'executeSSHCommand')
                .mockImplementation((client, command) => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve({ stdout: '', stderr: 'No such container', exitCode: 1 });
                }
                return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
            });
            await adapter.execute({
                command: 'echo hello',
                adapterOptions: {
                    type: 'remote-docker',
                    ssh: testConfig.ssh,
                    docker: {
                        container: 'non-existent'
                    }
                }
            });
            executeSSHCommandSpy.mockClear();
            executeSSHCommandSpy.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
            adapter.sshClient = mockClient;
            await adapter.dispose();
            expect(executeSSHCommandSpy).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/docker stop xec-temp-.*/));
            getConnectionSpy.mockRestore();
            executeSSHCommandSpy.mockRestore();
        });
    });
});
//# sourceMappingURL=remote-docker-adapter.test.js.map