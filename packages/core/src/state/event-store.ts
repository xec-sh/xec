import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';

import { IEventStore, IStorageAdapter } from './interfaces';
import {
  Event,
  ActorId,
  EventType,
  TimeRange,
  Timestamp,
  ResourceId,
  QueryOptions,
} from './types.js';

export class EventStore extends EventEmitter implements IEventStore {
  private storage: IStorageAdapter;
  private sequenceNumber: number = 0;
  private eventHandlers: Map<EventType, Set<(event: Event) => void>> = new Map();

  constructor(storage: IStorageAdapter) {
    super();
    this.storage = storage;
  }

  async initialize(): Promise<void> {
    await this.storage.connect();
    this.sequenceNumber = await this.getLastSequenceNumber();
  }

  async append(event: Event): Promise<void> {
    const enrichedEvent = await this.enrichEvent(event);
    const key = this.getEventKey(enrichedEvent.id);

    await this.storage.set(key, enrichedEvent);
    await this.updateIndexes(enrichedEvent);

    this.notifySubscribers(enrichedEvent);
    this.emit('event', enrichedEvent);
  }

  async appendBatch(events: Event[]): Promise<void> {
    const enrichedEvents = await Promise.all(
      events.map(event => this.enrichEvent(event))
    );

    const operations: Array<{ op: 'set'; key: string; value: any }> = [];

    for (const event of enrichedEvents) {
      operations.push({
        op: 'set' as const,
        key: this.getEventKey(event.id),
        value: event,
      });

      operations.push(...await this.getIndexOperations(event));
    }

    await this.storage.batch(operations);

    enrichedEvents.forEach(event => {
      this.notifySubscribers(event);
      this.emit('event', event);
    });
  }

  async getEvent(eventId: string): Promise<Event | null> {
    const key = this.getEventKey(eventId);
    return await this.storage.get(key);
  }

  async getEvents(options?: QueryOptions): Promise<Event[]> {
    const events: Event[] = [];
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    const orderBy = options?.orderBy || 'timestamp';
    const orderDirection = options?.orderDirection || 'asc';

    const iterator = this.storage.scan('events:', {
      limit: limit + offset,
    });

    let count = 0;
    for await (const [_, event] of iterator as unknown as AsyncIterable<[string, any]>) {
      if (count >= offset && events.length < limit) {
        events.push(event);
      }
      count++;
    }

    return this.sortEvents(events, orderBy, orderDirection);
  }

  async getEventsByType(type: EventType, options?: QueryOptions): Promise<Event[]> {
    const indexKey = `index:type:${type}`;
    const eventIds = await this.storage.get(indexKey) || [];

    const events = await Promise.all(
      eventIds.slice(options?.offset || 0, (options?.offset || 0) + (options?.limit || 100))
        .map((id: string) => this.getEvent(id))
    );

    return events.filter(e => e !== null) as Event[];
  }

  async getEventsByResource(resourceId: ResourceId, options?: QueryOptions): Promise<Event[]> {
    const indexKey = `index:resource:${resourceId}`;
    const eventIds = await this.storage.get(indexKey) || [];

    const events = await Promise.all(
      eventIds.slice(options?.offset || 0, (options?.offset || 0) + (options?.limit || 100))
        .map((id: string) => this.getEvent(id))
    );

    return events.filter(e => e !== null) as Event[];
  }

  async getEventsByActor(actorId: ActorId, options?: QueryOptions): Promise<Event[]> {
    const indexKey = `index:actor:${actorId}`;
    const eventIds = await this.storage.get(indexKey) || [];

    const events = await Promise.all(
      eventIds.slice(options?.offset || 0, (options?.offset || 0) + (options?.limit || 100))
        .map((id: string) => this.getEvent(id))
    );

    return events.filter(e => e !== null) as Event[];
  }

  async getEventsByTimeRange(range: TimeRange, options?: QueryOptions): Promise<Event[]> {
    const fromTimestamp = range.from ? this.parseTimestamp(range.from) : 0;
    const toTimestamp = range.to ? this.parseTimestamp(range.to) : Date.now();

    const events: Event[] = [];
    const iterator = this.storage.scan('events:', options);

    for await (const [_, event] of iterator as unknown as AsyncIterable<[string, any]>) {
      if (event.timestamp >= fromTimestamp && event.timestamp <= toTimestamp) {
        events.push(event);
      }
    }

    return this.sortEvents(events, options?.orderBy || 'timestamp', options?.orderDirection || 'asc');
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

  private async enrichEvent(event: Event): Promise<Event> {
    const enriched = { ...event };

    if (!enriched.id) {
      enriched.id = uuidv4();
    }

    if (!enriched.timestamp) {
      enriched.timestamp = Date.now();
    }

    enriched.sequenceNumber = ++this.sequenceNumber;
    await this.storage.set('meta:sequence', this.sequenceNumber);

    if (!enriched.signature) {
      enriched.signature = this.generateSignature(enriched);
    }

    return enriched;
  }

  private async updateIndexes(event: Event): Promise<void> {
    const operations = await this.getIndexOperations(event);
    await this.storage.batch(operations);
  }

  private async getIndexOperations(event: Event): Promise<Array<{ op: 'set'; key: string; value: any }>> {
    const operations: Array<{ op: 'set'; key: string; value: any }> = [];
    const indexUpdates: Array<{ key: string; eventId: string }> = [];

    // Collect all index updates first
    indexUpdates.push({ key: `index:type:${event.type}`, eventId: event.id });

    if (event.metadata.tags) {
      const resourceId = event.metadata.tags.get('resourceId');
      if (resourceId) {
        indexUpdates.push({ key: `index:resource:${resourceId}`, eventId: event.id });
      }
    }

    indexUpdates.push({ key: `index:actor:${event.actor}`, eventId: event.id });

    const timestampBucket = Math.floor(event.timestamp / (60 * 60 * 1000));
    indexUpdates.push({ key: `index:time:${timestampBucket}`, eventId: event.id });

    // Now fetch all existing values in parallel
    const existingValues = await Promise.all(
      indexUpdates.map(({ key }) => this.storage.get(key).then(val => val || []))
    );

    // Build operations
    for (let i = 0; i < indexUpdates.length; i++) {
      const { key, eventId } = indexUpdates[i];
      const existing = existingValues[i];
      existing.push(eventId);
      operations.push({
        op: 'set' as const,
        key,
        value: existing,
      });
    }

    return operations;
  }

  private notifySubscribers(event: Event): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error('Error in event handler:', error);
        }
      });
    }

    const allHandlers = this.eventHandlers.get('*');
    if (allHandlers) {
      allHandlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error('Error in event handler:', error);
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