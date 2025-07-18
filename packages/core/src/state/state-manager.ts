import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { Ledger } from './ledger.js';
import { EventStore } from './event-store.js';
import { StateStore } from './state-store.js';
import { LockManager } from './lock-manager.js';
import { MemoryStorageAdapter } from './storage/memory-adapter.js';
import { FileSnapshotStore } from './storage/file-snapshot-store.js';
import {
  ILedger,
  IEventStore,
  IStateStore,
  ILockManager,
  IStateManager,
  ISnapshotStore,
  IStorageAdapter,
} from './interfaces.js';
import {
  Event,
  Timestamp,
  ResourceId,
  StateChange,
  Transaction,
  QueryOptions,
  StateSnapshot,
  OperationType,
  HistoryOptions,
  StateManagerConfig,
} from './types.js';

// Simple in-memory snapshot store implementation
class MemorySnapshotStore implements ISnapshotStore {
  private snapshots: Map<string, StateSnapshot> = new Map();
  private byResource: Map<string, string[]> = new Map();

  async saveSnapshot(snapshot: StateSnapshot): Promise<void> {
    this.snapshots.set(snapshot.id, snapshot);

    if (!this.byResource.has(snapshot.resourceId)) {
      this.byResource.set(snapshot.resourceId, []);
    }
    this.byResource.get(snapshot.resourceId)!.push(snapshot.id);
  }

  async getSnapshot(snapshotId: string): Promise<StateSnapshot | null> {
    return this.snapshots.get(snapshotId) || null;
  }

  async getLatestSnapshot(resourceId: ResourceId): Promise<StateSnapshot | null> {
    const ids = this.byResource.get(resourceId);
    if (!ids || ids.length === 0) return null;

    const lastId = ids[ids.length - 1];
    return lastId ? this.snapshots.get(lastId) || null : null;
  }

  async getSnapshotAt(resourceId: ResourceId, timestamp: Timestamp): Promise<StateSnapshot | null> {
    const ids = this.byResource.get(resourceId);
    if (!ids) return null;

    let latest = null;
    for (const id of ids) {
      const snapshot = this.snapshots.get(id);
      if (snapshot && snapshot.timestamp <= timestamp) {
        if (!latest || snapshot.timestamp > latest.timestamp) {
          latest = snapshot;
        }
      }
    }

    return latest;
  }

  async getSnapshots(resourceId: ResourceId, options?: any): Promise<StateSnapshot[]> {
    const ids = this.byResource.get(resourceId) || [];
    return ids.map(id => this.snapshots.get(id)!).filter(s => s !== undefined);
  }

  async pruneSnapshots(resourceId: ResourceId, keepCount: number): Promise<number> {
    const ids = this.byResource.get(resourceId) || [];
    if (ids.length <= keepCount) return 0;

    const toRemove = ids.slice(0, ids.length - keepCount);
    for (const id of toRemove) {
      this.snapshots.delete(id);
    }

    this.byResource.set(resourceId, ids.slice(ids.length - keepCount));
    return toRemove.length;
  }

  async getSnapshotsBefore(timestamp: Timestamp): Promise<StateSnapshot[]> {
    const results: StateSnapshot[] = [];
    for (const snapshot of this.snapshots.values()) {
      if (snapshot.timestamp < timestamp) {
        results.push(snapshot);
      }
    }
    return results;
  }
}

export class StateManager implements IStateManager {
  private eventStore: IEventStore;
  private stateStore: IStateStore;
  private snapshotStore: ISnapshotStore;
  private ledger: ILedger;
  private lockManager: ILockManager;
  private transactions: Map<string, Transaction> = new Map();
  private config: StateManagerConfig;
  private eventHandlers: Map<string, (event: Event) => Promise<void>> = new Map();

  constructor(config: StateManagerConfig) {
    this.config = config;

    const storage = this.createStorageAdapter(config);
    this.lockManager = new LockManager();

    this.eventStore = new EventStore(storage);
    this.stateStore = new StateStore(storage, this.lockManager);
    this.ledger = new Ledger(storage);
    
    // Create proper snapshot store based on storage type
    if (config.storage.type === 'file') {
      const basePath = (config.storage as any).basePath || './state';
      this.snapshotStore = new FileSnapshotStore({
        basePath: path.join(basePath, 'snapshots'),
        maxSnapshotsPerResource: config.snapshotConfig?.maxPerResource || 10,
        compressionEnabled: config.snapshotConfig?.compression || false
      });
    } else {
      // Fallback to memory snapshot store for other storage types
      this.snapshotStore = new MemorySnapshotStore();
    }
    
    // Store storage adapter for initialization
    this.storage = storage;
  }
  
  private storage: IStorageAdapter;

  async initialize(): Promise<void> {
    await this.storage.connect();
    await (this.eventStore as EventStore).initialize();
    await (this.ledger as Ledger).initialize();
    
    // Initialize file snapshot store if applicable
    if (this.snapshotStore instanceof FileSnapshotStore) {
      await this.snapshotStore.initialize();
    }
  }
  
  async cleanup(): Promise<void> {
    await this.storage.disconnect();
  }

  async applyEvent(event: Event): Promise<StateChange> {
    const resourceId = event.metadata.tags.get('resourceId');
    if (!resourceId) {
      throw new Error('Event must have resourceId in metadata tags');
    }

    const lockKey = `state:${resourceId}`;
    const lockId = await this.lockManager.acquire(lockKey, 10000); // Increased timeout

    try {
      await this.eventStore.append(event);

      const previousState = await this.stateStore.getCurrentState(resourceId);
      const previousVersion = await this.stateStore.getVersion(resourceId) || 0;

      const newState = await this.computeNewState(previousState, event);
      const newVersion = previousVersion + 1;

      await this.stateStore.setState(resourceId, newState, newVersion);

      const operation = this.inferOperation(previousState, newState);

      const ledgerEntry = await this.ledger.append({
        timestamp: event.timestamp,
        operation,
        resource: {
          type: event.metadata.tags.get('resourceType') || 'unknown',
          id: resourceId,
        },
        previousState,
        newState,
        event,
      });

      const stateChange: StateChange = {
        resourceId,
        version: newVersion,
        timestamp: event.timestamp,
        previousValue: previousState,
        newValue: newState,
        operation,
        actor: event.actor,
        reason: event.metadata.tags.get('reason'),
      };

      await this.checkSnapshotThreshold(resourceId, newVersion);

      return stateChange;
    } finally {
      await this.lockManager.release(lockId);
    }
  }

  private async applyEventWithoutLock(event: Event): Promise<StateChange> {
    const resourceId = event.metadata.tags.get('resourceId');
    if (!resourceId) {
      throw new Error('Event must have resourceId in metadata tags');
    }

    await this.eventStore.append(event);

    const previousState = await this.stateStore.getCurrentState(resourceId);
    const previousVersion = await this.stateStore.getVersion(resourceId) || 0;

    const newState = await this.computeNewState(previousState, event);
    const newVersion = previousVersion + 1;

    await this.stateStore.setState(resourceId, newState, newVersion);

    const operation = this.inferOperation(previousState, newState);

    const ledgerEntry = await this.ledger.append({
      timestamp: event.timestamp,
      operation,
      resource: {
        type: event.metadata.tags.get('resourceType') || 'unknown',
        id: resourceId,
      },
      previousState,
      newState,
      event,
    });

    const stateChange: StateChange = {
      resourceId,
      version: newVersion,
      timestamp: event.timestamp,
      previousValue: previousState,
      newValue: newState,
      operation,
      actor: event.actor,
      reason: event.metadata.tags.get('reason'),
    };

    await this.checkSnapshotThreshold(resourceId, newVersion);

    return stateChange;
  }

  async getCurrentState<T = any>(resourceId: ResourceId): Promise<T | null> {
    return await this.stateStore.getCurrentState<T>(resourceId);
  }

  async getStateAt<T = any>(resourceId: ResourceId, timestamp: Timestamp): Promise<T | null> {
    const snapshot = await this.snapshotStore.getSnapshotAt(resourceId, timestamp);

    if (snapshot && snapshot.timestamp <= timestamp) {
      const events = await this.eventStore.getEventsByResource(resourceId, {
        orderBy: 'timestamp',
        orderDirection: 'asc',
      });

      let state = snapshot.state;
      for (const event of events) {
        if (event.timestamp > snapshot.timestamp && event.timestamp <= timestamp) {
          state = await this.computeNewState(state, event);
        }
      }

      return state;
    } else {
      const events = await this.eventStore.getEventsByResource(resourceId, {
        orderBy: 'timestamp',
        orderDirection: 'asc',
      });

      let state = null;
      for (const event of events) {
        if (event.timestamp <= timestamp) {
          state = await this.computeNewState(state, event);
        }
      }

      return state;
    }
  }

  async getHistory(resourceId: ResourceId, options?: HistoryOptions): Promise<StateChange[]> {
    const entries = await this.ledger.getEntriesByResource(resourceId, {
      limit: options?.limit,
      offset: options?.offset,
      orderBy: options?.orderBy,
      orderDirection: options?.orderDirection,
    });

    return entries.map(entry => ({
      resourceId,
      version: entry.event.metadata.version,
      timestamp: entry.timestamp,
      previousValue: entry.previousState,
      newValue: entry.newState,
      operation: entry.operation,
      actor: entry.event.actor,
      reason: entry.event.metadata.tags.get('reason'),
    }));
  }

  async createSnapshot(resourceId: ResourceId): Promise<StateSnapshot> {
    const state = await this.stateStore.getCurrentState(resourceId);
    const version = await this.stateStore.getVersion(resourceId) || 0;
    const lastEvent = (await this.eventStore.getEventsByResource(resourceId, {
      limit: 1,
      orderDirection: 'desc',
    }))[0];

    if (!state || !lastEvent) {
      throw new Error('Cannot create snapshot: no state or events found');
    }

    const snapshot: StateSnapshot = {
      id: uuidv4(),
      resourceId,
      timestamp: Date.now(),
      version,
      state,
      eventId: lastEvent.id,
      eventSequence: lastEvent.sequenceNumber || 0,
      checksum: this.computeChecksum(state),
      compressed: this.config.compressionEnabled,
    };

    await this.snapshotStore.saveSnapshot(snapshot);

    if (this.config.snapshotRetention) {
      await this.snapshotStore.pruneSnapshots(resourceId, this.config.snapshotRetention);
    }

    return snapshot;
  }

  async restoreFromSnapshot(snapshotId: string): Promise<void> {
    const snapshot = await this.snapshotStore.getSnapshot(snapshotId);
    if (!snapshot) {
      throw new Error('Snapshot not found');
    }

    // Delete existing state first to avoid version conflicts
    await this.stateStore.deleteState(snapshot.resourceId);
    
    // Then set the snapshot state
    await this.stateStore.setState(
      snapshot.resourceId,
      snapshot.state,
      snapshot.version
    );

    // Replay events after the snapshot
    const events = await this.eventStore.getEventsByResource(snapshot.resourceId, {
      orderBy: 'sequence',
      orderDirection: 'asc',
    });

    for (const event of events) {
      if (event.sequenceNumber && event.sequenceNumber > snapshot.eventSequence) {
        await this.applyEvent(event);
      }
    }
  }

  async replay(fromEvent: string, toEvent?: string): Promise<void> {
    const events = await this.eventStore.getEvents({
      orderBy: 'sequence',
      orderDirection: 'asc',
    });

    let inRange = false;
    for (const event of events) {
      if (event.id === fromEvent) {
        inRange = true;
      }

      if (inRange) {
        await this.applyEvent(event);
      }

      if (toEvent && event.id === toEvent) {
        break;
      }
    }
  }

  async beginTransaction(): Promise<Transaction> {
    const transaction: Transaction = {
      id: uuidv4(),
      timestamp: Date.now(),
      operations: [],
      status: 'pending',
    };

    this.transactions.set(transaction.id, transaction);
    return transaction;
  }

  async commitTransaction(transactionId: string): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.status !== 'pending') {
      throw new Error('Transaction already completed');
    }

    const lockIds: string[] = [];

    try {
      for (const operation of transaction.operations) {
        const lockId = await this.lockManager.acquire(
          `state:${operation.resource.id}`,
          30000
        );
        lockIds.push(lockId);
      }

      // Apply all operations without re-acquiring locks
      for (const operation of transaction.operations) {
        const event: Event = {
          id: uuidv4(),
          type: `Transaction.${operation.type}`,
          timestamp: Date.now(),
          actor: 'system',
          payload: operation.data,
          metadata: {
            correlationId: transactionId,
            causationId: transactionId,
            version: 1,
            tags: new Map([
              ['resourceId', operation.resource.id],
              ['resourceType', operation.resource.type],
              ['transactionId', transactionId],
            ]),
          },
        };

        // Apply event without acquiring lock (we already have it)
        await this.applyEventWithoutLock(event);
      }

      transaction.status = 'committed';
    } catch (error) {
      transaction.status = 'aborted';
      throw error;
    } finally {
      for (const lockId of lockIds) {
        await this.lockManager.release(lockId);
      }
    }
  }

  async rollbackTransaction(transactionId: string): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    transaction.status = 'aborted';
  }

  private createStorageAdapter(config: StateManagerConfig): IStorageAdapter {
    switch (config.storage.type) {
      case 'memory':
        return new MemoryStorageAdapter();
      // TODO: Add other storage adapters
      default:
        throw new Error(`Unsupported storage type: ${config.storage.type}`);
    }
  }

  // Removed circular event subscription that was causing deadlocks
  // Event handlers are called directly in computeNewState instead

  private async computeNewState(currentState: any, event: Event): Promise<any> {
    const handler = this.eventHandlers.get(event.type);
    if (handler) {
      return await handler(event);
    }

    switch (event.type) {
      case 'ResourceCreated':
      case 'Transaction.create':
        return event.payload;
      case 'ResourceUpdated':
      case 'Transaction.update':
        return { ...currentState, ...event.payload };
      case 'ResourceDeleted':
      case 'Transaction.delete':
        return null;
      default:
        return currentState;
    }
  }

  private inferOperation(previousState: any, newState: any): OperationType {
    if (!previousState && newState) return OperationType.CREATE;
    if (previousState && !newState) return OperationType.DELETE;
    if (previousState && newState) return OperationType.UPDATE;
    return OperationType.UPDATE;
  }

  private computeChecksum(state: any): string {
    const crypto = require('crypto');
    const content = JSON.stringify(state);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async checkSnapshotThreshold(resourceId: ResourceId, version: number): Promise<void> {
    if (this.config.snapshotInterval && version % this.config.snapshotInterval === 0) {
      await this.createSnapshot(resourceId);
    }
  }

  async findExpired(ttlMs?: number): Promise<Array<{ resourceId: ResourceId; lastModified: Timestamp }>> {
    const results: Array<{ resourceId: ResourceId; lastModified: Timestamp }> = [];
    const cutoffTime = Date.now() - (ttlMs || 7 * 24 * 60 * 60 * 1000); // Default 7 days
    
    // Get all events to find resources
    const events = await this.eventStore.getEvents({
      orderBy: 'timestamp',
      orderDirection: 'desc'
    });
    
    // Track last modification time for each resource
    const resourceLastModified = new Map<ResourceId, Timestamp>();
    
    for (const event of events) {
      const resourceId = event.metadata.tags.get('resourceId');
      if (resourceId && !resourceLastModified.has(resourceId)) {
        resourceLastModified.set(resourceId, event.timestamp);
      }
    }
    
    // Find expired resources
    for (const [resourceId, lastModified] of resourceLastModified.entries()) {
      if (lastModified < cutoffTime) {
        results.push({ resourceId, lastModified });
      }
    }
    
    return results;
  }

  async deleteState(resourceId: ResourceId): Promise<void> {
    await this.stateStore.deleteState(resourceId);
  }

  async cleanupExpired(ttlMs?: number): Promise<number> {
    const expired = await this.findExpired(ttlMs);
    
    for (const { resourceId } of expired) {
      await this.deleteState(resourceId);
    }
    
    return expired.length;
  }

  async listNamespaces(): Promise<string[]> {
    const namespaces = new Set<string>();
    
    // Get all events to extract namespaces
    const events = await this.eventStore.getEvents();
    
    for (const event of events) {
      const namespace = event.metadata.tags.get('namespace');
      if (namespace) {
        namespaces.add(namespace);
      }
      
      // Also check resource ID for namespace prefix
      const resourceId = event.metadata.tags.get('resourceId');
      if (resourceId && typeof resourceId === 'string' && resourceId.includes(':')) {
        const [ns] = resourceId.split(':');
        if (ns) namespaces.add(ns);
      }
    }
    
    return Array.from(namespaces).sort();
  }

  async getResourcesByNamespace(namespace: string, options?: QueryOptions): Promise<ResourceId[]> {
    const resources = new Set<ResourceId>();
    
    // Get all events
    const events = await this.eventStore.getEvents(options);
    
    for (const event of events) {
      const resourceId = event.metadata.tags.get('resourceId');
      const eventNamespace = event.metadata.tags.get('namespace');
      
      if (resourceId) {
        // Check if namespace matches
        if (eventNamespace === namespace) {
          resources.add(resourceId);
        } else if (resourceId.startsWith(`${namespace}:`)) {
          resources.add(resourceId);
        }
      }
    }
    
    return Array.from(resources);
  }
}

