import { join, resolve } from 'path';
import { execSync } from 'child_process';

export interface ContainerConfig {
  name: string;
  port: number;
  packageManager: string;
  testPackage: string;
}

export const DOCKER_CONTAINERS: ContainerConfig[] = [
  { name: 'ubuntu-apt', port: 2201, packageManager: 'apt', testPackage: 'curl' },
  { name: 'centos7-yum', port: 2202, packageManager: 'yum', testPackage: 'wget' },
  { name: 'fedora-dnf', port: 2203, packageManager: 'dnf', testPackage: 'nano' },
  { name: 'alpine-apk', port: 2204, packageManager: 'apk', testPackage: 'vim' },
  { name: 'manjaro-pacman', port: 2205, packageManager: 'pacman', testPackage: 'htop' },
  { name: 'ubuntu-brew', port: 2206, packageManager: 'brew', testPackage: 'jq' },
  { name: 'ubuntu-snap', port: 2207, packageManager: 'snap', testPackage: 'hello' }
];

export class DockerContainerManager {
  private static instance: DockerContainerManager;
  private managerScriptPath: string;
  private startedContainers: Set<string> = new Set();
  private dockerImagesPath: string;

  private constructor() {
    // Resolve the path to the docker-ssh-manager.sh script
    // When running from dist, we need to go up to package root
    // When used as npm package, the script is at package root
    const packageRoot = resolve(__dirname, '..', '..');
    this.managerScriptPath = resolve(packageRoot, 'docker-ssh-manager.sh');
    // Resolve the path to docker images
    this.dockerImagesPath = resolve(packageRoot, 'docker');
  }

  static getInstance(): DockerContainerManager {
    if (!DockerContainerManager.instance) {
      DockerContainerManager.instance = new DockerContainerManager();
    }
    return DockerContainerManager.instance;
  }

  /**
   * Check if Docker is available
   */
  isDockerAvailable(): boolean {
    try {
      execSync('/usr/local/bin/docker --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a container is running
   */
  isContainerRunning(name: string): boolean {
    try {
      const result = execSync(`/usr/local/bin/docker ps --format '{{.Names}}' | grep -q "^${name}$"`, {
        shell: '/bin/bash',
        stdio: 'pipe'
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a port is available
   */
  isPortAvailable(port: number): boolean {
    try {
      execSync(`nc -z localhost ${port}`, { stdio: 'ignore' });
      return false; // Port is in use
    } catch {
      return true; // Port is available
    }
  }

  /**
   * Get the path to a specific Docker image directory
   */
  getDockerImagePath(containerName: string): string {
    return join(this.dockerImagesPath, containerName);
  }

  /**
   * Start a specific container
   */
  async startContainer(containerName: string): Promise<boolean> {
    if (!this.isDockerAvailable()) {
      console.warn('Docker is not available, skipping container start');
      return false;
    }

    if (this.isContainerRunning(containerName)) {
      console.log(`Container ${containerName} is already running`);
      return true;
    }

    console.log(`Starting container ${containerName}...`);

    try {
      execSync(`${this.managerScriptPath} start ${containerName}`, {
        stdio: 'inherit',
        cwd: this.dockerImagesPath
      });
      this.startedContainers.add(containerName);
      return true;
    } catch (error) {
      console.error(`Failed to start container ${containerName}:`, error);
      return false;
    }
  }

  /**
   * Start all containers
   */
  async startAllContainers(): Promise<boolean> {
    if (!this.isDockerAvailable()) {
      console.warn('Docker is not available, skipping container start');
      return false;
    }

    console.log('Starting all SSH test containers...');

    try {
      execSync(`${this.managerScriptPath} start`, {
        stdio: 'inherit',
        cwd: this.dockerImagesPath
      });

      // Mark all containers as started
      DOCKER_CONTAINERS.forEach(container => {
        this.startedContainers.add(container.name);
      });

      return true;
    } catch (error) {
      console.error('Failed to start containers:', error);
      return false;
    }
  }

  /**
   * Start only required containers for SSH tests
   */
  async startRequiredContainers(): Promise<boolean> {
    if (!this.isDockerAvailable()) {
      console.warn('Docker is not available, skipping container start');
      return false;
    }

    // For CI/CD, we might want to start only a subset of containers
    const requiredContainers = process.env['CI']
      ? ['ubuntu-apt', 'alpine-apk'] // Minimal set for CI
      : DOCKER_CONTAINERS.map(c => c.name); // All containers for local

    console.log(`Starting required SSH test containers: ${requiredContainers.join(', ')}`);

    let allStarted = true;
    for (const containerName of requiredContainers) {
      const started = await this.startContainer(containerName);
      if (!started) {
        allStarted = false;
      }
    }

    return allStarted;
  }

  /**
   * Stop a specific container
   */
  async stopContainer(containerName: string): Promise<boolean> {
    if (!this.startedContainers.has(containerName)) {
      // We didn't start this container, don't stop it
      return true;
    }

    console.log(`Stopping container ${containerName}...`);

    try {
      execSync(`${this.managerScriptPath} stop ${containerName}`, {
        stdio: 'inherit',
        cwd: this.dockerImagesPath
      });
      this.startedContainers.delete(containerName);
      return true;
    } catch (error) {
      console.error(`Failed to stop container ${containerName}:`, error);
      return false;
    }
  }

  /**
   * Stop all containers that we started
   */
  async stopAllContainers(): Promise<boolean> {
    if (this.startedContainers.size === 0) {
      return true;
    }

    console.log('Stopping SSH test containers...');

    let allStopped = true;
    for (const containerName of this.startedContainers) {
      const stopped = await this.stopContainer(containerName);
      if (!stopped) {
        allStopped = false;
      }
    }

    return allStopped;
  }

  /**
   * Get container status
   */
  getStatus(): void {
    try {
      execSync(`${this.managerScriptPath} status`, {
        stdio: 'inherit',
        cwd: this.dockerImagesPath
      });
    } catch (error) {
      console.error('Failed to get container status:', error);
    }
  }

  /**
   * Wait for SSH to be ready on a specific port
   */
  async waitForSSH(port: number, maxAttempts = 30): Promise<boolean> {
    console.log(`Waiting for SSH on port ${port} to be ready...`);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        execSync(
          `sshpass -p password ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 -p ${port} user@localhost exit`,
          { stdio: 'ignore' }
        );
        console.log(`SSH on port ${port} is ready`);
        return true;
      } catch {
        // SSH not ready yet
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.error(`SSH on port ${port} failed to become ready`);
    return false;
  }

  /**
   * Check if SSH tests should be skipped
   */
  shouldSkipSSHTests(): boolean {
    // Skip if explicitly requested
    if (process.env['SKIP_SSH_DOCKER_TESTS'] === 'true') {
      return true;
    }

    // Skip if Docker is not available
    if (!this.isDockerAvailable()) {
      console.warn('Docker is not available, SSH Docker tests will be skipped');
      return true;
    }

    return false;
  }
}

// Export singleton instance
export const dockerManager = DockerContainerManager.getInstance();