/**
 * UI Configuration system exports
 */

export * from './types.js';
export * from './workspace-manager.js';
export * from './ui-configuration-manager.js';

import { WorkspaceManager } from './workspace-manager.js';
import { getGlobalConfigDir } from '../../config/utils.js';
import { UIConfigurationManager } from './ui-configuration-manager.js';

// Create singleton instances
let _configManager: UIConfigurationManager | null = null;

/**
 * Get or create the singleton UI configuration manager
 */
export function getUIConfigManager(): UIConfigurationManager {
  if (!_configManager) {
    _configManager = new UIConfigurationManager({
      globalConfigDir: getGlobalConfigDir(),
      autoSave: true,
      validate: true,
      createIfMissing: true
    });
  }
  return _configManager;
}

/**
 * Get the singleton workspace manager
 * The WorkspaceManager now handles its own singleton pattern with:
 * - Safe multiple initialization calls
 * - Auto-initialization on async methods
 * - Sync methods for quick access when already initialized
 * - Thread-safe initialization with promise deduplication
 * 
 * @returns The singleton WorkspaceManager instance
 */
export function getWorkspaceManager(): WorkspaceManager {
  return WorkspaceManager.getInstance(getUIConfigManager(), {
    autoDiscover: false,
    validatePaths: true,
    autoCleanup: false
  });
}

/**
 * Initialize the UI configuration system
 */
export async function initializeUIConfig(): Promise<void> {
  const workspaceManager = getWorkspaceManager();
  await workspaceManager.initialize();
}

/**
 * Helper function to add current directory as workspace
 */
export async function addCurrentWorkspace(): Promise<void> {
  const workspaceManager = getWorkspaceManager();
  const currentPath = process.cwd();

  try {
    const workspace = await workspaceManager.add(currentPath);
    console.log(`Added workspace: ${workspace.name} (${workspace.path})`);
  } catch (error: any) {
    console.error(`Failed to add workspace: ${error.message}`);
  }
}

/**
 * Helper function to set current directory as active workspace
 */
export async function setCurrentWorkspaceActive(): Promise<void> {
  const workspaceManager = getWorkspaceManager();
  const currentPath = process.cwd();

  const workspace = await workspaceManager.getByPath(currentPath);
  if (workspace) {
    await workspaceManager.setActive(workspace.id);
    console.log(`Set active workspace: ${workspace.name}`);
  } else {
    console.error('Current directory is not a registered workspace');
  }
}