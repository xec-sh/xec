/**
 * SSH-enabled Docker Container Service
 *
 * Provides a simple API to create Docker containers with SSH access
 * out of the box, perfect for testing SSH connections and remote execution.
 */

import { DockerEphemeralFluentAPI } from '../base.js';

import type { SSHServiceConfig, ContainerRuntimeInfo } from '../types.js';
import type { ProcessPromise, ExecutionEngine } from '../../../../core/execution-engine.js';

/**
 * SSH Container Fluent API
 *
 * @example
 * // Quick start with defaults
 * const ssh = await docker.ssh().start();
 *
 * // Custom configuration
 * const ssh = await docker.ssh({
 *   distro: 'alpine',
 *   port: 2323,
 *   user: 'admin',
 *   password: 'secret'
 * }).start();
 *
 * // Fluent configuration
 * const ssh = await docker.ssh()
 *   .withDistro('ubuntu')
 *   .withCredentials('myuser', 'mypass')
 *   .withPort(2222)
 *   .start();
 */
export class SSHFluentAPI extends DockerEphemeralFluentAPI {
  private sshConfig: SSHServiceConfig;
  private pubKeys: string[] = [];
  private packages: string[] = [];
  private setupCommands: string[] = [];

  constructor(engine: ExecutionEngine, config?: Partial<SSHServiceConfig>) {
    const finalConfig = {
      distro: 'ubuntu',
      port: 2222,
      user: 'user',
      password: 'password',
      persistent: false,
      autoStart: false,
      ...config
    } as SSHServiceConfig;

    // Map distro to Docker image
    const imageMap: Record<string, string> = {
      ubuntu: 'ubuntu:latest',
      alpine: 'alpine:latest',
      debian: 'debian:latest',
      fedora: 'fedora:latest',
      centos: 'centos:7',
      rocky: 'rockylinux:latest',
      alma: 'almalinux:latest'
    };

    const image = imageMap[finalConfig.distro!] || finalConfig.distro!;

    // Call parent constructor with just image
    super(engine, image);

    // Configure SSH-specific settings
    this.sshConfig = finalConfig;

    // Set up container configuration
    this.ports([`${finalConfig.port}:22`]);
    if (!finalConfig.persistent) {
      this.autoRemove(true);
    }
    this.name(this.sshConfig.name || `ssh-${finalConfig.distro}-${Date.now()}`);
  }

  /**
   * Set the Linux distribution
   */
  withDistro(distro: 'ubuntu' | 'alpine' | 'debian' | 'fedora' | 'centos' | 'rocky' | 'alma' | string): this {
    this.sshConfig.distro = distro;

    // Update image based on new distro
    const imageMap: Record<string, string> = {
      ubuntu: 'ubuntu:latest',
      alpine: 'alpine:latest',
      debian: 'debian:latest',
      fedora: 'fedora:latest',
      centos: 'centos:7',
      rocky: 'rockylinux:latest',
      alma: 'almalinux:latest'
    };

    const image = imageMap[distro] || distro;
    this.image(image);

    return this;
  }

  /**
   * Set SSH credentials
   */
  withCredentials(user: string, password?: string): this {
    this.sshConfig.user = user;
    if (password) {
      this.sshConfig.password = password;
    }
    return this;
  }

  /**
   * Set SSH port
   */
  withPort(portNum: number): this {
    this.sshConfig.port = portNum;
    // Clear existing ports and add new one
    this.config.ports = [`${portNum}:22`];
    return this;
  }

  /**
   * Add public key for authentication
   */
  withPubKeyAuth(pubKeyPath: string): this {
    this.pubKeys.push(pubKeyPath);
    return this;
  }

  /**
   * Enable sudo for the user
   */
  withSudo(requirePassword = false): this {
    this.sshConfig.sudo = { enabled: true, requirePassword };
    return this;
  }

  /**
   * Add additional packages to install
   */
  withPackages(...packages: string[]): this {
    this.packages.push(...packages);
    return this;
  }

  /**
   * Add custom setup commands
   */
  withSetupCommand(command: string): this {
    this.setupCommands.push(command);
    return this;
  }

  /**
   * Set root password (for distros that need it)
   */
  withRootPassword(password: string): this {
    this.sshConfig.rootPassword = password;
    return this;
  }

  /**
   * Make container persistent (don't auto-remove)
   */
  persistent(value = true): this {
    this.sshConfig.persistent = value;
    this.autoRemove(!value);
    return this;
  }

  /**
   * Get SSH connection string
   */
  getConnectionString(): string {
    const port = this.sshConfig.port !== 22 ? `-p ${this.sshConfig.port}` : '';
    return `ssh ${this.sshConfig.user}@localhost ${port}`.trim();
  }

  /**
   * Get SSH configuration for programmatic access
   */
  getConnectionConfig() {
    return {
      host: 'localhost',
      port: this.sshConfig.port,
      username: this.sshConfig.user,
      password: this.sshConfig.password
    };
  }

  /**
   * Build the SSH setup script based on distro
   */
  private buildSetupScript(): string {
    const distro = this.sshConfig.distro!;
    const user = this.sshConfig.user!;
    const password = this.sshConfig.password!;

    // Package manager commands by distro
    const pkgManagers: Record<string, { update: string; install: string }> = {
      ubuntu: {
        update: 'apt-get update',
        install: 'apt-get install -y'
      },
      debian: {
        update: 'apt-get update',
        install: 'apt-get install -y'
      },
      alpine: {
        update: 'apk update',
        install: 'apk add --no-cache'
      },
      fedora: {
        update: 'dnf check-update || true',
        install: 'dnf install -y'
      },
      centos: {
        update: 'yum check-update || true',
        install: 'yum install -y'
      },
      rocky: {
        update: 'dnf check-update || true',
        install: 'dnf install -y'
      },
      alma: {
        update: 'dnf check-update || true',
        install: 'dnf install -y'
      }
    };

    const pkgCmd = pkgManagers[distro] || pkgManagers['ubuntu'];
    const isAlpine = distro === 'alpine';
    const isDebianBased = ['ubuntu', 'debian'].includes(distro);

    // SSH package name
    const sshPackage = isAlpine ? 'openssh' : 'openssh-server';
    const sudoPackage = isAlpine ? 'sudo' : 'sudo';

    const commands: string[] = [];

    // Set environment for non-interactive installation (Debian-based)
    if (isDebianBased) {
      commands.push('export DEBIAN_FRONTEND=noninteractive');
    }

    // Update package list
    if (pkgCmd) {
      commands.push(pkgCmd.update);

      // Install SSH and sudo
      const packagesToInstall = [sshPackage, sudoPackage, ...this.packages];
      commands.push(`${pkgCmd.install} ${packagesToInstall.join(' ')}`);
    }

    // Create SSH run directory
    commands.push('mkdir -p /var/run/sshd');

    // Alpine-specific SSH setup
    if (isAlpine) {
      commands.push('ssh-keygen -A'); // Generate host keys
      commands.push('echo "PermitRootLogin yes" >> /etc/ssh/sshd_config');
      commands.push('echo "PasswordAuthentication yes" >> /etc/ssh/sshd_config');
    }

    // Create user with home directory
    if (isAlpine) {
      commands.push(`adduser -D -s /bin/sh ${user}`);
    } else {
      commands.push(`useradd --create-home --shell /bin/bash ${user}`);
    }

    // Set user password
    commands.push(`echo "${user}:${password}" | chpasswd`);

    // Set root password if specified
    if (this.sshConfig.rootPassword) {
      commands.push(`echo "root:${this.sshConfig.rootPassword}" | chpasswd`);
    }

    // Configure sudo if requested
    if (this.sshConfig.sudo?.enabled) {
      if (isAlpine) {
        commands.push(`echo "${user} ALL=(ALL) ${this.sshConfig.sudo.requirePassword ? '' : 'NOPASSWD:'}ALL" > /etc/sudoers.d/${user}`);
      } else {
        commands.push(`usermod -aG sudo ${user} 2>/dev/null || usermod -aG wheel ${user}`);
        if (!this.sshConfig.sudo.requirePassword) {
          commands.push(`echo "${user} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/${user}`);
        }
      }
    }

    // Setup SSH keys if provided
    if (this.pubKeys.length > 0) {
      commands.push(`mkdir -p /home/${user}/.ssh`);
      commands.push(`touch /home/${user}/.ssh/authorized_keys`);
      commands.push(`chmod 700 /home/${user}/.ssh`);
      commands.push(`chmod 600 /home/${user}/.ssh/authorized_keys`);
      commands.push(`chown -R ${user}:${user} /home/${user}/.ssh`);
      // Note: Public keys will be added via volume mount or docker cp
    }

    // Run custom setup commands
    commands.push(...this.setupCommands);

    return commands.join(' && ');
  }

  /**
   * Start the SSH container (override base method)
   */
  override async start(): Promise<void> {
    const setupScript = this.buildSetupScript();

    // Build and run container with SSH setup
    this.command(['/bin/sh', '-c', `${setupScript} && /usr/sbin/sshd -D`]);

    // Call parent start method
    await super.start();

    // Copy public keys if provided
    for (const pubKeyPath of this.pubKeys) {
      const containerName = this.config.name;
      await this.engine.run`docker cp ${pubKeyPath} ${containerName}:/tmp/pubkey`;
      await this.engine.run`docker exec ${containerName} sh -c "cat /tmp/pubkey >> /home/${this.sshConfig.user}/.ssh/authorized_keys && rm /tmp/pubkey"`;
    }

    // Wait for SSH to be ready
    await this.waitForSSH();
  }

  /**
   * Wait for SSH service to be ready
   */
  private async waitForSSH(maxRetries = 30, delayMs = 1000): Promise<void> {
    const containerName = this.config.name;

    for (let i = 0; i < maxRetries; i++) {
      try {
        // Check if SSH port is listening
        const result = await this.engine.run`docker exec ${containerName} sh -c "netstat -tln | grep :22 || ss -tln | grep :22"`;
        if (result.stdout.includes(':22')) {
          // SSH is ready
          console.log(`SSH container ready: ${this.getConnectionString()}`);
          return;
        }
      } catch {
        // Container might not be ready yet
      }

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    throw new Error(`SSH service did not become ready within ${maxRetries * delayMs / 1000} seconds`);
  }

  /**
   * Execute command via SSH
   */
  ssh(command: string): ProcessPromise {
    const { host, port, username, password } = this.getConnectionConfig();

    // Use sshpass for password authentication (requires sshpass to be installed)
    return this.engine.run`sshpass -p ${password} ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${port} ${username}@${host} ${command}`;
  }

  /**
   * Copy file to container via SSH
   */
  scpTo(localPath: string, remotePath: string): ProcessPromise {
    const { host, port, username, password } = this.getConnectionConfig();

    return this.engine.run`sshpass -p ${password} scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -P ${port} ${localPath} ${username}@${host}:${remotePath}`;
  }

  /**
   * Copy file from container via SSH
   */
  scpFrom(remotePath: string, localPath: string): ProcessPromise {
    const { host, port, username, password } = this.getConnectionConfig();

    return this.engine.run`sshpass -p ${password} scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -P ${port} ${username}@${host}:${remotePath} ${localPath}`;
  }

  /**
   * Stop and remove the SSH container (override base method)
   */
  override async stop(): Promise<void> {
    const containerName = this.config.name;
    await this.engine.run`docker stop ${containerName}`;
    if (!this.sshConfig.persistent) {
      await this.engine.run`docker rm ${containerName}`;
    }
  }

  /**
   * Get container info (override base method)
   */
  override async info(): Promise<ContainerRuntimeInfo | null> {
    try {
      const containerName = this.config.name;
      const result = await this.engine.run`docker inspect ${containerName}`;
      const data = JSON.parse(result.stdout)[0];

      // Transform Docker inspect data to ContainerRuntimeInfo
      return {
        id: data.Id,
        name: data.Name?.replace(/^\//, '') || '',
        image: data.Config?.Image || '',
        status: data.State?.Status || '',
        ports: this.sshConfig.port ? [`${this.sshConfig.port}:22`] : [],
        networks: Object.keys(data.NetworkSettings?.Networks || {}),
        created: new Date(data.Created),
        started: data.State?.StartedAt ? new Date(data.State.StartedAt) : undefined,
        ip: data.NetworkSettings?.IPAddress,
        volumes: data.Mounts?.map((m: any) => `${m.Source}:${m.Destination}`) || [],
        labels: data.Config?.Labels || {}
      };
    } catch {
      return null;
    }
  }
}