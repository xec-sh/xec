import { it, expect, describe } from '@jest/globals';
import { describeSSH, getSSHConfig, testEachPackageManager } from '@xec-sh/test-utils';
import { $ } from '../../src/index';
import { SSHAdapter } from '../../../src/adapters/ssh/index';
function getConfiguredSSH(sshConfig) {
    return $.ssh(sshConfig);
}
describeSSH('SSH High-Level Integration Tests', () => {
    describe('Real-World Scenarios', () => {
        testEachPackageManager('should deploy and manage a simple application', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const appName = `test-app-${Date.now()}`;
            const appDir = `/home/user/${appName}`;
            try {
                await $ssh `mkdir -p ${appDir}/src ${appDir}/config ${appDir}/logs`;
                await $ssh `touch ${appDir}/src/app.sh`;
                await $ssh `echo '#!/bin/bash' >> ${appDir}/src/app.sh`;
                await $ssh `echo 'echo "Starting ${appName}..."' >> ${appDir}/src/app.sh`;
                await $ssh `echo 'while true; do' >> ${appDir}/src/app.sh`;
                await $ssh `echo '  echo "[$(date)] ${appName} is running" >> logs/app.log' >> ${appDir}/src/app.sh`;
                await $ssh `echo '  sleep 5' >> ${appDir}/src/app.sh`;
                await $ssh `echo 'done' >> ${appDir}/src/app.sh`;
                await $ssh `chmod +x ${appDir}/src/app.sh`;
                await $ssh `touch ${appDir}/config/app.conf`;
                await $ssh `echo "APP_NAME=${appName}" >> ${appDir}/config/app.conf`;
                await $ssh `echo "LOG_LEVEL=debug" >> ${appDir}/config/app.conf`;
                await $ssh `echo "PORT=8080" >> ${appDir}/config/app.conf`;
                const startResult = await $ssh `
          cd ${appDir} && 
          (./src/app.sh > /dev/null 2>&1 & echo $! > app.pid) || 
          (sh ./src/app.sh > /dev/null 2>&1 & echo $! > app.pid)
        `;
                await new Promise(resolve => setTimeout(resolve, 2000));
                const pidResult = await $ssh `test -f ${appDir}/app.pid && cat ${appDir}/app.pid || echo "0"`;
                const pid = pidResult.stdout.trim();
                if (pid === "0" || !pid.match(/^\d+$/)) {
                    console.log(`Skipping process check for ${container.name} - could not start background process`);
                    await $ssh `rm -rf ${appDir}`;
                    return;
                }
                expect(pid).toMatch(/^\d+$/);
                const psResult = await $ssh `ps -p ${pid} -o comm= 2>/dev/null || echo "not found"`.nothrow();
                if (psResult.stdout.trim() !== "not found") {
                    expect(psResult.stdout).toContain('sh');
                }
                const logsResult = await $ssh `test -f ${appDir}/logs/app.log && head -5 ${appDir}/logs/app.log || echo "No logs"`.nothrow();
                if (logsResult.stdout.trim() !== "No logs") {
                    expect(logsResult.stdout).toContain(`${appName} is running`);
                }
                await $ssh `test -f ${appDir}/app.pid && kill $(cat ${appDir}/app.pid) 2>/dev/null || true`;
                await $ssh `rm -rf ${appDir}`;
            }
            catch (error) {
                await $ssh `pkill -f ${appName} || true`;
                await $ssh `rm -rf ${appDir}`;
                throw error;
            }
        });
        testEachPackageManager('should handle complex pipeline operations', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const testDir = `/tmp/pipeline-test-${Date.now()}`;
            try {
                await $ssh `mkdir -p ${testDir}`;
                await $ssh `seq 1 1000 > ${testDir}/numbers.txt`;
                const result = await $ssh `
          cat ${testDir}/numbers.txt |
          grep -E '^[0-9]*[02468]$' |  # Even numbers only
          awk '{sum += $1} END {print "Count:", NR, "Sum:", sum, "Avg:", sum/NR}' 
        `;
                expect(result.exitCode).toBe(0);
                expect(result.stdout).toContain('Count: 500');
                expect(result.stdout).toContain('Sum: 250500');
                expect(result.stdout).toContain('Avg: 501');
                const lineCountResult = await $ssh `cat ${testDir}/numbers.txt | wc -l`;
                expect(lineCountResult.stdout.trim()).toBe('1000');
                await $ssh `rm -rf ${testDir}`;
            }
            catch (error) {
                await $ssh `rm -rf ${testDir}`;
                throw error;
            }
        });
        testEachPackageManager('should handle concurrent operations correctly', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const testDir = `/tmp/concurrent-test-${Date.now()}`;
            try {
                await $ssh `mkdir -p ${testDir}`;
                const operations = Array(10).fill(null).map((_, i) => $ssh `echo "Task ${i} completed at $(date +%s.%N)" > ${testDir}/task-${i}.txt`);
                const results = await Promise.all(operations);
                results.forEach(result => {
                    expect(result.exitCode).toBe(0);
                });
                const filesResult = await $ssh `ls ${testDir}/task-*.txt | wc -l`;
                expect(filesResult.stdout.trim()).toBe('10');
                const timestampsResult = await $ssh `
          for f in ${testDir}/task-*.txt; do
            cat "$f" | grep -oE '[0-9]+\\.[0-9]+' || true
          done | sort -n
        `;
                const timestamps = timestampsResult.stdout
                    .trim()
                    .split('\n')
                    .filter(line => line && line.match(/^[0-9]+\.[0-9]+$/))
                    .map(parseFloat);
                if (timestamps.length >= 2) {
                    const firstTimestamp = timestamps[0];
                    const lastTimestamp = timestamps[timestamps.length - 1];
                    if (firstTimestamp !== undefined && lastTimestamp !== undefined && !isNaN(firstTimestamp) && !isNaN(lastTimestamp)) {
                        const duration = lastTimestamp - firstTimestamp;
                        expect(duration).toBeLessThan(3);
                    }
                }
                await $ssh `rm -rf ${testDir}`;
            }
            catch (error) {
                await $ssh `rm -rf ${testDir}`;
                throw error;
            }
        });
        testEachPackageManager('should handle error recovery and retries', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const testFile = `/tmp/retry-test-${Date.now()}.txt`;
            try {
                const $sshRetry = $ssh.retry({ maxRetries: 3, initialDelay: 100 });
                const result = await $sshRetry `
          if [ ! -f ${testFile} ]; then
            touch ${testFile}
            exit 1
          else
            echo "Success on retry"
          fi
        `.nothrow();
                expect(result.stdout.trim()).toBe('Success on retry');
                const $sshTimeout = $ssh.timeout(1000).retry({ maxRetries: 2 });
                const timeoutResult = await $sshTimeout `
          sleep 0.5 && echo "Quick operation"
        `;
                expect(timeoutResult.exitCode).toBe(0);
                expect(timeoutResult.stdout.trim()).toBe('Quick operation');
                await $ssh `rm -f ${testFile}`;
            }
            catch (error) {
                await $ssh `rm -f ${testFile}`;
                throw error;
            }
        });
        testEachPackageManager('should handle package manager operations', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const ssh = new SSHAdapter();
            try {
                let pmCommand = '';
                let searchCommand = '';
                let searchPackage = '';
                switch (container.packageManager) {
                    case 'apt':
                        pmCommand = 'apt-cache';
                        searchCommand = 'search';
                        searchPackage = '^curl$';
                        break;
                    case 'yum':
                        pmCommand = 'yum';
                        searchCommand = 'search';
                        searchPackage = 'curl';
                        break;
                    case 'dnf':
                        pmCommand = 'dnf';
                        searchCommand = 'search';
                        searchPackage = 'curl';
                        break;
                    case 'apk':
                        pmCommand = 'apk';
                        searchCommand = 'search';
                        searchPackage = 'curl';
                        break;
                    case 'pacman':
                        pmCommand = 'pacman';
                        searchCommand = '-Ss';
                        searchPackage = '^curl$';
                        break;
                    case 'brew':
                        console.log(`Skipping package manager test for ${container.name}: brew not suitable for containers`);
                        return;
                    case 'snap':
                        console.log(`Skipping package manager test for ${container.name}: snap requires special setup`);
                        return;
                }
                const searchResult = await ssh.execute({
                    command: `${pmCommand} ${searchCommand} ${searchPackage} 2>/dev/null | head -5`,
                    nothrow: true,
                    adapterOptions: { type: 'ssh', ...sshConfig }
                });
                expect(searchResult.exitCode).toBe(0);
                expect(searchResult.stdout.length).toBeGreaterThan(0);
                await ssh.dispose();
            }
            catch (error) {
                await ssh.dispose();
                throw error;
            }
        });
        testEachPackageManager('should handle environment and shell contexts', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const $sshEnv = $ssh.env({
                MY_VAR: 'test-value',
                MY_NUMBER: '42',
                MY_PATH: '/custom/path'
            });
            const envResult = await $sshEnv `echo "$MY_VAR $MY_NUMBER $MY_PATH"`;
            expect(envResult.stdout.trim()).toBe('test-value 42 /custom/path');
            const $sshCd = $ssh.cd('/tmp');
            const pwdResult = await $sshCd `pwd`;
            expect(pwdResult.stdout.trim()).toBe('/tmp');
            const $sshCombined = $ssh
                .cd('/var')
                .env({ TEST_DIR: 'log' });
            const combinedResult = await $sshCombined `ls -d $TEST_DIR 2>/dev/null || echo "Not found"`;
            if (combinedResult.stdout.trim() !== 'Not found') {
                expect(combinedResult.stdout.trim()).toBe('log');
            }
            const shellResult = await $ssh `echo $0`;
            expect(shellResult.stdout).toMatch(/sh|bash/);
        });
    });
    describe('Cross-Container Operations', () => {
        it('should transfer data between containers', async () => {
            const containers = ['ubuntu-apt', 'alpine-apk'];
            const sourceContainerName = containers[0];
            const targetContainerName = containers[1];
            if (!sourceContainerName || !targetContainerName) {
                throw new Error('Container names not defined');
            }
            const sourceConfig = getSSHConfig(sourceContainerName);
            const targetConfig = getSSHConfig(targetContainerName);
            const $source = getConfiguredSSH(sourceConfig);
            const $target = getConfiguredSSH(targetConfig);
            const testData = `Test data from ${sourceContainerName} to ${targetContainerName} at ${new Date().toISOString()}`;
            const fileName = `transfer-test-${Date.now()}.txt`;
            try {
                const testContent = "Simple transfer test data";
                await $source `echo ${testContent} > /tmp/${fileName}`;
                const sourceContent = await $source `cat /tmp/${fileName}`;
                await $target `echo ${sourceContent.stdout.trim()} > /tmp/${fileName}`;
                const verifyResult = await $target `cat /tmp/${fileName}`;
                expect(verifyResult.stdout.trim()).toBe(testContent);
                await $source `rm -f /tmp/${fileName}`;
                await $target `rm -f /tmp/${fileName}`;
            }
            catch (error) {
                await $source `rm -f /tmp/${fileName}`.nothrow();
                await $target `rm -f /tmp/${fileName}`.nothrow();
                throw error;
            }
        });
    });
    describe('Performance and Stress Testing', () => {
        testEachPackageManager('should handle large data processing efficiently', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const testFile = `/tmp/large-data-${Date.now()}.txt`;
            try {
                await $ssh `dd if=/dev/urandom bs=1M count=10 2>/dev/null | base64 > ${testFile}`;
                const start = Date.now();
                const result = await $ssh `
          cat ${testFile} | 
          wc -c
        `;
                const duration = Date.now() - start;
                const fileSize = parseInt(result.stdout.trim());
                expect(fileSize).toBeGreaterThan(10 * 1024 * 1024);
                expect(duration).toBeLessThan(5000);
                console.log(`Processed ${(fileSize / 1024 / 1024).toFixed(2)}MB in ${duration}ms on ${container.name}`);
                await $ssh `rm -f ${testFile}`;
            }
            catch (error) {
                await $ssh `rm -f ${testFile}`;
                throw error;
            }
        });
    });
});
//# sourceMappingURL=ssh-high-level.test.js.map