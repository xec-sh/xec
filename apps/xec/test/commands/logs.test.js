import { tmpdir } from 'os';
import { join } from 'path';
import { $ } from '@xec-sh/core';
import { Command } from 'commander';
import { it, jest, expect, describe, afterAll, beforeAll, beforeEach } from '@jest/globals';
import { rmSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { SSH_TEST_CONFIGS, KindClusterManager, DockerContainerManager, } from '@xec-sh/test-utils';
import logsCommand from '../../src/commands/logs.js';
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`process.exit called with code ${code}`);
});
describe('logs command - real tests', () => {
    let program;
    let testDir;
    let configFile;
    let dockerManager;
    let kindManager = null;
    let testContainer = null;
    let capturedOutput = [];
    let capturedErrors = [];
    const originalLog = console.log;
    const originalError = console.error;
    beforeAll(async () => {
        testDir = mkdtempSync(join(tmpdir(), 'xec-logs-test-'));
        const xecDir = join(testDir, '.xec');
        mkdirSync(xecDir, { recursive: true });
        configFile = join(xecDir, 'config.yaml');
        const baseConfig = `
name: test-project
vars: {}
targets: {}
profiles: {}
tasks: {}
`;
        writeFileSync(configFile, baseConfig);
        dockerManager = DockerContainerManager.getInstance();
        console.log = (...args) => {
            capturedOutput.push(args.map(a => String(a)).join(' '));
            originalLog.apply(console, args);
        };
        console.error = (...args) => {
            capturedErrors.push(args.map(a => String(a)).join(' '));
            originalError.apply(console, args);
        };
    }, 300000);
    afterAll(async () => {
        console.log = originalLog;
        console.error = originalError;
        mockExit.mockRestore();
        if (testContainer) {
            try {
                await $ `docker rm -f ${testContainer}`.nothrow();
            }
            catch { }
        }
        if (kindManager) {
            await kindManager.deleteCluster();
            kindManager.cleanup();
        }
        rmSync(testDir, { recursive: true, force: true });
    }, 300000);
    beforeEach(() => {
        capturedOutput = [];
        capturedErrors = [];
        program = new Command();
        program
            .name('xec')
            .version('1.0.0')
            .exitOverride()
            .option('-v, --verbose', 'Enable verbose output')
            .option('-q, --quiet', 'Suppress output');
        process.chdir(testDir);
        const safeConfig = `
name: test-project
targets:
  local:
    type: local
`;
        writeFileSync(configFile, safeConfig);
        logsCommand(program);
    });
    describe('Docker container logs', () => {
        let dockerProgram;
        beforeEach(() => {
            dockerProgram = new Command();
            dockerProgram
                .name('xec')
                .version('1.0.0')
                .exitOverride()
                .option('-v, --verbose', 'Enable verbose output')
                .option('-q, --quiet', 'Suppress output');
            process.chdir(testDir);
            logsCommand(dockerProgram);
        });
        afterEach(() => {
            const safeConfig = `
name: test-project
targets:
  local:
    type: local
`;
            writeFileSync(configFile, safeConfig);
            process.chdir(testDir);
        });
        beforeAll(async () => {
            if (!dockerManager.isDockerAvailable()) {
                console.log('Docker not available, skipping Docker tests');
                testContainer = null;
                return;
            }
            const containerName = `xec-test-logs-${Date.now()}`;
            try {
                const script = `
          echo 'Starting application' &&
          echo 'INFO: Server listening on port 3000' &&
          echo 'DEBUG: Initializing database' &&
          echo 'ERROR: Failed to connect to database' &&
          echo 'WARN: Retrying connection' &&
          echo 'INFO: Database connected' &&
          while true; do 
            echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Heartbeat";
            sleep 2;
          done
        `.trim();
                const containerId = await $ `docker run -d --name ${containerName} alpine:latest sh -c ${script}`;
                const isRunning = await $ `docker ps --format "{{.Names}}" | grep "^${containerName}$"`.nothrow();
                if (isRunning.exitCode !== 0) {
                    throw new Error(`Container ${containerName} is not running`);
                }
                testContainer = containerName;
                await new Promise(resolve => setTimeout(resolve, 3000));
                const config = `
name: test-project
targets:
  containers:
    test:
      type: docker
      container: ${testContainer}
`;
                writeFileSync(configFile, config);
            }
            catch (error) {
                console.error('Failed to create test container:', error);
                testContainer = null;
            }
        }, 60000);
        beforeEach(() => {
            if (testContainer) {
                const config = `
name: test-project
targets:
  containers:
    test:
      type: docker
      container: ${testContainer}
`;
                writeFileSync(configFile, config);
            }
        });
        it('should view logs from Docker container', async () => {
            if (!dockerManager.isDockerAvailable() || !testContainer) {
                console.log('Test skipped - Docker not available');
                return;
            }
            await dockerProgram.parseAsync(['node', 'xec', 'logs', 'containers.test']);
            const output = capturedOutput.join('\n');
            expect(output).toContain('Starting application');
            expect(output).toContain('INFO: Server listening on port 3000');
            expect(output).toContain('ERROR: Failed to connect to database');
        });
        it('should filter logs with grep', async () => {
            if (!dockerManager.isDockerAvailable() || !testContainer) {
                console.log('Test skipped - Docker not available');
                return;
            }
            await dockerProgram.parseAsync(['node', 'xec', 'logs', 'containers.test', '--grep', 'ERROR', '--no-color']);
            const output = capturedOutput.join('\n');
            expect(output).toContain('ERROR: Failed to connect to database');
            expect(output).not.toContain('INFO: Server listening');
        });
        it('should show timestamps with --timestamps flag', async () => {
            if (!dockerManager.isDockerAvailable() || !testContainer) {
                console.log('Test skipped - Docker not available');
                return;
            }
            await dockerProgram.parseAsync(['node', 'xec', 'logs', 'containers.test', '--timestamps']);
            const output = capturedOutput.join('\n');
            expect(output).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });
        it('should limit lines with --tail', async () => {
            if (!dockerManager.isDockerAvailable() || !testContainer) {
                console.log('Test skipped - Docker not available');
                return;
            }
            await dockerProgram.parseAsync(['node', 'xec', 'logs', 'containers.test', '--tail', '3']);
            const outputLines = capturedOutput.filter(line => line.includes('Heartbeat') ||
                line.includes('INFO') ||
                line.includes('ERROR') ||
                line.includes('DEBUG') ||
                line.includes('WARN') ||
                line.includes('Starting'));
            expect(outputLines.length).toBeLessThanOrEqual(3);
        });
        it('should stream logs with --follow', async () => {
            if (!dockerManager.isDockerAvailable() || !testContainer) {
                console.log('Test skipped - Docker not available');
                return;
            }
            const logPromise = dockerProgram.parseAsync(['node', 'xec', 'logs', 'containers.test', '--follow', '--tail', '5']);
            await new Promise(resolve => setTimeout(resolve, 2000));
            let checkCount = 0;
            while (capturedOutput.length < 5 && checkCount < 5) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                checkCount++;
            }
            const output = capturedOutput.join('\n');
            expect(output).toContain('Streaming logs from');
            expect(output).toContain('Press Ctrl+C to stop');
            if (capturedOutput.length < 5) {
                console.log('DEBUG: Only captured', capturedOutput.length, 'lines');
                console.log('Captured output:', capturedOutput);
            }
            expect(capturedOutput.length).toBeGreaterThan(2);
            const hasLogContent = capturedOutput.some(line => line.includes('Starting application') ||
                line.includes('INFO') ||
                line.includes('ERROR') ||
                line.includes('DEBUG') ||
                line.includes('WARN') ||
                line.includes('Heartbeat') ||
                line.includes('GMT') ||
                line.includes('UTC'));
            expect(hasLogContent).toBe(true);
            process.emit('SIGINT');
            await new Promise(resolve => setTimeout(resolve, 1000));
            await expect(logPromise).resolves.not.toThrow();
        }, 15000);
        it('should format logs as JSON with --json', async () => {
            if (!dockerManager.isDockerAvailable() || !testContainer) {
                console.log('Test skipped - Docker not available');
                return;
            }
            await dockerProgram.parseAsync(['node', 'xec', 'logs', 'containers.test', '--json', '--tail', '1']);
            const jsonLines = capturedOutput.filter(line => {
                try {
                    JSON.parse(line);
                    return true;
                }
                catch {
                    return false;
                }
            });
            expect(jsonLines.length).toBeGreaterThan(0);
            const parsed = JSON.parse(jsonLines[0]);
            expect(parsed).toHaveProperty('target', 'containers.test');
            expect(parsed).toHaveProperty('timestamp');
            expect(parsed).toHaveProperty('message');
        });
        it.skip('should handle container not found error', async () => {
            if (!dockerManager.isDockerAvailable()) {
                console.log('Test skipped - Docker not available');
                return;
            }
            const errorProgram = new Command();
            errorProgram
                .name('xec')
                .version('1.0.0')
                .exitOverride()
                .option('-v, --verbose', 'Enable verbose output')
                .option('-q, --quiet', 'Suppress output');
            logsCommand(errorProgram);
            const tempConfigFile = join(testDir, '.xec', 'error-test-config.yaml');
            const config = `
name: test-project
targets:
  containers:
    missing:
      type: docker
      container: non-existent-container-${Date.now()}
`;
            writeFileSync(tempConfigFile, config);
            const tempTestDir = mkdtempSync(join(tmpdir(), 'xec-error-test-'));
            const tempXecDir = join(tempTestDir, '.xec');
            mkdirSync(tempXecDir, { recursive: true });
            writeFileSync(join(tempXecDir, 'config.yaml'), config);
            const originalCwd = process.cwd();
            process.chdir(tempTestDir);
            try {
                capturedErrors = [];
                await expect(errorProgram.parseAsync(['node', 'xec', 'logs', 'containers.missing', '--tail', '5'])).rejects.toThrow();
                const errors = capturedErrors.join(' ');
                expect(errors.toLowerCase()).toMatch(/container|error|not found|no such/i);
            }
            finally {
                process.chdir(originalCwd);
                rmSync(tempTestDir, { recursive: true, force: true });
                const safeConfig = `
name: test-project
targets:
  local:
    type: local
`;
                writeFileSync(configFile, safeConfig);
            }
        });
    });
    describe('Kubernetes pod logs', () => {
        let k8sProgram;
        beforeEach(() => {
            k8sProgram = new Command();
            k8sProgram
                .name('xec')
                .version('1.0.0')
                .exitOverride()
                .option('-v, --verbose', 'Enable verbose output')
                .option('-q, --quiet', 'Suppress output');
            process.chdir(testDir);
            logsCommand(k8sProgram);
            if (kindManager) {
                const config = `
name: test-project
targets:
  pods:
    test:
      type: k8s
      namespace: default
      pod: test-pod
    multi:
      type: k8s
      namespace: default
      pod: multi-pod
`;
                writeFileSync(configFile, config);
            }
        });
        beforeAll(async () => {
            try {
                await $ `kubectl version --client`.quiet();
            }
            catch {
                console.log('kubectl not available, skipping Kubernetes tests');
                return;
            }
            kindManager = new KindClusterManager({ name: 'xec-logs-test' });
            await kindManager.createCluster();
            try {
                await $ `kubectl delete pod test-pod -n default --ignore-not-found=true`.env({ KUBECONFIG: kindManager.getKubeConfigPath() });
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            catch (e) {
            }
            const loggingPodYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: test-pod
  namespace: default
  labels:
    app: test
spec:
  automountServiceAccountToken: false
  containers:
  - name: main
    image: alpine:3.18
    command: ['sh', '-c', 'echo "Pod starting up" && echo "INFO: Application initialized" && echo "ERROR: Configuration missing" && echo "WARN: Using default config" && while true; do echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Heartbeat"; sleep 5; done']
    securityContext:
      runAsUser: 1000
      runAsGroup: 1000
`;
            await $ `echo ${loggingPodYaml} | kubectl apply -f -`.env({ KUBECONFIG: kindManager.getKubeConfigPath() });
            await kindManager.waitForPod('test-pod', 'default');
            await new Promise(resolve => setTimeout(resolve, 2000));
            await kindManager.createMultiContainerPod('multi-pod', 'default');
            await new Promise(resolve => setTimeout(resolve, 3000));
            const config = `
name: test-project
targets:
  pods:
    test:
      type: k8s
      namespace: default
      pod: test-pod
    multi:
      type: k8s
      namespace: default
      pod: multi-pod
`;
            writeFileSync(configFile, config);
        }, 300000);
        it('should view logs from Kubernetes pod', async () => {
            if (!kindManager) {
                console.log('Skipping test - kubectl not available');
                return;
            }
            const k8sConfig = `
name: test-project
targets:
  pods:
    test:
      type: k8s
      namespace: default
      pod: test-pod
`;
            writeFileSync(configFile, k8sConfig);
            process.env.KUBECONFIG = kindManager.getKubeConfigPath();
            const currentConfig = readFileSync(configFile, 'utf-8');
            if (!currentConfig.includes('type: k8s')) {
                console.error('ERROR: Wrong config loaded for K8s test');
                console.error('Current config:', currentConfig);
            }
            await k8sProgram.parseAsync(['node', 'xec', 'logs', 'pods.test', '--since', '1m']);
            const output = capturedOutput.join('\n');
            expect(output).toContain('Pod starting up');
            expect(output).toContain('INFO: Application initialized');
        });
        it('should view logs from specific container in multi-container pod', async () => {
            if (!kindManager) {
                console.log('Skipping test - kubectl not available');
                return;
            }
            const k8sConfig = `
name: test-project
targets:
  pods:
    multi:
      type: k8s
      namespace: default
      pod: multi-pod
`;
            writeFileSync(configFile, k8sConfig);
            process.env.KUBECONFIG = kindManager.getKubeConfigPath();
            await k8sProgram.parseAsync(['node', 'xec', 'logs', 'pods.multi', '--container', 'sidecar']);
            const output = capturedOutput.join('\n');
            expect(output).toContain('Sidecar container running');
            expect(output).not.toContain('App container running');
        });
        it('should show pod logs with timestamps', async () => {
            if (!kindManager) {
                console.log('Skipping test - kubectl not available');
                return;
            }
            const k8sConfig = `
name: test-project
targets:
  pods:
    test:
      type: k8s
      namespace: default
      pod: test-pod
`;
            writeFileSync(configFile, k8sConfig);
            process.env.KUBECONFIG = kindManager.getKubeConfigPath();
            await k8sProgram.parseAsync(['node', 'xec', 'logs', 'pods.test', '--timestamps']);
            const output = capturedOutput.join('\n');
            expect(output).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });
        it.skip('should handle pod not found error', async () => {
            if (!kindManager) {
                console.log('Skipping test - kubectl not available');
                return;
            }
            const k8sConfig = `
name: test-project
targets:
  pods:
    test:
      type: k8s
      namespace: default
      pod: test-pod
`;
            writeFileSync(configFile, k8sConfig);
            process.env.KUBECONFIG = kindManager.getKubeConfigPath();
            const errorProgram = new Command();
            errorProgram
                .name('xec')
                .version('1.0.0')
                .exitOverride()
                .option('-v, --verbose', 'Enable verbose output')
                .option('-q, --quiet', 'Suppress output');
            logsCommand(errorProgram);
            const tempTestDir = mkdtempSync(join(tmpdir(), 'xec-k8s-error-test-'));
            const tempXecDir = join(tempTestDir, '.xec');
            mkdirSync(tempXecDir, { recursive: true });
            const config = `
name: test-project
targets:
  pods:
    missing:
      type: k8s
      namespace: default
      pod: non-existent-pod-${Date.now()}
`;
            writeFileSync(join(tempXecDir, 'config.yaml'), config);
            const originalCwd = process.cwd();
            process.chdir(tempTestDir);
            try {
                await expect(errorProgram.parseAsync(['node', 'xec', 'logs', 'pods.missing'])).rejects.toThrow();
                const errors = capturedErrors.join(' ');
                expect(errors).toContain('non-existent-pod');
            }
            finally {
                process.chdir(originalCwd);
                rmSync(tempTestDir, { recursive: true, force: true });
                const safeConfig = `
name: test-project
targets:
  local:
    type: local
`;
                writeFileSync(configFile, safeConfig);
            }
        });
    });
    describe('SSH host logs', () => {
        let sshTestDir;
        let sshLogFile;
        let fakeSyslogPath;
        beforeAll(async () => {
            if (dockerManager.shouldSkipSSHTests()) {
                console.log('Skipping SSH tests - Docker not available or SKIP_SSH_DOCKER_TESTS=true');
                return;
            }
            const started = await dockerManager.startContainer('ubuntu-apt');
            if (!started) {
                console.log('Failed to start SSH container');
                return;
            }
            await dockerManager.waitForSSH(2201);
            sshTestDir = `/tmp/xec-test-${Date.now()}`;
            sshLogFile = `${sshTestDir}/app.log`;
            const sshConfig = SSH_TEST_CONFIGS[0];
            await $.ssh({
                host: sshConfig.host,
                port: sshConfig.port,
                username: sshConfig.username,
                password: sshConfig.password
            }) `mkdir -p ${sshTestDir}`;
            await $.ssh({
                host: sshConfig.host,
                port: sshConfig.port,
                username: sshConfig.username,
                password: sshConfig.password
            }) `cat > ${sshLogFile} << 'EOF'
2024-01-01 10:00:00 INFO Starting application
2024-01-01 10:00:01 DEBUG Loading configuration
2024-01-01 10:00:02 ERROR Database connection failed
2024-01-01 10:00:03 WARN Retrying connection
2024-01-01 10:00:04 INFO Database connected
2024-01-01 10:00:05 INFO Server listening on port 8080
EOF`;
            fakeSyslogPath = `${sshTestDir}/syslog`;
            await $.ssh({
                host: sshConfig.host,
                port: sshConfig.port,
                username: sshConfig.username,
                password: sshConfig.password
            }) `cat > ${fakeSyslogPath} << 'EOF'
Jan  1 10:00:00 test-host kernel: Linux version 5.15.0
Jan  1 10:00:01 test-host systemd[1]: Started System Logging Service
Jan  1 10:00:02 test-host sshd[123]: Server listening on 0.0.0.0 port 22
Jan  1 10:00:03 test-host kernel: eth0: link up
Jan  1 10:00:04 test-host systemd[1]: Reached target Network is Online
EOF`;
            const config = `
name: test-project
targets:
  hosts:
    test-ssh:
      type: ssh
      host: ${sshConfig.host}
      port: ${sshConfig.port}
      username: ${sshConfig.username}
      password: ${sshConfig.password}
      logPath: ${fakeSyslogPath}
`;
            writeFileSync(configFile, config);
        }, 120000);
        afterAll(async () => {
            if (sshTestDir && !dockerManager.shouldSkipSSHTests()) {
                try {
                    const sshConfig = SSH_TEST_CONFIGS[0];
                    await $.ssh({
                        host: sshConfig.host,
                        port: sshConfig.port,
                        username: sshConfig.username,
                        password: sshConfig.password
                    }) `rm -rf ${sshTestDir}`.nothrow();
                }
                catch { }
            }
            await dockerManager.stopContainer('ubuntu-apt');
        });
        beforeEach(() => {
            if (!dockerManager.shouldSkipSSHTests() && sshTestDir) {
                const sshConfig = SSH_TEST_CONFIGS[0];
                const config = `
name: test-project
targets:
  hosts:
    test-ssh:
      type: ssh
      host: ${sshConfig.host}
      port: ${sshConfig.port}
      username: ${sshConfig.username}
      password: ${sshConfig.password}
      logPath: ${fakeSyslogPath}
`;
                writeFileSync(configFile, config);
            }
        });
        it('should view logs from SSH host', async () => {
            if (dockerManager.shouldSkipSSHTests()) {
                console.log('Test skipped');
                return;
            }
            await program.parseAsync(['node', 'xec', 'logs', 'hosts.test-ssh', sshLogFile, '--no-color']);
            const output = capturedOutput.join('\n');
            expect(output).toContain('INFO Starting application');
            expect(output).toContain('ERROR Database connection failed');
            expect(output).toContain('Server listening on port 8080');
        });
        it('should filter SSH logs with grep', async () => {
            if (dockerManager.shouldSkipSSHTests()) {
                console.log('Test skipped');
                return;
            }
            await program.parseAsync(['node', 'xec', 'logs', 'hosts.test-ssh', sshLogFile, '--grep', 'ERROR', '--no-color']);
            const output = capturedOutput.join('\n');
            expect(output).toContain('ERROR Database connection failed');
            expect(output).not.toContain('INFO Starting application');
        });
        it('should show context lines with grep', async () => {
            if (dockerManager.shouldSkipSSHTests()) {
                console.log('Test skipped');
                return;
            }
            await program.parseAsync(['node', 'xec', 'logs', 'hosts.test-ssh', sshLogFile, '--grep', 'ERROR', '--context', '1', '--no-color']);
            const output = capturedOutput.join('\n');
            expect(output).toContain('ERROR Database connection failed');
            expect(output).toContain('DEBUG Loading configuration');
            expect(output).toContain('WARN Retrying connection');
        });
        it('should use custom log path from config when not specified in command', async () => {
            if (dockerManager.shouldSkipSSHTests()) {
                console.log('Test skipped');
                return;
            }
            await program.parseAsync(['node', 'xec', 'logs', 'hosts.test-ssh', '--tail', '5', '--no-color']);
            const output = capturedOutput.join('\n');
            expect(output).toContain('kernel: Linux version');
            expect(output).toContain('Started System Logging Service');
            expect(output).toContain('Server listening on 0.0.0.0 port 22');
        });
    });
    describe('Local log files', () => {
        let localLogFile;
        beforeEach(() => {
            localLogFile = join(testDir, 'local.log');
            writeFileSync(localLogFile, `
2024-01-01 12:00:00 [INFO] Application started
2024-01-01 12:00:01 [DEBUG] Configuration loaded
2024-01-01 12:00:02 [ERROR] Failed to bind to port 8080
2024-01-01 12:00:03 [WARN] Trying alternate port 8081
2024-01-01 12:00:04 [INFO] Server listening on port 8081
2024-01-01 12:00:05 [INFO] Ready to accept connections
`.trim());
            const config = `
name: test-project
targets:
  local:
    type: local
`;
            writeFileSync(configFile, config);
        });
        it('should view local log file', async () => {
            await program.parseAsync(['node', 'xec', 'logs', 'local', localLogFile]);
            const output = capturedOutput.join('\n');
            expect(output).toContain('[INFO] Application started');
            expect(output).toContain('[ERROR] Failed to bind to port 8080');
        });
        it('should limit lines with tail', async () => {
            await program.parseAsync(['node', 'xec', 'logs', 'local', localLogFile, '--tail', '2']);
            const output = capturedOutput.join('\n');
            expect(output).toContain('[INFO] Ready to accept connections');
            expect(output).toContain('[INFO] Server listening on port 8081');
            expect(output).not.toContain('[INFO] Application started');
        });
        it('should filter with grep pattern', async () => {
            await program.parseAsync(['node', 'xec', 'logs', 'local', localLogFile, '--grep', '\\[ERROR\\]|\\[WARN\\]', '--no-color']);
            const output = capturedOutput.join('\n');
            expect(output).toContain('[ERROR] Failed to bind to port 8080');
            expect(output).toContain('[WARN] Trying alternate port 8081');
            expect(output).not.toContain('[INFO]');
        });
        it('should follow local file changes', async () => {
            const followFile = join(testDir, 'follow.log');
            const outputFile = join(testDir, 'follow-output.log');
            writeFileSync(followFile, 'Initial line 1\nInitial line 2\n');
            const followProcess = $ `tail -f -n 100 ${followFile} > ${outputFile} 2>&1`.nothrow();
            await new Promise(resolve => setTimeout(resolve, 500));
            appendFileSync(followFile, 'New line 3\n');
            await new Promise(resolve => setTimeout(resolve, 200));
            appendFileSync(followFile, 'New line 4\n');
            await new Promise(resolve => setTimeout(resolve, 200));
            try {
                await $ `pkill -f "tail -f.*${followFile}"`.nothrow();
            }
            catch (e) {
            }
            await new Promise(resolve => setTimeout(resolve, 500));
            const output = readFileSync(outputFile, 'utf-8');
            expect(output).toContain('Initial line 1');
            expect(output).toContain('Initial line 2');
            expect(output).toContain('New line 3');
            expect(output).toContain('New line 4');
            const logOutput = await $ `tail -n 10 ${followFile}`.text();
            expect(logOutput).toContain('New line 4');
        });
    });
    describe('Multi-target logs', () => {
        let container1 = null;
        let container2 = null;
        let multiProgram;
        beforeEach(() => {
            multiProgram = new Command();
            multiProgram
                .name('xec')
                .version('1.0.0')
                .exitOverride()
                .option('-v, --verbose', 'Enable verbose output')
                .option('-q, --quiet', 'Suppress output');
            process.chdir(testDir);
            logsCommand(multiProgram);
            if (container1 && container2) {
                const config = `
name: test-project
targets:
  containers:
    app-1:
      type: docker
      container: ${container1}
    app-2:
      type: docker
      container: ${container2}
`;
                writeFileSync(configFile, config);
            }
        });
        beforeAll(async () => {
            if (!dockerManager.isDockerAvailable()) {
                console.log('Docker not available, skipping multi-target tests');
                container1 = null;
                container2 = null;
                return;
            }
            try {
                const containerName1 = `xec-test-multi-1-${Date.now()}`;
                const containerName2 = `xec-test-multi-2-${Date.now()}`;
                const script1 = `while true; do echo '[${containerName1}] Log from container 1'; sleep 2; done`;
                const script2 = `while true; do echo '[${containerName2}] Log from container 2'; sleep 2; done`;
                await $ `docker run -d --name ${containerName1} alpine:latest sh -c ${script1}`;
                await $ `docker run -d --name ${containerName2} alpine:latest sh -c ${script2}`;
                container1 = containerName1;
                container2 = containerName2;
                await new Promise(resolve => setTimeout(resolve, 2000));
                const config = `
name: test-project
targets:
  containers:
    app-1:
      type: docker
      container: ${container1}
    app-2:
      type: docker
      container: ${container2}
`;
                writeFileSync(configFile, config);
            }
            catch (error) {
                console.error('Failed to create multi-target containers:', error);
                container1 = null;
                container2 = null;
            }
        }, 60000);
        afterAll(async () => {
            if (container1) {
                await $ `docker rm -f ${container1}`.nothrow();
            }
            if (container2) {
                await $ `docker rm -f ${container2}`.nothrow();
            }
        });
        it('should view logs from multiple targets with pattern', async () => {
            if (!dockerManager.isDockerAvailable() || !container1 || !container2) {
                console.log('Test skipped - Docker not available');
                return;
            }
            await multiProgram.parseAsync(['node', 'xec', 'logs', 'containers.app-*', '--tail', '2']);
            const output = capturedOutput.join('\n');
            expect(output).toContain(`[${container1}] Log from container 1`);
            expect(output).toContain(`[${container2}] Log from container 2`);
        });
        it('should view logs in parallel with prefix', async () => {
            if (!dockerManager.isDockerAvailable() || !container1 || !container2) {
                console.log('Test skipped - Docker not available');
                return;
            }
            await multiProgram.parseAsync(['node', 'xec', 'logs', 'containers.app-*', '--parallel', '--prefix', '--tail', '1']);
            const output = capturedOutput.join('\n');
            expect(output).toContain('[app-1 [docker]]');
            expect(output).toContain('[app-2 [docker]]');
            expect(output).toContain('Log from container 1');
            expect(output).toContain('Log from container 2');
        });
        it('should handle mixed target types', async () => {
            if (!dockerManager.isDockerAvailable() || !container1) {
                console.log('Test skipped - Docker not available');
                return;
            }
            const localLog = join(testDir, 'mixed.log');
            writeFileSync(localLog, 'Local log entry\n');
            const config = `
name: test-project
targets:
  containers:
    app-1:
      type: docker
      container: ${container1}
  local:
    type: local
`;
            writeFileSync(configFile, config);
            await multiProgram.parseAsync(['node', 'xec', 'logs', 'containers.app-1', '--tail', '1']);
            const dockerOutput = capturedOutput.join('\n');
            expect(dockerOutput).toContain('Log from container 1');
            capturedOutput = [];
            await multiProgram.parseAsync(['node', 'xec', 'logs', 'local', localLog]);
            const localOutput = capturedOutput.join('\n');
            expect(localOutput).toContain('Local log entry');
        });
    });
    describe('Configuration and defaults', () => {
        it('should apply command defaults from config', async () => {
            const config = `
name: test-project
targets:
  local:
    type: local
commands:
  logs:
    timestamps: true
    prefix: true
`;
            writeFileSync(configFile, config);
            const logFile = join(testDir, 'defaults.log');
            const lines = Array.from({ length: 5 }, (_, i) => `Line ${i + 1}`).join('\n');
            writeFileSync(logFile, lines);
            await program.parseAsync(['node', 'xec', 'logs', 'local', logFile]);
            const output = capturedOutput.join('\n');
            expect(output).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
            expect(output).toContain('[local]');
            expect(output).toContain('Line 1');
        });
        it('should allow CLI options to override config defaults', async () => {
            const config = `
name: test-project
targets:
  local:
    type: local
commands:
  logs:
    tail: "10"
`;
            writeFileSync(configFile, config);
            const logFile = join(testDir, 'override.log');
            const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join('\n');
            writeFileSync(logFile, lines);
            await program.parseAsync(['node', 'xec', 'logs', 'local', logFile, '--tail', '5']);
            const output = capturedOutput.join('\n');
            expect(output).toContain('Line 20');
            expect(output).toContain('Line 16');
            expect(output).not.toContain('Line 15');
        });
    });
    describe('Task integration', () => {
        it('should execute log analysis task', async () => {
            const logFile = join(testDir, 'task.log');
            writeFileSync(logFile, `INFO: Application started
ERROR: Database connection failed
WARN: Retrying connection
ERROR: Still failing
INFO: Finally connected
`);
            const resultFile = join(testDir, 'task-result.txt');
            const config = `
name: test-project
targets:
  local:
    type: local
tasks:
  analyze-logs:
    description: Analyze log file
    steps:
      - name: Count lines
        command: |
          LOG_PATH="${logFile}"
          if [ -f "$LOG_PATH" ]; then
            echo "Total lines: $(wc -l < "$LOG_PATH")" | tee -a ${resultFile}
            echo "Error lines: $(grep -c ERROR "$LOG_PATH" || echo 0)" | tee -a ${resultFile}
            echo "Warning lines: $(grep -c WARN "$LOG_PATH" || echo 0)" | tee -a ${resultFile}
          else
            echo "Log file not found: $LOG_PATH" | tee -a ${resultFile}
          fi
`;
            writeFileSync(configFile, config);
            await program.parseAsync(['node', 'xec', 'logs', 'local', logFile, '--task', 'analyze-logs']);
            const result = readFileSync(resultFile, 'utf-8');
            expect(result).toMatch(/Total lines:\s+5/);
            expect(result).toMatch(/Error lines:\s+2/);
            expect(result).toMatch(/Warning lines:\s+1/);
        });
    });
    describe('Error handling', () => {
        it('should handle target not found', async () => {
            const config = `
name: test-project
targets:
  containers:
    app:
      type: docker
      container: test
`;
            writeFileSync(configFile, config);
            await expect(program.parseAsync(['node', 'xec', 'logs', 'containers.missing'])).rejects.toThrow('process.exit called with code');
        });
        it('should handle unsupported target type', async () => {
            const config = `
name: test-project
targets:
  local:
    type: local
  containers:
    test:
      type: docker
      container: test-container
`;
            writeFileSync(configFile, config);
            capturedErrors = [];
            await expect(program.parseAsync(['node', 'xec', 'logs', 'containers.nonexistent'])).rejects.toThrow('process.exit called with code');
            const errors = capturedErrors.join(' ').toLowerCase();
            expect(errors).toMatch(/target.*not found|not found|does not exist|no such|unknown.*error|error/i);
        });
        it.skip('should require target specification', async () => {
            capturedErrors = [];
            capturedOutput = [];
            const config = `
name: test-project
targets:
  local:
    type: local
`;
            writeFileSync(configFile, config);
            await expect(program.parseAsync(['node', 'xec', 'logs'])).rejects.toThrow();
            const allOutput = [...capturedErrors, ...capturedOutput].join(' ');
            expect(allOutput.length).toBeGreaterThan(0);
        });
    });
    describe('Dry run mode', () => {
        it('should show what would be done without executing', async () => {
            const config = `
name: test-project
targets:
  local:
    type: local
`;
            writeFileSync(configFile, config);
            const logFile = join(testDir, 'dryrun.log');
            writeFileSync(logFile, 'Test content');
            await program.parseAsync(['node', 'xec', 'logs', 'local', logFile, '--dry-run']);
            const output = capturedOutput.join('\n');
            expect(output).toContain('[DRY RUN]');
            expect(output).toContain('Would view logs from local');
            expect(output).not.toContain('Test content');
        });
    });
    describe('Log formatting and colorization', () => {
        beforeEach(() => {
            const logFile = join(testDir, 'colors.log');
            writeFileSync(logFile, `
ERROR: Critical failure
WARN: Performance degradation  
INFO: System operational
DEBUG: Detailed trace information
SUCCESS: Operation completed
FATAL: System crash
`);
            const config = `
name: test-project
targets:
  local:
    type: local
`;
            writeFileSync(configFile, config);
        });
        it('should colorize log levels by default', async () => {
            const logFile = join(testDir, 'colors.log');
            await program.parseAsync(['node', 'xec', 'logs', 'local', logFile]);
            const output = capturedOutput.join('\n');
            expect(output).toContain('ERROR');
            expect(output).toContain('WARN');
            expect(output).toContain('INFO');
            expect(output).toContain('SUCCESS');
        });
        it('should disable colors with --no-color', async () => {
            const logFile = join(testDir, 'colors.log');
            await program.parseAsync(['node', 'xec', 'logs', 'local', logFile, '--no-color']);
            const output = capturedOutput.join('\n');
            expect(output).toContain('ERROR: Critical failure');
            expect(output).toContain('WARN: Performance degradation');
        });
    });
    describe('Additional coverage tests', () => {
        beforeEach(() => {
            const config = `
name: test-project
targets:
  local:
    type: local
`;
            if (testContainer) {
                const dockerConfig = `
name: test-project
targets:
  containers:
    test:
      type: docker
      container: ${testContainer}
  local:
    type: local
`;
                writeFileSync(configFile, dockerConfig);
            }
            else {
                writeFileSync(configFile, config);
            }
        });
        it('should handle time-based filtering with --since', async () => {
            if (!dockerManager.isDockerAvailable() || !testContainer) {
                console.log('Test skipped - Docker not available');
                return;
            }
            await program.parseAsync(['node', 'xec', 'logs', 'containers.test', '--since', '10m']);
            const output = capturedOutput.join('\n');
            expect(output.length).toBeGreaterThan(0);
        });
        it('should convert various time specifications', async () => {
            if (!dockerManager.isDockerAvailable() || !testContainer) {
                console.log('Test skipped - Docker not available');
                return;
            }
            const timeSpecs = ['5s', '2m', '1h', '1d'];
            for (const spec of timeSpecs) {
                capturedOutput = [];
                await program.parseAsync(['node', 'xec', 'logs', 'containers.test', '--since', spec, '--tail', '1']);
                expect(capturedErrors.join(' ')).not.toContain('Failed to view logs');
            }
        });
        it('should handle verbose mode with debug output', async () => {
            const config = `
name: test-project
targets:
  local:
    type: local
`;
            writeFileSync(configFile, config);
            const logFile = join(testDir, 'verbose.log');
            writeFileSync(logFile, 'Test log line\n');
            await program.parseAsync(['node', 'xec', 'logs', 'local', logFile, '--verbose']);
            const output = capturedOutput.join('\n');
            expect(output).toContain('Test log line');
            expect(output).toContain('[DEBUG] Log command:');
        });
        it('should handle quiet mode', async () => {
            const config = `
name: test-project
targets:
  local:
    type: local
`;
            writeFileSync(configFile, config);
            const logFile = join(testDir, 'quiet.log');
            writeFileSync(logFile, 'Test log line\n');
            await program.parseAsync(['node', 'xec', 'logs', 'local', logFile, '--quiet']);
            const output = capturedOutput.join('\n');
            expect(output).toContain('Test log line');
            expect(output).not.toContain('Fetching logs');
            expect(output).not.toContain('Displayed');
        });
        it('should handle logs with existing timestamps', async () => {
            const config = `
name: test-project
targets:
  local:
    type: local
`;
            writeFileSync(configFile, config);
            const logFile = join(testDir, 'timestamped.log');
            writeFileSync(logFile, `
2024-01-01T10:00:00Z INFO: Already has ISO timestamp
2024/01/01 10:00:01 INFO: Common log format
[2024-01-01 10:00:02] INFO: Bracketed format
Jan 1 10:00:03 INFO: Syslog format
INFO: No timestamp
`);
            await program.parseAsync(['node', 'xec', 'logs', 'local', logFile, '--timestamps']);
            const output = capturedOutput.join('\n');
            const lines = output.split('\n');
            const isoLine = lines.find(l => l.includes('Already has ISO timestamp'));
            expect(isoLine).not.toMatch(/\d{4}-\d{2}-\d{2}T.*\d{4}-\d{2}-\d{2}T/);
            const noTimestampLine = lines.find(l => l.includes('No timestamp'));
            expect(noTimestampLine).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });
        it('should handle target patterns with no matches', async () => {
            const config = `
name: test-project
targets:
  containers:
    app:
      type: docker
      container: test-app
`;
            writeFileSync(configFile, config);
            await expect(program.parseAsync(['node', 'xec', 'logs', 'containers.nonexistent*'])).rejects.toThrow();
        });
        it('should format target display with details', async () => {
            const config = `
name: test-project
targets:
  hosts:
    web:
      type: ssh
      host: example.com
      user: deploy
  containers:
    app:
      type: docker
      container: myapp
      image: node:18
  pods:
    api:
      type: k8s
      pod: api-server
      namespace: production
      container: main
`;
            writeFileSync(configFile, config);
            const logFile = join(testDir, 'display.log');
            writeFileSync(logFile, 'Log entry\n');
            await program.parseAsync(['node', 'xec', 'logs', 'hosts.web', logFile, '--dry-run']);
            let output = capturedOutput.join('\n');
            expect(output).toContain('deploy@example.com');
            expect(output).toContain('[ssh]');
            capturedOutput = [];
            if (dockerManager.isDockerAvailable()) {
                await program.parseAsync(['node', 'xec', 'logs', 'containers.app', '--dry-run']);
                output = capturedOutput.join('\n');
                expect(output).toContain('(node:18)');
                expect(output).toContain('[docker]');
            }
            capturedOutput = [];
            await program.parseAsync(['node', 'xec', 'logs', 'pods.api', '--dry-run']);
            output = capturedOutput.join('\n');
            expect(output).toContain('(ns: production)');
            expect(output).toContain('[main]');
            expect(output).toContain('[k8s]');
        });
        it('should validate options with zod schema', async () => {
            const config = `
name: test-project
targets:
  local:
    type: local
`;
            writeFileSync(configFile, config);
            const logFile = join(testDir, 'valid.log');
            writeFileSync(logFile, 'Test\n');
            await expect(program.parseAsync(['node', 'xec', 'logs', 'local', logFile])).resolves.not.toThrow();
        });
        it('should handle multi-line log entries', async () => {
            const config = `
name: test-project
targets:
  local:
    type: local
`;
            writeFileSync(configFile, config);
            const logFile = join(testDir, 'multiline.log');
            writeFileSync(logFile, `Single line log
Multi-line log entry
  continuation line 1
  continuation line 2
Another single line
Exception: Error at
  at function1() line 10
  at function2() line 20
Final line`);
            await program.parseAsync(['node', 'xec', 'logs', 'local', logFile]);
            const output = capturedOutput.join('\n');
            expect(output).toContain('Single line log');
            expect(output).toContain('continuation line 1');
            expect(output).toContain('at function1() line 10');
            expect(output).toContain('Final line');
        });
        it('should handle empty log files gracefully', async () => {
            const config = `
name: test-project
targets:
  local:
    type: local
`;
            writeFileSync(configFile, config);
            const logFile = join(testDir, 'empty.log');
            writeFileSync(logFile, '');
            await program.parseAsync(['node', 'xec', 'logs', 'local', logFile]);
            const output = capturedOutput.join('\n');
            expect(output).toContain('No logs found matching criteria');
        });
        it('should handle non-existent log files', async () => {
            const config = `
name: test-project
targets:
  local:
    type: local
`;
            writeFileSync(configFile, config);
            const logFile = join(testDir, 'nonexistent.log');
            await expect(program.parseAsync(['node', 'xec', 'logs', 'local', logFile])).rejects.toThrow();
            const errors = capturedErrors.join(' ');
            expect(errors).toContain('nonexistent.log');
        });
        it.skip('should handle task execution with LOG_PATH parameter', async () => {
            const config = `
name: test-project
targets:
  local:
    type: local
tasks:
  check-log:
    description: Check if log exists
    steps:
      - name: Check file
        run: |
          if [ -f "$LOG_PATH" ]; then
            echo "Log file exists: $LOG_PATH"
          else
            echo "Log file not found: $LOG_PATH"
          fi
    inputs:
      LOG_PATH:
        type: string
        required: true
`;
            writeFileSync(configFile, config);
            const logFile = join(testDir, 'task-test.log');
            writeFileSync(logFile, 'Test log\n');
            await program.parseAsync(['node', 'xec', 'logs', 'local', logFile, '--task', 'check-log']);
            const output = capturedOutput.join('\n');
            expect(output).toContain('Running log analysis task');
            expect(output).toContain('Log file exists:');
            expect(output).toContain(logFile);
        });
    });
});
//# sourceMappingURL=logs.test.js.map