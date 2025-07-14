import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { Event } from '../../../src/state/types.js';
import { EventStore } from '../../../src/state/event-store.js';
import { IStorageAdapter } from '../../../src/state/interfaces.js';
import { MemoryStorageAdapter } from '../../../src/state/storage/memory-adapter.js';

describe('state/event-store', () => {
  let eventStore: EventStore;
  let storage: IStorageAdapter;
  let testEvent: Event;

  beforeEach(async () => {
    storage = new MemoryStorageAdapter();
    await storage.connect();
    eventStore = new EventStore(storage);
    await eventStore.initialize();

    testEvent = {
      id: 'test-event-1',
      type: 'ResourceCreated',
      timestamp: Date.now(),
      actor: 'test-user',
      payload: { name: 'test-resource' },
      metadata: {
        correlationId: 'correlation-1',
        causationId: 'causation-1',
        version: 1,
        tags: new Map([
          ['resourceId', 'resource-1'],
          ['resourceType', 'TestResource']
        ])
      }
    };
  });

  afterEach(async () => {
    await storage.disconnect();
  });

  describe('append', () => {
    it('should append an event successfully', async () => {
      await eventStore.append(testEvent);
      const retrieved = await eventStore.getEvent(testEvent.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(testEvent.id);
      expect(retrieved?.sequenceNumber).toBeDefined();
    });

    it('should assign sequence numbers to events', async () => {
      const event1 = { ...testEvent, id: 'event-1' };
      const event2 = { ...testEvent, id: 'event-2' };
      
      await eventStore.append(event1);
      await eventStore.append(event2);
      
      const retrieved1 = await eventStore.getEvent('event-1');
      const retrieved2 = await eventStore.getEvent('event-2');
      
      expect(retrieved1?.sequenceNumber).toBe(1);
      expect(retrieved2?.sequenceNumber).toBe(2);
    });

    it('should emit event on append', async () => {
      const handler = vi.fn();
      const unsubscribe = eventStore.subscribe(['ResourceCreated'], handler);

      await eventStore.append(testEvent);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        id: testEvent.id,
        type: testEvent.type
      }));

      unsubscribe();
    });
  });

  describe('appendBatch', () => {
    it('should append multiple events atomically', async () => {
      const events = [
        { ...testEvent, id: 'batch-1' },
        { ...testEvent, id: 'batch-2' },
        { ...testEvent, id: 'batch-3' }
      ];

      await eventStore.appendBatch(events);
      
      const results = await Promise.all(
        events.map(e => eventStore.getEvent(e.id))
      );
      
      expect(results.every(r => r !== null)).toBe(true);
      expect(results[0]?.sequenceNumber).toBe(1);
      expect(results[1]?.sequenceNumber).toBe(2);
      expect(results[2]?.sequenceNumber).toBe(3);
    });
  });

  describe('getEvent', () => {
    it('should retrieve an existing event', async () => {
      await eventStore.append(testEvent);
      const retrieved = await eventStore.getEvent(testEvent.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(testEvent.id);
      expect(retrieved?.type).toBe(testEvent.type);
      expect(retrieved?.payload).toEqual(testEvent.payload);
    });

    it('should return null for non-existent event', async () => {
      const retrieved = await eventStore.getEvent('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('getEvents', () => {
    beforeEach(async () => {
      const events = [
        { ...testEvent, id: 'event-1', timestamp: 1000 },
        { ...testEvent, id: 'event-2', timestamp: 2000, type: 'ResourceUpdated' },
        { ...testEvent, id: 'event-3', timestamp: 3000 },
      ];
      for (const event of events) {
        await eventStore.append(event);
      }
    });

    it('should retrieve all events without options', async () => {
      const events = await eventStore.getEvents();
      expect(events).toHaveLength(3);
    });

    it('should apply limit option', async () => {
      const events = await eventStore.getEvents({ limit: 2 });
      expect(events).toHaveLength(2);
    });

    it('should apply offset option', async () => {
      const events = await eventStore.getEvents({ offset: 1 });
      expect(events).toHaveLength(2);
      expect(events[0].id).toBe('event-2');
    });

    it('should order by timestamp ascending', async () => {
      const events = await eventStore.getEvents({
        orderBy: 'timestamp',
        orderDirection: 'asc'
      });
      
      expect(events[0].timestamp).toBe(1000);
      expect(events[1].timestamp).toBe(2000);
      expect(events[2].timestamp).toBe(3000);
    });

    it('should order by timestamp descending', async () => {
      const events = await eventStore.getEvents({
        orderBy: 'timestamp',
        orderDirection: 'desc'
      });
      
      expect(events[0].timestamp).toBe(3000);
      expect(events[1].timestamp).toBe(2000);
      expect(events[2].timestamp).toBe(1000);
    });
  });

  describe('getEventsByType', () => {
    beforeEach(async () => {
      await eventStore.append({ ...testEvent, id: 'create-1', type: 'ResourceCreated' });
      await eventStore.append({ ...testEvent, id: 'update-1', type: 'ResourceUpdated' });
      await eventStore.append({ ...testEvent, id: 'create-2', type: 'ResourceCreated' });
    });

    it('should retrieve events by type', async () => {
      const events = await eventStore.getEventsByType('ResourceCreated');
      expect(events).toHaveLength(2);
      expect(events.every(e => e.type === 'ResourceCreated')).toBe(true);
    });

    it('should apply query options', async () => {
      const events = await eventStore.getEventsByType('ResourceCreated', { limit: 1 });
      expect(events).toHaveLength(1);
    });
  });

  describe('getEventsByResource', () => {
    beforeEach(async () => {
      await eventStore.append({
        ...testEvent,
        id: 'event-1',
        metadata: {
          ...testEvent.metadata,
          tags: new Map([['resourceId', 'resource-1']])
        }
      });
      await eventStore.append({
        ...testEvent,
        id: 'event-2',
        metadata: {
          ...testEvent.metadata,
          tags: new Map([['resourceId', 'resource-2']])
        }
      });
      await eventStore.append({
        ...testEvent,
        id: 'event-3',
        metadata: {
          ...testEvent.metadata,
          tags: new Map([['resourceId', 'resource-1']])
        }
      });
    });

    it('should retrieve events by resource ID', async () => {
      const events = await eventStore.getEventsByResource('resource-1');
      expect(events).toHaveLength(2);
      expect(events.every(e => 
        e.metadata.tags.get('resourceId') === 'resource-1'
      )).toBe(true);
    });
  });

  describe('getEventsByActor', () => {
    beforeEach(async () => {
      await eventStore.append({ ...testEvent, id: 'event-1', actor: 'user-1' });
      await eventStore.append({ ...testEvent, id: 'event-2', actor: 'user-2' });
      await eventStore.append({ ...testEvent, id: 'event-3', actor: 'user-1' });
    });

    it('should retrieve events by actor', async () => {
      const events = await eventStore.getEventsByActor('user-1');
      expect(events).toHaveLength(2);
      expect(events.every(e => e.actor === 'user-1')).toBe(true);
    });
  });

  describe('getEventsByTimeRange', () => {
    beforeEach(async () => {
      await eventStore.append({ ...testEvent, id: 'event-1', timestamp: 1000 });
      await eventStore.append({ ...testEvent, id: 'event-2', timestamp: 2000 });
      await eventStore.append({ ...testEvent, id: 'event-3', timestamp: 3000 });
      await eventStore.append({ ...testEvent, id: 'event-4', timestamp: 4000 });
    });

    it('should retrieve events within time range', async () => {
      const events = await eventStore.getEventsByTimeRange({
        from: 1500,
        to: 3500
      });
      
      expect(events).toHaveLength(2);
      expect(events[0].id).toBe('event-2');
      expect(events[1].id).toBe('event-3');
    });

    it('should handle open-ended ranges', async () => {
      const eventsFromStart = await eventStore.getEventsByTimeRange({ from: 2500 });
      expect(eventsFromStart).toHaveLength(2);
      
      const eventsToEnd = await eventStore.getEventsByTimeRange({ from: 0, to: 2500 });
      expect(eventsToEnd).toHaveLength(2);
    });
  });

  describe('getLastSequenceNumber', () => {
    it('should return 0 when no events exist', async () => {
      const seq = await eventStore.getLastSequenceNumber();
      expect(seq).toBe(0);
    });

    it('should return the last sequence number', async () => {
      await eventStore.append({ ...testEvent, id: 'event-1' });
      await eventStore.append({ ...testEvent, id: 'event-2' });
      
      const seq = await eventStore.getLastSequenceNumber();
      expect(seq).toBe(2);
    });
  });

  describe('subscribe', () => {
    it('should call handler for matching event types', async () => {
      const handler = vi.fn();
      const unsubscribe = eventStore.subscribe(['ResourceCreated', 'ResourceUpdated'], handler);

      await eventStore.append({ ...testEvent, type: 'ResourceCreated' });
      await eventStore.append({ ...testEvent, type: 'ResourceDeleted' });
      await eventStore.append({ ...testEvent, type: 'ResourceUpdated' });

      expect(handler).toHaveBeenCalledTimes(2);
      unsubscribe();
    });

    it('should handle wildcard subscription', async () => {
      const handler = vi.fn();
      const unsubscribe = eventStore.subscribe(['*'], handler);

      await eventStore.append({ ...testEvent, type: 'ResourceCreated' });
      await eventStore.append({ ...testEvent, type: 'ResourceDeleted' });

      expect(handler).toHaveBeenCalledTimes(2);
      unsubscribe();
    });

    it('should stop calling handler after unsubscribe', async () => {
      const handler = vi.fn();
      const unsubscribe = eventStore.subscribe(['ResourceCreated'], handler);

      await eventStore.append({ ...testEvent, type: 'ResourceCreated' });
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();
      
      await eventStore.append({ ...testEvent, type: 'ResourceCreated' });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});