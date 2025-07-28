/**
 * CLI API for scripts
 * 
 * This module provides the configuration and utilities for scripts
 * executed by the xec CLI. Scripts can import this to access:
 * - Configured hosts, containers, and pods
 * - Command aliases
 * - Utility functions
 * 
 * @example
 * ```typescript
 * import { $, config, hosts, containers, pods } from '@xec-sh/cli';
 * 
 * // Use configured SSH host
 * const $prod = $.ssh(config.hosts.prod);
 * await $prod`uptime`;
 * 
 * // Or use the convenience function
 * await hosts.prod`uptime`;
 * 
 * // Access containers
 * await containers.app`npm test`;
 * 
 * // Access pods
 * await pods.web.exec`date`;
 * ```
 */

import { unifiedConfig } from '@xec-sh/core';
import { $, type DockerContext, type SSHExecutionContext, type K8sExecutionContext } from '@xec-sh/core';

/**
 * Load and export the current configuration
 */
export async function loadCliConfig() {
  await unifiedConfig.load();
  return unifiedConfig.get();
}

/**
 * Get the current configuration synchronously
 * Note: This requires loadCliConfig() to have been called first
 */
export function getConfig() {
  return unifiedConfig.get();
}

/**
 * Proxy object that provides convenient access to configured hosts
 */
export const hosts = new Proxy({} as Record<string, SSHExecutionContext>, {
  get(target, prop: string) {
    const host = unifiedConfig.getHost(prop);
    if (!host) {
      throw new Error(`Host '${prop}' not found in configuration`);
    }
    
    const sshOptions: Parameters<typeof $.ssh>[0] = {
      host: host.host,
      username: host.username || process.env['USER'] || 'root'
    };
    
    if (host.password) sshOptions.password = host.password;
    if (host.privateKey) sshOptions.privateKey = host.privateKey;
    if (host.port) sshOptions.port = host.port;
    
    return $.ssh(sshOptions);
  }
});

/**
 * Proxy object that provides convenient access to configured containers
 */
export const containers = new Proxy({} as Record<string, DockerContext>, {
  get(target, prop: string) {
    const container = unifiedConfig.getContainer(prop);
    if (!container) {
      throw new Error(`Container '${prop}' not found in configuration`);
    }
    
    // Return a callable that executes in the container
    const containerName = container.container || container.name;
    if (!containerName) {
      throw new Error(`Container '${prop}' has no name specified`);
    }
    
    return $.docker({ container: containerName });
  }
});

/**
 * Proxy object that provides convenient access to configured pods
 */
export const pods = new Proxy({} as Record<string, K8sExecutionContext>, {
  get(target, prop: string) {
    const pod = unifiedConfig.getPod(prop);
    if (!pod) {
      throw new Error(`Pod '${prop}' not found in configuration`);
    }
    
    return $.k8s({
      pod: pod.name,
      namespace: pod.namespace,
      container: pod.container
    });
  }
});

/**
 * Get command aliases
 */
export function getAliases(): Record<string, string> {
  return unifiedConfig.get().aliases || {};
}

/**
 * Resolve a command alias
 */
export function resolveAlias(alias: string): string | undefined {
  return unifiedConfig.resolveAlias(alias);
}

/**
 * Run a command alias
 */
export async function runAlias(alias: string): Promise<any> {
  const command = resolveAlias(alias);
  if (!command) {
    throw new Error(`Alias '${alias}' not found`);
  }
  
  // Execute the alias command using the shell
  return $`sh -c ${command}`;
}

/**
 * List all available hosts
 */
export function listHosts(): string[] {
  return unifiedConfig.listHosts();
}

/**
 * List all available containers
 */
export function listContainers(): string[] {
  return unifiedConfig.listContainers();
}

/**
 * List all available pods
 */
export function listPods(): string[] {
  return unifiedConfig.listPods();
}

/**
 * Apply a configuration profile
 */
export function useProfile(profileName: string): void {
  unifiedConfig.applyProfile(profileName);
}

/**
 * Get current profile
 */
export function getCurrentProfile(): string | undefined {
  return unifiedConfig.getActiveProfile();
}

// Re-export $ and types from core for convenience
export { $ } from '@xec-sh/core';
export type { 
  PodConfig, 
  HostConfig, 
  DockerContext,
  UnifiedConfig,
  ContainerConfig,
  SSHExecutionContext,
  K8sExecutionContext
} from '@xec-sh/core';

/**
 * Configuration object
 * This provides access to the raw configuration
 */
export const config = {
  get hosts() {
    return unifiedConfig.get().hosts || {};
  },
  
  get containers() {
    return unifiedConfig.get().containers || {};
  },
  
  get pods() {
    return unifiedConfig.get().pods || {};
  },
  
  get aliases() {
    return unifiedConfig.get().aliases || {};
  },
  
  get defaults() {
    return unifiedConfig.get().defaults || {};
  },
  
  get profiles() {
    return unifiedConfig.get().profiles || {};
  },
  
  /**
   * Get the full configuration
   */
  get all() {
    return unifiedConfig.get();
  },
  
  /**
   * Get a specific value by path
   */
  get(path: string) {
    return unifiedConfig.getValue(path);
  },
  
  /**
   * List configured resources
   */
  list: {
    hosts: listHosts,
    containers: listContainers,
    pods: listPods,
    profiles: () => unifiedConfig.listProfiles()
  }
};

// Initialize configuration on module load
// This ensures config is available when scripts import this module
if (typeof process !== 'undefined' && process.env['XEC_SCRIPT_MODE'] === 'true') {
  // Load config synchronously for scripts
  (async () => {
    try {
      await loadCliConfig();
    } catch (error) {
      console.warn('Warning: Failed to load CLI configuration:', error);
    }
  })();
}