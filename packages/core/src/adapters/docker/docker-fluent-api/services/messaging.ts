/**
 * Messaging and Queue Service Presets for Docker Fluent API
 */

import { DockerEphemeralFluentAPI } from '../base.js';

import type { ExecutionEngine } from '../../../../core/execution-engine.js';
import type {
  ServiceManager,
  KafkaServiceConfig,
  RabbitMQServiceConfig
} from '../types.js';

/**
 * Apache Kafka Service Fluent API
 */
export class KafkaFluentAPI extends DockerEphemeralFluentAPI implements ServiceManager {
  private kafkaConfig: KafkaServiceConfig;
  private zookeeperContainer?: DockerEphemeralFluentAPI;

  constructor(engine: ExecutionEngine, config?: Partial<KafkaServiceConfig>) {
    const version = config?.version || 'latest';
    const image = `confluentinc/cp-kafka:${version}`;
    super(engine, image);

    this.kafkaConfig = {
      version,
      port: config?.port || 9092,
      name: config?.name || 'xec-kafka',
      zookeeper: config?.zookeeper || 'xec-zookeeper:2181',
      brokerId: config?.brokerId || 1,
      listeners: config?.listeners || ['PLAINTEXT://0.0.0.0:9092'],
      advertisedListeners: config?.advertisedListeners || ['PLAINTEXT://localhost:9092'],
      autoCreateTopics: config?.autoCreateTopics ?? true,
      defaultReplicationFactor: config?.defaultReplicationFactor || 1,
      minInsyncReplicas: config?.minInsyncReplicas || 1,
      persistent: config?.persistent ?? false,
      dataPath: config?.dataPath,
      network: config?.network || 'xec-kafka-network',
      env: config?.env || {},
      config: config?.config || {}
    };

    this.applyConfiguration();
  }

  private applyConfiguration(): void {
    // Container name and port
    this.name(this.kafkaConfig.name!);
    this.port(this.kafkaConfig.port!, 9092);

    // Additional Kafka ports
    this.port(9093, 9093); // External listener
    this.port(29092, 29092); // Docker internal

    // Network
    if (this.kafkaConfig.network) {
      this.network(this.kafkaConfig.network);
    }

    // Data persistence
    if (this.kafkaConfig.persistent && this.kafkaConfig.dataPath) {
      this.volume(this.kafkaConfig.dataPath, '/var/lib/kafka/data');
    }

    // Environment variables
    this.env({
      KAFKA_BROKER_ID: String(this.kafkaConfig.brokerId),
      KAFKA_ZOOKEEPER_CONNECT: this.kafkaConfig.zookeeper!,
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT',
      KAFKA_ADVERTISED_LISTENERS: `PLAINTEXT://${this.kafkaConfig.name}:29092,PLAINTEXT_HOST://localhost:${this.kafkaConfig.port}`,
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: String(this.kafkaConfig.defaultReplicationFactor),
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: String(this.kafkaConfig.minInsyncReplicas),
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: String(this.kafkaConfig.defaultReplicationFactor),
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: String(this.kafkaConfig.autoCreateTopics),
      KAFKA_DELETE_TOPIC_ENABLE: 'true',
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: '0',
      KAFKA_JMX_PORT: '9101',
      KAFKA_JMX_HOSTNAME: 'localhost',
      ...this.kafkaConfig.env
    });

    // Additional Kafka configuration
    if (this.kafkaConfig.config) {
      for (const [key, value] of Object.entries(this.kafkaConfig.config)) {
        this.addEnv(`KAFKA_${key.toUpperCase().replace(/-/g, '_')}`, value);
      }
    }

    // Labels
    this.labels({
      service: 'kafka',
      'managed-by': 'xec'
    });

    // Health check
    this.healthcheck(
      'kafka-topics --bootstrap-server localhost:9092 --list',
      {
        interval: '10s',
        timeout: '10s',
        retries: 5,
        startPeriod: '40s'
      }
    );
  }

  /**
   * Start Kafka with Zookeeper
   */
  async startWithZookeeper(): Promise<void> {
    // Start Zookeeper first
    await this.startZookeeper();

    // Wait for Zookeeper
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Start Kafka
    await this.start();
  }

  /**
   * Start Zookeeper container
   */
  private async startZookeeper(): Promise<void> {
    const zookeeperName = this.kafkaConfig.zookeeper?.split(':')[0] || 'xec-zookeeper';

    this.zookeeperContainer = new DockerEphemeralFluentAPI(this.engine, 'confluentinc/cp-zookeeper:latest')
      .name(zookeeperName)
      .port(2181, 2181)
      .env({
        ZOOKEEPER_CLIENT_PORT: '2181',
        ZOOKEEPER_TICK_TIME: '2000'
      });

    if (this.kafkaConfig.network) {
      this.zookeeperContainer.network(this.kafkaConfig.network);
    }

    if (this.kafkaConfig.persistent) {
      this.zookeeperContainer.volume(`${this.kafkaConfig.dataPath}-zk`, '/var/lib/zookeeper/data');
    }

    await this.zookeeperContainer.start();
    console.log('[xec-core] Zookeeper started');
  }

  /**
   * Stop Kafka and Zookeeper
   */
  async stopAll(): Promise<void> {
    await this.stop();
    if (this.zookeeperContainer) {
      await this.zookeeperContainer.stop();
    }
  }

  /**
   * Remove Kafka and Zookeeper containers
   */
  async removeAll(): Promise<void> {
    await this.remove();
    if (this.zookeeperContainer) {
      await this.zookeeperContainer.remove();
    }
  }

  /**
   * Create Kafka topic
   */
  async createTopic(
    name: string,
    partitions = 1,
    replicationFactor = 1,
    config?: Record<string, string>
  ): Promise<void> {
    let cmd = `kafka-topics --bootstrap-server localhost:9092 --create --topic ${name}`;
    cmd += ` --partitions ${partitions}`;
    cmd += ` --replication-factor ${replicationFactor}`;

    if (config) {
      for (const [key, value] of Object.entries(config)) {
        cmd += ` --config ${key}=${value}`;
      }
    }

    await this.exec`${cmd}`;
  }

  /**
   * Delete Kafka topic
   */
  async deleteTopic(name: string): Promise<void> {
    await this.exec`kafka-topics --bootstrap-server localhost:9092 --delete --topic ${name}`;
  }

  /**
   * List Kafka topics
   */
  async listTopics(): Promise<string[]> {
    const result = await this.exec`kafka-topics --bootstrap-server localhost:9092 --list`;
    return result.stdout.trim().split('\n').filter(t => t);
  }

  /**
   * Describe topic
   */
  async describeTopic(name: string): Promise<string> {
    const result = await this.exec`kafka-topics --bootstrap-server localhost:9092 --describe --topic ${name}`;
    return result.stdout;
  }

  /**
   * Produce message to topic
   */
  async produce(topic: string, message: string, key?: string): Promise<void> {
    const keyPart = key ? `--property "parse.key=true" --property "key.separator=:"` : '';
    const msg = key ? `${key}:${message}` : message;
    const cmd = `echo "${msg}" | kafka-console-producer --bootstrap-server localhost:9092 --topic ${topic} ${keyPart}`;
    await this.exec`sh -c "${cmd}"`;
  }

  /**
   * Consume messages from topic
   */
  async consume(
    topic: string,
    options?: {
      fromBeginning?: boolean;
      maxMessages?: number;
      timeout?: number;
      group?: string;
    }
  ): Promise<string[]> {
    let cmd = `kafka-console-consumer --bootstrap-server localhost:9092 --topic ${topic}`;

    if (options?.fromBeginning) {
      cmd += ' --from-beginning';
    }

    if (options?.maxMessages) {
      cmd += ` --max-messages ${options.maxMessages}`;
    }

    if (options?.timeout) {
      cmd += ` --timeout-ms ${options.timeout}`;
    }

    if (options?.group) {
      cmd += ` --group ${options.group}`;
    }

    const result = await this.exec`${cmd}`;
    return result.stdout.trim().split('\n').filter(m => m);
  }

  /**
   * Get consumer groups
   */
  async listConsumerGroups(): Promise<string[]> {
    const result = await this.exec`kafka-consumer-groups --bootstrap-server localhost:9092 --list`;
    return result.stdout.trim().split('\n').filter(g => g);
  }

  /**
   * Describe consumer group
   */
  async describeConsumerGroup(group: string): Promise<string> {
    const result = await this.exec`kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group ${group}`;
    return result.stdout;
  }

  /**
   * Reset consumer group offset
   */
  async resetConsumerOffset(group: string, topic: string, offset: 'earliest' | 'latest' | number): Promise<void> {
    let offsetArg = '';
    if (typeof offset === 'number') {
      offsetArg = `--to-offset ${offset}`;
    } else {
      offsetArg = `--to-${offset}`;
    }

    await this.exec`kafka-consumer-groups --bootstrap-server localhost:9092 --group ${group} --topic ${topic} --reset-offsets ${offsetArg} --execute`;
  }

  getConnectionString(): string {
    return `localhost:${this.kafkaConfig.port}`;
  }

  getConnectionInfo(): Record<string, any> {
    return {
      bootstrapServers: `localhost:${this.kafkaConfig.port}`,
      zookeeper: this.kafkaConfig.zookeeper,
      brokerId: this.kafkaConfig.brokerId,
      listeners: this.kafkaConfig.listeners,
      advertisedListeners: this.kafkaConfig.advertisedListeners
    };
  }
}

/**
 * RabbitMQ Service Fluent API
 */
export class RabbitMQFluentAPI extends DockerEphemeralFluentAPI implements ServiceManager {
  private rabbitConfig: RabbitMQServiceConfig;

  constructor(engine: ExecutionEngine, config?: Partial<RabbitMQServiceConfig>) {
    const version = config?.version || '3-management-alpine';
    const image = `rabbitmq:${version}`;
    super(engine, image);

    this.rabbitConfig = {
      version,
      port: config?.port || 5672,
      name: config?.name || 'xec-rabbitmq',
      user: config?.user || 'guest',
      password: config?.password || 'guest',
      vhost: config?.vhost || '/',
      management: config?.management ?? true,
      plugins: config?.plugins || [],
      cluster: config?.cluster,
      persistent: config?.persistent ?? false,
      dataPath: config?.dataPath,
      network: config?.network,
      env: config?.env || {},
      config: config?.config || {}
    };

    this.applyConfiguration();
  }

  private applyConfiguration(): void {
    // Container name and ports
    this.name(this.rabbitConfig.name!);
    this.port(this.rabbitConfig.port!, 5672); // AMQP port

    // Management port if enabled
    if (this.rabbitConfig.management) {
      this.port(15672, 15672); // Management UI
    }

    // Clustering ports
    if (this.rabbitConfig.cluster?.enabled) {
      this.port(4369, 4369); // EPMD
      this.port(25672, 25672); // Erlang distribution
    }

    // Network
    if (this.rabbitConfig.network) {
      this.network(this.rabbitConfig.network);
    }

    // Data persistence
    if (this.rabbitConfig.persistent && this.rabbitConfig.dataPath) {
      this.volume(this.rabbitConfig.dataPath, '/var/lib/rabbitmq');
    }

    // Environment variables
    this.env({
      RABBITMQ_DEFAULT_USER: this.rabbitConfig.user!,
      RABBITMQ_DEFAULT_PASS: this.rabbitConfig.password!,
      RABBITMQ_DEFAULT_VHOST: this.rabbitConfig.vhost!,
      ...this.rabbitConfig.env
    });

    // Clustering configuration
    if (this.rabbitConfig.cluster?.enabled) {
      if (this.rabbitConfig.cluster.nodeName) {
        this.addEnv('RABBITMQ_NODENAME', this.rabbitConfig.cluster.nodeName);
      }
      if (this.rabbitConfig.cluster.cookie) {
        this.addEnv('RABBITMQ_ERLANG_COOKIE', this.rabbitConfig.cluster.cookie);
      }
    }

    // Additional configuration
    if (this.rabbitConfig.config) {
      for (const [key, value] of Object.entries(this.rabbitConfig.config)) {
        this.addEnv(`RABBITMQ_${key.toUpperCase()}`, value);
      }
    }

    // Labels
    this.labels({
      service: 'rabbitmq',
      'managed-by': 'xec'
    });

    // Health check
    this.healthcheck(
      'rabbitmq-diagnostics -q ping',
      {
        interval: '10s',
        timeout: '5s',
        retries: 5,
        startPeriod: '30s'
      }
    );
  }

  /**
   * Start RabbitMQ and enable plugins
   */
  override async start(): Promise<void> {
    await super.start();

    // Enable plugins
    if (this.rabbitConfig.plugins && this.rabbitConfig.plugins.length > 0) {
      await this.enablePlugins(this.rabbitConfig.plugins);
    }

    // Enable management plugin by default if management is true
    if (this.rabbitConfig.management && this.rabbitConfig.plugins && !this.rabbitConfig.plugins.includes('rabbitmq_management')) {
      await this.enablePlugin('rabbitmq_management');
    }
  }

  /**
   * Enable RabbitMQ plugin
   */
  async enablePlugin(plugin: string): Promise<void> {
    await this.exec`rabbitmq-plugins enable ${plugin}`;
  }

  /**
   * Enable multiple plugins
   */
  async enablePlugins(plugins: string[]): Promise<void> {
    await this.exec`rabbitmq-plugins enable ${plugins.join(' ')}`;
  }

  /**
   * Disable RabbitMQ plugin
   */
  async disablePlugin(plugin: string): Promise<void> {
    await this.exec`rabbitmq-plugins disable ${plugin}`;
  }

  /**
   * Create vhost
   */
  async createVHost(name: string): Promise<void> {
    await this.exec`rabbitmqctl add_vhost ${name}`;
  }

  /**
   * Delete vhost
   */
  async deleteVHost(name: string): Promise<void> {
    await this.exec`rabbitmqctl delete_vhost ${name}`;
  }

  /**
   * List vhosts
   */
  async listVHosts(): Promise<string[]> {
    const result = await this.exec`rabbitmqctl list_vhosts --quiet`;
    return result.stdout.trim().split('\n').filter(v => v);
  }

  /**
   * Create user
   */
  async createUser(username: string, password: string, tags: string[] = []): Promise<void> {
    await this.exec`rabbitmqctl add_user ${username} ${password}`;
    if (tags.length > 0) {
      await this.exec`rabbitmqctl set_user_tags ${username} ${tags.join(' ')}`;
    }
  }

  /**
   * Delete user
   */
  async deleteUser(username: string): Promise<void> {
    await this.exec`rabbitmqctl delete_user ${username}`;
  }

  /**
   * Set user permissions
   */
  async setPermissions(username: string, vhost: string, configure = '.*', write = '.*', read = '.*'): Promise<void> {
    await this.exec`rabbitmqctl set_permissions -p ${vhost} ${username} "${configure}" "${write}" "${read}"`;
  }

  /**
   * Create exchange
   */
  async createExchange(
    name: string,
    type: 'direct' | 'topic' | 'fanout' | 'headers' = 'direct',
    vhost = '/',
    durable = true,
    autoDelete = false
  ): Promise<void> {
    const durableFlag = durable ? 'true' : 'false';
    const autoDeleteFlag = autoDelete ? 'true' : 'false';
    await this.exec`rabbitmqadmin -V ${vhost} declare exchange name=${name} type=${type} durable=${durableFlag} auto_delete=${autoDeleteFlag}`;
  }

  /**
   * Create queue
   */
  async createQueue(
    name: string,
    vhost = '/',
    durable = true,
    autoDelete = false,
    queueArgs?: Record<string, any>
  ): Promise<void> {
    const durableFlag = durable ? 'true' : 'false';
    const autoDeleteFlag = autoDelete ? 'true' : 'false';
    let cmd = `rabbitmqadmin -V ${vhost} declare queue name=${name} durable=${durableFlag} auto_delete=${autoDeleteFlag}`;

    if (queueArgs) {
      cmd += ` arguments='${JSON.stringify(queueArgs)}'`;
    }

    await this.exec`${cmd}`;
  }

  /**
   * Bind queue to exchange
   */
  async bindQueue(queue: string, exchange: string, routingKey = '', vhost = '/'): Promise<void> {
    await this.exec`rabbitmqadmin -V ${vhost} declare binding source=${exchange} destination=${queue} routing_key=${routingKey}`;
  }

  /**
   * Publish message
   */
  async publishMessage(
    exchange: string,
    routingKey: string,
    message: string,
    vhost = '/',
    properties?: Record<string, any>
  ): Promise<void> {
    let cmd = `rabbitmqadmin -V ${vhost} publish exchange=${exchange} routing_key=${routingKey} payload='${message}'`;

    if (properties) {
      cmd += ` properties='${JSON.stringify(properties)}'`;
    }

    await this.exec`${cmd}`;
  }

  /**
   * Get messages from queue
   */
  async getMessages(queue: string, count = 1, vhost = '/', ack = true): Promise<any[]> {
    const ackMode = ack ? 'ack' : 'nack';
    const result = await this.exec`rabbitmqadmin -V ${vhost} get queue=${queue} count=${count} ackmode=${ackMode} -f json`;

    try {
      return JSON.parse(result.stdout);
    } catch {
      return [];
    }
  }

  /**
   * Get queue info
   */
  async getQueueInfo(queue: string, vhost = '/'): Promise<any> {
    const result = await this.exec`rabbitmqadmin -V ${vhost} show queue name=${queue} -f json`;

    try {
      return JSON.parse(result.stdout)[0];
    } catch {
      return null;
    }
  }

  /**
   * List queues
   */
  async listQueues(vhost = '/'): Promise<string[]> {
    const result = await this.exec`rabbitmqctl list_queues -p ${vhost} name --quiet`;
    return result.stdout.trim().split('\n').filter(q => q);
  }

  /**
   * List exchanges
   */
  async listExchanges(vhost = '/'): Promise<string[]> {
    const result = await this.exec`rabbitmqctl list_exchanges -p ${vhost} name --quiet`;
    return result.stdout.trim().split('\n').filter(e => e && !e.startsWith('amq.'));
  }

  /**
   * Get cluster status
   */
  async getClusterStatus(): Promise<string> {
    const result = await this.exec`rabbitmqctl cluster_status`;
    return result.stdout;
  }

  /**
   * Join cluster
   */
  async joinCluster(nodeName: string): Promise<void> {
    await this.exec`rabbitmqctl stop_app`;
    await this.exec`rabbitmqctl join_cluster rabbit@${nodeName}`;
    await this.exec`rabbitmqctl start_app`;
  }

  /**
   * Leave cluster
   */
  async leaveCluster(): Promise<void> {
    await this.exec`rabbitmqctl stop_app`;
    await this.exec`rabbitmqctl reset`;
    await this.exec`rabbitmqctl start_app`;
  }

  getConnectionString(): string {
    const { user, password, port, vhost } = this.rabbitConfig;
    const vhostPart = vhost && vhost !== '/' ? `/${encodeURIComponent(vhost)}` : '';
    return `amqp://${user}:${password}@localhost:${port}${vhostPart}`;
  }

  getConnectionInfo(): Record<string, any> {
    return {
      host: 'localhost',
      port: this.rabbitConfig.port,
      user: this.rabbitConfig.user,
      password: this.rabbitConfig.password,
      vhost: this.rabbitConfig.vhost,
      managementUrl: this.rabbitConfig.management ? `http://localhost:15672` : null,
      connectionString: this.getConnectionString()
    };
  }

  getManagementUrl(): string | null {
    if (this.rabbitConfig.management) {
      const { user, password } = this.rabbitConfig;
      return `http://${user}:${password}@localhost:15672`;
    }
    return null;
  }
}