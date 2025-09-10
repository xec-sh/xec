/**
 * Workspace Manager - High-level API for managing xec workspaces
 */

import * as path from 'path';
import { homedir } from 'os';
import * as fs from 'fs/promises';

import { UIConfigurationManager } from './ui-configuration-manager.js';

import type { Workspace, WorkspaceManagerOptions } from './types.js';

/**
 * Workspace manager for easy workspace operations
 * Implements singleton pattern with lazy initialization
 * 
 * Usage:
 * ```typescript
 * // Get instance (first call requires configManager)
 * const manager = WorkspaceManager.getInstance(configManager);
 * 
 * // Subsequent calls don't need parameters
 * const sameManager = WorkspaceManager.getInstance();
 * 
 * // Async methods auto-initialize if needed
 * const workspaces = await manager.getAll(); // Will initialize if needed
 * 
 * // Sync methods require prior initialization
 * await manager.initialize(); // Safe to call multiple times
 * const workspaces = manager.getAllSync(); // Now safe to use
 * 
 * // Check initialization status
 * if (manager.isInitialized()) {
 *   const workspace = manager.getSync('id'); // Safe
 * } else {
 *   const workspace = await manager.get('id'); // Will auto-initialize
 * }
 * ```
 */
export class WorkspaceManager {
  private static instance: WorkspaceManager | null = null;
  private configManager: UIConfigurationManager;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private constructor(
    configManager: UIConfigurationManager,
    private options: WorkspaceManagerOptions = {}
  ) {
    this.configManager = configManager;

    // Set default options
    this.options.autoDiscover = this.options.autoDiscover ?? false;
    this.options.validatePaths = this.options.validatePaths ?? true;
    this.options.autoCleanup = this.options.autoCleanup ?? false;
  }

  /**
   * Get singleton instance of WorkspaceManager
   * @param configManager - Optional config manager (only used on first call)
   * @param options - Optional workspace manager options (only used on first call)
   */
  static getInstance(
    configManager?: UIConfigurationManager,
    options?: WorkspaceManagerOptions
  ): WorkspaceManager {
    if (!WorkspaceManager.instance) {
      if (!configManager) {
        throw new Error('ConfigManager is required for first initialization');
      }
      WorkspaceManager.instance = new WorkspaceManager(configManager, options);
    }
    return WorkspaceManager.instance;
  }

  /**
   * Reset singleton instance (mainly for testing)
   */
  static resetInstance(): void {
    WorkspaceManager.instance = null;
  }

  /**
   * Check if the manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if initialization is in progress
   */
  isInitializing(): boolean {
    return this.initPromise !== null;
  }

  /**
   * Initialize the workspace manager (safe for multiple calls)
   */
  async initialize(): Promise<void> {
    // Return early if already initialized
    if (this.initialized) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    // Start initialization
    this.initPromise = this.performInitialization();

    try {
      await this.initPromise;
      this.initialized = true;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Perform actual initialization
   */
  private async performInitialization(): Promise<void> {
    // Load configuration
    await this.configManager.load();

    // Ensure global workspace exists
    await this.ensureGlobalWorkspace();

    // Auto-discover if enabled
    if (this.options.autoDiscover) {
      // Use internal version that doesn't call ensureInitialized
      await this.discoverAndAddInternal();
    }

    // Validate paths if enabled
    if (this.options.validatePaths) {
      // Use internal version that doesn't call ensureInitialized
      await this.validateWorkspacesInternal();
    }

    // Set global workspace as active if no other workspace is active
    await this.ensureActiveWorkspace();
  }

  /**
   * Ensure manager is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized && !this.initPromise) {
      await this.initialize();
    } else if (this.initPromise) {
      await this.initPromise;
    }
  }

  /**
   * Get all workspaces
   */
  async getAll(): Promise<Workspace[]> {
    await this.ensureInitialized();
    return this.configManager.getWorkspaces();
  }

  /**
   * Get all workspaces synchronously (only if already initialized)
   * @throws Error if not initialized
   * @deprecated Use async getAll() instead - sync version cannot enrich with xec config
   */
  getAllSync(): Workspace[] {
    if (!this.initialized) {
      throw new Error('WorkspaceManager not initialized. Call initialize() or use async getAll() instead.');
    }
    // This will not include description from xec config
    return this.configManager.getConfig().workspaces || [];
  }

  /**
   * Get workspace by ID
   */
  async get(id: string): Promise<Workspace | undefined> {
    await this.ensureInitialized();
    return this.configManager.getWorkspace(id);
  }

  /**
   * Get workspace by ID synchronously (only if already initialized)
   * @throws Error if not initialized
   * @deprecated Use async get() instead - sync version cannot enrich with xec config
   */
  getSync(id: string): Workspace | undefined {
    if (!this.initialized) {
      throw new Error('WorkspaceManager not initialized. Call initialize() or use async get() instead.');
    }
    // This will not include description from xec config
    return this.configManager.getConfig().workspaces?.find(w => w.id === id);
  }

  /**
   * Get workspace by path
   */
  async getByPath(workspacePath: string): Promise<Workspace | undefined> {
    await this.ensureInitialized();
    const normalizedPath = path.resolve(workspacePath);
    const workspaces = await this.getAll();
    return workspaces.find(w => path.resolve(w.path) === normalizedPath);
  }

  /**
   * Get workspace by path synchronously (only if already initialized)
   * @throws Error if not initialized
   */
  getByPathSync(workspacePath: string): Workspace | undefined {
    if (!this.initialized) {
      throw new Error('WorkspaceManager not initialized. Call initialize() or use async getByPath() instead.');
    }
    const normalizedPath = path.resolve(workspacePath);
    const workspaces = this.getAllSync();
    return workspaces.find(w => path.resolve(w.path) === normalizedPath);
  }

  /**
   * Add a workspace from path
   */
  async add(workspacePath: string, options?: Partial<Workspace>): Promise<Workspace> {
    await this.ensureInitialized();
    const normalizedPath = path.resolve(workspacePath);

    // Check if already exists
    const existing = await this.getByPath(normalizedPath);
    if (existing) {
      return existing;
    }

    // Validate it's a xec workspace
    await this.validateXecWorkspace(normalizedPath);

    // Get workspace name from directory or config
    const name = options?.name || await this.getWorkspaceName(normalizedPath);

    // Add workspace
    return this.configManager.addWorkspace({
      name,
      path: normalizedPath,
      description: options?.description,
      type: options?.type || 'project',
      tags: options?.tags,
      metadata: options?.metadata
    });
  }

  /**
   * Update a workspace
   */
  async update(id: string, updates: Partial<Workspace>): Promise<Workspace> {
    await this.ensureInitialized();
    return this.configManager.updateWorkspace(id, updates);
  }

  /**
   * Remove a workspace
   */
  async remove(id: string): Promise<void> {
    await this.ensureInitialized();
    this.configManager.removeWorkspace(id);
  }

  /**
   * Remove workspace by path
   */
  async removeByPath(workspacePath: string): Promise<void> {
    await this.ensureInitialized();
    const workspace = await this.getByPath(workspacePath);
    if (workspace) {
      await this.remove(workspace.id);
    }
  }

  /**
   * Set active workspace
   */
  async setActive(id: string): Promise<void> {
    await this.ensureInitialized();
    await this.configManager.setActiveWorkspace(id);
  }

  /**
   * Set active workspace by path
   */
  async setActiveByPath(workspacePath: string): Promise<void> {
    await this.ensureInitialized();
    const workspace = await this.getByPath(workspacePath);
    if (workspace) {
      await this.setActive(workspace.id);
    }
  }

  /**
   * Get active workspace
   */
  async getActive(): Promise<Workspace | undefined> {
    await this.ensureInitialized();
    return this.configManager.getActiveWorkspace();
  }

  /**
   * Get recent workspaces
   */
  async getRecent(limit?: number): Promise<Workspace[]> {
    await this.ensureInitialized();
    const config = this.configManager.getConfig();
    const recentIds = config.recentWorkspaces || [];
    const workspaces: Workspace[] = [];

    const maxLimit = limit || config.recent?.maxRecentWorkspaces || 10;

    for (const id of recentIds.slice(0, maxLimit)) {
      const workspace = await this.get(id);
      if (workspace) {
        workspaces.push(workspace);
      }
    }

    return workspaces;
  }

  /**
   * Search workspaces
   */
  async search(query: string): Promise<Workspace[]> {
    await this.ensureInitialized();
    const lowerQuery = query.toLowerCase();
    const workspaces = await this.getAll();
    return workspaces.filter(w =>
      w.name.toLowerCase().includes(lowerQuery) ||
      w.path.toLowerCase().includes(lowerQuery) ||
      w.description?.toLowerCase().includes(lowerQuery) ||
      w.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get workspaces by tag
   */
  async getByTag(tag: string): Promise<Workspace[]> {
    await this.ensureInitialized();
    const workspaces = await this.getAll();
    return workspaces.filter(w => w.tags?.includes(tag));
  }

  /**
   * Get workspaces by type
   */
  async getByType(type: string): Promise<Workspace[]> {
    await this.ensureInitialized();
    const workspaces = await this.getAll();
    return workspaces.filter(w => w.type === type);
  }

  /**
   * Discover and add workspaces
   */
  async discoverAndAdd(): Promise<Workspace[]> {
    await this.ensureInitialized();
    return this.discoverAndAddInternal();
  }

  /**
   * Internal version for use during initialization
   */
  private async discoverAndAddInternal(): Promise<Workspace[]> {
    const discovered = await this.configManager.discoverWorkspaces(this.options.scanPaths);
    const added: Workspace[] = [];

    for (const workspace of discovered) {
      try {
        const newWorkspace = await this.configManager.addWorkspace(workspace);
        added.push(newWorkspace);
      } catch (error) {
        // Workspace might already exist or be invalid
        console.debug(`Could not add discovered workspace: ${workspace.path}`, error);
      }
    }

    return added;
  }

  /**
   * Validate all workspace paths
   */
  async validateWorkspaces(): Promise<void> {
    await this.ensureInitialized();
    await this.validateWorkspacesInternal();
  }

  /**
   * Internal version for use during initialization
   */
  private async validateWorkspacesInternal(): Promise<void> {
    // Get workspaces directly from config (don't load xec configs for validation)
    const workspaces = this.configManager.getConfig().workspaces || [];
    const invalidIds: string[] = [];

    for (const workspace of workspaces) {
      try {
        await this.validateXecWorkspace(workspace.path);
      } catch {
        invalidIds.push(workspace.id);
      }
    }

    // Auto-cleanup if enabled
    if (this.options.autoCleanup && invalidIds.length > 0) {
      for (const id of invalidIds) {
        // Use config manager directly during initialization
        this.configManager.removeWorkspace(id);
      }
      console.log(`Removed ${invalidIds.length} invalid workspace(s)`);
    } else if (invalidIds.length > 0) {
      console.warn(`Found ${invalidIds.length} invalid workspace(s)`);
    }
  }

  /**
   * Export workspaces to JSON
   */
  async exportToJSON(): Promise<string> {
    await this.ensureInitialized();
    const workspaces = await this.getAll();
    return JSON.stringify(workspaces, null, 2);
  }

  /**
   * Import workspaces from JSON
   */
  async importFromJSON(json: string): Promise<Workspace[]> {
    await this.ensureInitialized();
    const workspaces = JSON.parse(json) as Workspace[];
    const imported: Workspace[] = [];

    for (const workspace of workspaces) {
      try {
        // Validate before importing
        await this.validateXecWorkspace(workspace.path);

        // Add or update
        const existing = await this.getByPath(workspace.path);
        if (existing) {
          const updated = await this.update(existing.id, workspace);
          imported.push(updated);
        } else {
          const added = await this.configManager.addWorkspace(workspace);
          imported.push(added);
        }
      } catch (error) {
        console.warn(`Could not import workspace: ${workspace.path}`, error);
      }
    }

    return imported;
  }

  /**
   * Get workspace statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byType: Record<string, number>;
    recentlyUsed: number;
    withTags: number;
  }> {
    await this.ensureInitialized();
    const workspaces = await this.getAll();
    const byType: Record<string, number> = {};
    let withTags = 0;
    let recentlyUsed = 0;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    for (const workspace of workspaces) {
      // Count by type
      const type = workspace.type || 'other';
      byType[type] = (byType[type] || 0) + 1;

      // Count with tags
      if (workspace.tags && workspace.tags.length > 0) {
        withTags++;
      }

      // Count recently used
      if (workspace.lastAccessed) {
        const lastAccessed = new Date(workspace.lastAccessed);
        if (lastAccessed > oneWeekAgo) {
          recentlyUsed++;
        }
      }
    }

    return {
      total: workspaces.length,
      byType,
      recentlyUsed,
      withTags
    };
  }

  /**
   * Save configuration
   */
  async save(): Promise<void> {
    await this.ensureInitialized();
    await this.configManager.save();
  }

  /**
   * Validate that a path is a xec workspace
   */
  private async validateXecWorkspace(workspacePath: string): Promise<void> {
    try {
      const stats = await fs.stat(workspacePath);
      if (!stats.isDirectory()) {
        throw new Error('Path is not a directory');
      }

      // Check for .xec directory
      const xecPath = path.join(workspacePath, '.xec');
      await fs.access(xecPath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error('Not a valid xec workspace (missing .xec directory)');
      }
      throw error;
    }
  }

  /**
   * Ensure the global (home directory) workspace exists
   */
  private async ensureGlobalWorkspace(): Promise<void> {
    const homeDir = homedir();

    // Check if global workspace already exists by path or metadata
    const workspaces = this.configManager.getConfig().workspaces || [];
    const existingGlobal = workspaces.find(w =>
      path.resolve(w.path) === path.resolve(homeDir) ||
      w.metadata?.['isGlobal'] === true
    );

    if (!existingGlobal) {
      // Create the global config directory if it doesn't exist
      try {
        await fs.access(homeDir);
      } catch {
        await fs.mkdir(homeDir, { recursive: true });
      }

      // Add home workspace to configuration
      // Note: addWorkspace will generate an ID based on the name
      await this.configManager.addWorkspace({
        name: 'Global Workspace',
        path: homeDir,
        description: 'Home xec configuration and scripts',
        type: 'global',
        tags: ['global', 'system', 'home'],
        metadata: {
          isGlobal: true
        }
      });

      console.log('Global workspace created at:', homeDir);
    } else {
      // Update the path if it has changed (e.g., XEC_HOME_DIR was set)
      if (path.resolve(existingGlobal.path) !== path.resolve(homeDir)) {
        await this.configManager.updateWorkspace(existingGlobal.id, {
          path: homeDir
        });
        console.log('Global workspace path updated to:', homeDir);
      }
    }
  }

  /**
   * Ensure there is an active workspace (set global as default if none)
   */
  private async ensureActiveWorkspace(): Promise<void> {
    const config = this.configManager.getConfig();
    const activeWorkspaceId = config.activeWorkspace;

    // Check if active workspace exists
    if (activeWorkspaceId) {
      const activeWorkspace = config.workspaces?.find(w => w.id === activeWorkspaceId);
      if (activeWorkspace) {
        // Active workspace exists and is valid
        return;
      }
    }

    // No active workspace or it's invalid, set global as active
    const homeDir = homedir();
    const globalWorkspace = config.workspaces?.find(w =>
      path.resolve(w.path) === path.resolve(homeDir) ||
      w.metadata?.['isGlobal'] === true
    );

    if (globalWorkspace) {
      await this.configManager.setActiveWorkspace(globalWorkspace.id);
      console.log('Global workspace set as active');
    }
  }

  /**
   * Get the global workspace
   */
  async getGlobalWorkspace(): Promise<Workspace | undefined> {
    await this.ensureInitialized();
    const homeDir = homedir();
    const workspaces = await this.getAll();
    return workspaces.find(w =>
      path.resolve(w.path) === path.resolve(homeDir) ||
      w.metadata?.['isGlobal'] === true
    );
  }

  /**
   * Get workspace name from path or config
   */
  private async getWorkspaceName(workspacePath: string): Promise<string> {
    // Try to read from xec config
    try {
      const configPath = path.join(workspacePath, '.xec', 'config.json');
      const content = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(content);
      if (config.name) {
        return config.name;
      }
    } catch {
      // Try YAML config as fallback
      try {
        const configPath = path.join(workspacePath, '.xec', 'config.yaml');
        const content = await fs.readFile(configPath, 'utf8');
        // Basic YAML parsing for name field
        const nameMatch = content?.match(/^name:\s*(.+)$/m);
        if (nameMatch && nameMatch[1]) {
          return nameMatch[1].trim().replace(/^["']|["']$/g, '');
        }
      } catch {
        // Фолбэк к имени директории
      }
    }

    return path.basename(workspacePath);
  }
}