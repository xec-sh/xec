/**
 * Database Service Presets for the Docker Fluent API
 */

import type {
  ServiceManager,
  ExecutionEngine,
  ExecutionResult
} from '@xec-sh/core';
import type {
  MySQLServiceConfig,
  MongoServiceConfig,
  PostgresServiceConfig
} from './types.js';

import { quoteForShell, DockerEphemeralFluentAPI } from '@xec-sh/core';

import { dataVolumeFor } from './types.js';
import { jsLiteral, pgLiteral, pgIdentifier, mysqlLiteral, mysqlIdentifier } from './sql-quote.js';

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
    const pgVolume = dataVolumeFor(this.pgConfig, 'xec-postgres');
    if (pgVolume) {
      this.volume(pgVolume, '/var/lib/postgresql/data');
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

  // Each statement is built with the value quoted for SQL, then handed to
  // psql as one argument. It used to be concatenated into the template
  // between literal double quotes, which was wrong twice over: the shell
  // escaping the tag applies landed *inside* those quotes, so any value with
  // a space produced `command not found`; and a name carrying `'` or `;`
  // ended the statement and began another.
  async createDatabase(name: string): Promise<void> {
    await this.exec`psql -U ${this.pgConfig.user} -c ${`CREATE DATABASE ${pgIdentifier(name)};`}`;
  }

  async dropDatabase(name: string): Promise<void> {
    await this.exec`psql -U ${this.pgConfig.user} -c ${`DROP DATABASE IF EXISTS ${pgIdentifier(name)};`}`;
  }

  async createUser(username: string, password: string): Promise<void> {
    await this.exec`psql -U ${this.pgConfig.user} -c ${
      `CREATE USER ${pgIdentifier(username)} WITH PASSWORD ${pgLiteral(password)};`}`;
  }

  async grantPrivileges(username: string, database: string): Promise<void> {
    await this.exec`psql -U ${this.pgConfig.user} -c ${
      `GRANT ALL PRIVILEGES ON DATABASE ${pgIdentifier(database)} TO ${pgIdentifier(username)};`}`;
  }

  async installExtension(extension: string): Promise<void> {
    await this.exec`psql -U ${this.pgConfig.user} -d ${this.pgConfig.database} -c ${
      `CREATE EXTENSION IF NOT EXISTS ${pgIdentifier(extension)};`}`;
  }

  async backup(backupPath: string): Promise<void> {
    const cmd = `pg_dump -U ${this.pgConfig.user} -d ${this.pgConfig.database} -f /tmp/backup.sql`;
    await this.exec`${cmd}`;
    await this.exec`cp /tmp/backup.sql ${backupPath}`;
  }

  async restore(backupPath: string): Promise<void> {
    await this.exec`psql -U ${this.pgConfig.user} -d ${this.pgConfig.database} -f ${backupPath}`;
  }

  /**
   * Run a statement the caller composed.
   *
   * The SQL is theirs and is passed through unchanged — quote anything you
   * interpolate into it, or use a driver with bound parameters. What this
   * guarantees is only that the statement reaches psql as one argument.
   */
  async query(sql: string): Promise<ExecutionResult> {
    return await this.exec`psql -U ${this.pgConfig.user} -d ${this.pgConfig.database} -c ${sql}`;
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
    const mysqlVolume = dataVolumeFor(this.mysqlConfig, 'xec-mysql');
    if (mysqlVolume) {
      this.volume(mysqlVolume, '/var/lib/mysql');
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
    await this.mysqlExec(`CREATE DATABASE IF NOT EXISTS ${mysqlIdentifier(name)};`);
  }

  async dropDatabase(name: string): Promise<void> {
    await this.mysqlExec(`DROP DATABASE IF EXISTS ${mysqlIdentifier(name)};`);
  }

  async createUser(username: string, password: string, host = '%'): Promise<void> {
    await this.mysqlExec(
      `CREATE USER ${mysqlLiteral(username)}@${mysqlLiteral(host)} ` +
      `IDENTIFIED BY ${mysqlLiteral(password)};`
    );
  }

  async grantPrivileges(username: string, database: string, host = '%'): Promise<void> {
    await this.mysqlExec(
      `GRANT ALL PRIVILEGES ON ${mysqlIdentifier(database)}.* ` +
      `TO ${mysqlLiteral(username)}@${mysqlLiteral(host)}; FLUSH PRIVILEGES;`
    );
  }

  async backup(backupPath: string): Promise<void> {
    // The redirect is shell syntax, so the shell has to see it — but the
    // password must not. It goes in the environment, where `mysqldump`
    // reads it without it appearing on any command line.
    await this.exec`sh -c ${'mysqldump -u root --all-databases > /tmp/backup.sql'}`
      .env({ MYSQL_PWD: this.mysqlConfig.rootPassword ?? '' });
    await this.exec`cp /tmp/backup.sql ${backupPath}`;
  }

  async restore(backupPath: string): Promise<void> {
    await this.exec`sh -c ${`mysql -u root < ${quoteForShell(backupPath, 'posix')}`}`
      .env({ MYSQL_PWD: this.mysqlConfig.rootPassword ?? '' });
  }

  /**
   * Run a statement the caller composed.
   *
   * The SQL is theirs and is passed through unchanged — quote anything you
   * interpolate into it. What this guarantees is only that the statement
   * reaches mysql as one argument.
   */
  async query(sql: string, database?: string): Promise<ExecutionResult> {
    const db = database || this.mysqlConfig.database;
    return await this.exec`mysql -u root -D ${db} -e ${sql}`
      .env({ MYSQL_PWD: this.mysqlConfig.rootPassword ?? '' });
  }

  /**
   * Issue an administrative statement.
   *
   * `-p<password>` on the command line is visible in the container's
   * process list to anything that can read /proc; `MYSQL_PWD` is not.
   */
  private mysqlExec(sql: string): Promise<ExecutionResult> {
    return this.exec`mysql -u root -e ${sql}`
      .env({ MYSQL_PWD: this.mysqlConfig.rootPassword ?? '' });
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
    const mongoVolume = dataVolumeFor(this.mongoConfig, 'xec-mongodb');
    if (mongoVolume) {
      this.volume(mongoVolume, '/data/db');
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
    await this.mongoEval(name, `db.createCollection(${jsLiteral('_init')});`);
  }

  async createUser(username: string, password: string, database: string, roles: string[] = ['readWrite']): Promise<void> {
    // The old statement was also missing a closing brace, so it could never
    // have parsed even with a benign name.
    await this.mongoEval(database, `db.createUser({user: ${jsLiteral(username)}, ` +
      `pwd: ${jsLiteral(password)}, roles: ${jsLiteral(roles.map(r => ({ role: r, db: database })))}});`);
  }

  async createCollection(database: string, collection: string): Promise<void> {
    await this.mongoEval(database, `db.createCollection(${jsLiteral(collection)});`);
  }

  async insertDocument(database: string, collection: string, document: Record<string, any>): Promise<void> {
    await this.mongoEval(database,
      `db.getCollection(${jsLiteral(collection)}).insertOne(${jsLiteral(document)});`);
  }

  async find(database: string, collection: string, query: Record<string, any> = {}): Promise<ExecutionResult> {
    return await this.mongoEval(database,
      `db.getCollection(${jsLiteral(collection)}).find(${jsLiteral(query)});`);
  }

  async backup(backupPath: string): Promise<void> {
    await this.exec`mongodump ${this.getAuthArgs()} --out /tmp/backup`;
    await this.exec`tar -czf ${backupPath} -C /tmp backup`;
  }

  async restore(backupPath: string): Promise<void> {
    await this.exec`tar -xzf ${backupPath} -C /tmp`;
    await this.exec`mongorestore ${this.getAuthArgs()} /tmp/backup`;
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

    await this.exec`mongosh ${this.getAuthArgs()} --eval ${`rs.initiate(${jsLiteral(config)});`}`;
  }

  async addReplicaSetMember(host: string, priority = 1): Promise<void> {
    await this.exec`mongosh ${this.getAuthArgs()} --eval ${
      `rs.add({host: ${jsLiteral(host)}, priority: ${jsLiteral(priority)}});`}`;
  }

  /**
   * The authentication flags, as separate arguments.
   *
   * A single string of flags is interpolated as one value and quoted as
   * one, so mongosh received `'-u root -p secret --authenticationDatabase
   * admin'` as a single argument and rejected it. An array is expanded into
   * separate arguments, each escaped on its own.
   */
  private getAuthArgs(): string[] {
    if (this.mongoConfig.rootUser && this.mongoConfig.rootPassword) {
      return ['-u', this.mongoConfig.rootUser, '-p', this.mongoConfig.rootPassword,
              '--authenticationDatabase', 'admin'];
    }
    return [];
  }

  /**
   * Run a script against a database.
   *
   * The script is JavaScript, so every value going into it is rendered with
   * `JSON.stringify` and every collection is reached through
   * `getCollection`, which takes a name rather than being part of the
   * syntax. Concatenating names into the source let one close a string and
   * continue with statements of its own.
   */
  private mongoEval(database: string, script: string): Promise<ExecutionResult> {
    return this.exec`mongosh ${this.getAuthArgs()} --eval ${
      `db = db.getSiblingDB(${jsLiteral(database)}); ${script}`}`;
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
