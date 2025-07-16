import { EventEmitter } from 'events';

import { Logger } from '../utils/logger.js';

export interface QuotaDefinition {
  name: string;
  description?: string;
  limits: Record<string, QuotaLimit>;
  metadata?: Record<string, any>;
}

export interface QuotaLimit {
  max: number;
  min?: number;
  unit: string;
  enforcementMode?: 'hard' | 'soft' | 'none';
  warningThreshold?: number; // Percentage
  resetInterval?: 'daily' | 'weekly' | 'monthly' | 'never';
}

export interface QuotaUsage {
  current: number;
  max: number;
  percentage: number;
  remaining: number;
  unit: string;
  lastReset?: Date;
  violations?: QuotaViolation[];
}

export interface QuotaViolation {
  timestamp: Date;
  requested: number;
  available: number;
  type: 'exceeded' | 'warning';
  action: 'blocked' | 'allowed' | 'warned';
}

export interface QuotaScope {
  type: 'user' | 'project' | 'organization' | 'global';
  id: string;
}

export interface QuotaManagerOptions {
  logger?: Logger;
  persistState?: boolean;
  statePath?: string;
  defaultLimits?: Record<string, QuotaLimit>;
}

export class QuotaManager extends EventEmitter {
  private quotas: Map<string, Map<string, QuotaDefinition>> = new Map();
  private usage: Map<string, Map<string, Map<string, QuotaUsage>>> = new Map();
  private logger: Logger;
  private resetTimers: Map<string, NodeJS.Timeout> = new Map();
  private defaultLimits: Record<string, QuotaLimit>;

  constructor(options: QuotaManagerOptions = {}) {
    super();
    this.logger = options.logger || new Logger({ name: 'quota-manager' });
    
    this.defaultLimits = options.defaultLimits || {
      'api.requests': {
        max: 1000,
        unit: 'requests',
        enforcementMode: 'hard',
        warningThreshold: 80,
        resetInterval: 'daily'
      },
      'storage.size': {
        max: 10 * 1024 * 1024 * 1024, // 10GB
        unit: 'bytes',
        enforcementMode: 'hard',
        warningThreshold: 90
      },
      'compute.time': {
        max: 3600 * 1000, // 1 hour in ms
        unit: 'milliseconds',
        enforcementMode: 'soft',
        warningThreshold: 75,
        resetInterval: 'daily'
      }
    };

    // Initialize scope maps
    for (const scopeType of ['user', 'project', 'organization', 'global']) {
      this.quotas.set(scopeType, new Map());
      this.usage.set(scopeType, new Map());
    }
  }

  defineQuota(scope: QuotaScope, definition: QuotaDefinition): void {
    const scopeQuotas = this.quotas.get(scope.type);
    if (!scopeQuotas) {
      throw new Error(`Invalid scope type: ${scope.type}`);
    }

    scopeQuotas.set(scope.id, definition);

    // Initialize usage tracking
    const scopeUsage = this.usage.get(scope.type)!;
    if (!scopeUsage.has(scope.id)) {
      scopeUsage.set(scope.id, new Map());
    }

    const entityUsage = scopeUsage.get(scope.id)!;
    for (const [resourceName, limit] of Object.entries(definition.limits)) {
      if (!entityUsage.has(resourceName)) {
        entityUsage.set(resourceName, {
          current: 0,
          max: limit.max,
          percentage: 0,
          remaining: limit.max,
          unit: limit.unit,
          lastReset: new Date()
        });
      }

      // Setup reset timer if needed
      if (limit.resetInterval && limit.resetInterval !== 'never') {
        this.setupResetTimer(scope, resourceName, limit.resetInterval);
      }
    }

    this.emit('quota:defined', { scope, definition });
    this.logger.info(`Defined quota for ${scope.type}:${scope.id}`);
  }

  async checkQuota(
    scope: QuotaScope, 
    resource: string, 
    requested: number
  ): Promise<{ allowed: boolean; reason?: string; usage?: QuotaUsage }> {
    const quota = this.getQuota(scope, resource);
    if (!quota) {
      // No quota defined, check defaults
      const defaultLimit = this.defaultLimits[resource];
      if (defaultLimit) {
        this.defineQuota(scope, {
          name: 'default',
          limits: { [resource]: defaultLimit }
        });
        return this.checkQuota(scope, resource, requested);
      }
      
      // No quota restrictions
      return { allowed: true };
    }

    const usage = this.getUsage(scope, resource);
    if (!usage) {
      return { allowed: true };
    }

    const newTotal = usage.current + requested;
    const percentage = (newTotal / usage.max) * 100;
    const limit = quota.limits[resource];

    // Check warning threshold
    if (limit.warningThreshold && percentage >= limit.warningThreshold) {
      this.emit('quota:warning', {
        scope,
        resource,
        percentage,
        usage
      });
    }

    // Check quota limit
    if (newTotal > usage.max) {
      const violation: QuotaViolation = {
        timestamp: new Date(),
        requested,
        available: usage.remaining,
        type: 'exceeded',
        action: limit.enforcementMode === 'hard' ? 'blocked' : 'allowed'
      };

      if (!usage.violations) {
        usage.violations = [];
      }
      usage.violations.push(violation);

      if (limit.enforcementMode === 'hard') {
        this.emit('quota:exceeded', {
          scope,
          resource,
          requested,
          available: usage.remaining,
          usage
        });

        return {
          allowed: false,
          reason: `Quota exceeded: requested ${requested} ${limit.unit}, available ${usage.remaining} ${limit.unit}`,
          usage
        };
      } else if (limit.enforcementMode === 'soft') {
        this.logger.warn(`Soft quota exceeded for ${scope.type}:${scope.id} - ${resource}`);
        this.emit('quota:soft-exceeded', {
          scope,
          resource,
          requested,
          usage
        });
      }
    }

    return { allowed: true, usage };
  }

  async consumeQuota(
    scope: QuotaScope,
    resource: string,
    amount: number
  ): Promise<QuotaUsage> {
    const check = await this.checkQuota(scope, resource, amount);
    
    if (!check.allowed && check.usage) {
      const limit = this.getQuota(scope, resource)?.limits[resource];
      if (limit?.enforcementMode === 'hard') {
        throw new Error(check.reason || 'Quota exceeded');
      }
    }

    const usage = this.getUsage(scope, resource);
    if (!usage) {
      throw new Error(`No usage tracking for ${scope.type}:${scope.id} - ${resource}`);
    }

    usage.current += amount;
    usage.remaining = Math.max(0, usage.max - usage.current);
    usage.percentage = (usage.current / usage.max) * 100;

    this.emit('quota:consumed', {
      scope,
      resource,
      amount,
      usage
    });

    return usage;
  }

  async releaseQuota(
    scope: QuotaScope,
    resource: string,
    amount: number
  ): Promise<QuotaUsage> {
    const usage = this.getUsage(scope, resource);
    if (!usage) {
      throw new Error(`No usage tracking for ${scope.type}:${scope.id} - ${resource}`);
    }

    usage.current = Math.max(0, usage.current - amount);
    usage.remaining = usage.max - usage.current;
    usage.percentage = (usage.current / usage.max) * 100;

    this.emit('quota:released', {
      scope,
      resource,
      amount,
      usage
    });

    return usage;
  }

  resetQuota(scope: QuotaScope, resource?: string): void {
    const scopeUsage = this.usage.get(scope.type)?.get(scope.id);
    if (!scopeUsage) {
      return;
    }

    if (resource) {
      // Reset specific resource
      const usage = scopeUsage.get(resource);
      if (usage) {
        usage.current = 0;
        usage.remaining = usage.max;
        usage.percentage = 0;
        usage.lastReset = new Date();
        usage.violations = [];

        this.emit('quota:reset', { scope, resource, usage });
      }
    } else {
      // Reset all resources for scope
      for (const [res, usage] of scopeUsage.entries()) {
        usage.current = 0;
        usage.remaining = usage.max;
        usage.percentage = 0;
        usage.lastReset = new Date();
        usage.violations = [];

        this.emit('quota:reset', { scope, resource: res, usage });
      }
    }
  }

  getQuota(scope: QuotaScope, resource: string): QuotaDefinition | undefined {
    // Check specific scope
    const scopeQuotas = this.quotas.get(scope.type)?.get(scope.id);
    if (scopeQuotas?.limits[resource]) {
      return scopeQuotas;
    }

    // Check parent scopes (e.g., organization for project)
    if (scope.type === 'project') {
      // Would need project -> org mapping
      // Simplified for this example
    }

    // Check global quotas
    const globalQuotas = this.quotas.get('global')?.get('default');
    if (globalQuotas?.limits[resource]) {
      return globalQuotas;
    }

    return undefined;
  }

  getUsage(scope: QuotaScope, resource: string): QuotaUsage | undefined {
    return this.usage.get(scope.type)?.get(scope.id)?.get(resource);
  }

  getAllUsage(scope: QuotaScope): Map<string, QuotaUsage> | undefined {
    return this.usage.get(scope.type)?.get(scope.id);
  }

  getQuotaSummary(scope: QuotaScope): Array<{
    resource: string;
    usage: QuotaUsage;
    limit: QuotaLimit;
    status: 'ok' | 'warning' | 'exceeded';
  }> {
    const summary: Array<any> = [];
    const quota = this.quotas.get(scope.type)?.get(scope.id);
    const usageMap = this.usage.get(scope.type)?.get(scope.id);

    if (!quota || !usageMap) {
      return summary;
    }

    for (const [resource, limit] of Object.entries(quota.limits)) {
      const usage = usageMap.get(resource);
      if (!usage) continue;

      let status: 'ok' | 'warning' | 'exceeded' = 'ok';
      if (usage.percentage >= 100) {
        status = 'exceeded';
      } else if (limit.warningThreshold && usage.percentage >= limit.warningThreshold) {
        status = 'warning';
      }

      summary.push({
        resource,
        usage,
        limit,
        status
      });
    }

    return summary;
  }

  private setupResetTimer(
    scope: QuotaScope,
    resource: string,
    interval: 'daily' | 'weekly' | 'monthly'
  ): void {
    const key = `${scope.type}:${scope.id}:${resource}`;
    
    // Clear existing timer
    if (this.resetTimers.has(key)) {
      clearInterval(this.resetTimers.get(key)!);
    }

    const ms = this.getResetInterval(interval);
    const timer = setInterval(() => {
      this.resetQuota(scope, resource);
      this.logger.debug(`Reset quota for ${key}`);
    }, ms);

    this.resetTimers.set(key, timer);
  }

  private getResetInterval(interval: 'daily' | 'weekly' | 'monthly'): number {
    switch (interval) {
      case 'daily':
        return 24 * 60 * 60 * 1000;
      case 'weekly':
        return 7 * 24 * 60 * 60 * 1000;
      case 'monthly':
        return 30 * 24 * 60 * 60 * 1000;
    }
  }

  stop(): void {
    for (const timer of this.resetTimers.values()) {
      clearInterval(timer);
    }
    this.resetTimers.clear();
  }

  // Export/Import for persistence
  exportState(): any {
    const state: any = {
      quotas: {},
      usage: {}
    };

    for (const [scopeType, scopes] of this.quotas.entries()) {
      state.quotas[scopeType] = {};
      for (const [scopeId, quota] of scopes.entries()) {
        state.quotas[scopeType][scopeId] = quota;
      }
    }

    for (const [scopeType, scopes] of this.usage.entries()) {
      state.usage[scopeType] = {};
      for (const [scopeId, resources] of scopes.entries()) {
        state.usage[scopeType][scopeId] = {};
        for (const [resource, usage] of resources.entries()) {
          state.usage[scopeType][scopeId][resource] = usage;
        }
      }
    }

    return state;
  }

  importState(state: any): void {
    // Clear current state
    this.quotas.clear();
    this.usage.clear();
    
    // Import quotas
    for (const [scopeType, scopes] of Object.entries(state.quotas)) {
      const typeMap = new Map();
      for (const [scopeId, quota] of Object.entries(scopes as any)) {
        typeMap.set(scopeId, quota);
      }
      this.quotas.set(scopeType, typeMap);
    }

    // Import usage
    for (const [scopeType, scopes] of Object.entries(state.usage)) {
      const typeMap = new Map();
      for (const [scopeId, resources] of Object.entries(scopes as any)) {
        const resourceMap = new Map();
        for (const [resource, usage] of Object.entries(resources as any)) {
          resourceMap.set(resource, usage);
        }
        typeMap.set(scopeId, resourceMap);
      }
      this.usage.set(scopeType, typeMap);
    }
  }
}

// Global instance
let globalQuotaManager: QuotaManager | null = null;

export function getQuotaManager(): QuotaManager {
  if (!globalQuotaManager) {
    globalQuotaManager = new QuotaManager();
  }
  return globalQuotaManager;
}

export function setQuotaManager(manager: QuotaManager): void {
  if (globalQuotaManager) {
    globalQuotaManager.stop();
  }
  globalQuotaManager = manager;
}