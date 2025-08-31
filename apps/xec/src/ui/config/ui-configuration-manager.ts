/**
 * UI Configuration Manager - handles loading, saving, and managing UI configurations
 */

import * as path from 'path';
import { homedir } from 'os';
import jsYaml from 'js-yaml';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';

import type {
  Workspace,
  UIConfigSource,
  UIConfiguration,
  UIConfigChangeEvent,
  UIConfigManagerOptions,
  UIConfigValidationError
} from './types.js';

/**
 * Default UI configuration values
 */
const DEFAULT_UI_CONFIG: Partial<UIConfiguration> = {
  version: '1.0',
  workspaces: [],
  theme: {
    name: 'dark'
  },
  layout: {
    showSidebar: true,
    sidebarWidth: 30,
    showStatusBar: true,
    defaultFocus: 'sidebar'
  },
  keybindings: {
    toggleSidebar: 'ctrl+b',
    focusSidebar: 'ctrl+s',
    focusMain: 'ctrl+m',
    quickSwitch: 'ctrl+p',
    addWorkspace: 'ctrl+n',
    removeWorkspace: 'ctrl+d'
  },
  recent: {
    maxRecentWorkspaces: 10,
    maxRecentCommands: 50,
    clearOnExit: false
  },
  recentWorkspaces: [],
  preferences: {
    autoDiscover: false,
    scanPaths: [],
    confirmRemove: true,
    autoSave: true,
    showHidden: false
  }
};

/**
 * UI Configuration manager implementation
 */
export class UIConfigurationManager extends EventEmitter {
  private sources: UIConfigSource[] = [];
  private config: UIConfiguration;
  private configPath: string;
  private autoSaveTimer?: NodeJS.Timeout;

  constructor(private options: UIConfigManagerOptions) {
    super();

    // Set default options
    this.options.globalConfigDir = this.options.globalConfigDir || path.join(homedir(), '.xec');
    this.options.configFileName = this.options.configFileName || 'ui.yaml';
    this.options.autoSave = this.options.autoSave ?? true;
    this.options.validate = this.options.validate ?? true;
    this.options.createIfMissing = this.options.createIfMissing ?? true;

    // Set config file path
    this.configPath = path.join(this.options.globalConfigDir, this.options.configFileName);

    // Initialize with defaults
    this.config = { ...DEFAULT_UI_CONFIG } as UIConfiguration;
  }

  /**
   * Load configuration from all sources
   */
  async load(): Promise<UIConfiguration> {
    // Clear previous state
    this.sources = [];

    // 1. Load default configuration
    this.addSource({
      type: 'default',
      priority: 0,
      config: DEFAULT_UI_CONFIG
    });

    // 2. Load global configuration file
    await this.loadGlobalConfig();

    // 3. Load environment overrides
    this.loadEnvironmentConfig();

    // 4. Merge configurations
    this.config = this.mergeConfigurations();

    // 5. Validate if requested
    if (this.options?.validate) {
      const errors = this.validate(this.config);
      if (errors.length > 0) {
        console.warn('UI configuration validation warnings:', errors);
      }
    }

    // 6. Clean up invalid workspaces
    await this.cleanupInvalidWorkspaces();

    this.emit('config-loaded', this.config);
    return this.config;
  }

  /**
   * Save configuration to file
   */
  async save(): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(this.options.globalConfigDir, { recursive: true });

      // Convert to YAML
      const yamlContent = jsYaml.dump(this.config, {
        indent: 2,
        lineWidth: 120,
        sortKeys: false
      });

      // Write to file
      await fs.writeFile(this.configPath, yamlContent, 'utf8');

      this.emit('config-saved', this.config);
    } catch (error) {
      console.error('Failed to save UI configuration:', error);
      throw error;
    }
  }

  /**
   * Schedule auto-save (debounced)
   */
  private scheduleAutoSave(): void {
    if (!this.options.autoSave) return;

    // Clear existing timer
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    // Schedule new save
    this.autoSaveTimer = setTimeout(() => {
      this.save().catch(error => {
        console.error('Auto-save failed:', error);
      });
    }, 1000); // 1 second debounce
  }

  /**
   * Get the current configuration
   */
  getConfig(): UIConfiguration {
    return this.config;
  }

  /**
   * Get all workspaces
   */
  getWorkspaces(): Workspace[] {
    return this.config.workspaces || [];
  }

  /**
   * Get workspace by ID
   */
  getWorkspace(id: string): Workspace | undefined {
    return this.config.workspaces?.find(w => w.id === id);
  }

  /**
   * Add a new workspace
   */
  async addWorkspace(workspace: Omit<Workspace, 'id' | 'createdAt'>): Promise<Workspace> {
    // Generate unique ID
    const id = this.generateWorkspaceId(workspace.name);

    // Create full workspace object
    const newWorkspace: Workspace = {
      ...workspace,
      id,
      createdAt: new Date().toISOString()
    };

    // Validate workspace path exists
    try {
      const stats = await fs.stat(workspace.path);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${workspace.path}`);
      }

      // Check if .xec directory exists
      const xecPath = path.join(workspace.path, '.xec');
      await fs.access(xecPath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Not a valid xec workspace: ${workspace.path}`);
      }
      throw error;
    }

    // Add to configuration
    if (!this.config.workspaces) {
      this.config.workspaces = [];
    }

    // Check for duplicates
    const existing = this.config.workspaces.find(w => w.path === workspace.path);
    if (existing) {
      throw new Error(`Workspace already exists: ${existing.name}`);
    }

    this.config.workspaces.push(newWorkspace);

    // Emit event
    this.emitChange({
      type: 'workspace-added',
      data: newWorkspace,
      timestamp: new Date()
    });

    // Auto-save
    this.scheduleAutoSave();

    return newWorkspace;
  }

  /**
   * Update an existing workspace
   */
  updateWorkspace(id: string, updates: Partial<Workspace>): Workspace {
    const workspace = this.getWorkspace(id);
    if (!workspace) {
      throw new Error(`Workspace not found: ${id}`);
    }

    // Store previous value
    const previous = { ...workspace };

    // Apply updates
    Object.assign(workspace, updates);

    // Update last accessed
    workspace.lastAccessed = new Date().toISOString();

    // Emit event
    this.emitChange({
      type: 'workspace-updated',
      data: workspace,
      previous,
      timestamp: new Date()
    });

    // Auto-save
    this.scheduleAutoSave();

    return workspace;
  }

  /**
   * Remove a workspace
   */
  removeWorkspace(id: string): void {
    const index = this.config.workspaces?.findIndex(w => w.id === id) ?? -1;
    if (index === -1) {
      throw new Error(`Workspace not found: ${id}`);
    }

    const removed = this.config.workspaces!.splice(index, 1)[0];

    // Remove from recent if present
    if (this.config.recentWorkspaces) {
      const recentIndex = this.config.recentWorkspaces.indexOf(id);
      if (recentIndex !== -1) {
        this.config.recentWorkspaces.splice(recentIndex, 1);
      }
    }

    // Clear active workspace if it was removed
    if (this.config.activeWorkspace === id) {
      this.config.activeWorkspace = undefined;
    }

    // Emit event
    this.emitChange({
      type: 'workspace-removed',
      data: removed,
      timestamp: new Date()
    });

    // Auto-save
    this.scheduleAutoSave();
  }

  /**
   * Set active workspace
   */
  setActiveWorkspace(id: string): void {
    const workspace = this.getWorkspace(id);
    if (!workspace) {
      throw new Error(`Workspace not found: ${id}`);
    }

    this.config.activeWorkspace = id;

    // Update last accessed
    workspace.lastAccessed = new Date().toISOString();

    // Update recent workspaces
    this.updateRecentWorkspaces(id);

    // Auto-save
    this.scheduleAutoSave();
  }

  /**
   * Get active workspace
   */
  getActiveWorkspace(): Workspace | undefined {
    if (!this.config.activeWorkspace) {
      return undefined;
    }
    return this.getWorkspace(this.config.activeWorkspace);
  }

  /**
   * Discover workspaces in specified paths
   */
  async discoverWorkspaces(scanPaths?: string[]): Promise<Workspace[]> {
    const paths = scanPaths || this.config.preferences?.scanPaths || [];
    const discovered: Workspace[] = [];

    for (const scanPath of paths) {
      try {
        const entries = await fs.readdir(scanPath, { withFileTypes: true });

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          const projectPath = path.join(scanPath, entry.name);
          const xecPath = path.join(projectPath, '.xec');

          try {
            // Check if .xec directory exists
            await fs.access(xecPath);

            // Check if not already in workspaces
            const existing = this.config.workspaces?.find(w => w.path === projectPath);
            if (!existing) {
              discovered.push({
                id: this.generateWorkspaceId(entry.name),
                name: entry.name,
                path: projectPath,
                type: 'project',
                createdAt: new Date().toISOString()
              });
            }
          } catch {
            // Not a xec project, skip
          }
        }
      } catch (error) {
        console.warn(`Failed to scan path: ${scanPath}`, error);
      }
    }

    return discovered;
  }

  /**
   * Load global configuration file
   */
  private async loadGlobalConfig(): Promise<void> {
    try {
      const content = await fs.readFile(this.configPath, 'utf8');
      const config = jsYaml.load(content) as UIConfiguration;

      this.addSource({
        type: 'global',
        path: this.configPath,
        priority: 10,
        config
      });
    } catch (error: any) {
      if (error.code === 'ENOENT' && this.options.createIfMissing) {
        // Create default config file
        await this.save();
      } else if (error.code !== 'ENOENT') {
        console.error('Failed to load UI configuration:', error);
      }
    }
  }

  /**
   * Load environment configuration
   */
  private loadEnvironmentConfig(): void {
    const config: Partial<UIConfiguration> = {};

    // Check for environment variables
    if (process.env['XEC_UI_THEME']) {
      config.theme = { name: process.env['XEC_UI_THEME'] as any };
    }

    if (Object.keys(config).length > 0) {
      this.addSource({
        type: 'environment',
        priority: 20,
        config
      });
    }
  }

  /**
   * Add a configuration source
   */
  private addSource(source: UIConfigSource): void {
    this.sources.push(source);
    this.sources.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Merge configurations from all sources
   */
  private mergeConfigurations(): UIConfiguration {
    let merged = {} as UIConfiguration;

    for (const source of this.sources) {
      merged = this.deepMerge(merged, source.config) as UIConfiguration;
    }

    return merged;
  }

  /**
   * Deep merge objects
   */
  private deepMerge(target: any, source: any): any {
    if (!source) return target;

    const result = { ...target };

    for (const key in source) {
      if (source[key] === null || source[key] === undefined) {
        continue;
      }

      if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Validate configuration
   */
  private validate(config: UIConfiguration): UIConfigValidationError[] {
    const errors: UIConfigValidationError[] = [];

    // Validate version
    if (!config.version) {
      errors.push({
        path: 'version',
        message: 'Version is required',
        severity: 'error'
      });
    }

    // Validate workspaces
    if (config.workspaces) {
      for (let i = 0; i < config.workspaces.length; i++) {
        const workspace = config.workspaces[i];
        if (!workspace) {
          errors.push({
            path: `workspaces[${i}]`,
            message: 'Workspace is required',
            severity: 'error'
          });
          continue;
        }
        if (!workspace.id) {
          errors.push({
            path: `workspaces[${i}].id`,
            message: 'Workspace ID is required',
            severity: 'error'
          });
        }
        if (!workspace.path) {
          errors.push({
            path: `workspaces[${i}].path`,
            message: 'Workspace path is required',
            severity: 'error'
          });
        }
      }
    }

    return errors;
  }

  /**
   * Clean up invalid workspaces
   */
  private async cleanupInvalidWorkspaces(): Promise<void> {
    if (!this.config.workspaces) return;

    const validWorkspaces: Workspace[] = [];

    for (const workspace of this.config.workspaces) {
      try {
        await fs.access(workspace.path);
        validWorkspaces.push(workspace);
      } catch {
        console.warn(`Removing invalid workspace: ${workspace.name} (${workspace.path})`);
      }
    }

    this.config.workspaces = validWorkspaces;
  }

  /**
   * Update recent workspaces list
   */
  private updateRecentWorkspaces(id: string): void {
    if (!this.config.recentWorkspaces) {
      this.config.recentWorkspaces = [];
    }

    // Remove if already in list
    const index = this.config.recentWorkspaces.indexOf(id);
    if (index !== -1) {
      this.config.recentWorkspaces.splice(index, 1);
    }

    // Add to front
    this.config.recentWorkspaces.unshift(id);

    // Limit to max recent
    const maxRecent = this.config.recent?.maxRecentWorkspaces || 10;
    if (this.config.recentWorkspaces.length > maxRecent) {
      this.config.recentWorkspaces = this.config.recentWorkspaces.slice(0, maxRecent);
    }
  }

  /**
   * Generate unique workspace ID
   */
  private generateWorkspaceId(name: string): string {
    const base = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    let id = base;
    let counter = 1;

    while (this.config.workspaces?.some(w => w.id === id)) {
      id = `${base}-${counter}`;
      counter++;
    }

    return id;
  }

  /**
   * Emit configuration change event
   */
  private emitChange(event: UIConfigChangeEvent): void {
    this.emit('config-changed', event);
  }
}