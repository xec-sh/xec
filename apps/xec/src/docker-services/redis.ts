/**
 * Redis Docker Service Fluent API
 */

import type { RedisServiceConfig } from './types.js';
import type {
  ServiceStatus,
  ProcessPromise,
  ServiceManager,
  ExecutionEngine,
  ExecutionResult,
  ClusterNodeInfo
} from '@xec-sh/core';

import { DockerFluentAPI, DockerEphemeralFluentAPI } from '@xec-sh/core';

import { dataVolumeFor } from './types.js';

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
    const dataVolume = dataVolumeFor(this.redisConfig, 'xec-redis');
    if (dataVolume) {
      this.volume(dataVolume, '/data');
    }

    // Config file
    if (this.redisConfig.configPath) {
      this.volume(this.redisConfig.configPath, '/usr/local/etc/redis/redis.conf', 'ro');
    }

    // Environment variables
    if (this.redisConfig.password) {
      this.addEnv('REDISCLI_AUTH', this.redisConfig.password);
    }

    // Additional environment
    if (this.redisConfig.env) {
      this.env(this.redisConfig.env);
    }

    // Labels
    this.addLabel('service', 'redis');
    this.addLabel('managed-by', 'xec');

    // Health check
    this.healthcheck(['redis-cli', 'ping'], {
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
    return await this.exec(['redis-cli', 'ping']);
  }

  /**
   * Execute Redis CLI command
   */
  async cli(command: string | string[]): Promise<ExecutionResult> {
    return Array.isArray(command)
      ? this.exec(['redis-cli', ...command])
      : this.exec(`redis-cli ${command}`);
  }

  /**
   * Get Redis info
   */
  async getInfo(section?: string): Promise<string> {
    const cmd = section ? ['INFO', section] : ['INFO'];
    const result = await this.cli(cmd);
    return result.stdout;
  }

  /**
   * Get Redis config
   */
  async getConfig(parameter?: string): Promise<string> {
    const cmd = ['CONFIG', 'GET', parameter ?? '*'];
    const result = await this.cli(cmd);
    return result.stdout;
  }

  /**
   * Set Redis config
   */
  async setConfig(parameter: string, value: string): Promise<void> {
    await this.cli(['CONFIG', 'SET', parameter, value]);
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
  monitor(): ProcessPromise {
    return this.exec`redis-cli monitor`;
  }

  /**
   * Create backup
   */
  async backup(backupPath: string): Promise<void> {
    if (!this.redisConfig.persistent || !this.redisConfig.dataPath) {
      throw new Error('Redis must be configured with persistence for backups');
    }

    await this.save(false); // SAVE completes only after the snapshot has been written.

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
      return `redis://:${encodeURIComponent(password)}@${host}:${port}`;
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
    version?: string;
    basePort: number;
    network: string;
    containerPrefix: string;
    nodeTimeout: number;
    persistent: boolean;
    dataPath?: string;
    password?: string;
    config?: Record<string, string>;
  };
  private running = false;
  private ownsNetwork = false;

  constructor(
    private engine: ExecutionEngine,
    config?: Partial<RedisServiceConfig>
  ) {
    // Set cluster defaults
    this.clusterConfig = {
      version: config?.version,
      masters: config?.cluster?.masters ?? 3,
      replicas: config?.cluster?.replicas ?? 1,
      basePort: Number(config?.port) || 7001,
      network: config?.network || 'redis-cluster-net',
      containerPrefix: config?.name || 'redis-cluster',
      nodeTimeout: config?.cluster?.nodeTimeout ?? 5000,
      persistent: config?.persistent ?? false,
      dataPath: config?.dataPath,
      password: config?.password,
      config: config?.config
    };

    // Validate cluster config
    if (!Number.isSafeInteger(this.clusterConfig.replicas) || this.clusterConfig.replicas < 0) {
      throw new Error('Redis cluster replicas must be a nonnegative integer');
    }
    if (!Number.isSafeInteger(this.clusterConfig.masters) || this.clusterConfig.masters < 3) {
      throw new Error('[xec] Redis cluster requires at least 3 master nodes');
    }

    const totalNodes = this.getTotalNodes();
    if (totalNodes < 3) {
      throw new Error('[xec] Redis cluster requires at least 3 nodes total');
    }
  }

  getContainerNames(): string[] {
    return this.nodes.map(node => node.build().name!);
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
        version: this.clusterConfig.version,
        name: `${this.clusterConfig.containerPrefix}-${i + 1}`,
        port: this.clusterConfig.basePort + i,
        network: this.clusterConfig.network,
        persistent: this.clusterConfig.persistent,
        password: this.clusterConfig.password,
        // Custom redis settings apply to every node; cluster-mode settings
        // are merged on top below.
        config: { ...this.clusterConfig.config, 'cluster-enabled': 'yes',
          'cluster-config-file': 'nodes.conf',
          'cluster-node-timeout': String(this.clusterConfig.nodeTimeout), 'appendonly': 'yes' },
        cluster: {
          enabled: true,
          nodeTimeout: this.clusterConfig.nodeTimeout
        }
      };

      if (this.clusterConfig.persistent && this.clusterConfig.dataPath) {
        nodeConfig.dataPath = `${this.clusterConfig.dataPath}/node-${i + 1}`;
      }

      const node = new RedisFluentAPI(this.engine, nodeConfig);

      this.nodes.push(node);
    }
  }

  /**
   * Create Docker network for cluster
   */
  private async createNetwork(): Promise<void> {
    const network = new DockerFluentAPI(this.engine).network(this.clusterConfig.network);
    if (!await network.exists()) {
      await network.create();
      this.ownsNetwork = true;
    }
  }

  /**
   * Initialize Redis cluster
   */
  private async initializeCluster(): Promise<void> {
    console.log('[xec] Initializing Redis cluster...');

    // Redis.start has already confirmed PONG on every node. Preserve saved
    // membership: only a set of pristine standalone nodes may be initialized.
    const membership = await this.readMembership();
    const fresh = membership.every(({ self, members }) => members.length === 1 && members[0] === self);
    if (!fresh) {
      const expected = new Set(membership.map(({ self }) => self));
      if (membership.some(({ members }) => members.some(id => !expected.has(id)))) {
        throw new Error('Redis cluster contains members outside this instance; existing data and membership are preserved');
      }
      return;
    }

    // Get node addresses using container names
    const nodeAddresses = this.nodes.map(node =>
      `${node.build().name}:6379`
    );

    // Build cluster create command
    const firstNode = this.nodes[0];
    if (!firstNode) {
      throw new Error('[xec] No nodes available for cluster creation');
    }

    const createCmd = [
      'redis-cli',
      '--cluster', 'create',
      ...nodeAddresses,
      '--cluster-replicas', String(this.clusterConfig.replicas),
      '--cluster-yes'
    ];

    // Execute cluster creation
    await firstNode.exec(createCmd);

    console.log('[xec] Redis cluster initialized');
  }

  private async readMembership(): Promise<Array<{ self: string; members: string[] }>> {
    return Promise.all(this.nodes.map(async node => {
      const result = await node.cli(['CLUSTER', 'NODES']);
      const records = result.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => line.trim().split(/\s+/));
      const self = records.find(fields => fields[2]?.split(',').includes('myself'))?.[0];
      if (!self || records.some(fields => !fields[0] || fields.length < 8)) {
        throw new Error('Invalid Redis CLUSTER NODES response');
      }
      return { self, members: records.map(fields => fields[0]!) };
    }));
  }

  /**
   * Start the Redis cluster
   */
  async start(): Promise<void> {
    if (this.running && await this.isRunning()) {
      console.log('[xec] Redis cluster is already running');
      return;
    }

    console.log('[xec] Starting Redis cluster...');

    // Create network
    await this.createNetwork();

    // Create and start nodes
    if (this.nodes.length === 0) await this.createNodes();

    // Start all nodes in parallel
    const starts = await Promise.allSettled(this.nodes.map(node => node.start()));
    const failures = starts.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Redis node startup failed; recorded nodes are retained for cleanup');

    console.log(`[xec] Started ${this.nodes.length} Redis nodes`);

    // Initialize cluster
    await this.initializeCluster();

    // Marked running before the wait, not after: `exec` refuses to talk to
    // a cluster that is not running, and `waitForReady` asks it for
    // CLUSTER INFO — so waiting first meant every poll threw into an empty
    // catch and the loop ran its whole timeout learning nothing.
    this.running = true;

    // `redis-cli --cluster create` returns as soon as the nodes have been
    // told about each other; agreement takes longer. Returning from start()
    // there meant `await cluster.start()` handed back a cluster answering
    // `cluster_state:fail` to the first command sent to it — a race whose
    // outcome depended on how loaded the machine was.
    try {
      await this.waitForReady();
    } catch (error) {
      this.running = false;
      throw error;
    }

    console.log('[xec] Redis cluster started successfully');
  }

  /**
   * Stop the Redis cluster
   */
  async stop(): Promise<void> {
    // A rejected start may leave live nodes before the cluster becomes ready.
    const results = await Promise.allSettled(this.nodes.map(node => node.stop()));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Redis cluster stop was not confirmed');
    this.running = false;
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
    const results = await Promise.allSettled(this.nodes.map(node => node.remove()));
    this.nodes = this.nodes.filter((_node, index) => results[index]?.status === 'rejected');
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Redis cluster removal was not confirmed');
    this.running = false;
    // Only this instance's created network is owned. User paths and data volumes
    // are never deleted by removing a service, including after partial startup.
    if (this.ownsNetwork) {
      await new DockerFluentAPI(this.engine).network(this.clusterConfig.network).remove();
      this.ownsNetwork = false;
    }
  }

  /**
   * Get cluster status
   */
  async status(): Promise<ServiceStatus> {
    const nodeStatuses = await Promise.all(
      this.nodes.map(node => node.status())
    );

    const allRunning = nodeStatuses.length > 0 && nodeStatuses.every(s => s.running);
    const containers = nodeStatuses.flatMap(s => s.containers);

    return {
      running: allRunning,
      healthy: allRunning && nodeStatuses.every(s => s.healthy),
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
      const nodeName = node.build().name;
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
      throw new Error('[xec] Redis cluster is not running');
    }

    const firstNode = this.nodes[0];
    if (!firstNode) {
      throw new Error('[xec] No nodes available in cluster');
    }

    // Execute on first node with cluster mode
    return await firstNode.cli(`-c ${command}`);
  }

  /**
   * Check if cluster is running
   */
  async isRunning(): Promise<boolean> {
    return (await this.status()).running;
  }

  /**
   * Wait for cluster to be ready
   */
  async waitForReady(timeout = 60000): Promise<void> {
    const startTime = Date.now();
    const interval = 2000;

    if (this.nodes.length === 0) throw new Error('Redis cluster has no nodes');
    let lastError: unknown;
    while (Date.now() - startTime < timeout) {
      try {
        const membership = await this.readMembership();
        const expected = new Set(membership.map(({ self }) => self));
        const complete = membership.every(({ members }) => members.length === expected.size && members.every(id => expected.has(id)));
        const states = await Promise.all(this.nodes.map(node => node.cli(['CLUSTER', 'INFO'])));
        if (complete && states.every(result => /^cluster_state:ok\r?$/m.test(result.stdout))) return;
      } catch (error) {
        lastError = error;
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(interval, Math.max(0, timeout - (Date.now() - startTime)))));
    }

    throw new Error(`Redis cluster failed to become ready within ${timeout}ms`, { cause: lastError });
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
      const [id, address, flags, master, _ping, _pong, _epoch, status] = parts;
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
      const port = node.getConnectionInfo()['port'];
      return `localhost:${port}`;
    });
  }

  /**
   * Add node to cluster
   */
  async addNode(role: 'master' | 'replica', replicateFrom?: string): Promise<void> {
    const firstNode = this.nodes[0];
    if (!firstNode) throw new Error('No nodes available to add node');
    if (role !== 'master' && role !== 'replica') throw new Error('Invalid Redis cluster node role');
    if (role === 'replica' && !replicateFrom) throw new Error('Replica master ID is required');
    const names = new Set(this.getContainerNames());
    let nodeIndex = 0;
    while (names.has(`${this.clusterConfig.containerPrefix}-${nodeIndex + 1}`)) nodeIndex++;
    const nodeConfig: Partial<RedisServiceConfig> = {
      version: this.clusterConfig.version,
      name: `${this.clusterConfig.containerPrefix}-${nodeIndex + 1}`,
      port: this.clusterConfig.basePort + nodeIndex,
      network: this.clusterConfig.network,
      persistent: this.clusterConfig.persistent,
      password: this.clusterConfig.password,
      config: { ...this.clusterConfig.config, 'cluster-enabled': 'yes',
          'cluster-config-file': 'nodes.conf',
          'cluster-node-timeout': String(this.clusterConfig.nodeTimeout), 'appendonly': 'yes' },
      cluster: {
        enabled: true,
        nodeTimeout: this.clusterConfig.nodeTimeout
      }
    };

    if (this.clusterConfig.persistent && this.clusterConfig.dataPath) {
      nodeConfig.dataPath = `${this.clusterConfig.dataPath}/node-${nodeIndex + 1}`;
    }

    const node = new RedisFluentAPI(this.engine, nodeConfig);
    // Record admission before starting: a refused join may still leave a live
    // container, which stop/remove must be able to reach.
    this.nodes.push(node);
    await node.start();

    const newNodeAddr = `${node.build().name}:6379`;
    const masterAddr = `${firstNode.build().name}:6379`;

    if (role === 'master') {
      await firstNode.cli(['--cluster', 'add-node', newNodeAddr, masterAddr]);
    } else if (replicateFrom) {
      await firstNode.cli(['--cluster', 'add-node', newNodeAddr, masterAddr, '--cluster-slave', '--cluster-master-id', replicateFrom]);
    }

    await this.waitForReady();
  }

  /**
   * Remove node from cluster
   */
  async removeNode(nodeId: string): Promise<void> {
    const firstNode = this.nodes[0];
    if (!firstNode) throw new Error('No nodes available to remove a cluster node');
    let owned: RedisFluentAPI | undefined;
    for (const node of this.nodes) {
      if ((await node.cli(['CLUSTER', 'MYID'])).stdout.trim() === nodeId) { owned = node; break; }
    }
    if (!owned) throw new Error(`Node ${nodeId} is not owned by this cluster instance`);
    await firstNode.cli(['--cluster', 'del-node', `${firstNode.build().name}:6379`, nodeId]);
    await owned.remove();
    this.nodes = this.nodes.filter(node => node !== owned);
  }

  /**
   * Rebalance cluster slots
   */
  async rebalance(): Promise<void> {
    const firstNode = this.nodes[0];
    if (!firstNode) {
      throw new Error('[xec] No nodes available to rebalance');
    }
    await firstNode.cli(['--cluster', 'rebalance', `${firstNode.build().name}:6379`, '--cluster-use-empty-masters']);
  }

  /**
   * Perform cluster failover
   */
  async failover(nodeId?: string): Promise<void> {
    for (const node of this.nodes) {
      const result = await node.cli(nodeId ? ['CLUSTER', 'MYID'] : ['INFO', 'replication']);
      if (nodeId ? result.stdout.trim() === nodeId : result.stdout.includes('role:slave')) {
        await node.cli(['CLUSTER', 'FAILOVER']);
        return;
      }
    }
    throw new Error(nodeId ? `Node ${nodeId} not found` : 'No replica available for failover');
  }

}
