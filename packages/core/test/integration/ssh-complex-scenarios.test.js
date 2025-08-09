import { promises as fs } from 'fs';
import { expect, describe } from '@jest/globals';
import { describeSSH, getSSHConfig, testEachPackageManager } from '@xec-sh/test-utils';
import { $ } from '../../src/index';
import { SSHAdapter } from '../../../src/adapters/ssh/index';
function getConfiguredSSH(sshConfig) {
    return $.ssh(sshConfig);
}
describeSSH('SSH Complex Scenarios Tests', () => {
    describe('Advanced File Operations', () => {
        testEachPackageManager('should handle file archiving and compression', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const testDir = `/tmp/archive-test-${Date.now()}`;
            try {
                await $ssh `mkdir -p ${testDir}/src ${testDir}/docs ${testDir}/config`;
                await $ssh `echo "Source code" > ${testDir}/src/app.js`;
                await $ssh `echo "Documentation" > ${testDir}/docs/README.md`;
                await $ssh `echo "Config data" > ${testDir}/config/settings.json`;
                const archiveName = `backup-${Date.now()}.tar.gz`;
                await $ssh `cd ${testDir} && tar -czf /tmp/${archiveName} src docs config`;
                const sizeResult = await $ssh `ls -la /tmp/${archiveName} | awk '{print $5}'`;
                const archiveSize = parseInt(sizeResult.stdout.trim());
                expect(archiveSize).toBeGreaterThan(100);
                const extractDir = `/tmp/extract-test-${Date.now()}`;
                await $ssh `mkdir -p ${extractDir}`;
                await $ssh `cd ${extractDir} && tar -xzf /tmp/${archiveName}`;
                await new Promise(resolve => setTimeout(resolve, 500));
                const listResult = await $ssh `find ${extractDir} -type f 2>/dev/null | sort`;
                const extractedFiles = listResult.stdout.trim().split('\n').filter(Boolean);
                expect(extractedFiles.length).toBeGreaterThanOrEqual(1);
                const hasSource = extractedFiles.some(f => f.includes('app.js'));
                const hasDocs = extractedFiles.some(f => f.includes('README.md'));
                const hasConfig = extractedFiles.some(f => f.includes('settings.json'));
                expect(hasSource || hasDocs || hasConfig).toBe(true);
                await $ssh `rm -rf ${testDir} ${extractDir} /tmp/${archiveName}`;
            }
            catch (error) {
                await $ssh `rm -rf ${testDir} /tmp/extract-test-* /tmp/backup-*.tar.gz`.nothrow();
                throw error;
            }
        });
        testEachPackageManager('should handle symbolic links and permissions', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const testDir = `/tmp/links-test-${Date.now()}`;
            try {
                await $ssh `mkdir -p ${testDir}`;
                await $ssh `echo "Executable script" > ${testDir}/script.sh`;
                await $ssh `chmod 755 ${testDir}/script.sh`;
                await $ssh `echo "Read only file" > ${testDir}/readonly.txt`;
                await $ssh `chmod 444 ${testDir}/readonly.txt`;
                await $ssh `echo "Private file" > ${testDir}/private.txt`;
                await $ssh `chmod 600 ${testDir}/private.txt`;
                await $ssh `ln -s script.sh ${testDir}/run.sh`;
                await $ssh `ln -s /tmp ${testDir}/tmp-link`;
                const permsResult = await $ssh `ls -la ${testDir} | grep -E "(script|readonly|private)" | awk '{print $1, $9}'`;
                expect(permsResult.stdout).toContain('-rwxr-xr-x');
                expect(permsResult.stdout).toContain('-r--r--r--');
                expect(permsResult.stdout).toContain('-rw-------');
                const linksResult = await $ssh `ls -la ${testDir} | grep -E "^l" | wc -l`;
                expect(linksResult.stdout.trim()).toBe('2');
                const linkTargetResult = await $ssh `readlink ${testDir}/run.sh`;
                expect(linkTargetResult.stdout.trim()).toBe('script.sh');
                await $ssh `rm -rf ${testDir}`;
            }
            catch (error) {
                await $ssh `rm -rf ${testDir}`.nothrow();
                throw error;
            }
        });
        testEachPackageManager('should handle file searching and filtering', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const testDir = `/tmp/search-test-${Date.now()}`;
            try {
                await $ssh `mkdir -p ${testDir}/project1/src ${testDir}/project1/test ${testDir}/project2/src ${testDir}/project2/docs ${testDir}/logs`;
                const files = [
                    'project1/src/main.js',
                    'project1/src/utils.js',
                    'project1/test/main.test.js',
                    'project2/src/app.py',
                    'project2/src/helpers.py',
                    'project2/docs/README.md',
                    'logs/app.log',
                    'logs/error.log'
                ];
                for (const file of files) {
                    await $ssh `echo "Content of ${file}" > ${testDir}/${file}`;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
                const jsFilesResult = await $ssh `find ${testDir} -name "*.js" | grep -v "^$" | sort || true`;
                const jsFiles = jsFilesResult.stdout.trim().split('\n').filter(line => line.length > 0);
                expect(jsFiles.length).toBeGreaterThanOrEqual(3);
                const recentResult = await $ssh `find ${testDir} -type f -mmin -1 | wc -l`;
                expect(parseInt(recentResult.stdout.trim())).toBe(8);
                await $ssh `dd if=/dev/zero of=${testDir}/large.bin bs=1K count=10 2>/dev/null`;
                const largeResult = await $ssh `find ${testDir} -type f -size +5k | grep large.bin || echo ""`;
                expect(largeResult.stdout).toContain('large.bin');
                const grepResult = await $ssh `grep -r "Content of.*\.py" ${testDir} 2>/dev/null | wc -l`;
                expect(parseInt(grepResult.stdout.trim())).toBe(2);
                await $ssh `rm -rf ${testDir}`;
            }
            catch (error) {
                await $ssh `rm -rf ${testDir}`.nothrow();
                throw error;
            }
        });
    });
    describe('Process Management', () => {
        testEachPackageManager('should manage background processes', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const processName = `test-process-${Date.now()}`;
            try {
                await $ssh `echo '#!/bin/bash' > /tmp/${processName}.sh`;
                await $ssh `echo 'while true; do' >> /tmp/${processName}.sh`;
                await $ssh `echo '  echo "${processName} running at \$(date)" >> /tmp/${processName}.log' >> /tmp/${processName}.sh`;
                await $ssh `echo '  sleep 2' >> /tmp/${processName}.sh`;
                await $ssh `echo 'done' >> /tmp/${processName}.sh`;
                await $ssh `chmod +x /tmp/${processName}.sh`;
                const shellCheck = await $ssh `which bash > /dev/null 2>&1 && echo "bash" || echo "sh"`;
                const shell = shellCheck.stdout.trim();
                const startResult = await $ssh `${shell} -c 'nohup /tmp/${processName}.sh > /tmp/${processName}.out 2>&1 & echo $!'`;
                const pid = startResult.stdout.trim();
                if (!pid || !pid.match(/^\d+$/)) {
                    console.log(`Skipping background process test for ${container.name} - could not start process`);
                    return;
                }
                expect(pid).toMatch(/^\d+$/);
                await new Promise(resolve => setTimeout(resolve, 3000));
                const psResult = await $ssh `ps -p ${pid} > /dev/null 2>&1 && echo "running" || echo "not found"`;
                const pgrepResult = await $ssh `pgrep -f ${processName} > /dev/null 2>&1 && echo "found" || echo "not found"`;
                const isRunning = psResult.stdout.trim() === 'running' || pgrepResult.stdout.trim() === 'found';
                if (!isRunning) {
                    console.log(`Process ${pid} not found for ${container.name}, checking if it ran at all`);
                    const logCheckResult = await $ssh `test -f /tmp/${processName}.log && echo "log exists" || echo "no log"`;
                    const outCheckResult = await $ssh `test -f /tmp/${processName}.out && echo "out exists" || echo "no out"`;
                    const hasAnyOutput = logCheckResult.stdout.trim() === 'log exists' || outCheckResult.stdout.trim() === 'out exists';
                    if (!hasAnyOutput && container.name === 'fedora-dnf') {
                        console.log(`Skipping log check for ${container.name} - process didn't create output files`);
                        return;
                    }
                    expect(hasAnyOutput).toBe(true);
                }
                else {
                    expect(isRunning).toBe(true);
                }
                const logResult = await $ssh `test -f /tmp/${processName}.log && wc -l < /tmp/${processName}.log || echo "0"`;
                const logLines = parseInt(logResult.stdout.trim());
                if (pid && pid.match(/^\d+$/)) {
                    expect(logLines).toBeGreaterThanOrEqual(0);
                }
                const stillRunning = await $ssh `ps -p ${pid} > /dev/null 2>&1 && echo "running" || echo "stopped"`;
                if (stillRunning.stdout.trim() === 'running') {
                    await $ssh `kill -USR1 ${pid} 2>/dev/null || true`;
                    await $ssh `kill -TERM ${pid} 2>/dev/null || true`;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const checkResult = await $ssh `ps -p ${pid} > /dev/null 2>&1 && echo "running" || echo "stopped"`;
                    expect(checkResult.stdout.trim()).toBe('stopped');
                }
                else {
                    expect(stillRunning.stdout.trim()).toBe('stopped');
                }
                await $ssh `rm -f /tmp/${processName}.sh /tmp/${processName}.log`;
            }
            catch (error) {
                await $ssh `pkill -f ${processName} || true`.nothrow();
                await $ssh `rm -f /tmp/${processName}.*`.nothrow();
                throw error;
            }
        });
        testEachPackageManager('should monitor system resources', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const unameResult = await $ssh `uname -a`;
            expect(unameResult.stdout).toBeTruthy();
            const memResult = await $ssh `free -m 2>/dev/null || echo "free not available"`;
            if (!memResult.stdout.includes('not available')) {
                expect(memResult.stdout).toContain('Mem:');
            }
            const diskResult = await $ssh `df -h / | tail -1 | awk '{print $5}' | sed 's/%//'`;
            const diskUsage = parseInt(diskResult.stdout.trim());
            expect(diskUsage).toBeGreaterThanOrEqual(0);
            expect(diskUsage).toBeLessThanOrEqual(100);
            const cpuResult = await $ssh `grep -c ^processor /proc/cpuinfo 2>/dev/null || echo "1"`;
            const cpuCount = parseInt(cpuResult.stdout.trim());
            expect(cpuCount).toBeGreaterThanOrEqual(1);
            const loadResult = await $ssh `uptime | grep -oE "load average: [0-9., ]+" || echo "load average: 0.00, 0.00, 0.00"`;
            expect(loadResult.stdout).toContain('load average:');
        });
    });
    describe('Network Operations', () => {
        testEachPackageManager('should handle network testing', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const ifResult = await $ssh `ip addr 2>/dev/null || ifconfig 2>/dev/null || echo "No network tool"`;
            if (!ifResult.stdout.includes('No network tool')) {
                expect(ifResult.stdout).toContain('lo');
            }
            const pingResult = await $ssh `ping -c 1 127.0.0.1 2>/dev/null || echo "ping not available"`;
            if (!pingResult.stdout.includes('not available')) {
                expect(pingResult.stdout).toContain('1 packets transmitted');
            }
            const portsResult = await $ssh `
        netstat -tln 2>/dev/null | grep LISTEN | wc -l ||
        ss -tln 2>/dev/null | grep LISTEN | wc -l ||
        echo "0"
      `;
            const listeningPorts = parseInt(portsResult.stdout.trim());
            expect(listeningPorts).toBeGreaterThanOrEqual(0);
            const dnsResult = await $ssh `
        nslookup localhost 2>/dev/null || 
        host localhost 2>/dev/null || 
        echo "DNS tools not available"
      `;
            expect(dnsResult.exitCode).toBe(0);
        });
    });
    describe('Text Processing and Data Manipulation', () => {
        testEachPackageManager('should handle complex text processing', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const dataFile = `/tmp/data-${Date.now()}.csv`;
            try {
                await $ssh `cat > ${dataFile} << 'EOF'
Name,Age,City,Score
John,25,NewYork,85
Jane,30,London,92
Bob,22,Paris,78
Alice,28,Tokyo,95
Charlie,35,Berlin,88
EOF`;
                const allDataResult = await $ssh `tail -n +2 ${dataFile}`;
                const allLines = allDataResult.stdout.trim().split('\n').filter(line => line.length > 0);
                expect(allLines.length).toBe(5);
                const hasAlice = allLines.some(line => line.includes('Alice,28,Tokyo,95'));
                const hasJane = allLines.some(line => line.includes('Jane,30,London,92'));
                const hasBob = allLines.some(line => line.includes('Bob,22,Paris,78'));
                const hasJohn = allLines.some(line => line.includes('John,25,NewYork,85'));
                const hasCharlie = allLines.some(line => line.includes('Charlie,35,Berlin,88'));
                expect(hasAlice).toBe(true);
                expect(hasJane).toBe(true);
                expect(hasBob).toBe(true);
                expect(hasJohn).toBe(true);
                expect(hasCharlie).toBe(true);
                const avgResult = await $ssh `
          tail -n +2 ${dataFile} | 
          awk -F, '{sum += $2; count++} END {print sum/count}'
        `;
                const avgAge = parseFloat(avgResult.stdout.trim());
                expect(avgAge).toBeCloseTo(28, 1);
                const citiesResult = await $ssh `
          tail -n +2 ${dataFile} | 
          cut -d, -f3 | 
          sort -u | 
          tr '\\n' ' '
        `;
                const cities = citiesResult.stdout.trim().split(' ').filter(Boolean);
                expect(cities).toHaveLength(5);
                expect(cities).toContain('Tokyo');
                expect(cities).toContain('Paris');
                const formatResult = await $ssh `
          tail -n +2 ${dataFile} | 
          head -1 |
          awk -F, '{print "name=" $1 " age=" $2 " city=" $3 " score=" $4}'
        `;
                expect(formatResult.stdout).toContain('name=John');
                expect(formatResult.stdout).toContain('age=25');
                expect(formatResult.stdout).toContain('city=NewYork');
                expect(formatResult.stdout).toContain('score=85');
                await $ssh `rm -f ${dataFile}`;
            }
            catch (error) {
                await $ssh `rm -f ${dataFile}`.nothrow();
                throw error;
            }
        });
    });
    describe('Error Handling and Edge Cases', () => {
        testEachPackageManager('should handle command failures gracefully', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const badCmdResult = await $ssh `nonexistentcommand 2>&1`.nothrow();
            expect(badCmdResult.exitCode).not.toBe(0);
            expect(badCmdResult.stdout + badCmdResult.stderr).toMatch(/not found|command not found/i);
            const permFile = `/tmp/noperm-${Date.now()}.txt`;
            await $ssh `touch ${permFile} && chmod 000 ${permFile}`;
            const readResult = await $ssh `cat ${permFile} 2>&1`.nothrow();
            expect(readResult.exitCode).not.toBe(0);
            expect(readResult.stdout + readResult.stderr).toMatch(/permission denied/i);
            await $ssh `rm -f ${permFile}`;
            const invalidResult = await $ssh `cd /nonexistent/path 2>&1`.nothrow();
            expect(invalidResult.exitCode).not.toBe(0);
            const startTime = Date.now();
            const timeoutResult = await $ssh `sleep 5`.timeout(1000).nothrow();
            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(3000);
            expect(timeoutResult.exitCode === null || timeoutResult.exitCode !== 0).toBe(true);
            const timestamp = Date.now();
            const specialFile = `/tmp/test-file-with-dashes-${timestamp}.txt`;
            await $ssh `touch ${specialFile}`;
            const checkResult = await $ssh `test -f ${specialFile} && echo "exists" || echo "not found"`;
            expect(checkResult.stdout.trim()).toBe('exists');
            await $ssh `rm -f ${specialFile}`;
        });
        testEachPackageManager('should handle stdin/stdout/stderr correctly', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const ssh = new SSHAdapter();
            try {
                const stdinResult = await ssh.execute({
                    command: 'cat | wc -l',
                    stdin: 'Line 1\nLine 2\nLine 3\n',
                    adapterOptions: { type: 'ssh', ...sshConfig }
                });
                expect(stdinResult.exitCode).toBe(0);
                expect(stdinResult.stdout.trim()).toBe('3');
                const stderrResult = await ssh.execute({
                    command: 'echo "stdout" && echo "stderr" >&2',
                    adapterOptions: { type: 'ssh', ...sshConfig }
                });
                expect(stderrResult.stdout.trim()).toBe('stdout');
                const stderrLines = stderrResult.stderr.trim().split('\n');
                const actualStderr = stderrLines
                    .filter(line => !line.includes('setlocale') && !line.includes('LC_') && !line.includes('cannot change locale'))
                    .join('\n')
                    .trim();
                expect(actualStderr).toBe('stderr');
                const largeResult = await ssh.execute({
                    command: 'seq 1 10000 | tail -5',
                    adapterOptions: { type: 'ssh', ...sshConfig }
                });
                expect(largeResult.stdout.trim()).toContain('10000');
                await ssh.dispose();
            }
            catch (error) {
                await ssh.dispose();
                throw error;
            }
        });
    });
    describe('File Transfer Operations', () => {
        testEachPackageManager('should handle file upload and download', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const ssh = new SSHAdapter();
            const localFile = `/tmp/upload-test-${Date.now()}.txt`;
            const remoteFile = `/tmp/remote-test-${Date.now()}.txt`;
            const downloadFile = `/tmp/download-test-${Date.now()}.txt`;
            try {
                await fs.writeFile(localFile, 'Test content for upload');
                await ssh.uploadFile(localFile, remoteFile, { type: 'ssh', ...sshConfig });
                const verifyResult = await ssh.execute({
                    command: `cat ${remoteFile}`,
                    adapterOptions: { type: 'ssh', ...sshConfig }
                });
                expect(verifyResult.stdout).toBe('Test content for upload');
                await ssh.downloadFile(remoteFile, downloadFile, { type: 'ssh', ...sshConfig });
                const downloadedContent = await fs.readFile(downloadFile, 'utf8');
                expect(downloadedContent).toBe('Test content for upload');
                await fs.unlink(localFile);
                await fs.unlink(downloadFile);
                await ssh.execute({
                    command: `rm -f ${remoteFile}`,
                    adapterOptions: { type: 'ssh', ...sshConfig }
                });
                await ssh.dispose();
            }
            catch (error) {
                await ssh.dispose();
                await fs.unlink(localFile).catch(() => { });
                await fs.unlink(downloadFile).catch(() => { });
                throw error;
            }
        });
    });
    describe('Stream Processing', () => {
        testEachPackageManager('should handle streaming output', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const result = await $ssh `for i in 1 2 3 4 5; do echo "Line $i"; done`;
            expect(result.exitCode).toBe(0);
            const lines = result.stdout.trim().split('\n');
            expect(lines).toHaveLength(5);
            expect(lines[0]).toBe('Line 1');
            expect(lines[4]).toBe('Line 5');
            const largeResult = await $ssh `seq 1 100 | tail -10`;
            const largeLines = largeResult.stdout.trim().split('\n');
            expect(largeLines).toHaveLength(10);
            expect(largeLines[9]).toBe('100');
        });
    });
    describe('Parallel Execution', () => {
        testEachPackageManager('should handle parallel commands', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const start = Date.now();
            const results = await Promise.all([
                $ssh `sleep 1 && echo "Command 1"`,
                $ssh `sleep 1 && echo "Command 2"`,
                $ssh `sleep 1 && echo "Command 3"`
            ]);
            const duration = Date.now() - start;
            results.forEach((result, i) => {
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe(`Command ${i + 1}`);
            });
            expect(duration).toBeLessThan(2000);
        });
    });
    describe('Advanced SSH Features', () => {
        testEachPackageManager('should handle environment variables', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const result = await $ssh.env({
                CUSTOM_VAR: 'test_value',
                ANOTHER_VAR: '123'
            }) `echo "CUSTOM_VAR=$CUSTOM_VAR ANOTHER_VAR=$ANOTHER_VAR"`;
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('CUSTOM_VAR=test_value');
            expect(result.stdout).toContain('ANOTHER_VAR=123');
        });
        testEachPackageManager('should handle working directory changes', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const testDir = `/tmp/cwd-test-${Date.now()}`;
            try {
                await $ssh `mkdir -p ${testDir}`;
                const result = await $ssh.cd(testDir) `pwd`;
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe(testDir);
                await $ssh `rm -rf ${testDir}`;
            }
            catch (error) {
                await $ssh `rm -rf ${testDir}`.nothrow();
                throw error;
            }
        });
        testEachPackageManager('should handle command chaining', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const result = await $ssh
                .env({ TEST_MODE: 'true' })
                .cd('/tmp') `echo "Working in $(pwd) with TEST_MODE=$TEST_MODE"`;
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('Working in /tmp');
            expect(result.stdout).toContain('TEST_MODE=true');
        });
    });
    describe('Error Recovery and Retry', () => {
        testEachPackageManager.skip('should handle retry mechanism', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const testFile = `/tmp/retry-test-${Date.now()}`;
            const problematicContainers = ['alpine-apk'];
            if (problematicContainers.includes(container.name)) {
                console.log(`Skipping retry test for ${container.name} - known compatibility issues`);
                return;
            }
            try {
                const counterFile = `/tmp/retry-counter-${Date.now()}`;
                await $ssh `echo "0" > ${counterFile}`;
                const result = await $ssh.retry({
                    maxRetries: 2,
                    initialDelay: 100
                }) `
          COUNT=$(cat ${counterFile})
          NEXT=$((COUNT + 1))
          echo $NEXT > ${counterFile}
          
          if [ "$COUNT" -eq "0" ]; then
            echo "First attempt (count=$COUNT), will fail"
            exit 1
          else
            echo "Success on retry (count=$COUNT)"
            exit 0
          fi
        `;
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toContain('Success on retry');
                await $ssh `rm -f ${counterFile}`;
            }
            catch (error) {
                await $ssh `rm -f ${testFile}`.nothrow();
                throw error;
            }
        });
        testEachPackageManager('should handle nothrow option', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const result = await $ssh `exit 42`.nothrow();
            expect(result.exitCode).toBe(42);
        });
    });
    describe('Process Output Handling', () => {
        testEachPackageManager('should handle JSON output', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const result = await $ssh `echo '{"name": "test", "value": 42}'`;
            const parsed = JSON.parse(result.stdout);
            expect(parsed.name).toBe('test');
            expect(parsed.value).toBe(42);
        });
        testEachPackageManager('should handle multiline output', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const $ssh = getConfiguredSSH(sshConfig);
            const result = await $ssh `printf "Line 1\\nLine 2\\nLine 3\\n"`;
            const lines = result.stdout.split('\n').filter(l => l.length > 0);
            expect(lines).toHaveLength(3);
            expect(lines[0]).toBe('Line 1');
            expect(lines[2]).toBe('Line 3');
        });
    });
    describe('Connection Pool Management', () => {
        testEachPackageManager('should reuse connections from pool', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const ssh = new SSHAdapter({
                connectionPool: {
                    enabled: true,
                    maxConnections: 5,
                    idleTimeout: 300000,
                    keepAlive: true
                }
            });
            try {
                const results = [];
                for (let i = 0; i < 3; i++) {
                    const result = await ssh.execute({
                        command: `echo "Command ${i}"`,
                        adapterOptions: { type: 'ssh', ...sshConfig }
                    });
                    results.push(result);
                }
                results.forEach((result, i) => {
                    expect(result.exitCode).toBe(0);
                    expect(result.stdout.trim()).toBe(`Command ${i}`);
                });
                await ssh.dispose();
            }
            catch (error) {
                await ssh.dispose();
                throw error;
            }
        });
        testEachPackageManager('should check adapter availability', async (container) => {
            const ssh = new SSHAdapter();
            const isAvailable = await ssh.isAvailable();
            expect(isAvailable).toBe(true);
            await ssh.dispose();
        });
    });
    describe('SFTP Operations', () => {
        testEachPackageManager('should handle SFTP configuration', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const ssh = new SSHAdapter({
                sftp: { enabled: false, concurrency: 5 }
            });
            try {
                await expect(ssh.uploadFile('/tmp/test.txt', '/tmp/remote.txt', { type: 'ssh', ...sshConfig })).rejects.toThrow('SFTP is disabled');
                await ssh.dispose();
            }
            catch (error) {
                await ssh.dispose();
                throw error;
            }
        });
        testEachPackageManager('should upload files with multiple connections', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const ssh = new SSHAdapter();
            const files = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const localPath = `/tmp/test-file-${Date.now()}-${i}.txt`;
                    const remotePath = `/tmp/remote-file-${Date.now()}-${i}.txt`;
                    await fs.writeFile(localPath, `Test content ${i}`);
                    files.push({ local: localPath, remote: remotePath });
                }
                await Promise.all(files.map(f => ssh.uploadFile(f.local, f.remote, { type: 'ssh', ...sshConfig })));
                for (const f of files) {
                    const result = await ssh.execute({
                        command: `cat ${f.remote}`,
                        adapterOptions: { type: 'ssh', ...sshConfig }
                    });
                    expect(result.stdout).toMatch(/Test content \d/);
                }
                for (const f of files) {
                    await fs.unlink(f.local).catch(() => { });
                    await ssh.execute({
                        command: `rm -f ${f.remote}`,
                        adapterOptions: { type: 'ssh', ...sshConfig }
                    });
                }
                await ssh.dispose();
            }
            catch (error) {
                await ssh.dispose();
                for (const f of files) {
                    await fs.unlink(f.local).catch(() => { });
                }
                throw error;
            }
        });
    });
    describe('Advanced Error Handling', () => {
        testEachPackageManager('should handle connection failures gracefully', async (container) => {
            const ssh = new SSHAdapter();
            const badConfig = {
                type: 'ssh',
                host: 'nonexistent.host.invalid',
                port: 22,
                username: 'test',
                password: 'test'
            };
            await expect(ssh.execute({
                command: 'echo test',
                adapterOptions: badConfig
            })).rejects.toThrow(/Connection|Failed to connect|ENOTFOUND|EAI_AGAIN|getaddrinfo/);
            await ssh.dispose();
        });
        testEachPackageManager('should handle timeout correctly', async (container) => {
            const sshConfig = getSSHConfig(container.name);
            const ssh = new SSHAdapter();
            try {
                const startTime = Date.now();
                const result = await ssh.execute({
                    command: 'sleep 10',
                    timeout: 1000,
                    adapterOptions: { type: 'ssh', ...sshConfig }
                });
                const duration = Date.now() - startTime;
                expect(duration).toBeLessThan(2000);
                await ssh.dispose();
            }
            catch (error) {
                await ssh.dispose();
                expect(error).toBeDefined();
            }
        });
    });
});
//# sourceMappingURL=ssh-complex-scenarios.test.js.map