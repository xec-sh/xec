import {
  Event,
  Version,
  ActorId,
  EventType,
  TimeRange,
  Timestamp,
  ResourceId,
  LedgerEntry,
  StateChange,
  Transaction,
  MerkleProof,
  QueryOptions,
  StateSnapshot,
  HistoryOptions,
  ComplianceReport,
  AggregationOptions,
} from './types.js';

export interface IEventStore {
  append(event: Event): Promise<void>;
  appendBatch(events: Event[]): Promise<void>;
  getEvent(eventId: string): Promise<Event | null>;
  getEvents(options?: QueryOptions): Promise<Event[]>;
  getEventsByType(type: EventType, options?: QueryOptions): Promise<Event[]>;
  getEventsByResource(resourceId: ResourceId, options?: QueryOptions): Promise<Event[]>;
  getEventsByActor(actorId: ActorId, options?: QueryOptions): Promise<Event[]>;
  getEventsByTimeRange(range: TimeRange, options?: QueryOptions): Promise<Event[]>;
  getLastSequenceNumber(): Promise<number>;
  subscribe(types: EventType[], handler: (event: Event) => void): () => void;
}

export interface IStateStore {
  getCurrentState<T = any>(resourceId: ResourceId): Promise<T | null>;
  setState<T = any>(resourceId: ResourceId, state: T, version: Version): Promise<void>;
  deleteState(resourceId: ResourceId): Promise<void>;
  getStatesByType<T = any>(type: string, options?: QueryOptions): Promise<Array<{ resourceId: ResourceId; state: T }>>;
  exists(resourceId: ResourceId): Promise<boolean>;
  getVersion(resourceId: ResourceId): Promise<Version | null>;
}

export interface ISnapshotStore {
  saveSnapshot(snapshot: StateSnapshot): Promise<void>;
  getSnapshot(snapshotId: string): Promise<StateSnapshot | null>;
  getLatestSnapshot(resourceId: ResourceId): Promise<StateSnapshot | null>;
  getSnapshotAt(resourceId: ResourceId, timestamp: Timestamp): Promise<StateSnapshot | null>;
  getSnapshots(resourceId: ResourceId, options?: QueryOptions): Promise<StateSnapshot[]>;
  pruneSnapshots(resourceId: ResourceId, keepCount: number): Promise<number>;
  getSnapshotsBefore(timestamp: Timestamp): Promise<StateSnapshot[]>;
}

export interface ILedger {
  append(entry: Omit<LedgerEntry, 'id' | 'hash' | 'sequenceNumber' | 'previousHash'>): Promise<LedgerEntry>;
  getEntry(entryId: string): Promise<LedgerEntry | null>;
  getEntries(options?: QueryOptions): Promise<LedgerEntry[]>;
  getEntriesByResource(resourceId: ResourceId, options?: QueryOptions): Promise<LedgerEntry[]>;
  getLastEntry(): Promise<LedgerEntry | null>;
  verify(entryId: string): Promise<boolean>;
  verifyChain(fromEntry?: string, toEntry?: string): Promise<boolean>;
  getMerkleProof(entryId: string): Promise<MerkleProof>;
  verifyMerkleProof(entryId: string, proof: MerkleProof): Promise<boolean>;
}

export interface IStateManager {
  applyEvent(event: Event): Promise<StateChange>;
  getCurrentState<T = any>(resourceId: ResourceId): Promise<T | null>;
  getStateAt<T = any>(resourceId: ResourceId, timestamp: Timestamp): Promise<T | null>;
  getHistory(resourceId: ResourceId, options?: HistoryOptions): Promise<StateChange[]>;
  createSnapshot(resourceId: ResourceId): Promise<StateSnapshot>;
  restoreFromSnapshot(snapshotId: string): Promise<void>;
  replay(fromEvent: string, toEvent?: string): Promise<void>;
  beginTransaction(): Promise<Transaction>;
  commitTransaction(transactionId: string): Promise<void>;
  rollbackTransaction(transactionId: string): Promise<void>;
}

export interface IQueryEngine {
  query<T = any>(query: string, params?: any): Promise<T>;
  aggregate(options: AggregationOptions): Promise<any>;
  timeline(resourceId: ResourceId, metric: string, options?: any): Promise<any>;
  getDependencies(resourceId: ResourceId, options?: any): Promise<any>;
  search(criteria: any, options?: QueryOptions): Promise<any[]>;
  count(criteria: any): Promise<number>;
}

export interface IAuditLogger {
  logAccess(actor: ActorId, resource: ResourceId, operation: string): Promise<void>;
  logModification(change: StateChange): Promise<void>;
  getAuditTrail(resourceId: ResourceId, options?: QueryOptions): Promise<any[]>;
  exportCompliance(report: ComplianceReport): Promise<any>;
}

export interface IProjection<TState = any> {
  name: string;
  eventTypes: EventType[];
  getInitialState(): TState;
  apply(state: TState, event: Event): TState;
  query(state: TState, query: any): any;
}

export interface IProjectionStore {
  register(projection: IProjection): void;
  unregister(projectionName: string): void;
  rebuild(projectionName: string): Promise<void>;
  query(projectionName: string, query: any): Promise<any>;
  getState(projectionName: string): Promise<any>;
}

export interface IReplicationManager {
  addNode(nodeId: string, endpoint: string): Promise<void>;
  removeNode(nodeId: string): Promise<void>;
  getNodes(): Promise<Array<{ id: string; endpoint: string; status: string }>>;
  sync(nodeId: string): Promise<void>;
  getReplicationLag(nodeId: string): Promise<number>;
  promoteToLeader(nodeId: string): Promise<void>;
}

export interface IConflictResolver {
  resolve<T>(conflicts: Array<{ source: string; value: T; timestamp: Timestamp }>): T;
  registerCustomResolver(type: string, resolver: (conflicts: any[]) => any): void;
}

export interface IEncryptionService {
  encrypt(data: any): Promise<{ encrypted: string; keyId: string }>;
  decrypt(encrypted: string, keyId: string): Promise<any>;
  rotateKeys(): Promise<void>;
}

export interface ICompressionService {
  compress(data: any): Promise<Buffer>;
  decompress(compressed: Buffer): Promise<any>;
}

export interface IStorageAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  scan(prefix: string, options?: any): AsyncIterator<[string, any]>;
  batch(operations: Array<{ op: 'get' | 'set' | 'delete'; key: string; value?: any }>): Promise<any[]>;
}

export interface ILockManager {
  acquire(resource: string, timeout?: number): Promise<string>;
  release(lockId: string): Promise<void>;
  extend(lockId: string, timeout: number): Promise<void>;
  isLocked(resource: string): Promise<boolean>;
}