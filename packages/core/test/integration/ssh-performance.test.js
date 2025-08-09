import { performance } from 'perf_hooks';
import { it, expect, describe } from '@jest/globals';
import { describeSSH, getSSHConfig, testEachPackageManager, getAvailableContainers } from '@xec-sh/test-utils';
import { $ } from '../../src/index';
import { SSHAdapter } from '../../../src/adapters/ssh/index';
const LONG_TIMEOUT = 120000;
describeSSH('SSH Performance and Stress Tests', () => {
    describe('Connection Performance', () => {
        testEachPackageManager('should establish connections quickly', async (container) => {
            const connectionTimes = [];
            const iterations = 10;
            const sshConfig = getSSHConfig(container.name);
            for (let i = 0; i < iterations; i++) {
                const start = performance.now();
                const ssh = new SSHAdapter();
                try {
                    await ssh.execute({
                        command: 'echo test',
                        adapterOptions: {
                            type: 'ssh',
                            ...sshConfig
                        }
                    });
                    const duration = performance.now() - start;
                    connectionTimes.push(duration);
                }
                finally {
                    await ssh.dispose();
                }
            }
            const avgTime = connectionTimes.reduce((a, b) => a + b) / connectionTimes.length;
            const minTime = Math.min(...connectionTimes);
            const maxTime = Math.max(...connectionTimes);
            console.log(`Connection times for ${container.name} - Avg: ${avgTime.toFixed(2)}ms, Min: ${minTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
            expect(minTime).toBeLessThan(1000);
            expect(avgTime).toBeLessThan(2000);
        });
        testEachPackageManager('should benefit from connection pooling', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = $.ssh(sshConfig);
            try {
                const start1 = performance.now();
                await $ssh `echo "first"`;
                const firstDuration = performance.now() - start1;
                const subsequentTimes = [];
                for (let i = 0; i < 10; i++) {
                    const start = performance.now();
                    await $ssh `echo "test ${i}"`;
                    subsequentTimes.push(performance.now() - start);
                }
                const avgSubsequent = subsequentTimes.reduce((a, b) => a + b) / subsequentTimes.length;
                console.log(`First command: ${firstDuration.toFixed(2)}ms, Avg subsequent: ${avgSubsequent.toFixed(2)}ms`);
                expect(avgSubsequent).toBeLessThan(firstDuration * 0.5);
            }
            finally {
            }
        });
    });
    describe('Command Execution Performance', () => {
        testEachPackageManager('should handle rapid command execution', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = $.ssh(sshConfig);
            const commandCount = 50;
            const batchSize = 10;
            const start = performance.now();
            const results = [];
            for (let batch = 0; batch < commandCount / batchSize; batch++) {
                const batchPromises = Array(batchSize).fill(null).map((_, i) => {
                    const cmdIndex = batch * batchSize + i;
                    return $ssh `echo ${cmdIndex}`;
                });
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
            }
            const duration = performance.now() - start;
            results.forEach((result, i) => {
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe(String(i));
            });
            const commandsPerSecond = (commandCount / duration) * 1000;
            console.log(`${container.name}: Executed ${commandCount} commands in ${duration.toFixed(2)}ms (${commandsPerSecond.toFixed(2)} commands/sec)`);
            expect(commandsPerSecond).toBeGreaterThan(10);
        });
        testEachPackageManager('should handle long-running commands efficiently', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = $.ssh(sshConfig);
            const longCommands = [
                $ssh `sleep 2 && echo "done1"`,
                $ssh `sleep 2 && echo "done2"`,
                $ssh `sleep 2 && echo "done3"`,
                $ssh `sleep 2 && echo "done4"`,
                $ssh `sleep 2 && echo "done5"`
            ];
            const start = performance.now();
            const results = await Promise.all(longCommands);
            const duration = performance.now() - start;
            results.forEach((result, i) => {
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe(`done${i + 1}`);
            });
            expect(duration).toBeLessThan(4000);
            console.log(`5 parallel 2-second commands completed in ${duration.toFixed(2)}ms`);
        });
    });
    describe('Data Transfer Performance', () => {
        testEachPackageManager('should handle large stdout efficiently', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = $.ssh(sshConfig);
            const sizes = [1000, 10000, 100000, 1000000];
            const throughputs = [];
            for (const size of sizes) {
                const start = performance.now();
                const result = await $ssh `dd if=/dev/zero bs=1 count=${size} 2>/dev/null | base64`;
                const duration = performance.now() - start;
                expect(result.exitCode).toBe(0);
                const throughputMBps = (size / 1024 / 1024) / (duration / 1000);
                throughputs.push(throughputMBps);
                console.log(`${container.name}: Transfer ${size} bytes: ${duration.toFixed(2)}ms (${throughputMBps.toFixed(2)} MB/s)`);
            }
            const avgThroughput = throughputs.reduce((a, b) => a + b) / throughputs.length;
            expect(avgThroughput).toBeGreaterThan(0.1);
        });
        testEachPackageManager('should handle many small outputs efficiently', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = $.ssh(sshConfig);
            const lineCount = 10000;
            const start = performance.now();
            const result = await $ssh `seq 1 ${lineCount}`;
            const duration = performance.now() - start;
            expect(result.exitCode).toBe(0);
            const lines = result.stdout.trim().split('\n');
            expect(lines).toHaveLength(lineCount);
            const linesPerSecond = (lineCount / duration) * 1000;
            console.log(`${container.name}: Processed ${lineCount} lines in ${duration.toFixed(2)}ms (${linesPerSecond.toFixed(0)} lines/sec)`);
            expect(linesPerSecond).toBeGreaterThan(1000);
        });
    });
    describe('Concurrent Connection Stress Test', () => {
        it('should handle multiple concurrent SSH connections', async () => {
            const connectionCount = 10;
            const connections = [];
            const sshConfig = getSSHConfig('ubuntu-apt');
            const start = performance.now();
            try {
                for (let i = 0; i < connectionCount; i++) {
                    connections.push($.ssh(sshConfig));
                }
                const promises = connections.map(($ssh, i) => $ssh `echo "Connection ${i} - $(hostname)"`.catch(err => ({
                    exitCode: 1,
                    stdout: '',
                    stderr: err.message,
                    error: err
                })));
                const results = await Promise.all(promises);
                const duration = performance.now() - start;
                const successes = results.filter(r => r.exitCode === 0).length;
                const failures = results.filter(r => r.exitCode !== 0).length;
                console.log(`Created and used ${connectionCount} connections in ${duration.toFixed(2)}ms (${successes} succeeded, ${failures} failed)`);
                expect(successes).toBeGreaterThan(connectionCount / 2);
                expect(duration).toBeLessThan(30000);
            }
            catch (error) {
                console.error('Test failed with error:', error);
                throw error;
            }
        }, LONG_TIMEOUT);
        it('should handle connection pool limits gracefully', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const $ssh = $.ssh(sshConfig);
            try {
                const commandCount = 50;
                const batchSize = 10;
                for (let batch = 0; batch < commandCount / batchSize; batch++) {
                    const promises = Array(batchSize).fill(null).map((_, i) => $ssh `echo "Batch ${batch}, Command ${i}"`);
                    const results = await Promise.all(promises);
                    results.forEach(result => {
                        expect(result.exitCode).toBe(0);
                    });
                }
                console.log(`Successfully executed ${commandCount} commands in batches`);
            }
            finally {
            }
        });
    });
    describe('Memory and Resource Usage', () => {
        it('should not leak memory with repeated operations', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const $ssh = $.ssh(sshConfig);
            try {
                if (global.gc) {
                    global.gc();
                }
                const initialMemory = process.memoryUsage().heapUsed;
                for (let i = 0; i < 100; i++) {
                    await $ssh `echo "Iteration ${i}"`;
                    if (i % 20 === 0 && i > 0) {
                        if (global.gc) {
                            global.gc();
                        }
                        const currentMemory = process.memoryUsage().heapUsed;
                        const growth = (currentMemory - initialMemory) / 1024 / 1024;
                        console.log(`After ${i} iterations: Memory growth: ${growth.toFixed(2)} MB`);
                    }
                }
                if (global.gc) {
                    global.gc();
                }
                const finalMemory = process.memoryUsage().heapUsed;
                const totalGrowth = (finalMemory - initialMemory) / 1024 / 1024;
                console.log(`Total memory growth: ${totalGrowth.toFixed(2)} MB`);
                expect(totalGrowth).toBeLessThan(50);
            }
            finally {
            }
        }, LONG_TIMEOUT);
        it('should handle command output buffering efficiently', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const $ssh = $.ssh(sshConfig);
            try {
                const sizes = [
                    { size: '1K', bytes: 1024 },
                    { size: '10K', bytes: 10240 },
                    { size: '100K', bytes: 102400 },
                    { size: '1M', bytes: 1048576 }
                ];
                for (const { size, bytes } of sizes) {
                    const start = performance.now();
                    const result = await $ssh `dd if=/dev/urandom bs=1 count=${bytes} 2>/dev/null | base64`;
                    const duration = performance.now() - start;
                    const throughput = (bytes / 1024 / 1024) / (duration / 1000);
                    expect(result.exitCode).toBe(0);
                    expect(result.stdout.length).toBeGreaterThan(bytes);
                    console.log(`Buffered ${size} in ${duration.toFixed(2)}ms (${throughput.toFixed(2)} MB/s)`);
                }
            }
            finally {
            }
        });
    });
    describe('Error Handling Under Load', () => {
        it('should handle errors gracefully under concurrent load', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const $ssh = $.ssh(sshConfig);
            try {
                const totalCommands = 30;
                const errorRate = 0.2;
                const batchSize = 10;
                const results = [];
                for (let batch = 0; batch < totalCommands / batchSize; batch++) {
                    const batchPromises = Array(batchSize).fill(null).map((_, i) => {
                        const cmdIndex = batch * batchSize + i;
                        const shouldFail = Math.random() < errorRate;
                        const command = shouldFail
                            ? `exit ${cmdIndex % 5 + 1}`
                            : `echo "Success ${cmdIndex}"`;
                        return $ssh `${command}`.nothrow();
                    });
                    const batchResults = await Promise.all(batchPromises);
                    results.push(...batchResults);
                }
                const successes = results.filter(r => r.exitCode === 0).length;
                const failures = results.filter(r => r.exitCode !== 0).length;
                console.log(`Commands: ${totalCommands}, Successes: ${successes}, Failures: ${failures}`);
                expect(successes + failures).toBe(totalCommands);
                expect(failures).toBeGreaterThan(0);
                expect(successes).toBeGreaterThan(0);
            }
            finally {
            }
        });
        it('should recover from temporary connection issues', async () => {
            const sshConfig = getSSHConfig('ubuntu-apt');
            const $ssh = $.ssh(sshConfig).retry({
                maxRetries: 3,
                initialDelay: 100
            });
            try {
                const attemptCount = 0;
                const testFile = `/tmp/recovery-test-${Date.now()}`;
                const result = await $ssh `
          if [ ! -f ${testFile} ]; then
            touch ${testFile}
            exit 1
          else
            echo "Recovered"
            rm ${testFile}
          fi
        `.nothrow();
                expect(result.stdout.trim()).toBe('Recovered');
            }
            finally {
            }
        });
    });
    describe('Benchmarking Common Operations', () => {
        testEachPackageManager('should benchmark common shell operations', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = $.ssh(sshConfig);
            const benchmarks = [
                { name: 'Echo simple string', command: 'echo "test"' },
                { name: 'List directory', command: 'ls -la /tmp' },
                { name: 'Process check', command: 'ps aux | wc -l' },
                { name: 'Disk usage', command: 'df -h' },
                { name: 'Network interfaces', command: 'ip addr || ifconfig' },
                { name: 'System info', command: 'uname -a' },
                { name: 'Environment vars', command: 'env | wc -l' },
                { name: 'Date command', command: 'date "+%Y-%m-%d %H:%M:%S"' }
            ];
            console.log(`\nBenchmark Results for ${container.name}:`);
            console.log('==================');
            for (const { name, command } of benchmarks) {
                const iterations = 3;
                const times = [];
                let failed = false;
                for (let i = 0; i < iterations; i++) {
                    try {
                        const start = performance.now();
                        const result = await $ssh `${command}`;
                        times.push(performance.now() - start);
                        expect(result.exitCode).toBe(0);
                    }
                    catch (error) {
                        console.warn(`Benchmark "${name}" iteration ${i} failed:`, error);
                        failed = true;
                        break;
                    }
                }
                if (failed || times.length === 0) {
                    console.log(`${name}: FAILED`);
                    continue;
                }
                const avgTime = times.reduce((a, b) => a + b) / times.length;
                const minTime = Math.min(...times);
                const maxTime = Math.max(...times);
                console.log(`${name}:`);
                console.log(`  Avg: ${avgTime.toFixed(2)}ms, Min: ${minTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
            }
        });
    });
    describe('Container-Specific Performance', () => {
        it('should compare performance across different containers', async () => {
            const containers = getAvailableContainers().filter(c => ['ubuntu-apt', 'alpine-apk', 'fedora-dnf'].includes(c.name));
            console.log('\nContainer Performance Comparison:');
            console.log('=================================');
            for (const container of containers) {
                const sshConfig = getSSHConfig(container.name);
                const $ssh = $.ssh(sshConfig);
                try {
                    const times = [];
                    for (let i = 0; i < 5; i++) {
                        const start = performance.now();
                        await $ssh `echo "test"`;
                        times.push(performance.now() - start);
                    }
                    const avgTime = times.reduce((a, b) => a + b) / times.length;
                    const dataStart = performance.now();
                    const result = await $ssh `seq 1 1000 | wc -l`;
                    const dataTime = performance.now() - dataStart;
                    expect(result.stdout.trim()).toBe('1000');
                    console.log(`${container.name}:`);
                    console.log(`  Avg echo time: ${avgTime.toFixed(2)}ms`);
                    console.log(`  Data processing: ${dataTime.toFixed(2)}ms`);
                }
                catch (error) {
                    console.log(`${container.name}: Failed to connect - ${error instanceof Error ? error.message : String(error)}`);
                }
                finally {
                }
            }
        });
    });
}, { timeout: LONG_TIMEOUT });
//# sourceMappingURL=ssh-performance.test.js.map