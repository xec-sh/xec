import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { StateStore } from '../../../src/state/state-store.js';
import { LockManager } from '../../../src/state/lock-manager.js';
import { ILockManager, IStorageAdapter } from '../../../src/state/interfaces.js';
import { MemoryStorageAdapter } from '../../../src/state/storage/memory-adapter.js';

describe('state/state-store', () => {
  let stateStore: StateStore;
  let storage: IStorageAdapter;
  let lockManager: ILockManager;

  beforeEach(async () => {
    storage = new MemoryStorageAdapter();
    await storage.connect();
    lockManager = new LockManager();
    stateStore = new StateStore(storage, lockManager);
  });

  afterEach(async () => {
    await storage.disconnect();
  });

  describe('setState', () => {
    it('should set state for a resource', async () => {
      const resourceId = 'resource-1';
      const state = { name: 'Test Resource', value: 42 };
      const version = 1;

      await stateStore.setState(resourceId, state, version);
      const retrieved = await stateStore.getCurrentState(resourceId);
      
      expect(retrieved).toEqual(state);
    });

    it('should update state for existing resource', async () => {
      const resourceId = 'resource-1';
      const state1 = { name: 'Test Resource', value: 42 };
      const state2 = { name: 'Updated Resource', value: 100 };

      await stateStore.setState(resourceId, state1, 1);
      await stateStore.setState(resourceId, state2, 2);
      
      const retrieved = await stateStore.getCurrentState(resourceId);
      expect(retrieved).toEqual(state2);
    });

    it('should handle concurrent updates with locking', async () => {
      const resourceId = 'resource-1';
      const updates = [];

      // Simulate concurrent updates
      for (let i = 0; i < 10; i++) {
        updates.push(
          stateStore.setState(resourceId, { value: i }, i + 1)
        );
      }

      await Promise.all(updates);
      
      const finalState = await stateStore.getCurrentState(resourceId);
      expect(finalState).toBeDefined();
      expect(finalState.value).toBeGreaterThanOrEqual(0);
      expect(finalState.value).toBeLessThan(10);
    });
  });

  describe('getCurrentState', () => {
    it('should return null for non-existent resource', async () => {
      const state = await stateStore.getCurrentState('non-existent');
      expect(state).toBeNull();
    });

    it('should return current state for existing resource', async () => {
      const resourceId = 'resource-1';
      const state = { name: 'Test', data: [1, 2, 3] };

      await stateStore.setState(resourceId, state, 1);
      const retrieved = await stateStore.getCurrentState(resourceId);
      
      expect(retrieved).toEqual(state);
    });
  });

  describe('deleteState', () => {
    it('should delete state for a resource', async () => {
      const resourceId = 'resource-1';
      const state = { name: 'Test Resource' };

      await stateStore.setState(resourceId, state, 1);
      expect(await stateStore.exists(resourceId)).toBe(true);

      await stateStore.deleteState(resourceId);
      expect(await stateStore.exists(resourceId)).toBe(false);
      expect(await stateStore.getCurrentState(resourceId)).toBeNull();
    });

    it('should handle deleting non-existent resource', async () => {
      await expect(stateStore.deleteState('non-existent')).resolves.not.toThrow();
    });
  });

  describe('getStatesByType', () => {
    beforeEach(async () => {
      await stateStore.setState('user:user-1', { type: 'user', name: 'Alice' }, 1);
      await stateStore.setState('user:user-2', { type: 'user', name: 'Bob' }, 1);
      await stateStore.setState('product:product-1', { type: 'product', name: 'Widget' }, 1);
      await stateStore.setState('user:user-3', { type: 'user', name: 'Charlie' }, 1);
    });

    it('should retrieve states by type', async () => {
      const users = await stateStore.getStatesByType('user');
      
      expect(users).toHaveLength(3);
      expect(users.every(u => u.state.type === 'user')).toBe(true);
      expect(users.map(u => u.state.name).sort()).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('should return empty array for non-existent type', async () => {
      const results = await stateStore.getStatesByType('non-existent');
      expect(results).toEqual([]);
    });

    it('should apply query options', async () => {
      const users = await stateStore.getStatesByType('user', { limit: 2 });
      expect(users).toHaveLength(2);
    });
  });

  describe('exists', () => {
    it('should return true for existing resource', async () => {
      await stateStore.setState('resource-1', { value: 1 }, 1);
      expect(await stateStore.exists('resource-1')).toBe(true);
    });

    it('should return false for non-existent resource', async () => {
      expect(await stateStore.exists('non-existent')).toBe(false);
    });
  });

  describe('getVersion', () => {
    it('should return version for existing resource', async () => {
      const resourceId = 'resource-1';
      await stateStore.setState(resourceId, { value: 1 }, 5);
      
      const version = await stateStore.getVersion(resourceId);
      expect(version).toBe(5);
    });

    it('should return null for non-existent resource', async () => {
      const version = await stateStore.getVersion('non-existent');
      expect(version).toBeNull();
    });

    it('should track version updates', async () => {
      const resourceId = 'resource-1';
      
      await stateStore.setState(resourceId, { value: 1 }, 1);
      expect(await stateStore.getVersion(resourceId)).toBe(1);
      
      await stateStore.setState(resourceId, { value: 2 }, 2);
      expect(await stateStore.getVersion(resourceId)).toBe(2);
      
      await stateStore.setState(resourceId, { value: 3 }, 3);
      expect(await stateStore.getVersion(resourceId)).toBe(3);
    });
  });
});