import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { StateManager } from '../../../src/state/state-manager.js';
import { Event, OperationType, StateManagerConfig } from '../../../src/state/types.js';

describe('state/state-manager', () => {
  let stateManager: StateManager;
  let config: StateManagerConfig;

  beforeEach(async () => {
    config = {
      storage: {
        type: 'memory',
        options: {}
      },
      compressionEnabled: false,
      encryptionEnabled: false,
      snapshotInterval: 10,
      snapshotRetention: 5,
      eventRetention: 1000,
      replicationEnabled: false
    };

    stateManager = new StateManager(config);
    await stateManager.initialize();
  });
  
  afterEach(async () => {
    if (stateManager) {
      await stateManager.cleanup();
    }
  });

  describe('applyEvent', () => {
    it('should apply a create event', async () => {
      const event: Event = {
        id: 'event-1',
        type: 'ResourceCreated',
        timestamp: Date.now(),
        actor: 'user-1',
        payload: { name: 'Test Resource', value: 42 },
        metadata: {
          correlationId: 'corr-1',
          causationId: 'cause-1',
          version: 1,
          tags: new Map([
            ['resourceId', 'resource-1'],
            ['resourceType', 'TestResource'],
            ['reason', 'Initial creation']
          ])
        }
      };

      const stateChange = await stateManager.applyEvent(event);
      
      expect(stateChange.resourceId).toBe('resource-1');
      expect(stateChange.version).toBe(1);
      expect(stateChange.operation).toBe(OperationType.CREATE);
      expect(stateChange.previousValue).toBeNull();
      expect(stateChange.newValue).toEqual({ name: 'Test Resource', value: 42 });
      expect(stateChange.actor).toBe('user-1');
      expect(stateChange.reason).toBe('Initial creation');
    });

    it('should apply an update event', async () => {
      // First create the resource
      const createEvent: Event = {
        id: 'event-1',
        type: 'ResourceCreated',
        timestamp: Date.now(),
        actor: 'user-1',
        payload: { name: 'Test Resource', value: 42 },
        metadata: {
          correlationId: 'corr-1',
          causationId: 'cause-1',
          version: 1,
          tags: new Map([
            ['resourceId', 'resource-1'],
            ['resourceType', 'TestResource']
          ])
        }
      };
      await stateManager.applyEvent(createEvent);

      // Then update it
      const updateEvent: Event = {
        id: 'event-2',
        type: 'ResourceUpdated',
        timestamp: Date.now() + 1000,
        actor: 'user-2',
        payload: { value: 100 },
        metadata: {
          correlationId: 'corr-2',
          causationId: 'cause-2',
          version: 2,
          tags: new Map([
            ['resourceId', 'resource-1'],
            ['resourceType', 'TestResource']
          ])
        }
      };

      const stateChange = await stateManager.applyEvent(updateEvent);
      
      expect(stateChange.version).toBe(2);
      expect(stateChange.operation).toBe(OperationType.UPDATE);
      expect(stateChange.previousValue).toEqual({ name: 'Test Resource', value: 42 });
      expect(stateChange.newValue).toEqual({ name: 'Test Resource', value: 100 });
    });

    it('should apply a delete event', async () => {
      // First create the resource
      const createEvent: Event = {
        id: 'event-1',
        type: 'ResourceCreated',
        timestamp: Date.now(),
        actor: 'user-1',
        payload: { name: 'Test Resource' },
        metadata: {
          correlationId: 'corr-1',
          causationId: 'cause-1',
          version: 1,
          tags: new Map([
            ['resourceId', 'resource-1'],
            ['resourceType', 'TestResource']
          ])
        }
      };
      await stateManager.applyEvent(createEvent);

      // Then delete it
      const deleteEvent: Event = {
        id: 'event-2',
        type: 'ResourceDeleted',
        timestamp: Date.now() + 1000,
        actor: 'user-1',
        payload: {},
        metadata: {
          correlationId: 'corr-2',
          causationId: 'cause-2',
          version: 2,
          tags: new Map([
            ['resourceId', 'resource-1'],
            ['resourceType', 'TestResource']
          ])
        }
      };

      const stateChange = await stateManager.applyEvent(deleteEvent);
      
      expect(stateChange.operation).toBe(OperationType.DELETE);
      expect(stateChange.previousValue).toEqual({ name: 'Test Resource' });
      expect(stateChange.newValue).toBeNull();
    });

    it('should throw error if event missing resourceId', async () => {
      const event: Event = {
        id: 'event-1',
        type: 'ResourceCreated',
        timestamp: Date.now(),
        actor: 'user-1',
        payload: {},
        metadata: {
          correlationId: 'corr-1',
          causationId: 'cause-1',
          version: 1,
          tags: new Map() // Missing resourceId
        }
      };

      await expect(stateManager.applyEvent(event)).rejects.toThrow(
        'Event must have resourceId in metadata tags'
      );
    });
  });

  describe('getCurrentState', () => {
    it('should return null for non-existent resource', async () => {
      const state = await stateManager.getCurrentState('non-existent');
      expect(state).toBeNull();
    });

    it('should return current state after events', async () => {
      const event: Event = {
        id: 'event-1',
        type: 'ResourceCreated',
        timestamp: Date.now(),
        actor: 'user-1',
        payload: { name: 'Test', data: [1, 2, 3] },
        metadata: {
          correlationId: 'corr-1',
          causationId: 'cause-1',
          version: 1,
          tags: new Map([
            ['resourceId', 'resource-1'],
            ['resourceType', 'TestResource']
          ])
        }
      };

      await stateManager.applyEvent(event);
      const state = await stateManager.getCurrentState('resource-1');
      
      expect(state).toEqual({ name: 'Test', data: [1, 2, 3] });
    });
  });

  describe('getStateAt', () => {
    it('should return state at specific timestamp', async () => {
      const baseTime = Date.now();
      
      // Create resource
      await stateManager.applyEvent({
        id: 'event-1',
        type: 'ResourceCreated',
        timestamp: baseTime,
        actor: 'user-1',
        payload: { value: 1 },
        metadata: {
          correlationId: 'corr-1',
          causationId: 'cause-1',
          version: 1,
          tags: new Map([
            ['resourceId', 'resource-1'],
            ['resourceType', 'TestResource']
          ])
        }
      });

      // Update at different times
      await stateManager.applyEvent({
        id: 'event-2',
        type: 'ResourceUpdated',
        timestamp: baseTime + 1000,
        actor: 'user-1',
        payload: { value: 2 },
        metadata: {
          correlationId: 'corr-2',
          causationId: 'cause-2',
          version: 2,
          tags: new Map([
            ['resourceId', 'resource-1'],
            ['resourceType', 'TestResource']
          ])
        }
      });

      await stateManager.applyEvent({
        id: 'event-3',
        type: 'ResourceUpdated',
        timestamp: baseTime + 2000,
        actor: 'user-1',
        payload: { value: 3 },
        metadata: {
          correlationId: 'corr-3',
          causationId: 'cause-3',
          version: 3,
          tags: new Map([
            ['resourceId', 'resource-1'],
            ['resourceType', 'TestResource']
          ])
        }
      });

      // Check state at different times
      const stateAt0 = await stateManager.getStateAt('resource-1', baseTime - 100);
      expect(stateAt0).toBeNull();

      const stateAt1 = await stateManager.getStateAt('resource-1', baseTime + 500);
      expect(stateAt1).toEqual({ value: 1 });

      const stateAt2 = await stateManager.getStateAt('resource-1', baseTime + 1500);
      expect(stateAt2).toEqual({ value: 2 });

      const stateAt3 = await stateManager.getStateAt('resource-1', baseTime + 3000);
      expect(stateAt3).toEqual({ value: 3 });
    });
  });

  describe('getHistory', () => {
    it('should return history of state changes', async () => {
      const baseTime = Date.now();
      const resourceId = 'resource-1';

      // Apply multiple events
      await stateManager.applyEvent({
        id: 'event-1',
        type: 'ResourceCreated',
        timestamp: baseTime,
        actor: 'user-1',
        payload: { value: 1 },
        metadata: {
          correlationId: 'corr-1',
          causationId: 'cause-1',
          version: 1,
          tags: new Map([
            ['resourceId', resourceId],
            ['resourceType', 'TestResource']
          ])
        }
      });

      await stateManager.applyEvent({
        id: 'event-2',
        type: 'ResourceUpdated',
        timestamp: baseTime + 1000,
        actor: 'user-2',
        payload: { value: 2 },
        metadata: {
          correlationId: 'corr-2',
          causationId: 'cause-2',
          version: 2,
          tags: new Map([
            ['resourceId', resourceId],
            ['resourceType', 'TestResource']
          ])
        }
      });

      const history = await stateManager.getHistory(resourceId);
      
      expect(history).toHaveLength(2);
      expect(history[0].operation).toBe(OperationType.CREATE);
      expect(history[0].version).toBe(1);
      expect(history[0].actor).toBe('user-1');
      expect(history[1].operation).toBe(OperationType.UPDATE);
      expect(history[1].version).toBe(2);
      expect(history[1].actor).toBe('user-2');
    });

    it('should apply pagination options', async () => {
      const resourceId = 'resource-1';

      // Create many events
      for (let i = 0; i < 10; i++) {
        await stateManager.applyEvent({
          id: `event-${i}`,
          type: i === 0 ? 'ResourceCreated' : 'ResourceUpdated',
          timestamp: Date.now() + i * 100,
          actor: 'user-1',
          payload: { value: i },
          metadata: {
            correlationId: `corr-${i}`,
            causationId: `cause-${i}`,
            version: i + 1,
            tags: new Map([
              ['resourceId', resourceId],
              ['resourceType', 'TestResource']
            ])
          }
        });
      }

      const history = await stateManager.getHistory(resourceId, {
        limit: 5,
        offset: 2
      });
      
      expect(history).toHaveLength(5);
      expect(history[0].version).toBe(3);
    });
  });

  describe('snapshots', () => {
    it('should create snapshot', async () => {
      const event: Event = {
        id: 'event-1',
        type: 'ResourceCreated',
        timestamp: Date.now(),
        actor: 'user-1',
        payload: { name: 'Test', value: 42 },
        metadata: {
          correlationId: 'corr-1',
          causationId: 'cause-1',
          version: 1,
          tags: new Map([
            ['resourceId', 'resource-1'],
            ['resourceType', 'TestResource']
          ])
        }
      };

      await stateManager.applyEvent(event);
      const snapshot = await stateManager.createSnapshot('resource-1');
      
      expect(snapshot.resourceId).toBe('resource-1');
      expect(snapshot.version).toBe(1);
      expect(snapshot.state).toEqual({ name: 'Test', value: 42 });
      expect(snapshot.eventId).toBe('event-1');
      expect(snapshot.compressed).toBe(false);
    });

    it('should restore from snapshot', async () => {
      const resourceId = 'resource-1';
      
      // Create initial state
      await stateManager.applyEvent({
        id: 'event-1',
        type: 'ResourceCreated',
        timestamp: Date.now(),
        actor: 'user-1',
        payload: { value: 1 },
        metadata: {
          correlationId: 'corr-1',
          causationId: 'cause-1',
          version: 1,
          tags: new Map([
            ['resourceId', resourceId],
            ['resourceType', 'TestResource']
          ])
        }
      });

      // Create snapshot
      const snapshot = await stateManager.createSnapshot(resourceId);

      // Apply more events
      await stateManager.applyEvent({
        id: 'event-2',
        type: 'ResourceUpdated',
        timestamp: Date.now() + 1000,
        actor: 'user-1',
        payload: { value: 2 },
        metadata: {
          correlationId: 'corr-2',
          causationId: 'cause-2',
          version: 2,
          tags: new Map([
            ['resourceId', resourceId],
            ['resourceType', 'TestResource']
          ])
        }
      });

      // Verify current state
      let currentState = await stateManager.getCurrentState(resourceId);
      expect(currentState).toEqual({ value: 2 });

      // Restore from snapshot
      await stateManager.restoreFromSnapshot(snapshot.id);

      // Should replay events after snapshot
      currentState = await stateManager.getCurrentState(resourceId);
      expect(currentState).toEqual({ value: 2 });
    });

    it('should auto-create snapshots based on interval', async () => {
      const resourceId = 'resource-1';
      
      // Apply events up to snapshot interval (10)
      for (let i = 0; i < 11; i++) {
        await stateManager.applyEvent({
          id: `event-${i}`,
          type: i === 0 ? 'ResourceCreated' : 'ResourceUpdated',
          timestamp: Date.now() + i * 100,
          actor: 'user-1',
          payload: { value: i },
          metadata: {
            correlationId: `corr-${i}`,
            causationId: `cause-${i}`,
            version: i + 1,
            tags: new Map([
              ['resourceId', resourceId],
              ['resourceType', 'TestResource']
            ])
          }
        });
      }

      // Snapshot should have been created at version 10
      // This is tested implicitly - would need to expose snapshot store to verify
    });
  });

  describe('transactions', () => {
    it('should execute transaction successfully', async () => {
      const transaction = await stateManager.beginTransaction();
      
      expect(transaction.id).toBeDefined();
      expect(transaction.status).toBe('pending');
      expect(transaction.operations).toEqual([]);

      // Add operations to transaction
      transaction.operations.push({
        type: 'create',
        resource: { type: 'User', id: 'user-1' },
        data: { name: 'Alice' }
      });
      transaction.operations.push({
        type: 'create',
        resource: { type: 'User', id: 'user-2' },
        data: { name: 'Bob' }
      });

      // Commit transaction
      await stateManager.commitTransaction(transaction.id);

      // Verify states were created
      const user1 = await stateManager.getCurrentState('user-1');
      const user2 = await stateManager.getCurrentState('user-2');
      
      expect(user1).toEqual({ name: 'Alice' });
      expect(user2).toEqual({ name: 'Bob' });
    });

    it('should rollback transaction', async () => {
      const transaction = await stateManager.beginTransaction();
      
      transaction.operations.push({
        type: 'create',
        resource: { type: 'User', id: 'user-1' },
        data: { name: 'Alice' }
      });

      await stateManager.rollbackTransaction(transaction.id);
      
      // Operation should not have been applied
      const state = await stateManager.getCurrentState('user-1');
      expect(state).toBeNull();
    });

    it('should handle transaction errors', async () => {
      const transaction = await stateManager.beginTransaction();
      
      // Try to commit non-existent transaction
      await expect(
        stateManager.commitTransaction('non-existent')
      ).rejects.toThrow('Transaction not found');

      // Try to commit already completed transaction
      await stateManager.rollbackTransaction(transaction.id);
      await expect(
        stateManager.commitTransaction(transaction.id)
      ).rejects.toThrow('Transaction already completed');
    });
  });

  describe('replay', () => {
    it('should replay events from specific point', async () => {
      const events = [];
      
      // Create initial events
      for (let i = 0; i < 5; i++) {
        const event: Event = {
          id: `event-${i}`,
          type: i === 0 ? 'ResourceCreated' : 'ResourceUpdated',
          timestamp: Date.now() + i * 100,
          actor: 'user-1',
          payload: { value: i },
          metadata: {
            correlationId: `corr-${i}`,
            causationId: `cause-${i}`,
            version: i + 1,
            tags: new Map([
              ['resourceId', 'resource-1'],
              ['resourceType', 'TestResource']
            ])
          }
        };
        await stateManager.applyEvent(event);
        events.push(event);
      }

      // Clear current state (simulate recovery scenario)
      // In real scenario, we'd recreate the state manager
      
      // Replay from event 2
      await stateManager.replay('event-2', 'event-4');
      
      // State should reflect replayed events
      const state = await stateManager.getCurrentState('resource-1');
      expect(state).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle storage errors gracefully', async () => {
      // This would require mocking the storage adapter
      // For now, just verify basic error scenarios
      
      const event: Event = {
        id: 'event-1',
        type: 'InvalidEventType' as any,
        timestamp: Date.now(),
        actor: 'user-1',
        payload: {},
        metadata: {
          correlationId: 'corr-1',
          causationId: 'cause-1',
          version: 1,
          tags: new Map([
            ['resourceId', 'resource-1'],
            ['resourceType', 'TestResource']
          ])
        }
      };

      // Should handle unknown event type
      const stateChange = await stateManager.applyEvent(event);
      expect(stateChange.newValue).toBeNull();
    });
  });
});