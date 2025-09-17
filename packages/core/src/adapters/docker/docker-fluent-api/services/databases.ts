/**
 * Database Service Presets for Docker Fluent API
 */

import { DockerEphemeralFluentAPI } from '../base.js';

import type { ExecutionResult } from '../../../../types/result.js';
import type { ExecutionEngine } from '../../../../core/execution-engine.js';
import type {
  ServiceManager,
  MySQLServiceConfig,
  MongoServiceConfig,
  PostgresServiceConfig
} from '../types.js';

/**
 * PostgreSQL Service Fluent API
 */
export class PostgreSQLFluentAPI extends DockerEphemeralFluentAPI implements ServiceManager {
  private pgConfig: PostgresServiceConfig;

  constructor(engine: ExecutionEngine, config?: Partial<PostgresServiceConfig>) {
    const version = config?.version || '15-alpine';
    const image = `postgres:${version}`;
    super(engine, image);

    this.pgConfig = {
      version,
      port: config?.port || 5432,
      name: config?.name || 'xec-postgres',
      database: config?.database || 'postgres',
      user: config?.user || 'postgres',
      password: config?.password || 'postgres',
      persistent: config?.persistent ?? false,
      dataPath: config?.dataPath,
      network: config?.network,
      env: config?.env || {},
      config: config?.config || {},
      extensions: config?.extensions || [],
      initDb: config?.initDb,
      replication: config?.replication
    };

    this.applyConfiguration();
  }

  private applyConfiguration(): void {
    // Container name and port
    this.name(this.pgConfig.name!);
    this.port(this.pgConfig.port!, 5432);

    // Network
    if (this.pgConfig.network) {
      this.network(this.pgConfig.network);
    }

    // Data persistence
    if (this.pgConfig.persistent && this.pgConfig.dataPath) {
      this.volume(this.pgConfig.dataPath, '/var/lib/postgresql/data');
    }

    // Environment variables
    this.env({
      POSTGRES_DB: this.pgConfig.database!,
      POSTGRES_USER: this.pgConfig.user!,
      POSTGRES_PASSWORD: this.pgConfig.password!,
      ...this.pgConfig.env
    });

    // Init scripts
    if (this.pgConfig.initDb?.scripts) {
      for (const script of this.pgConfig.initDb.scripts) {
        this.volume(script, `/docker-entrypoint-initdb.d/${script.split('/').pop()}`);
      }
    }

    // Labels
    this.labels({
      service: 'postgresql',
      'managed-by': 'xec'
    });

    // Health check
    this.healthcheck(
      `pg_isready -U ${this.pgConfig.user} -d ${this.pgConfig.database}`,
      {
        interval: '10s',
        timeout: '5s',
        retries: 5,
        startPeriod: '30s'
      }
    );

    // Replication configuration
    if (this.pgConfig.replication?.enabled) {
      this.configureReplication();
    }
  }

  private configureReplication(): void {
    if (this.pgConfig.replication?.role === 'master') {
      this.env({
        POSTGRES_REPLICATION_MODE: 'master',
        POSTGRES_REPLICATION_USER: 'replicator',
        POSTGRES_REPLICATION_PASSWORD: this.pgConfig.password!
      });
    } else if (this.pgConfig.replication?.role === 'replica') {
      this.env({
        POSTGRES_REPLICATION_MODE: 'slave',
        POSTGRES_MASTER_HOST: this.pgConfig.replication.masterHost!,
        POSTGRES_REPLICATION_USER: 'replicator',
        POSTGRES_REPLICATION_PASSWORD: this.pgConfig.password!
      });
    }
  }

  async createDatabase(name: string): Promise<void> {
    await this.exec`psql -U ${this.pgConfig.user} -c "CREATE DATABASE ${name};"`;
  }

  async dropDatabase(name: string): Promise<void> {
    await this.exec`psql -U ${this.pgConfig.user} -c "DROP DATABASE IF EXISTS ${name};"`;
  }

  async createUser(username: string, password: string): Promise<void> {
    await this.exec`psql -U ${this.pgConfig.user} -c "CREATE USER ${username} WITH PASSWORD '${password}';"`;
  }

  async grantPrivileges(username: string, database: string): Promise<void> {
    await this.exec`psql -U ${this.pgConfig.user} -c "GRANT ALL PRIVILEGES ON DATABASE ${database} TO ${username};"`;
  }

  async installExtension(extension: string): Promise<void> {
    await this.exec`psql -U ${this.pgConfig.user} -d ${this.pgConfig.database} -c "CREATE EXTENSION IF NOT EXISTS ${extension};"`;
  }

  async backup(backupPath: string): Promise<void> {
    const cmd = `pg_dump -U ${this.pgConfig.user} -d ${this.pgConfig.database} -f /tmp/backup.sql`;
    await this.exec`${cmd}`;
    await this.exec`cp /tmp/backup.sql ${backupPath}`;
  }

  async restore(backupPath: string): Promise<void> {
    await this.exec`psql -U ${this.pgConfig.user} -d ${this.pgConfig.database} -f ${backupPath}`;
  }

  async query(sql: string): Promise<ExecutionResult> {
    return await this.exec`psql -U ${this.pgConfig.user} -d ${this.pgConfig.database} -c "${sql}"`;
  }

  getConnectionString(): string {
    const { user, password, database, port } = this.pgConfig;
    return `postgresql://${user}:${password}@localhost:${port}/${database}`;
  }

  getConnectionInfo(): Record<string, any> {
    return {
      host: 'localhost',
      port: this.pgConfig.port,
      database: this.pgConfig.database,
      user: this.pgConfig.user,
      password: this.pgConfig.password,
      connectionString: this.getConnectionString()
    };
  }
}

/**
 * MySQL Service Fluent API
 */
export class MySQLFluentAPI extends DockerEphemeralFluentAPI implements ServiceManager {
  private mysqlConfig: MySQLServiceConfig;

  constructor(engine: ExecutionEngine, config?: Partial<MySQLServiceConfig>) {
    const version = config?.version || '8-oracle';
    const image = `mysql:${version}`;
    super(engine, image);

    this.mysqlConfig = {
      version,
      port: config?.port || 3306,
      name: config?.name || 'xec-mysql',
      database: config?.database || 'mysql',
      user: config?.user || 'mysql',
      password: config?.password || 'mysql',
      rootPassword: config?.rootPassword || 'root',
      persistent: config?.persistent ?? false,
      dataPath: config?.dataPath,
      network: config?.network,
      charset: config?.charset || 'utf8mb4',
      collation: config?.collation || 'utf8mb4_unicode_ci',
      env: config?.env || {},
      config: config?.config || {},
      initScripts: config?.initScripts || [],
      replication: config?.replication
    };

    this.applyConfiguration();
  }

  private applyConfiguration(): void {
    // Container name and port
    this.name(this.mysqlConfig.name!);
    this.port(this.mysqlConfig.port!, 3306);

    // Network
    if (this.mysqlConfig.network) {
      this.network(this.mysqlConfig.network);
    }

    // Data persistence
    if (this.mysqlConfig.persistent && this.mysqlConfig.dataPath) {
      this.volume(this.mysqlConfig.dataPath, '/var/lib/mysql');
    }

    // Environment variables
    this.env({
      MYSQL_ROOT_PASSWORD: this.mysqlConfig.rootPassword!,
      MYSQL_DATABASE: this.mysqlConfig.database!,
      MYSQL_USER: this.mysqlConfig.user!,
      MYSQL_PASSWORD: this.mysqlConfig.password!,
      ...this.mysqlConfig.env
    });

    // Init scripts
    if (this.mysqlConfig.initScripts && this.mysqlConfig.initScripts.length > 0) {
      for (const script of this.mysqlConfig.initScripts) {
        this.volume(script, `/docker-entrypoint-initdb.d/${script.split('/').pop()}`);
      }
    }

    // Custom config
    if (this.mysqlConfig.config && Object.keys(this.mysqlConfig.config).length > 0) {
      const configArgs = Object.entries(this.mysqlConfig.config)
        .map(([key, value]) => `--${key}=${value}`)
        .join(' ');
      this.command(`mysqld ${configArgs}`);
    }

    // Labels
    this.labels({
      service: 'mysql',
      'managed-by': 'xec'
    });

    // Health check
    this.healthcheck(
      `mysqladmin ping -h localhost -u root -p${this.mysqlConfig.rootPassword}`,
      {
        interval: '10s',
        timeout: '5s',
        retries: 5,
        startPeriod: '30s'
      }
    );

    // Replication configuration
    if (this.mysqlConfig.replication?.enabled) {
      this.configureReplication();
    }
  }

  private configureReplication(): void {
    if (this.mysqlConfig.replication?.role === 'master') {
      this.env({
        MYSQL_REPLICATION_MODE: 'master',
        MYSQL_REPLICATION_USER: 'replicator',
        MYSQL_REPLICATION_PASSWORD: this.mysqlConfig.password!,
        MYSQL_SERVER_ID: String(this.mysqlConfig.replication.masterId || 1)
      });
    } else if (this.mysqlConfig.replication?.role === 'slave') {
      this.env({
        MYSQL_REPLICATION_MODE: 'slave',
        MYSQL_MASTER_HOST: 'mysql-master',
        MYSQL_REPLICATION_USER: 'replicator',
        MYSQL_REPLICATION_PASSWORD: this.mysqlConfig.password!,
        MYSQL_SERVER_ID: String(this.mysqlConfig.replication.slaveId || 2)
      });
    }
  }

  async createDatabase(name: string): Promise<void> {
    await this.exec`mysql -u root -p${this.mysqlConfig.rootPassword} -e "CREATE DATABASE IF NOT EXISTS ${name};"`;
  }

  async dropDatabase(name: string): Promise<void> {
    await this.exec`mysql -u root -p${this.mysqlConfig.rootPassword} -e "DROP DATABASE IF EXISTS ${name};"`;
  }

  async createUser(username: string, password: string, host = '%'): Promise<void> {
    await this.exec`mysql -u root -p${this.mysqlConfig.rootPassword} -e "CREATE USER '${username}'@'${host}' IDENTIFIED BY '${password}';"`;
  }

  async grantPrivileges(username: string, database: string, host = '%'): Promise<void> {
    await this.exec`mysql -u root -p${this.mysqlConfig.rootPassword} -e "GRANT ALL PRIVILEGES ON ${database}.* TO '${username}'@'${host}'; FLUSH PRIVILEGES;"`;
  }

  async backup(backupPath: string): Promise<void> {
    const cmd = `mysqldump -u root -p${this.mysqlConfig.rootPassword} --all-databases > /tmp/backup.sql`;
    await this.exec`sh -c "${cmd}"`;
    await this.exec`cp /tmp/backup.sql ${backupPath}`;
  }

  async restore(backupPath: string): Promise<void> {
    const cmd = `mysql -u root -p${this.mysqlConfig.rootPassword} < ${backupPath}`;
    await this.exec`sh -c "${cmd}"`;
  }

  async query(sql: string, database?: string): Promise<ExecutionResult> {
    const db = database || this.mysqlConfig.database;
    return await this.exec`mysql -u root -p${this.mysqlConfig.rootPassword} -D ${db} -e "${sql}"`;
  }

  getConnectionString(): string {
    const { user, password, database, port } = this.mysqlConfig;
    return `mysql://${user}:${password}@localhost:${port}/${database}`;
  }

  getConnectionInfo(): Record<string, any> {
    return {
      host: 'localhost',
      port: this.mysqlConfig.port,
      database: this.mysqlConfig.database,
      user: this.mysqlConfig.user,
      password: this.mysqlConfig.password,
      rootPassword: this.mysqlConfig.rootPassword,
      connectionString: this.getConnectionString()
    };
  }
}

/**
 * MongoDB Service Fluent API
 */
export class MongoDBFluentAPI extends DockerEphemeralFluentAPI implements ServiceManager {
  private mongoConfig: MongoServiceConfig;

  constructor(engine: ExecutionEngine, config?: Partial<MongoServiceConfig>) {
    const version = config?.version || '6';
    const image = `mongo:${version}`;
    super(engine, image);

    this.mongoConfig = {
      version,
      port: config?.port || 27017,
      name: config?.name || 'xec-mongodb',
      database: config?.database || 'test',
      user: config?.user,
      password: config?.password,
      rootUser: config?.rootUser || 'admin',
      rootPassword: config?.rootPassword || 'admin',
      persistent: config?.persistent ?? false,
      dataPath: config?.dataPath,
      network: config?.network,
      replicaSet: config?.replicaSet,
      sharding: config?.sharding ?? false,
      configServer: config?.configServer ?? false,
      shardServer: config?.shardServer ?? false,
      arbiter: config?.arbiter ?? false,
      env: config?.env || {},
      config: config?.config || {},
      initScripts: config?.initScripts || []
    };

    this.applyConfiguration();
  }

  private applyConfiguration(): void {
    // Container name and port
    this.name(this.mongoConfig.name!);
    this.port(this.mongoConfig.port!, 27017);

    // Network
    if (this.mongoConfig.network) {
      this.network(this.mongoConfig.network);
    }

    // Data persistence
    if (this.mongoConfig.persistent && this.mongoConfig.dataPath) {
      this.volume(this.mongoConfig.dataPath, '/data/db');
    }

    // Environment variables
    const envVars: Record<string, string> = {
      ...this.mongoConfig.env
    };

    if (this.mongoConfig.rootUser && this.mongoConfig.rootPassword) {
      envVars['MONGO_INITDB_ROOT_USERNAME'] = this.mongoConfig.rootUser;
      envVars['MONGO_INITDB_ROOT_PASSWORD'] = this.mongoConfig.rootPassword;
    }

    if (this.mongoConfig.database) {
      envVars['MONGO_INITDB_DATABASE'] = this.mongoConfig.database;
    }

    this.env(envVars);

    // Init scripts
    if (this.mongoConfig.initScripts && this.mongoConfig.initScripts.length > 0) {
      for (const script of this.mongoConfig.initScripts) {
        this.volume(script, `/docker-entrypoint-initdb.d/${script.split('/').pop()}`);
      }
    }

    // Command arguments for replica set, sharding, etc.
    const cmdArgs: string[] = ['mongod'];

    if (this.mongoConfig.replicaSet) {
      cmdArgs.push('--replSet', this.mongoConfig.replicaSet);
    }

    if (this.mongoConfig.sharding) {
      cmdArgs.push('--shardsvr');
    }

    if (this.mongoConfig.configServer) {
      cmdArgs.push('--configsvr');
    }

    if (this.mongoConfig.arbiter) {
      cmdArgs.push('--arbiter');
    }

    // Add custom config options
    if (this.mongoConfig.config) {
      for (const [key, value] of Object.entries(this.mongoConfig.config)) {
        cmdArgs.push(`--${key}`, value);
      }
    }

    if (cmdArgs.length > 1) {
      this.command(cmdArgs);
    }

    // Labels
    this.labels({
      service: 'mongodb',
      'managed-by': 'xec'
    });

    // Health check
    this.healthcheck(
      'mongosh --eval "db.adminCommand(\'ping\')"',
      {
        interval: '10s',
        timeout: '5s',
        retries: 5,
        startPeriod: '30s'
      }
    );
  }

  async createDatabase(name: string): Promise<void> {
    const authStr = this.getAuthString();
    await this.exec`mongosh ${authStr} --eval "use ${name}; db.createCollection('_init')"`;
  }

  async createUser(username: string, password: string, database: string, roles: string[] = ['readWrite']): Promise<void> {
    const authStr = this.getAuthString();
    const rolesJson = JSON.stringify(roles.map(r => ({ role: r, db: database })));
    await this.exec`mongosh ${authStr} --eval "use ${database}; db.createUser({user: '${username}', pwd: '${password}', roles: ${rolesJson})"`;
  }

  async createCollection(database: string, collection: string): Promise<void> {
    const authStr = this.getAuthString();
    await this.exec`mongosh ${authStr} --eval "use ${database}; db.createCollection('${collection}')"`;
  }

  async insertDocument(database: string, collection: string, document: Record<string, any>): Promise<void> {
    const authStr = this.getAuthString();
    const docJson = JSON.stringify(document);
    await this.exec`mongosh ${authStr} --eval "use ${database}; db.${collection}.insertOne(${docJson})"`;
  }

  async find(database: string, collection: string, query: Record<string, any> = {}): Promise<ExecutionResult> {
    const authStr = this.getAuthString();
    const queryJson = JSON.stringify(query);
    return await this.exec`mongosh ${authStr} --eval "use ${database}; db.${collection}.find(${queryJson})"`;
  }

  async backup(backupPath: string): Promise<void> {
    const authStr = this.mongoConfig.rootUser && this.mongoConfig.rootPassword
      ? `-u ${this.mongoConfig.rootUser} -p ${this.mongoConfig.rootPassword} --authenticationDatabase admin`
      : '';
    await this.exec`mongodump ${authStr} --out /tmp/backup`;
    await this.exec`tar -czf ${backupPath} -C /tmp backup`;
  }

  async restore(backupPath: string): Promise<void> {
    const authStr = this.mongoConfig.rootUser && this.mongoConfig.rootPassword
      ? `-u ${this.mongoConfig.rootUser} -p ${this.mongoConfig.rootPassword} --authenticationDatabase admin`
      : '';
    await this.exec`tar -xzf ${backupPath} -C /tmp`;
    await this.exec`mongorestore ${authStr} /tmp/backup`;
  }

  async initReplicaSet(): Promise<void> {
    if (!this.mongoConfig.replicaSet) {
      throw new Error('Replica set name not configured');
    }

    const config = {
      _id: this.mongoConfig.replicaSet,
      members: [
        { _id: 0, host: `${this.mongoConfig.name}:27017` }
      ]
    };

    const authStr = this.getAuthString();
    await this.exec`mongosh ${authStr} --eval "rs.initiate(${JSON.stringify(config)})"`;
  }

  async addReplicaSetMember(host: string, priority = 1): Promise<void> {
    const authStr = this.getAuthString();
    await this.exec`mongosh ${authStr} --eval "rs.add({host: '${host}', priority: ${priority}})"`;
  }

  private getAuthString(): string {
    if (this.mongoConfig.rootUser && this.mongoConfig.rootPassword) {
      return `-u ${this.mongoConfig.rootUser} -p ${this.mongoConfig.rootPassword} --authenticationDatabase admin`;
    }
    return '';
  }

  getConnectionString(): string {
    const { rootUser, rootPassword, port, database, replicaSet } = this.mongoConfig;
    let connStr = 'mongodb://';

    if (rootUser && rootPassword) {
      connStr += `${rootUser}:${rootPassword}@`;
    }

    connStr += `localhost:${port}/${database || 'admin'}`;

    if (replicaSet) {
      connStr += `?replicaSet=${replicaSet}`;
    }

    return connStr;
  }

  getConnectionInfo(): Record<string, any> {
    return {
      host: 'localhost',
      port: this.mongoConfig.port,
      database: this.mongoConfig.database,
      user: this.mongoConfig.rootUser,
      password: this.mongoConfig.rootPassword,
      replicaSet: this.mongoConfig.replicaSet,
      connectionString: this.getConnectionString()
    };
  }
}