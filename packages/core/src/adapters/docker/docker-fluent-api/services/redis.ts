/**
 * Redis Docker Service Fluent API
 */

import { DockerEphemeralFluentAPI } from '../base.js';

import type { ExecutionResult } from '../../../../types/result.js';
import type { ProcessPromise, ExecutionEngine } from '../../../../core/execution-engine.js';
import type {
  ServiceStatus,
  ServiceManager,
  ClusterNodeInfo,
  RedisServiceConfig
} from '../types.js';

/**
 * Redis Single Instance Fluent API
 */
export class RedisFluentAPI extends DockerEphemeralFluentAPI {
  private redisConfig: RedisServiceConfig;

  constructor(engine: ExecutionEngine, config?: Partial<RedisServiceConfig>) {
    const version = config?.version || 'alpine';
    const image = `redis:${version}`;
    super(engine, image);

    // Default Redis configuration
    this.redisConfig = {
      version,
      port: config?.port || 6379,
      name: config?.name || 'xec-redis',
      persistent: config?.persistent ?? false,
      dataPath: config?.dataPath,
      configPath: config?.configPath,
      password: config?.password,
      maxMemory: config?.maxMemory,
      maxMemoryPolicy: config?.maxMemoryPolicy || 'allkeys-lru',
      appendOnly: config?.appendOnly ?? true,
      network: config?.network,
      env: config?.env || {},
      config: config?.config || {},
      autoStart: config?.autoStart ?? false
    };

    // Apply configuration to base
    this.applyConfiguration();
  }

  /**
   * Apply Redis configuration to Docker container
   */
  private applyConfiguration(): void {
    // Set container name
    if (this.redisConfig.name) {
      this.name(this.redisConfig.name);
    }

    // Port mapping
    if (this.redisConfig.port) {
      this.port(this.redisConfig.port, 6379);
    }

    // Network
    if (this.redisConfig.network) {
      this.network(this.redisConfig.network);
    }

    // Data persistence
    if (this.redisConfig.persistent && this.redisConfig.dataPath) {
      this.volume(this.redisConfig.dataPath, '/data');
    }

    // Config file
    if (this.redisConfig.configPath) {
      this.volume(this.redisConfig.configPath, '/usr/local/etc/redis/redis.conf', 'ro');
    }

    // Environment variables
    if (this.redisConfig.password) {
      this.addEnv('REDIS_PASSWORD', this.redisConfig.password);
    }

    // Additional environment
    if (this.redisConfig.env) {
      this.env(this.redisConfig.env);
    }

    // Labels
    this.addLabel('service', 'redis');
    this.addLabel('managed-by', 'xec');

    // Health check
    const healthCmd = this.redisConfig.password
      ? `redis-cli -a ${this.redisConfig.password} ping`
      : 'redis-cli ping';
    this.healthcheck(healthCmd, {
      interval: '5s',
      timeout: '3s',
      retries: 5,
      startPeriod: '10s'
    });
  }

  /**
   * Build Redis command arguments
   */
  private buildRedisCommand(): string[] {
    const args: string[] = ['redis-server'];

    // Use config file if provided
    if (this.redisConfig.configPath) {
      args.push('/usr/local/etc/redis/redis.conf');
    }

    // Command line config options
    const configOptions: Record<string, string> = {};

    // Password
    if (this.redisConfig.password) {
      configOptions['requirepass'] = this.redisConfig.password;
    }

    // Max memory
    if (this.redisConfig.maxMemory) {
      configOptions['maxmemory'] = this.redisConfig.maxMemory;
    }

    // Max memory policy
    if (this.redisConfig.maxMemoryPolicy) {
      configOptions['maxmemory-policy'] = this.redisConfig.maxMemoryPolicy;
    }

    // Append only
    if (this.redisConfig.appendOnly !== undefined) {
      configOptions['appendonly'] = this.redisConfig.appendOnly ? 'yes' : 'no';
    }

    // Additional config
    Object.assign(configOptions, this.redisConfig.config);

    // Add config options to command
    for (const [key, value] of Object.entries(configOptions)) {
      args.push('--' + key, value);
    }

    return args;
  }

  /**
   * Start Redis container
   */
  override async start(): Promise<void> {
    // Set command
    this.command(this.buildRedisCommand());

    // Call parent start
    await super.start();

    // Wait for Redis to be ready
    await this.waitForRedis();
  }

  /**
   * Wait for Redis to be ready
   */
  private async waitForRedis(timeout = 30000): Promise<void> {
    const startTime = Date.now();
    const interval = 1000;

    while (Date.now() - startTime < timeout) {
      try {
        const result = await this.ping();
        if (result.stdout.trim() === 'PONG') {
          return;
        }
      } catch {
        // Continue waiting
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Redis failed to become ready within ${timeout}ms`);
  }

  /**
   * Ping Redis
   */
  async ping(): Promise<ExecutionResult> {
    const pingCommand = this.redisConfig.password
      ? `redis-cli -a ${this.redisConfig.password} ping`
      : 'redis-cli ping';

    // Use the ServiceManager interface exec method which accepts string
    return await this.exec(pingCommand);
  }

  /**
   * Execute Redis CLI command
   */
  async cli(command: string): Promise<ExecutionResult> {
    const fullCommand = this.redisConfig.password
      ? `redis-cli -a ${this.redisConfig.password} ${command}`
      : `redis-cli ${command}`;

    // Use the ServiceManager interface exec method which accepts string
    return await this.exec(fullCommand);
  }

  /**
   * Get Redis info
   */
  async getInfo(section?: string): Promise<string> {
    const cmd = section ? `INFO ${section}` : 'INFO';
    const result = await this.cli(cmd);
    return result.stdout;
  }

  /**
   * Get Redis config
   */
  async getConfig(parameter?: string): Promise<string> {
    const cmd = parameter ? `CONFIG GET ${parameter}` : 'CONFIG GET *';
    const result = await this.cli(cmd);
    return result.stdout;
  }

  /**
   * Set Redis config
   */
  async setConfig(parameter: string, value: string): Promise<void> {
    await this.cli(`CONFIG SET ${parameter} ${value}`);
  }

  /**
   * Save Redis data
   */
  async save(background = true): Promise<void> {
    const cmd = background ? 'BGSAVE' : 'SAVE';
    await this.cli(cmd);
  }

  /**
   * Flush database
   */
  async flush(all = false, async = false): Promise<void> {
    let cmd = all ? 'FLUSHALL' : 'FLUSHDB';
    if (async) cmd += ' ASYNC';
    await this.cli(cmd);
  }

  /**
   * Get memory usage
   */
  async memoryUsage(): Promise<string> {
    const result = await this.cli('INFO memory');
    return result.stdout;
  }

  /**
   * Get connected clients
   */
  async clients(): Promise<string> {
    const result = await this.cli('CLIENT LIST');
    return result.stdout;
  }

  /**
   * Monitor Redis commands
   */
  async monitor(): Promise<ProcessPromise> {
    const monitorCommand = this.redisConfig.password
      ? `redis-cli -a ${this.redisConfig.password} monitor`
      : 'redis-cli monitor';

    // Create a template literal for ProcessPromise return
    const templateArr = Object.assign([monitorCommand], { raw: [monitorCommand] }) as TemplateStringsArray;
    return this.exec(templateArr);
  }

  /**
   * Create backup
   */
  async backup(backupPath: string): Promise<void> {
    if (!this.redisConfig.persistent || !this.redisConfig.dataPath) {
      throw new Error('Redis must be configured with persistence for backups');
    }

    await this.save();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for save to complete

    // Copy dump file
    const dumpFile = `${this.redisConfig.dataPath}/dump.rdb`;
    await this.engine.run`cp ${dumpFile} ${backupPath}`;
  }

  /**
   * Restore from backup
   */
  async restore(backupPath: string): Promise<void> {
    if (!this.redisConfig.persistent || !this.redisConfig.dataPath) {
      throw new Error('Redis must be configured with persistence for restore');
    }

    await this.stop();

    // Copy backup to data directory
    const dumpFile = `${this.redisConfig.dataPath}/dump.rdb`;
    await this.engine.run`cp ${backupPath} ${dumpFile}`;

    await this.start();
  }

  /**
   * Get connection string
   */
  getConnectionString(): string {
    const host = 'localhost';
    const port = this.redisConfig.port;
    const password = this.redisConfig.password;

    if (password) {
      return `redis://:${password}@${host}:${port}`;
    }
    return `redis://${host}:${port}`;
  }

  /**
   * Get connection info
   */
  getConnectionInfo(): Record<string, any> {
    return {
      host: 'localhost',
      port: this.redisConfig.port,
      password: this.redisConfig.password || null,
      database: 0,
      connectionString: this.getConnectionString()
    };
  }

  /**
   * Enable Redis modules
   */
  async enableModules(modules: string[]): Promise<RedisFluentAPI> {
    // For Redis Stack or modules, change image
    if (modules.length > 0) {
      this.image(`redis/redis-stack:${this.redisConfig.version}`);
    }
    return this;
  }

  /**
   * Set as master in replication
   */
  asMaster(): RedisFluentAPI {
    this.redisConfig.config = {
      ...this.redisConfig.config,
      'repl-diskless-sync': 'yes',
      'repl-diskless-sync-delay': '5'
    };
    this.applyConfiguration();
    return this;
  }

  /**
   * Set as slave in replication
   */
  asSlave(masterHost: string, masterPort: number): RedisFluentAPI {
    this.redisConfig.config = {
      ...this.redisConfig.config,
      'slaveof': `${masterHost} ${masterPort}`
    };

    if (this.redisConfig.password) {
      this.redisConfig.config['masterauth'] = this.redisConfig.password;
    }

    this.applyConfiguration();
    return this;
  }

  /**
   * Configure for Sentinel
   */
  asSentinel(masterName: string, masterHost: string, masterPort: number, quorum = 2): RedisFluentAPI {
    this.redisConfig.config = {
      ...this.redisConfig.config,
      'sentinel': 'yes',
      'sentinel monitor': `${masterName} ${masterHost} ${masterPort} ${quorum}`,
      'sentinel down-after-milliseconds': `${masterName} 5000`,
      'sentinel parallel-syncs': `${masterName} 1`,
      'sentinel failover-timeout': `${masterName} 10000`
    };

    if (this.redisConfig.password) {
      this.redisConfig.config[`sentinel auth-pass ${masterName}`] = this.redisConfig.password;
    }

    // Change port for Sentinel
    this.redisConfig.port = 26379;
    this.applyConfiguration();
    return this;
  }
}

/**
 * Redis Cluster Fluent API
 */
export class RedisClusterFluentAPI implements ServiceManager {
  private nodes: RedisFluentAPI[] = [];
  private clusterConfig: {
    masters: number;
    replicas: number;
    basePort: number;
    network: string;
    containerPrefix: string;
    nodeTimeout: number;
    persistent: boolean;
    dataPath?: string;
    password?: string;
  };
  private running = false;

  constructor(
    private engine: ExecutionEngine,
    config?: Partial<RedisServiceConfig>
  ) {
    // Set cluster defaults
    this.clusterConfig = {
      masters: config?.cluster?.masters ?? 3,
      replicas: config?.cluster?.replicas ?? 1,
      basePort: Number(config?.port) || 7001,
      network: config?.network || 'redis-cluster-net',
      containerPrefix: config?.name || 'redis-cluster',
      nodeTimeout: config?.cluster?.nodeTimeout ?? 5000,
      persistent: config?.persistent ?? false,
      dataPath: config?.dataPath,
      password: config?.password
    };

    // Validate cluster config
    if (this.clusterConfig.masters < 3) {
      throw new Error('[xec-core] Redis cluster requires at least 3 master nodes');
    }

    const totalNodes = this.getTotalNodes();
    if (totalNodes < 3) {
      throw new Error('[xec-core] Redis cluster requires at least 3 nodes total');
    }
  }

  /**
   * Get total number of nodes
   */
  private getTotalNodes(): number {
    return this.clusterConfig.masters * (1 + this.clusterConfig.replicas);
  }

  /**
   * Create cluster nodes
   */
  private async createNodes(): Promise<void> {
    const totalNodes = this.getTotalNodes();
    this.nodes = [];

    for (let i = 0; i < totalNodes; i++) {
      const nodeConfig: Partial<RedisServiceConfig> = {
        name: `${this.clusterConfig.containerPrefix}-${i + 1}`,
        port: this.clusterConfig.basePort + i,
        network: this.clusterConfig.network,
        persistent: this.clusterConfig.persistent,
        password: this.clusterConfig.password,
        cluster: {
          enabled: true,
          nodeTimeout: this.clusterConfig.nodeTimeout
        }
      };

      if (this.clusterConfig.persistent && this.clusterConfig.dataPath) {
        nodeConfig.dataPath = `${this.clusterConfig.dataPath}/node-${i + 1}`;
      }

      const node = new RedisFluentAPI(this.engine, nodeConfig);

      // Configure for cluster mode
      node['redisConfig'].config = {
        ...node['redisConfig'].config,
        'cluster-enabled': 'yes',
        'cluster-config-file': 'nodes.conf',
        'cluster-node-timeout': String(this.clusterConfig.nodeTimeout),
        'appendonly': 'yes'
      };

      this.nodes.push(node);
    }
  }

  /**
   * Create Docker network for cluster
   */
  private async createNetwork(): Promise<void> {
    try {
      await this.engine.run`docker network inspect ${this.clusterConfig.network}`;
    } catch {
      console.log(`[xec-core] Creating network ${this.clusterConfig.network}`);
      await this.engine.run`docker network create ${this.clusterConfig.network}`;
    }
  }

  /**
   * Initialize Redis cluster
   */
  private async initializeCluster(): Promise<void> {
    console.log('[xec-core] Initializing Redis cluster...');

    // Wait for all nodes to be ready
    await this.waitForNodes();

    // Get node addresses using container names
    const nodeAddresses = this.nodes.map(node =>
      `${node['redisConfig'].name}:6379`
    );

    // Build cluster create command
    const firstNode = this.nodes[0];
    if (!firstNode) {
      throw new Error('[xec-core] No nodes available for cluster creation');
    }

    const createCmd = [
      'redis-cli',
      '--cluster', 'create',
      ...nodeAddresses,
      '--cluster-replicas', String(this.clusterConfig.replicas),
      '--cluster-yes'
    ];

    if (this.clusterConfig.password) {
      createCmd.splice(1, 0, '-a', this.clusterConfig.password);
    }

    // Execute cluster creation
    await firstNode.exec(createCmd.join(' '));

    console.log('[xec-core] Redis cluster initialized');
  }

  /**
   * Wait for all nodes to be ready
   */
  private async waitForNodes(): Promise<void> {
    const maxRetries = 30;
    const delay = 1000;

    for (const node of this.nodes) {
      let ready = false;

      for (let i = 0; i < maxRetries; i++) {
        try {
          const result = await node.ping();
          if (result.stdout.trim() === 'PONG') {
            ready = true;
            break;
          }
        } catch {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      if (!ready) {
        throw new Error(`[xec-core] Redis node ${node['redisConfig'].name} failed to start`);
      }
    }
  }

  /**
   * Start the Redis cluster
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('[xec-core] Redis cluster is already running');
      return;
    }

    console.log('[xec-core] Starting Redis cluster...');

    // Create network
    await this.createNetwork();

    // Create and start nodes
    await this.createNodes();

    // Start all nodes in parallel
    const startPromises = this.nodes.map(node => node.start());
    await Promise.all(startPromises);

    console.log(`[xec-core] Started ${this.nodes.length} Redis nodes`);

    // Initialize cluster
    await this.initializeCluster();

    this.running = true;
    console.log('[xec-core] Redis cluster started successfully');
  }

  /**
   * Stop the Redis cluster
   */
  async stop(): Promise<void> {
    if (!this.running) {
      console.log('[xec-core] Redis cluster is not running');
      return;
    }

    console.log('[xec-core] Stopping Redis cluster...');

    // Stop all nodes in parallel
    const stopPromises = this.nodes.map(node => node.stop().catch(() => {}));
    await Promise.all(stopPromises);

    this.running = false;
    console.log('[xec-core] Redis cluster stopped');
  }

  /**
   * Restart the Redis cluster
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Remove the Redis cluster
   */
  async remove(): Promise<void> {
    console.log('[xec-core] Removing Redis cluster...');

    // Remove all nodes
    const removePromises = this.nodes.map(node => node.remove().catch(() => {}));
    await Promise.all(removePromises);

    // Remove network
    try {
      await this.engine.run`docker network rm ${this.clusterConfig.network}`;
    } catch {
      // Network might be in use by other containers
    }

    // Clean up data if not persistent
    if (!this.clusterConfig.persistent && this.clusterConfig.dataPath) {
      try {
        await this.engine.run`rm -rf ${this.clusterConfig.dataPath}`;
      } catch {
        // Ignore cleanup errors
      }
    }

    this.running = false;
    this.nodes = [];

    console.log('[xec-core] Redis cluster removed');
  }

  /**
   * Get cluster status
   */
  async status(): Promise<ServiceStatus> {
    const nodeStatuses = await Promise.all(
      this.nodes.map(node => node.status())
    );

    const allRunning = nodeStatuses.every(s => s.running);
    const containers = nodeStatuses.flatMap(s => s.containers);

    return {
      running: this.running && allRunning,
      healthy: allRunning,
      containers,
      endpoints: this.getEndpoints()
    };
  }

  /**
   * Get cluster logs
   */
  async logs(options?: any): Promise<string> {
    const logs: string[] = [];

    for (const node of this.nodes) {
      const nodeName = node['redisConfig'].name;
      const nodeLog = await node.logs(options);
      logs.push(`=== ${nodeName} ===\n${nodeLog}\n`);
    }

    return logs.join('\n');
  }

  /**
   * Execute command on cluster
   */
  async exec(command: string): Promise<ExecutionResult> {
    if (!this.running || this.nodes.length === 0) {
      throw new Error('[xec-core] Redis cluster is not running');
    }

    const firstNode = this.nodes[0];
    if (!firstNode) {
      throw new Error('[xec-core] No nodes available in cluster');
    }

    // Execute on first node with cluster mode
    return await firstNode.cli(`-c ${command}`);
  }

  /**
   * Check if cluster is running
   */
  async isRunning(): Promise<boolean> {
    return this.running;
  }

  /**
   * Wait for cluster to be ready
   */
  async waitForReady(timeout = 60000): Promise<void> {
    const startTime = Date.now();
    const interval = 2000;

    while (Date.now() - startTime < timeout) {
      try {
        const info = await this.getClusterInfo();
        if (info.includes('cluster_state:ok')) {
          return;
        }
      } catch {
        // Continue waiting
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Redis cluster failed to become ready within ${timeout}ms`);
  }

  /**
   * Get cluster info
   */
  async getClusterInfo(): Promise<string> {
    const result = await this.exec('CLUSTER INFO');
    return result.stdout;
  }

  /**
   * Get cluster nodes
   */
  async getClusterNodes(): Promise<ClusterNodeInfo[]> {
    const result = await this.exec('CLUSTER NODES');
    const lines = result.stdout.trim().split('\n');

    return lines.map(line => {
      const parts = line.split(' ');
      const [id, address, flags, master, ping, pong, epoch, status] = parts;
      const [host, ports] = address ? address.split(':') : ['', ''];
      const [port] = ports ? ports.split('@') : ['6379'];

      return {
        id: id || '',
        name: `node-${(id || '').substring(0, 8)}`,
        role: flags && flags.includes('master') ? 'master' : 'replica',
        status: status || 'unknown',
        host: host || 'localhost',
        port: parseInt(port || '6379'),
        master: master === '-' ? undefined : master,
        replicas: []
      };
    });
  }

  /**
   * Get connection string
   */
  getConnectionString(): string {
    return this.getEndpoints().join(',');
  }

  /**
   * Get endpoints
   */
  getEndpoints(): string[] {
    return this.nodes.map(node => {
      const port = node['redisConfig'].port;
      return `localhost:${port}`;
    });
  }

  /**
   * Add node to cluster
   */
  async addNode(role: 'master' | 'replica', replicateFrom?: string): Promise<void> {
    const nodeIndex = this.nodes.length;
    const nodeConfig: Partial<RedisServiceConfig> = {
      name: `${this.clusterConfig.containerPrefix}-${nodeIndex + 1}`,
      port: this.clusterConfig.basePort + nodeIndex,
      network: this.clusterConfig.network,
      persistent: this.clusterConfig.persistent,
      password: this.clusterConfig.password,
      cluster: {
        enabled: true,
        nodeTimeout: this.clusterConfig.nodeTimeout
      }
    };

    if (this.clusterConfig.persistent && this.clusterConfig.dataPath) {
      nodeConfig.dataPath = `${this.clusterConfig.dataPath}/node-${nodeIndex + 1}`;
    }

    const node = new RedisFluentAPI(this.engine, nodeConfig);
    await node.start();

    // Add to cluster
    const firstNode = this.nodes[0];
    if (!firstNode) {
      throw new Error('[xec-core] No nodes available to add node');
    }
    const newNodeAddr = `${node['redisConfig'].name}:6379`;
    const masterAddr = `${firstNode['redisConfig'].name}:6379`;

    if (role === 'master') {
      await firstNode.cli(`--cluster add-node ${newNodeAddr} ${masterAddr}`);
    } else if (replicateFrom) {
      await firstNode.cli(`--cluster add-node ${newNodeAddr} ${masterAddr} --cluster-slave --cluster-master-id ${replicateFrom}`);
    }

    this.nodes.push(node);
  }

  /**
   * Remove node from cluster
   */
  async removeNode(nodeId: string): Promise<void> {
    const firstNode = this.nodes[0];
    if (!firstNode) {
      throw new Error('[xec-core] No nodes available to remove node');
    }
    await firstNode.cli(`--cluster del-node ${firstNode['redisConfig'].name}:6379 ${nodeId}`);

    // Find and remove the node from our list
    const nodeIndex = this.nodes.findIndex(n => 
      // You'd need to track node IDs properly for this
       false // Placeholder
    );

    if (nodeIndex >= 0) {
      const nodeToRemove = this.nodes[nodeIndex];
      if (nodeToRemove) {
        await nodeToRemove.remove();
        this.nodes.splice(nodeIndex, 1);
      }
    }
  }

  /**
   * Rebalance cluster slots
   */
  async rebalance(): Promise<void> {
    const firstNode = this.nodes[0];
    if (!firstNode) {
      throw new Error('[xec-core] No nodes available to rebalance');
    }
    await firstNode.cli(`--cluster rebalance ${firstNode['redisConfig'].name}:6379 --cluster-use-empty-masters`);
  }

  /**
   * Perform cluster failover
   */
  async failover(nodeId?: string): Promise<void> {
    if (nodeId) {
      // Find the node and perform failover
      for (const node of this.nodes) {
        try {
          const result = await node.cli('CLUSTER MYID');
          if (result.stdout.trim() === nodeId) {
            await node.cli('CLUSTER FAILOVER');
            return;
          }
        } catch {
          // Continue searching
        }
      }
      throw new Error(`Node ${nodeId} not found`);
    } else {
      // Auto failover on first replica
      for (const node of this.nodes) {
        try {
          const info = await node.cli('INFO replication');
          if (info.stdout.includes('role:slave')) {
            await node.cli('CLUSTER FAILOVER');
            return;
          }
        } catch {
          // Continue searching
        }
      }
    }
  }
}