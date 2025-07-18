/**
 * Database Connector for Xec Core
 * Provides unified interface for connecting to various databases
 */

import { EventEmitter } from 'events';

import { createModuleLogger } from '../utils/logger.js';
import { SecretManager, getSecretManager } from '../security/secrets.js';

const logger = createModuleLogger('database-connector');

export type DatabaseType = 'postgres' | 'mysql' | 'mongodb' | 'redis' | 'sqlite' | 'mssql';

export interface DatabaseConfig {
  type: DatabaseType;
  connection: {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    secretRef?: string; // Reference to connection details in SecretManager
    ssl?: boolean | {
      ca?: string;
      cert?: string;
      key?: string;
    };
    // SQLite specific
    filename?: string;
    // MongoDB specific
    uri?: string;
    authSource?: string;
    // Connection pool settings
    poolMin?: number;
    poolMax?: number;
    poolIdleTimeout?: number;
  };
  options?: Record<string, any>;
  hooks?: {
    beforeConnect?: () => Promise<void>;
    afterConnect?: () => Promise<void>;
    beforeQuery?: (query: string, params?: any[]) => Promise<void>;
    afterQuery?: (query: string, result: any) => Promise<void>;
    onError?: (error: Error) => Promise<void>;
  };
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  fields?: Array<{ name: string; dataType: string }>;
  executionTime?: number;
}

export interface Transaction {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export abstract class DatabaseConnector extends EventEmitter {
  protected config: DatabaseConfig;
  protected connected: boolean = false;
  protected connectionPool: any;
  protected secretManager: SecretManager;

  constructor(config: DatabaseConfig) {
    super();
    this.config = config;
    this.secretManager = getSecretManager();
  }

  /**
   * Connect to database
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnect from database
   */
  abstract disconnect(): Promise<void>;

  /**
   * Execute a query
   */
  abstract query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;

  /**
   * Begin a transaction
   */
  abstract beginTransaction(): Promise<Transaction>;

  /**
   * Test connection
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Get connection from pool
   */
  protected abstract getConnection(): Promise<any>;

  /**
   * Release connection back to pool
   */
  protected abstract releaseConnection(connection: any): Promise<void>;

  /**
   * Get connection configuration with secrets resolved
   */
  protected async getConnectionConfig(): Promise<DatabaseConfig['connection']> {
    const { connection } = this.config;
    let config = { ...connection };

    // Resolve secrets if needed
    if (connection.secretRef) {
      const secret = await this.secretManager.get(connection.secretRef);
      if (typeof secret === 'object' && secret !== null) {
        config = { ...config, ...(secret as DatabaseConfig['connection']) };
      }
    }

    return config;
  }

  /**
   * Execute query with hooks
   */
  protected async executeQuery<T>(
    queryFn: () => Promise<QueryResult<T>>,
    sql: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();

    try {
      // Before query hook
      if (this.config.hooks?.beforeQuery) {
        await this.config.hooks.beforeQuery(sql, params);
      }

      // Execute query
      const result = await queryFn();
      result.executionTime = Date.now() - startTime;

      // After query hook
      if (this.config.hooks?.afterQuery) {
        await this.config.hooks.afterQuery(sql, result);
      }

      this.emit('query', { sql, params, result, executionTime: result.executionTime });
      return result;

    } catch (error: any) {
      // Error hook
      if (this.config.hooks?.onError) {
        await this.config.hooks.onError(error);
      }

      logger.error('Database query failed', {
        error: error.message,
        sql,
        params
      });

      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get database type
   */
  getType(): DatabaseType {
    return this.config.type;
  }
}

/**
 * PostgreSQL Connector
 */
export class PostgresConnector extends DatabaseConnector {
  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      // Before connect hook
      if (this.config.hooks?.beforeConnect) {
        await this.config.hooks.beforeConnect();
      }

      const config = await this.getConnectionConfig();
      
      // Mock connection for now
      // In real implementation, would use pg library
      logger.info(`Connecting to PostgreSQL at ${config.host}:${config.port || 5432}`);
      
      this.connected = true;

      // After connect hook
      if (this.config.hooks?.afterConnect) {
        await this.config.hooks.afterConnect();
      }

      this.emit('connected');
    } catch (error: any) {
      logger.error('Failed to connect to PostgreSQL', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      // Mock disconnection
      logger.info('Disconnecting from PostgreSQL');
      this.connected = false;
      this.emit('disconnected');
    } catch (error: any) {
      logger.error('Failed to disconnect from PostgreSQL', error);
      throw error;
    }
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.connected) {
      throw new Error('Not connected to database');
    }

    return this.executeQuery(async () => {
      // Mock query execution
      logger.debug('Executing PostgreSQL query', { sql, params });
      
      return {
        rows: [] as T[],
        rowCount: 0,
        fields: []
      };
    }, sql, params);
  }

  async beginTransaction(): Promise<Transaction> {
    if (!this.connected) {
      throw new Error('Not connected to database');
    }

    const connection = await this.getConnection();

    return {
      query: async <T = any>(sql: string, params?: any[]) => this.query<T>(sql, params),
      commit: async () => {
        logger.debug('Committing transaction');
        await this.releaseConnection(connection);
      },
      rollback: async () => {
        logger.debug('Rolling back transaction');
        await this.releaseConnection(connection);
      }
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  protected async getConnection(): Promise<any> {
    // Mock connection from pool
    return {};
  }

  protected async releaseConnection(connection: any): Promise<void> {
    // Mock releasing connection
  }
}

/**
 * MySQL Connector
 */
export class MySQLConnector extends DatabaseConnector {
  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      const config = await this.getConnectionConfig();
      logger.info(`Connecting to MySQL at ${config.host}:${config.port || 3306}`);
      this.connected = true;
      this.emit('connected');
    } catch (error: any) {
      logger.error('Failed to connect to MySQL', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    
    logger.info('Disconnecting from MySQL');
    this.connected = false;
    this.emit('disconnected');
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.connected) {
      throw new Error('Not connected to database');
    }

    return this.executeQuery(async () => ({
      rows: [] as T[],
      rowCount: 0,
      fields: []
    }), sql, params);
  }

  async beginTransaction(): Promise<Transaction> {
    if (!this.connected) {
      throw new Error('Not connected to database');
    }

    return {
      query: async <T = any>(sql: string, params?: any[]) => this.query<T>(sql, params),
      commit: async () => logger.debug('Committing MySQL transaction'),
      rollback: async () => logger.debug('Rolling back MySQL transaction')
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  protected async getConnection(): Promise<any> {
    return {};
  }

  protected async releaseConnection(connection: any): Promise<void> {}
}

/**
 * MongoDB Connector
 */
export class MongoDBConnector extends DatabaseConnector {
  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      const config = await this.getConnectionConfig();
      const uri = config.uri || `mongodb://${config.host}:${config.port || 27017}/${config.database}`;
      logger.info(`Connecting to MongoDB at ${uri}`);
      this.connected = true;
      this.emit('connected');
    } catch (error: any) {
      logger.error('Failed to connect to MongoDB', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    
    logger.info('Disconnecting from MongoDB');
    this.connected = false;
    this.emit('disconnected');
  }

  async query<T = any>(query: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.connected) {
      throw new Error('Not connected to database');
    }

    // MongoDB uses different query syntax, this is just for compatibility
    return this.executeQuery(async () => ({
      rows: [] as T[],
      rowCount: 0
    }), query, params);
  }

  async beginTransaction(): Promise<Transaction> {
    // MongoDB transactions work differently
    return {
      query: async <T = any>(query: string, params?: any[]) => this.query<T>(query, params),
      commit: async () => logger.debug('MongoDB session ended'),
      rollback: async () => logger.debug('MongoDB session aborted')
    };
  }

  async testConnection(): Promise<boolean> {
    return this.connected;
  }

  protected async getConnection(): Promise<any> {
    return {};
  }

  protected async releaseConnection(connection: any): Promise<void> {}

  // MongoDB-specific methods
  async find<T = any>(collection: string, filter: any, options?: any): Promise<T[]> {
    if (!this.connected) {
      throw new Error('Not connected to database');
    }

    logger.debug('MongoDB find', { collection, filter, options });
    return [];
  }

  async insertOne<T = any>(collection: string, document: T): Promise<{ insertedId: string }> {
    if (!this.connected) {
      throw new Error('Not connected to database');
    }

    logger.debug('MongoDB insertOne', { collection, document });
    return { insertedId: 'mock-id' };
  }

  async updateOne<T = any>(collection: string, filter: any, update: any): Promise<{ modifiedCount: number }> {
    if (!this.connected) {
      throw new Error('Not connected to database');
    }

    logger.debug('MongoDB updateOne', { collection, filter, update });
    return { modifiedCount: 0 };
  }

  async deleteOne(collection: string, filter: any): Promise<{ deletedCount: number }> {
    if (!this.connected) {
      throw new Error('Not connected to database');
    }

    logger.debug('MongoDB deleteOne', { collection, filter });
    return { deletedCount: 0 };
  }
}

/**
 * Redis Connector
 */
export class RedisConnector extends DatabaseConnector {
  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      const config = await this.getConnectionConfig();
      logger.info(`Connecting to Redis at ${config.host}:${config.port || 6379}`);
      this.connected = true;
      this.emit('connected');
    } catch (error: any) {
      logger.error('Failed to connect to Redis', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    
    logger.info('Disconnecting from Redis');
    this.connected = false;
    this.emit('disconnected');
  }

  async query<T = any>(command: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.connected) {
      throw new Error('Not connected to database');
    }

    // Redis uses commands, not SQL
    return this.executeQuery(async () => ({
      rows: [] as T[],
      rowCount: 0
    }), command, params);
  }

  async beginTransaction(): Promise<Transaction> {
    // Redis transactions use MULTI/EXEC
    return {
      query: async <T = any>(command: string, params?: any[]) => this.query<T>(command, params),
      commit: async () => logger.debug('Redis EXEC'),
      rollback: async () => logger.debug('Redis DISCARD')
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.ping();
      return true;
    } catch {
      return false;
    }
  }

  protected async getConnection(): Promise<any> {
    return {};
  }

  protected async releaseConnection(connection: any): Promise<void> {}

  // Redis-specific methods
  async get(key: string): Promise<string | null> {
    if (!this.connected) {
      throw new Error('Not connected to database');
    }

    logger.debug('Redis GET', { key });
    return null;
  }

  async set(key: string, value: string, options?: { ex?: number; px?: number }): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to database');
    }

    logger.debug('Redis SET', { key, value, options });
  }

  async del(key: string): Promise<number> {
    if (!this.connected) {
      throw new Error('Not connected to database');
    }

    logger.debug('Redis DEL', { key });
    return 0;
  }

  async ping(): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to database');
    }

    logger.debug('Redis PING');
  }
}

/**
 * Database connector factory
 */
export function createDatabaseConnector(config: DatabaseConfig): DatabaseConnector {
  switch (config.type) {
    case 'postgres':
      return new PostgresConnector(config);
    case 'mysql':
      return new MySQLConnector(config);
    case 'mongodb':
      return new MongoDBConnector(config);
    case 'redis':
      return new RedisConnector(config);
    default:
      throw new Error(`Unsupported database type: ${config.type}`);
  }
}

/**
 * Connection pool manager
 */
export class ConnectionPoolManager {
  private pools: Map<string, DatabaseConnector> = new Map();

  /**
   * Get or create connection pool
   */
  async getPool(name: string, config: DatabaseConfig): Promise<DatabaseConnector> {
    let pool = this.pools.get(name);

    if (!pool) {
      pool = createDatabaseConnector(config);
      await pool.connect();
      this.pools.set(name, pool);
    }

    return pool;
  }

  /**
   * Close pool
   */
  async closePool(name: string): Promise<void> {
    const pool = this.pools.get(name);
    if (pool) {
      await pool.disconnect();
      this.pools.delete(name);
    }
  }

  /**
   * Close all pools
   */
  async closeAll(): Promise<void> {
    for (const [name, pool] of this.pools) {
      await pool.disconnect();
    }
    this.pools.clear();
  }
}

// Global pool manager
export const poolManager = new ConnectionPoolManager();