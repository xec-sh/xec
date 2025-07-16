import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { LRUCache } from 'lru-cache';
import { EventEmitter } from 'events';

import { createModuleLogger } from '../utils/logger.js';
import { IEventStore, IStorageAdapter } from './interfaces.js';
import {
  Event,
  ActorId,
  EventType,
  TimeRange,
  Timestamp,
  ResourceId,
  QueryOptions,
} from './types.js';

interface EventStoreOptions {
  batchSize?: number;
  cacheSize?: number;
  indexBucketSize?: number;
  partitionSize?: number;
  compressionEnabled?: boolean;
}

interface IndexEntry {
  eventId: string;
  timestamp: number;
  sequenceNumber: number;
}

interface EventPartition {
  startSequence: number;
  endSequence: number;
  eventCount: number;
  compressed?: boolean;
}

export class OptimizedEventStore extends EventEmitter implements IEventStore {
  private storage: IStorageAdapter;
  private sequenceNumber: number = 0;
  private eventHandlers: Map<EventType, Set<(event: Event) => void>> = new Map();
  private logger = createModuleLogger('optimized-event-store');
  
  // Optimization features
  private cache: LRUCache<string, Event>;
  private batchSize: number;
  private indexBucketSize: number;
  private partitionSize: number;
  private compressionEnabled: boolean;
  
  // Buffers for batch operations
  private eventBuffer: Event[] = [];
  private indexBuffer: Map<string, IndexEntry[]> = new Map();
  private flushTimer?: NodeJS.Timeout;

  constructor(storage: IStorageAdapter, options: EventStoreOptions = {}) {
    super();
    this.storage = storage;
    
    // Configure optimization parameters
    this.batchSize = options.batchSize || 100;
    this.indexBucketSize = options.indexBucketSize || 1000;
    this.partitionSize = options.partitionSize || 10000;
    this.compressionEnabled = options.compressionEnabled || false;
    
    // Initialize cache
    this.cache = new LRUCache<string, Event>({
      max: options.cacheSize || 1000,
      ttl: 1000 * 60 * 5 // 5 minutes
    });
  }

  async initialize(): Promise<void> {
    await this.storage.connect();
    this.sequenceNumber = await this.getLastSequenceNumber();
    
    // Start periodic flush
    this.startPeriodicFlush();
  }

  async append(event: Event): Promise<void> {
    const enrichedEvent = await this.enrichEvent(event);
    
    // Add to buffer
    this.eventBuffer.push(enrichedEvent);
    this.addToIndexBuffer(enrichedEvent);
    
    // Cache the event
    this.cache.set(enrichedEvent.id, enrichedEvent);
    
    // Emit immediately for real-time monitoring
    this.notifySubscribers(enrichedEvent);
    this.emit('event', enrichedEvent);
    
    // Flush if buffer is full
    if (this.eventBuffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  async appendBatch(events: Event[]): Promise<void> {
    const enrichedEvents = await Promise.all(
      events.map(event => this.enrichEvent(event))
    );

    // Add all to buffers
    this.eventBuffer.push(...enrichedEvents);
    enrichedEvents.forEach(event => {
      this.addToIndexBuffer(event);
      this.cache.set(event.id, event);
    });

    // Emit events
    enrichedEvents.forEach(event => {
      this.notifySubscribers(event);
      this.emit('event', event);
    });

    // Flush if needed
    if (this.eventBuffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  async getEvent(eventId: string): Promise<Event | null> {
    // Check cache first
    const cached = this.cache.get(eventId);
    if (cached) {
      return cached;
    }

    // Check buffer
    const buffered = this.eventBuffer.find(e => e.id === eventId);
    if (buffered) {
      return buffered;
    }

    // Load from storage
    const key = this.getEventKey(eventId);
    const event = await this.storage.get(key);
    
    if (event) {
      this.cache.set(eventId, event);
    }
    
    return event;
  }

  async getEvents(options?: QueryOptions): Promise<Event[]> {
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    const orderBy = options?.orderBy || 'timestamp';
    const orderDirection = options?.orderDirection || 'asc';

    // For recent events, check buffer first
    if (offset === 0 && orderBy === 'timestamp' && orderDirection === 'desc') {
      const bufferEvents = [...this.eventBuffer];
      if (bufferEvents.length >= limit) {
        return bufferEvents.slice(-limit).reverse();
      }
    }

    // Use partition metadata to optimize scanning
    const partitions = await this.getPartitionMetadata();
    const relevantPartitions = this.selectRelevantPartitions(partitions, options);

    const events: Event[] = [];
    
    for (const partition of relevantPartitions) {
      const partitionEvents = await this.loadPartition(partition);
      events.push(...partitionEvents);
      
      if (events.length >= offset + limit) {
        break;
      }
    }

    return this.sortAndSlice(events, orderBy, orderDirection, offset, limit);
  }

  async getEventsByType(type: EventType, options?: QueryOptions): Promise<Event[]> {
    return this.getEventsByIndex(`type:${type}`, options);
  }

  async getEventsByResource(resourceId: ResourceId, options?: QueryOptions): Promise<Event[]> {
    return this.getEventsByIndex(`resource:${resourceId}`, options);
  }

  async getEventsByActor(actorId: ActorId, options?: QueryOptions): Promise<Event[]> {
    return this.getEventsByIndex(`actor:${actorId}`, options);
  }

  async getEventsByTimeRange(range: TimeRange, options?: QueryOptions): Promise<Event[]> {
    const fromTimestamp = range.from ? this.parseTimestamp(range.from) : 0;
    const toTimestamp = range.to ? this.parseTimestamp(range.to) : Date.now();

    // Use time-based index buckets
    const startBucket = Math.floor(fromTimestamp / (60 * 60 * 1000));
    const endBucket = Math.floor(toTimestamp / (60 * 60 * 1000));

    const events: Event[] = [];
    
    for (let bucket = startBucket; bucket <= endBucket; bucket++) {
      const bucketEvents = await this.getEventsByIndex(`time:${bucket}`, {
        ...options,
        limit: undefined // Get all from bucket
      });
      
      events.push(...bucketEvents.filter(
        e => e.timestamp >= fromTimestamp && e.timestamp <= toTimestamp
      ));
    }

    return this.sortAndSlice(
      events, 
      options?.orderBy || 'timestamp', 
      options?.orderDirection || 'asc',
      options?.offset || 0,
      options?.limit || 100
    );
  }

  async getLastSequenceNumber(): Promise<number> {
    const seq = await this.storage.get('meta:sequence');
    return seq || 0;
  }

  subscribe(types: EventType[], handler: (event: Event) => void): () => void {
    types.forEach(type => {
      if (!this.eventHandlers.has(type)) {
        this.eventHandlers.set(type, new Set());
      }
      this.eventHandlers.get(type)!.add(handler);
    });

    return () => {
      types.forEach(type => {
        this.eventHandlers.get(type)?.delete(handler);
      });
    };
  }

  async close(): Promise<void> {
    // Flush any pending data
    await this.flush();
    
    // Clear flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    // Clear cache
    this.cache.clear();
  }

  private async enrichEvent(event: Event): Promise<Event> {
    const enriched = { ...event };

    if (!enriched.id) {
      enriched.id = uuidv4();
    }

    if (!enriched.timestamp) {
      enriched.timestamp = Date.now();
    }

    enriched.sequenceNumber = ++this.sequenceNumber;

    if (!enriched.signature) {
      enriched.signature = this.generateSignature(enriched);
    }

    return enriched;
  }

  private addToIndexBuffer(event: Event): void {
    const indexEntry: IndexEntry = {
      eventId: event.id,
      timestamp: event.timestamp,
      sequenceNumber: event.sequenceNumber || 0
    };

    // Type index
    this.addToIndexBufferEntry(`type:${event.type}`, indexEntry);

    // Resource index
    if (event.metadata.tags) {
      const resourceId = event.metadata.tags.get('resourceId');
      if (resourceId) {
        this.addToIndexBufferEntry(`resource:${resourceId}`, indexEntry);
      }
    }

    // Actor index
    this.addToIndexBufferEntry(`actor:${event.actor}`, indexEntry);

    // Time bucket index
    const timestampBucket = Math.floor(event.timestamp / (60 * 60 * 1000));
    this.addToIndexBufferEntry(`time:${timestampBucket}`, indexEntry);
  }

  private addToIndexBufferEntry(key: string, entry: IndexEntry): void {
    if (!this.indexBuffer.has(key)) {
      this.indexBuffer.set(key, []);
    }
    this.indexBuffer.get(key)!.push(entry);
  }

  private async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const operations: Array<{ op: 'set'; key: string; value: any }> = [];

    // Prepare event operations
    for (const event of this.eventBuffer) {
      operations.push({
        op: 'set' as const,
        key: this.getEventKey(event.id),
        value: event
      });
    }

    // Prepare index operations
    for (const [indexKey, entries] of this.indexBuffer.entries()) {
      const bucketNumber = Math.floor(entries[0].sequenceNumber / this.indexBucketSize);
      const bucketKey = `index:${indexKey}:bucket:${bucketNumber}`;
      
      // Get existing bucket
      const existingBucket = await this.storage.get(bucketKey) || [];
      existingBucket.push(...entries);
      
      operations.push({
        op: 'set' as const,
        key: bucketKey,
        value: existingBucket
      });

      // Update bucket metadata
      const metaKey = `index:${indexKey}:meta`;
      const meta = await this.storage.get(metaKey) || { buckets: [] };
      if (!meta.buckets.includes(bucketNumber)) {
        meta.buckets.push(bucketNumber);
        operations.push({
          op: 'set' as const,
          key: metaKey,
          value: meta
        });
      }
    }

    // Update sequence number
    operations.push({
      op: 'set' as const,
      key: 'meta:sequence',
      value: this.sequenceNumber
    });

    // Check if we need to create a new partition
    if (this.sequenceNumber % this.partitionSize === 0) {
      await this.createPartition();
    }

    // Execute batch operation
    await this.storage.batch(operations);

    // Clear buffers
    this.eventBuffer = [];
    this.indexBuffer.clear();
  }

  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => {
        this.logger.error('Error during periodic flush', { error: err });
      });
    }, 5000); // Flush every 5 seconds
  }

  private async getEventsByIndex(indexName: string, options?: QueryOptions): Promise<Event[]> {
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;

    // Get index metadata
    const metaKey = `index:${indexName}:meta`;
    const meta = await this.storage.get(metaKey);
    
    if (!meta || !meta.buckets) {
      return [];
    }

    const events: Event[] = [];
    let skipped = 0;

    // Iterate through buckets in reverse order for recent events
    const buckets = [...meta.buckets].sort((a, b) => b - a);
    
    for (const bucketNumber of buckets) {
      const bucketKey = `index:${indexName}:bucket:${bucketNumber}`;
      const entries: IndexEntry[] = await this.storage.get(bucketKey) || [];
      
      // Sort entries by sequence number descending
      entries.sort((a, b) => b.sequenceNumber - a.sequenceNumber);
      
      for (const entry of entries) {
        if (skipped < offset) {
          skipped++;
          continue;
        }
        
        if (events.length >= limit) {
          break;
        }
        
        const event = await this.getEvent(entry.eventId);
        if (event) {
          events.push(event);
        }
      }
      
      if (events.length >= limit) {
        break;
      }
    }

    return events;
  }

  private async getPartitionMetadata(): Promise<EventPartition[]> {
    const partitions = await this.storage.get('meta:partitions') || [];
    return partitions;
  }

  private selectRelevantPartitions(
    partitions: EventPartition[], 
    options?: QueryOptions
  ): EventPartition[] {
    // Select partitions based on query options
    // This is a simplified version - could be more sophisticated
    return partitions;
  }

  private async loadPartition(partition: EventPartition): Promise<Event[]> {
    const events: Event[] = [];
    
    for (let seq = partition.startSequence; seq <= partition.endSequence; seq++) {
      const event = await this.storage.get(`events:seq:${seq}`);
      if (event) {
        events.push(event);
      }
    }
    
    return events;
  }

  private async createPartition(): Promise<void> {
    const partitionNumber = Math.floor(this.sequenceNumber / this.partitionSize);
    const partition: EventPartition = {
      startSequence: partitionNumber * this.partitionSize,
      endSequence: this.sequenceNumber,
      eventCount: this.partitionSize,
      compressed: false
    };

    const partitions = await this.storage.get('meta:partitions') || [];
    partitions.push(partition);
    await this.storage.set('meta:partitions', partitions);
  }

  private sortAndSlice(
    events: Event[], 
    orderBy: string, 
    direction: 'asc' | 'desc',
    offset: number,
    limit: number
  ): Event[] {
    const sorted = this.sortEvents(events, orderBy, direction);
    return sorted.slice(offset, offset + limit);
  }

  private notifySubscribers(event: Event): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          this.logger.error('Error in event handler', { error });
        }
      });
    }

    const allHandlers = this.eventHandlers.get('*');
    if (allHandlers) {
      allHandlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          this.logger.error('Error in event handler', { error });
        }
      });
    }
  }

  private generateSignature(event: Event): string {
    const content = JSON.stringify({
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      actor: event.actor,
      payload: event.payload,
      sequenceNumber: event.sequenceNumber,
    });

    return createHash('sha256').update(content).digest('hex');
  }

  private getEventKey(eventId: string): string {
    return `events:${eventId}`;
  }

  private parseTimestamp(time: Timestamp | string): number {
    if (typeof time === 'number') {
      return time;
    }

    if (time === 'now') {
      return Date.now();
    }

    const relativeMatch = time.match(/^-(\d+)([hdwm])$/);
    if (relativeMatch) {
      const [, amount, unit] = relativeMatch;
      const units: Record<string, number> = {
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000,
        m: 30 * 24 * 60 * 60 * 1000,
      };
      return Date.now() - parseInt(amount) * units[unit];
    }

    return new Date(time).getTime();
  }

  private sortEvents(events: Event[], orderBy: string, direction: 'asc' | 'desc'): Event[] {
    const sorted = [...events].sort((a, b) => {
      let aVal: any, bVal: any;

      switch (orderBy) {
        case 'timestamp':
          aVal = a.timestamp;
          bVal = b.timestamp;
          break;
        case 'version':
          aVal = a.metadata.version;
          bVal = b.metadata.version;
          break;
        case 'sequence':
          aVal = a.sequenceNumber || 0;
          bVal = b.sequenceNumber || 0;
          break;
        default:
          aVal = a.timestamp;
          bVal = b.timestamp;
      }

      if (direction === 'asc') {
        return aVal - bVal;
      } else {
        return bVal - aVal;
      }
    });

    return sorted;
  }
}