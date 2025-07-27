export interface ConnectionPoolMetrics {
  activeConnections: number;
  idleConnections: number;
  totalConnections: number;
  connectionsCreated: number;
  connectionsDestroyed: number;
  connectionsFailed: number;
  reuseCount: number;
  averageIdleTime: number;
  averageUseCount: number;
  lastCleanup: Date | null;
}

export interface PooledConnectionMetrics {
  created: Date;
  lastUsed: Date;
  useCount: number;
  isAlive: boolean;
  errors: number;
}

export class ConnectionPoolMetricsCollector {
  private connectionsCreated = 0;
  private connectionsDestroyed = 0;
  private connectionsFailed = 0;
  private reuseCount = 0;
  private lastCleanup: Date | null = null;

  onConnectionCreated(): void {
    this.connectionsCreated++;
  }

  onConnectionDestroyed(): void {
    this.connectionsDestroyed++;
  }

  onConnectionFailed(): void {
    this.connectionsFailed++;
  }

  onConnectionReused(): void {
    this.reuseCount++;
  }

  onCleanup(): void {
    this.lastCleanup = new Date();
  }

  getMetrics(poolSize: number, connections: Map<string, PooledConnectionMetrics>): ConnectionPoolMetrics {
    const activeConnections = Array.from(connections.values()).filter(c => c.isAlive).length;
    const idleConnections = poolSize - activeConnections;
    
    const now = Date.now();
    let totalIdleTime = 0;
    let totalUseCount = 0;
    
    for (const conn of connections.values()) {
      if (conn.isAlive) {
        totalIdleTime += now - conn.lastUsed.getTime();
        totalUseCount += conn.useCount;
      }
    }
    
    const averageIdleTime = activeConnections > 0 ? totalIdleTime / activeConnections : 0;
    const averageUseCount = activeConnections > 0 ? totalUseCount / activeConnections : 0;

    return {
      activeConnections,
      idleConnections,
      totalConnections: poolSize,
      connectionsCreated: this.connectionsCreated,
      connectionsDestroyed: this.connectionsDestroyed,
      connectionsFailed: this.connectionsFailed,
      reuseCount: this.reuseCount,
      averageIdleTime,
      averageUseCount,
      lastCleanup: this.lastCleanup
    };
  }

  reset(): void {
    this.connectionsCreated = 0;
    this.connectionsDestroyed = 0;
    this.connectionsFailed = 0;
    this.reuseCount = 0;
    this.lastCleanup = null;
  }
}