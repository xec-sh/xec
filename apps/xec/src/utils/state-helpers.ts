// Simple in-memory state store for CLI usage
// The real StateManager in @xec-js/core is event-sourced and too complex for CLI needs
export class SimpleStateStore {
  private state: Map<string, any> = new Map();
  private expiry: Map<string, number> = new Map();

  constructor() { }

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async get(key: string): Promise<any> {
    // Check expiry
    const expiryTime = this.expiry.get(key);
    if (expiryTime && Date.now() > expiryTime) {
      this.state.delete(key);
      this.expiry.delete(key);
      return undefined;
    }

    return this.state.get(key);
  }

  async set(key: string, value: any, options?: { ttl?: number }): Promise<void> {
    this.state.set(key, value);

    if (options?.ttl) {
      this.expiry.set(key, Date.now() + options.ttl * 1000);
    } else {
      this.expiry.delete(key);
    }
  }

  async delete(key: string): Promise<void> {
    this.state.delete(key);
    this.expiry.delete(key);
  }

  async getNamespace(namespace: string): Promise<Record<string, any>> {
    const result: Record<string, any> = {};

    for (const [key, value] of this.state) {
      if (key.startsWith(`${namespace}:`)) {
        const shortKey = key.replace(`${namespace}:`, '');
        // Check expiry
        const expiryTime = this.expiry.get(key);
        if (!expiryTime || Date.now() <= expiryTime) {
          result[shortKey] = value;
        }
      }
    }

    return result;
  }

  async listNamespaces(): Promise<string[]> {
    const namespaces = new Set<string>();

    for (const key of this.state.keys()) {
      const [namespace] = key.split(':');
      if (namespace) {
        namespaces.add(namespace);
      }
    }

    return Array.from(namespaces);
  }

  async listKeys(namespace: string): Promise<string[]> {
    const keys: string[] = [];

    for (const key of this.state.keys()) {
      if (key.startsWith(`${namespace}:`)) {
        // Check expiry
        const expiryTime = this.expiry.get(key);
        if (!expiryTime || Date.now() <= expiryTime) {
          keys.push(key.replace(`${namespace}:`, ''));
        }
      }
    }

    return keys;
  }

  async findExpired(): Promise<Array<{ key: string; namespace: string }>> {
    const expired: Array<{ key: string; namespace: string }> = [];
    const now = Date.now();

    for (const [key, expiryTime] of this.expiry) {
      if (now > expiryTime) {
        const [namespace] = key.split(':');
        expired.push({ key, namespace: namespace || 'default' });
      }
    }

    return expired;
  }
}

// Replace the old createCLIStateManager function
export function createCLIStateManager(): SimpleStateStore {
  return new SimpleStateStore();
}

// Helper to create namespaced keys
export function namespaceKey(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

// Helper to parse namespaced keys
export function parseNamespacedKey(key: string): { namespace: string; key: string } {
  const [namespace, ...keyParts] = key.split(':');
  return {
    namespace: namespace || 'default',
    key: keyParts.join(':')
  };
}