/**
 * Default configuration values for Xec
 */

export interface DefaultConfig {
  version?: string;
  name?: string;
  description?: string;
  targets?: {
    local?: any;
    hosts?: Record<string, any>;
    containers?: Record<string, any>;
    pods?: Record<string, any>;
    defaults?: {
      ssh?: {
        port?: number;
        keepAlive?: boolean;
        keepAliveInterval?: number;
        timeout?: number;
      };
      docker?: {
        workdir?: string;
        tty?: boolean;
        interactive?: boolean;
      };
      kubernetes?: {
        namespace?: string;
        context?: string;
      };
    };
  };
  commands?: {
    exec?: {
      shell?: string;
      tty?: boolean;
      interactive?: boolean;
    };
    logs?: {
      tail?: string;
      timestamps?: boolean;
      follow?: boolean;
      prefix?: boolean;
      since?: string;
      until?: string;
      grep?: string;
      color?: boolean;
    };
    cp?: {
      recursive?: boolean;
      preserveMode?: boolean;
      preserveTimestamps?: boolean;
      followSymlinks?: boolean;
    };
    sync?: {
      delete?: boolean;
      exclude?: string[];
      dryRun?: boolean;
    };
  };
  secrets?: {
    provider?: 'env' | 'file' | 'vault';
    path?: string;
  };
  vars?: Record<string, string>;
  tasks?: Record<string, any>;
}

/**
 * Get default configuration values
 */
export function getDefaultConfig(): DefaultConfig {
  return {
    version: '1.0.0',
    name: 'my-project',
    description: 'A Xec managed project',
    targets: {
      local: {
        type: 'local'
      },
      defaults: {
        ssh: {
          port: 22,
          keepAlive: true,
          keepAliveInterval: 30000,
          timeout: 60000
        },
        docker: {
          workdir: '/app',
          tty: true,
          interactive: true
        },
        kubernetes: {
          namespace: 'default',
          context: undefined
        }
      }
    },
    commands: {
      exec: {
        shell: '/bin/sh',
        tty: true,
        interactive: true
      },
      logs: {
        tail: '50',
        timestamps: false,
        follow: false,
        prefix: false,
        since: undefined,
        until: undefined,
        grep: undefined,
        color: true
      },
      cp: {
        recursive: true,
        preserveMode: true,
        preserveTimestamps: false,
        followSymlinks: false
      },
      sync: {
        delete: false,
        exclude: [],
        dryRun: false
      }
    },
    secrets: {
      provider: 'env',
      path: undefined
    },
    vars: {},
    tasks: {}
  };
}

/**
 * Define the order of root keys for sorting
 */
export const ROOT_KEY_ORDER = [
  'version',
  'name',
  'description',
  'defaults',
  'targets',
  'commands',
  'secrets',
  'vars',
  'tasks'
];

/**
 * Sort configuration keys according to the defined order
 */
export function sortConfigKeys(config: any): any {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return config;
  }

  const sorted: any = {};

  // First add keys in the defined order
  for (const key of ROOT_KEY_ORDER) {
    if (key in config) {
      sorted[key] = config[key];
    }
  }

  // Then add any remaining custom keys
  for (const key in config) {
    if (!ROOT_KEY_ORDER.includes(key)) {
      sorted[key] = config[key];
    }
  }

  return sorted;
}

/**
 * Merge configuration with defaults
 */
export function mergeWithDefaults(config: any, defaults: any = getDefaultConfig()): any {
  const result: any = {};

  // Start with defaults
  for (const key in defaults) {
    if (defaults[key] !== undefined) {
      if (typeof defaults[key] === 'object' && !Array.isArray(defaults[key]) && defaults[key] !== null) {
        result[key] = mergeWithDefaults(config?.[key] || {}, defaults[key]);
      } else {
        result[key] = config?.[key] !== undefined ? config[key] : defaults[key];
      }
    }
  }

  // Add any keys from config that aren't in defaults
  for (const key in config) {
    if (!(key in result)) {
      result[key] = config[key];
    }
  }

  return result;
}

/**
 * Check if a value is a default value
 */
export function isDefaultValue(path: string, value: any, defaults: any = getDefaultConfig()): boolean {
  const keys = path.split('.');
  let defaultValue: any = defaults;

  for (const key of keys) {
    if (defaultValue && typeof defaultValue === 'object' && key in defaultValue) {
      defaultValue = defaultValue[key];
    } else {
      return false;
    }
  }

  return JSON.stringify(value) === JSON.stringify(defaultValue);
}