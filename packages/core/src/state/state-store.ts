import {
  Version,
  ResourceId,
  QueryOptions
} from './types.js';
import { IStateStore, ILockManager, IStorageAdapter } from './interfaces';

export class StateStore implements IStateStore {
  private storage: IStorageAdapter;
  private lockManager: ILockManager;
  private cache: Map<ResourceId, { state: any; version: Version; timestamp: number }> = new Map();
  private cacheMaxAge: number = 60000; // 1 minute

  constructor(storage: IStorageAdapter, lockManager: ILockManager) {
    this.storage = storage;
    this.lockManager = lockManager;
  }

  async getCurrentState<T = any>(resourceId: ResourceId): Promise<T | null> {
    const cached = this.getFromCache(resourceId);
    if (cached) {
      return cached.state;
    }

    const key = this.getStateKey(resourceId);
    const data = await this.storage.get(key);

    if (data) {
      this.setCache(resourceId, data.state, data.version);
      return data.state;
    }

    return null;
  }

  async setState<T = any>(resourceId: ResourceId, state: T, version: Version): Promise<void> {
    // Note: Lock should be acquired by caller (StateManager) to avoid deadlocks
    const key = this.getStateKey(resourceId);
    const currentData = await this.storage.get(key);

    if (currentData && currentData.version >= version) {
      throw new Error(`Optimistic concurrency violation: current version ${currentData.version} >= ${version}`);
    }

    const data = {
      resourceId,
      state,
      version,
      timestamp: Date.now(),
    };

    await this.storage.set(key, data);
    await this.updateIndexes(resourceId, data);

    this.setCache(resourceId, state, version);
  }

  async deleteState(resourceId: ResourceId): Promise<void> {
    // Note: Lock should be acquired by caller (StateManager) to avoid deadlocks
    const key = this.getStateKey(resourceId);
    const data = await this.storage.get(key);

    if (data) {
      await this.removeFromIndexes(resourceId, data);
      await this.storage.delete(key);
      this.cache.delete(resourceId);
    }
  }

  async getStatesByType<T = any>(type: string, options?: QueryOptions): Promise<Array<{ resourceId: ResourceId; state: T }>> {
    const indexKey = `index:state:type:${type}`;
    const resourceIds = await this.storage.get(indexKey) || [];

    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    const slice = resourceIds.slice(offset, offset + limit);

    const results = await Promise.all(
      slice.map(async (resourceId: ResourceId) => {
        const state = await this.getCurrentState<T>(resourceId);
        return state ? { resourceId, state } : null;
      })
    );

    return results.filter(r => r !== null) as Array<{ resourceId: ResourceId; state: T }>;
  }

  async exists(resourceId: ResourceId): Promise<boolean> {
    const key = this.getStateKey(resourceId);
    const data = await this.storage.get(key);
    return data !== null;
  }

  async getVersion(resourceId: ResourceId): Promise<Version | null> {
    const cached = this.getFromCache(resourceId);
    if (cached) {
      return cached.version;
    }

    const key = this.getStateKey(resourceId);
    const data = await this.storage.get(key);

    if (data) {
      return data.version;
    }

    return null;
  }

  async getBulk<T = any>(resourceIds: ResourceId[]): Promise<Map<ResourceId, T>> {
    const results = new Map<ResourceId, T>();

    const uncachedIds = resourceIds.filter(id => {
      const cached = this.getFromCache(id);
      if (cached) {
        results.set(id, cached.state);
        return false;
      }
      return true;
    });

    if (uncachedIds.length > 0) {
      const operations = uncachedIds.map(id => ({
        op: 'get' as const,
        key: this.getStateKey(id),
      }));

      const bulkResults = await this.storage.batch(operations);

      bulkResults.forEach((data, index) => {
        if (data) {
          const resourceId = uncachedIds[index];
          results.set(resourceId, data.state);
          this.setCache(resourceId, data.state, data.version);
        }
      });
    }

    return results;
  }

  async vacuum(): Promise<number> {
    let cleaned = 0;
    const now = Date.now();

    for (const [resourceId, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.cacheMaxAge) {
        this.cache.delete(resourceId);
        cleaned++;
      }
    }

    return cleaned;
  }

  private getStateKey(resourceId: ResourceId): string {
    return `state:${resourceId}`;
  }

  private getFromCache(resourceId: ResourceId): { state: any; version: Version } | null {
    const cached = this.cache.get(resourceId);

    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < this.cacheMaxAge) {
        return { state: cached.state, version: cached.version };
      } else {
        this.cache.delete(resourceId);
      }
    }

    return null;
  }

  private setCache(resourceId: ResourceId, state: any, version: Version): void {
    this.cache.set(resourceId, {
      state,
      version,
      timestamp: Date.now(),
    });

    if (this.cache.size > 10000) {
      const oldest = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, 1000);

      oldest.forEach(([id]) => this.cache.delete(id));
    }
  }

  private async updateIndexes(resourceId: ResourceId, data: any): Promise<void> {
    const resource = this.parseResourceId(resourceId);
    const operations = [];

    operations.push({
      op: 'set' as const,
      key: `index:state:type:${resource.type}`,
      value: await this.addToSet(`index:state:type:${resource.type}`, resourceId),
    });

    if (resource.namespace) {
      operations.push({
        op: 'set' as const,
        key: `index:state:namespace:${resource.namespace}`,
        value: await this.addToSet(`index:state:namespace:${resource.namespace}`, resourceId),
      });
    }

    await this.storage.batch(operations);
  }

  private async removeFromIndexes(resourceId: ResourceId, data: any): Promise<void> {
    const resource = this.parseResourceId(resourceId);
    const operations = [];

    operations.push({
      op: 'set' as const,
      key: `index:state:type:${resource.type}`,
      value: await this.removeFromSet(`index:state:type:${resource.type}`, resourceId),
    });

    if (resource.namespace) {
      operations.push({
        op: 'set' as const,
        key: `index:state:namespace:${resource.namespace}`,
        value: await this.removeFromSet(`index:state:namespace:${resource.namespace}`, resourceId),
      });
    }

    await this.storage.batch(operations);
  }

  private async addToSet(key: string, value: string): Promise<string[]> {
    const existing = await this.storage.get(key) || [];
    if (!existing.includes(value)) {
      existing.push(value);
    }
    return existing;
  }

  private async removeFromSet(key: string, value: string): Promise<string[]> {
    const existing = await this.storage.get(key) || [];
    return existing.filter((v: string) => v !== value);
  }

  private parseResourceId(resourceId: ResourceId): { type: string; namespace?: string } {
    const parts = resourceId.split(':');
    return {
      type: parts[0],
      namespace: parts.length > 1 ? parts[1] : undefined,
    };
  }
}