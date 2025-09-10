/**
 * UI Configuration type definitions for Xec
 */

/**
 * Workspace definition - represents a known xec project
 */
export interface Workspace {
  /** Unique identifier for the workspace */
  id: string;

  /** Display name for the workspace */
  name: string;

  /** Absolute path to the workspace directory */
  path: string;

  /** Optional description */
  description?: string;

  /** Workspace type/category */
  type?: 'project' | 'library' | 'template' | 'global' | 'other';

  /** Tags for categorization */
  tags?: string[];

  /** Last accessed timestamp */
  lastAccessed?: string;

  /** Creation timestamp */
  createdAt?: string;

  /** Custom metadata */
  metadata?: Record<string, any>;
}

/**
 * UI theme configuration
 */
export interface UIThemeConfig {
  /** Theme name */
  name?: 'dark' | 'light' | 'ocean' | 'forest' | 'sunset';

  /** Custom theme overrides */
  overrides?: Record<string, any>;
}

/**
 * UI layout configuration
 */
export interface UILayoutConfig {
  /** Show sidebar on startup */
  showSidebar?: boolean;

  /** Sidebar width */
  sidebarWidth?: number;

  /** Show status bar */
  showStatusBar?: boolean;

  /** Default focused panel */
  defaultFocus?: 'sidebar' | 'main' | 'footer';
}

/**
 * UI keybindings configuration
 */
export interface UIKeybindingsConfig {
  /** Toggle sidebar */
  toggleSidebar?: string;

  /** Focus sidebar */
  focusSidebar?: string;

  /** Focus main panel */
  focusMain?: string;

  /** Quick workspace switch */
  quickSwitch?: string;

  /** Add new workspace */
  addWorkspace?: string;

  /** Remove workspace */
  removeWorkspace?: string;

  /** Custom keybindings */
  custom?: Record<string, string>;
}

/**
 * Recent items configuration
 */
export interface UIRecentConfig {
  /** Maximum number of recent workspaces to remember */
  maxRecentWorkspaces?: number;

  /** Maximum number of recent commands to remember */
  maxRecentCommands?: number;

  /** Clear recent items on exit */
  clearOnExit?: boolean;
}

/**
 * Main UI configuration interface
 */
export interface UIConfiguration {
  /** Configuration format version */
  version: string;

  /** List of known workspaces */
  workspaces?: Workspace[];

  /** Currently active workspace ID */
  activeWorkspace?: string;

  /** Theme configuration */
  theme?: UIThemeConfig;

  /** Layout configuration */
  layout?: UILayoutConfig;

  /** Keybindings configuration */
  keybindings?: UIKeybindingsConfig;

  /** Recent items configuration */
  recent?: UIRecentConfig;

  /** Recent workspace IDs (ordered by last access) */
  recentWorkspaces?: string[];

  /** User preferences */
  preferences?: {
    /** Auto-discover workspaces in home directory */
    autoDiscover?: boolean;

    /** Paths to scan for workspaces */
    scanPaths?: string[];

    /** Confirm before removing workspace */
    confirmRemove?: boolean;

    /** Auto-save configuration changes */
    autoSave?: boolean;

    /** Show hidden files in file browser */
    showHidden?: boolean;
  };

  /** Custom user data */
  custom?: Record<string, any>;
}

/**
 * Configuration source metadata
 */
export interface UIConfigSource {
  /** Source type */
  type: 'default' | 'global' | 'environment';

  /** Source file path (if applicable) */
  path?: string;

  /** Source priority (higher = higher priority) */
  priority: number;

  /** Configuration data */
  config: Partial<UIConfiguration>;
}

/**
 * Configuration manager options
 */
export interface UIConfigManagerOptions {
  /** Path to global config directory (default: ~/.xec) */
  globalConfigDir: string;

  /** Config file name (default: ui.yaml) */
  configFileName?: string;

  /** Auto-save configuration changes */
  autoSave?: boolean;

  /** Validate configuration on load */
  validate?: boolean;

  /** Create config file if it doesn't exist */
  createIfMissing?: boolean;
}

/**
 * Workspace manager options
 */
export interface WorkspaceManagerOptions {
  /** Auto-discover workspaces */
  autoDiscover?: boolean;

  /** Paths to scan for workspaces */
  scanPaths?: string[];

  /** Validate workspace paths on load */
  validatePaths?: boolean;

  /** Remove invalid workspaces automatically */
  autoCleanup?: boolean;
}

/**
 * Configuration change event
 */
export interface UIConfigChangeEvent {
  /** Type of change */
  type: 'workspace-added' | 'workspace-removed' | 'workspace-updated' | 'config-updated';

  /** Changed data */
  data?: any;

  /** Previous value (for updates) */
  previous?: any;

  /** Timestamp */
  timestamp: Date;
}

/**
 * Configuration validation error
 */
export interface UIConfigValidationError {
  /** Error path in configuration */
  path: string;

  /** Error message */
  message: string;

  /** Error severity */
  severity: 'error' | 'warning';
}