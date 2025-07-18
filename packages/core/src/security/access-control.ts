/**
 * Access control and RBAC (Role-Based Access Control) for Xec Core
 */

import * as crypto from 'crypto';

import { SecurityError } from '../core/errors.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('access-control');

export interface User {
  id: string;
  username: string;
  email?: string;
  roles: string[];
  permissions?: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
  active: boolean;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  conditions?: Record<string, any>;
  description?: string;
}

export interface AccessRequest {
  userId: string;
  resource: string;
  action: string;
  context?: Record<string, any>;
}

export interface AccessDecision {
  allowed: boolean;
  reason?: string;
  permissions?: string[];
  conditions?: Record<string, any>;
}

export interface Policy {
  id: string;
  name: string;
  description?: string;
  effect: 'allow' | 'deny';
  principals: string[]; // User or role IDs
  resources: string[];
  actions: string[];
  conditions?: Record<string, any>;
  priority?: number;
}

export class AccessControlManager {
  private users: Map<string, User> = new Map();
  private roles: Map<string, Role> = new Map();
  private policies: Map<string, Policy> = new Map();
  private sessionCache: Map<string, AccessDecision> = new Map();

  constructor() {
    // Initialize with default roles
    this.initializeDefaultRoles();
  }

  /**
   * Initialize default roles
   */
  private initializeDefaultRoles(): void {
    // Admin role
    this.roles.set('admin', {
      id: 'admin',
      name: 'Administrator',
      description: 'Full system access',
      permissions: ['*:*'], // All resources, all actions
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Operator role
    this.roles.set('operator', {
      id: 'operator',
      name: 'Operator',
      description: 'Run and monitor tasks',
      permissions: [
        'task:read',
        'task:execute',
        'recipe:read',
        'recipe:execute',
        'state:read',
        'monitor:read'
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Viewer role
    this.roles.set('viewer', {
      id: 'viewer',
      name: 'Viewer',
      description: 'Read-only access',
      permissions: [
        '*:read',
        '*:list'
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Developer role
    this.roles.set('developer', {
      id: 'developer',
      name: 'Developer',
      description: 'Development and testing access',
      permissions: [
        'task:*',
        'recipe:*',
        'module:*',
        'script:*',
        'state:read',
        'state:write',
        'monitor:read'
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  /**
   * Create a new user
   */
  async createUser(
    username: string,
    email?: string,
    roles: string[] = ['viewer']
  ): Promise<User> {
    // Check if user already exists
    for (const user of this.users.values()) {
      if (user.username === username) {
        throw new SecurityError(`User '${username}' already exists`);
      }
    }

    const user: User = {
      id: crypto.randomUUID(),
      username,
      email,
      roles,
      createdAt: new Date(),
      updatedAt: new Date(),
      active: true
    };

    this.users.set(user.id, user);
    logger.info(`Created user: ${username} (${user.id})`);

    return user;
  }

  /**
   * Get user by ID
   */
  async getUser(userId: string): Promise<User | undefined> {
    return this.users.get(userId);
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<User | undefined> {
    for (const user of this.users.values()) {
      if (user.username === username) {
        return user;
      }
    }
    return undefined;
  }

  /**
   * Update user
   */
  async updateUser(
    userId: string,
    updates: Partial<User>
  ): Promise<User> {
    const user = this.users.get(userId);
    if (!user) {
      throw new SecurityError('User not found');
    }

    const updatedUser = {
      ...user,
      ...updates,
      id: user.id, // Prevent ID change
      updatedAt: new Date()
    };

    this.users.set(userId, updatedUser);
    this.invalidateUserCache(userId);

    logger.info(`Updated user: ${updatedUser.username} (${userId})`);
    return updatedUser;
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;

    this.users.delete(userId);
    this.invalidateUserCache(userId);

    logger.info(`Deleted user: ${user.username} (${userId})`);
    return true;
  }

  /**
   * List all users
   */
  async listUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  /**
   * Create a new role
   */
  async createRole(
    name: string,
    permissions: string[],
    description?: string
  ): Promise<Role> {
    // Check if role already exists
    for (const role of this.roles.values()) {
      if (role.name === name) {
        throw new SecurityError(`Role '${name}' already exists`);
      }
    }

    const role: Role = {
      id: crypto.randomUUID(),
      name,
      description,
      permissions,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.roles.set(role.id, role);
    logger.info(`Created role: ${name} (${role.id})`);

    return role;
  }

  /**
   * Get role by ID
   */
  async getRole(roleId: string): Promise<Role | undefined> {
    return this.roles.get(roleId);
  }

  /**
   * Get role by name
   */
  async getRoleByName(name: string): Promise<Role | undefined> {
    for (const role of this.roles.values()) {
      if (role.name === name) {
        return role;
      }
    }
    return undefined;
  }

  /**
   * Update role
   */
  async updateRole(
    roleId: string,
    updates: Partial<Role>
  ): Promise<Role> {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new SecurityError('Role not found');
    }

    const updatedRole = {
      ...role,
      ...updates,
      id: role.id, // Prevent ID change
      updatedAt: new Date()
    };

    this.roles.set(roleId, updatedRole);
    this.invalidateRoleCache(roleId);

    logger.info(`Updated role: ${updatedRole.name} (${roleId})`);
    return updatedRole;
  }

  /**
   * Delete role
   */
  async deleteRole(roleId: string): Promise<boolean> {
    const role = this.roles.get(roleId);
    if (!role) return false;

    // Don't delete built-in roles
    if (['admin', 'operator', 'viewer', 'developer'].includes(roleId)) {
      throw new SecurityError('Cannot delete built-in role');
    }

    this.roles.delete(roleId);
    this.invalidateRoleCache(roleId);

    logger.info(`Deleted role: ${role.name} (${roleId})`);
    return true;
  }

  /**
   * List all roles
   */
  async listRoles(): Promise<Role[]> {
    return Array.from(this.roles.values());
  }

  /**
   * Grant role to user
   */
  async grantRole(userId: string, roleId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new SecurityError('User not found');
    }

    const role = this.roles.get(roleId);
    if (!role) {
      throw new SecurityError('Role not found');
    }

    if (!user.roles.includes(roleId)) {
      user.roles.push(roleId);
      user.updatedAt = new Date();
      this.invalidateUserCache(userId);

      logger.info(`Granted role '${role.name}' to user '${user.username}'`);
    }
  }

  /**
   * Revoke role from user
   */
  async revokeRole(userId: string, roleId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new SecurityError('User not found');
    }

    const index = user.roles.indexOf(roleId);
    if (index !== -1) {
      user.roles.splice(index, 1);
      user.updatedAt = new Date();
      this.invalidateUserCache(userId);

      logger.info(`Revoked role '${roleId}' from user '${user.username}'`);
    }
  }

  /**
   * Check access
   */
  async checkAccess(request: AccessRequest): Promise<AccessDecision> {
    // Check cache first
    const cacheKey = `${request.userId}:${request.resource}:${request.action}`;
    const cached = this.sessionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const user = this.users.get(request.userId);
    if (!user) {
      return { allowed: false, reason: 'User not found' };
    }

    if (!user.active) {
      return { allowed: false, reason: 'User is not active' };
    }

    // Collect all permissions from user's roles
    const permissions = new Set<string>();
    
    // Add direct user permissions
    if (user.permissions) {
      user.permissions.forEach(p => permissions.add(p));
    }

    // Add role permissions
    for (const roleId of user.roles) {
      const role = this.roles.get(roleId);
      if (role) {
        role.permissions.forEach(p => permissions.add(p));
      }
    }

    // Check permissions
    const decision = this.evaluatePermissions(
      Array.from(permissions),
      request.resource,
      request.action
    );

    // Check policies
    const policyDecision = this.evaluatePolicies(request);
    
    // Combine decisions (policies can override permissions)
    if (policyDecision.effect === 'deny') {
      decision.allowed = false;
      decision.reason = policyDecision.reason;
    } else if (policyDecision.effect === 'allow' && !decision.allowed) {
      decision.allowed = true;
      decision.reason = 'Allowed by policy';
    }

    // Cache the decision
    this.sessionCache.set(cacheKey, decision);

    // Log access attempt
    logger.info(`Access ${decision.allowed ? 'granted' : 'denied'} for user '${user.username}' to ${request.resource}:${request.action}`);

    return decision;
  }

  /**
   * Grant access (create allow policy)
   */
  async grantAccess(
    userId: string,
    resource: string,
    action: string,
    conditions?: Record<string, any>
  ): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new SecurityError('User not found');
    }

    const policy: Policy = {
      id: crypto.randomUUID(),
      name: `grant-${user.username}-${resource}-${action}`,
      description: `Grant ${action} on ${resource} to ${user.username}`,
      effect: 'allow',
      principals: [userId],
      resources: [resource],
      actions: [action],
      conditions,
      priority: 100
    };

    this.policies.set(policy.id, policy);
    this.invalidateUserCache(userId);

    logger.info(`Granted access for user '${user.username}' to ${resource}:${action}`);
  }

  /**
   * Deny access (create deny policy)
   */
  async denyAccess(
    userId: string,
    resource: string,
    action: string,
    conditions?: Record<string, any>
  ): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new SecurityError('User not found');
    }

    const policy: Policy = {
      id: crypto.randomUUID(),
      name: `deny-${user.username}-${resource}-${action}`,
      description: `Deny ${action} on ${resource} to ${user.username}`,
      effect: 'deny',
      principals: [userId],
      resources: [resource],
      actions: [action],
      conditions,
      priority: 200 // Deny has higher priority
    };

    this.policies.set(policy.id, policy);
    this.invalidateUserCache(userId);

    logger.info(`Denied access for user '${user.username}' to ${resource}:${action}`);
  }

  /**
   * Evaluate permissions
   */
  private evaluatePermissions(
    permissions: string[],
    resource: string,
    action: string
  ): AccessDecision {
    // Check for exact match
    const exactPermission = `${resource}:${action}`;
    if (permissions.includes(exactPermission)) {
      return { allowed: true, permissions: [exactPermission] };
    }

    // Check for wildcard permissions
    const wildcardPermissions = [
      '*:*',                    // All resources, all actions
      `${resource}:*`,          // Specific resource, all actions
      `*:${action}`,            // All resources, specific action
    ];

    for (const wildcard of wildcardPermissions) {
      if (permissions.includes(wildcard)) {
        return { allowed: true, permissions: [wildcard] };
      }
    }

    // Check for partial wildcards (e.g., 'task:*' matches 'task:subtask:action')
    for (const permission of permissions) {
      if (permission.includes('*')) {
        const pattern = permission.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(exactPermission)) {
          return { allowed: true, permissions: [permission] };
        }
      }
    }

    return { allowed: false, reason: 'No matching permissions' };
  }

  /**
   * Evaluate policies
   */
  private evaluatePolicies(request: AccessRequest): {
    effect?: 'allow' | 'deny';
    reason?: string;
  } {
    const applicablePolicies: Policy[] = [];

    // Find applicable policies
    for (const policy of this.policies.values()) {
      if (this.isPolicyApplicable(policy, request)) {
        applicablePolicies.push(policy);
      }
    }

    // Sort by priority (higher priority first)
    applicablePolicies.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Evaluate policies in order
    for (const policy of applicablePolicies) {
      if (this.evaluateConditions(policy.conditions, request.context)) {
        return {
          effect: policy.effect,
          reason: `${policy.effect === 'allow' ? 'Allowed' : 'Denied'} by policy: ${policy.name}`
        };
      }
    }

    return {};
  }

  /**
   * Check if policy is applicable to request
   */
  private isPolicyApplicable(policy: Policy, request: AccessRequest): boolean {
    // Check principals
    if (!policy.principals.includes(request.userId) && !policy.principals.includes('*')) {
      return false;
    }

    // Check resources
    const resourceMatch = policy.resources.some(r => {
      if (r === '*') return true;
      if (r === request.resource) return true;
      // Support wildcard matching
      const pattern = r.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(request.resource);
    });

    if (!resourceMatch) return false;

    // Check actions
    const actionMatch = policy.actions.some(a => {
      if (a === '*') return true;
      if (a === request.action) return true;
      // Support wildcard matching
      const pattern = a.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(request.action);
    });

    return actionMatch;
  }

  /**
   * Evaluate policy conditions
   */
  private evaluateConditions(
    conditions?: Record<string, any>,
    context?: Record<string, any>
  ): boolean {
    if (!conditions) return true;
    if (!context) return false;

    // Simple condition evaluation
    // In production, use a proper policy engine
    for (const [key, value] of Object.entries(conditions)) {
      if (context[key] !== value) {
        return false;
      }
    }

    return true;
  }

  /**
   * Invalidate cache for user
   */
  private invalidateUserCache(userId: string): void {
    // Remove all cached decisions for this user
    for (const key of this.sessionCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.sessionCache.delete(key);
      }
    }
  }

  /**
   * Invalidate cache for role
   */
  private invalidateRoleCache(roleId: string): void {
    // Remove all cached decisions for users with this role
    for (const user of this.users.values()) {
      if (user.roles.includes(roleId)) {
        this.invalidateUserCache(user.id);
      }
    }
  }

  /**
   * Export access control data
   */
  async export(): Promise<{
    users: User[];
    roles: Role[];
    policies: Policy[];
  }> {
    return {
      users: Array.from(this.users.values()),
      roles: Array.from(this.roles.values()),
      policies: Array.from(this.policies.values())
    };
  }

  /**
   * Import access control data
   */
  async import(data: {
    users?: User[];
    roles?: Role[];
    policies?: Policy[];
  }): Promise<void> {
    if (data.roles) {
      for (const role of data.roles) {
        this.roles.set(role.id, role);
      }
    }

    if (data.users) {
      for (const user of data.users) {
        this.users.set(user.id, user);
      }
    }

    if (data.policies) {
      for (const policy of data.policies) {
        this.policies.set(policy.id, policy);
      }
    }

    // Clear cache after import
    this.sessionCache.clear();
  }
}

// Global access control manager
let globalAccessControl: AccessControlManager | null = null;

export function getAccessControlManager(): AccessControlManager {
  if (!globalAccessControl) {
    globalAccessControl = new AccessControlManager();
  }
  return globalAccessControl;
}

// Helper functions
export async function checkAccess(
  userId: string,
  resource: string,
  action: string,
  context?: Record<string, any>
): Promise<boolean> {
  const manager = getAccessControlManager();
  const decision = await manager.checkAccess({ userId, resource, action, context });
  return decision.allowed;
}

export async function grantAccess(
  userId: string,
  resource: string,
  action: string
): Promise<void> {
  const manager = getAccessControlManager();
  await manager.grantAccess(userId, resource, action);
}

export async function createUser(
  username: string,
  email?: string,
  roles?: string[]
): Promise<User> {
  const manager = getAccessControlManager();
  return manager.createUser(username, email, roles);
}

export async function grantRole(userId: string, roleId: string): Promise<void> {
  const manager = getAccessControlManager();
  await manager.grantRole(userId, roleId);
}