import { z } from 'zod';

export type EventType = string;
export type ResourceId = string;
export type ActorId = string;
export type Timestamp = number;
export type Version = number;

export interface EventMetadata {
  correlationId: string;
  causationId: string;
  version: number;
  tags: Map<string, string>;
  source?: string;
  traceId?: string;
}

export interface Event<T = any> {
  id: string;
  type: EventType;
  timestamp: Timestamp;
  actor: ActorId;
  payload: T;
  metadata: EventMetadata;
  signature?: string;
  sequenceNumber?: number;
}

export interface StateSnapshot<T = any> {
  id: string;
  resourceId: ResourceId;
  timestamp: Timestamp;
  version: Version;
  state: T;
  eventId: string;
  eventSequence: number;
  checksum: string;
  merkleRoot?: string;
  compressed?: boolean;
}

export interface ResourceIdentifier {
  type: string;
  id: string;
  namespace?: string;
  cluster?: string;
  region?: string;
}

export enum OperationType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  MERGE = 'MERGE',
}

export interface MerkleProof {
  root: string;
  path: string[];
  siblings: string[];
  algorithm: 'sha256' | 'sha3-256' | 'blake2b';
}

export interface LedgerEntry<T = any> {
  id: string;
  timestamp: Timestamp;
  sequenceNumber: number;
  operation: OperationType;
  resource: ResourceIdentifier;
  previousState?: T;
  newState?: T;
  event: Event<T>;
  proof?: MerkleProof;
  previousHash: string;
  hash: string;
}

export interface StateChange<T = any> {
  resourceId: ResourceId;
  version: Version;
  timestamp: Timestamp;
  previousValue?: T;
  newValue?: T;
  operation: OperationType;
  actor: ActorId;
  reason?: string;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'timestamp' | 'version' | 'sequence';
  orderDirection?: 'asc' | 'desc';
  includeMetadata?: boolean;
}

export interface TimeRange {
  from: Timestamp | string;
  to?: Timestamp | string;
}

export interface HistoryOptions extends QueryOptions {
  timeRange?: TimeRange;
  includeEvents?: boolean;
  includeSnapshots?: boolean;
  expandReferences?: boolean;
}

export interface AggregationOptions {
  groupBy: string | string[];
  metrics: string[];
  filters?: Filter[];
  timeRange?: TimeRange;
  interval?: string;
}

export interface Filter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'matches';
  value: any;
}

export interface StorageBackend {
  type: 'memory' | 'file' | 'sqlite' | 'postgres' | 'mongodb' | 's3' | 'custom';
  config: any;
}

export interface StateManagerConfig {
  storage: StorageBackend;
  snapshotInterval?: number;
  snapshotRetention?: number;
  compressionEnabled?: boolean;
  encryptionEnabled?: boolean;
  replicationFactor?: number;
  consistencyLevel?: 'eventual' | 'strong' | 'bounded';
  snapshotConfig?: {
    maxPerResource?: number;
    compression?: boolean;
  };
}

export interface Transaction {
  id: string;
  timestamp: Timestamp;
  operations: Operation[];
  status: 'pending' | 'committed' | 'aborted';
  metadata?: Record<string, any>;
}

export interface Operation {
  type: OperationType;
  resource: ResourceIdentifier;
  data: any;
  conditions?: Condition[];
}

export interface Condition {
  field: string;
  operator: string;
  value: any;
}

export interface ConflictResolution {
  strategy: 'last-write-wins' | 'first-write-wins' | 'merge' | 'custom';
  customResolver?: (a: any, b: any) => any;
}

export interface ReplicationConfig {
  nodes: string[];
  quorum: number;
  syncMode: 'sync' | 'async';
  conflictResolution: ConflictResolution;
}

export interface ComplianceReport {
  period: TimeRange;
  format: 'SOC2' | 'ISO27001' | 'HIPAA' | 'PCI' | 'custom';
  includeDetails: boolean;
  filters?: Filter[];
}

export const EventSchema = z.object({
  id: z.string(),
  type: z.string(),
  timestamp: z.number(),
  actor: z.string(),
  payload: z.any(),
  metadata: z.object({
    correlationId: z.string(),
    causationId: z.string(),
    version: z.number(),
    tags: z.map(z.string(), z.string()),
    source: z.string().optional(),
    traceId: z.string().optional(),
  }),
  signature: z.string().optional(),
  sequenceNumber: z.number().optional(),
});

export const ResourceIdentifierSchema = z.object({
  type: z.string(),
  id: z.string(),
  namespace: z.string().optional(),
  cluster: z.string().optional(),
  region: z.string().optional(),
});

export const StateSnapshotSchema = z.object({
  id: z.string(),
  resourceId: z.string(),
  timestamp: z.number(),
  version: z.number(),
  state: z.any(),
  eventId: z.string(),
  eventSequence: z.number(),
  checksum: z.string(),
  merkleRoot: z.string().optional(),
  compressed: z.boolean().optional(),
});