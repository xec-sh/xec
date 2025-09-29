/**
 * Utilities for Kubernetes/kubectl command execution
 */

import { platform } from 'node:os';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * Cache for kubectl executable path
 */
let cachedKubectlPath: string | null = null;

/**
 * Cache for kind executable path
 */
let cachedKindPath: string | null = null;

/**
 * Find kubectl executable path
 * @returns Path to kubectl executable or 'kubectl' if not found
 */
export function findKubectlPath(): string {
  // Return cached value if available
  if (cachedKubectlPath !== null) {
    return cachedKubectlPath;
  }

  const isWindows = platform() === 'win32';

  // Common kubectl installation paths
  const commonPaths = isWindows ? [
    'C:\\Program Files\\Docker\\Docker\\resources\\bin\\kubectl.exe',
    'C:\\Program Files\\kubectl\\kubectl.exe',
    'C:\\ProgramData\\kubectl\\kubectl.exe'
  ] : [
    '/usr/local/bin/kubectl',
    '/usr/bin/kubectl',
    '/opt/homebrew/bin/kubectl',
    '/opt/local/bin/kubectl',
    '/usr/local/opt/kubernetes-cli/bin/kubectl',
    '/Applications/Docker.app/Contents/Resources/bin/kubectl'
  ];

  // Check common paths first
  for (const path of commonPaths) {
    if (existsSync(path)) {
      cachedKubectlPath = path;
      return path;
    }
  }

  // Try to find kubectl using 'which' or 'where' command
  try {
    const findCommand = isWindows ? 'where' : 'which';
    const result = execSync(`${findCommand} kubectl`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();

    const kubectlPath = result.split('\n')[0];
    if (result && kubectlPath && existsSync(kubectlPath)) {
      cachedKubectlPath = kubectlPath;
      return kubectlPath;
    }
  } catch {
    // Ignore errors and fall back to default
  }

  // Fall back to 'kubectl' and let the system PATH handle it
  cachedKubectlPath = 'kubectl';
  return 'kubectl';
}

/**
 * Find kind executable path
 * @returns Path to kind executable or 'kind' if not found
 */
export function findKindPath(): string {
  // Return cached value if available
  if (cachedKindPath !== null) {
    return cachedKindPath;
  }

  const isWindows = platform() === 'win32';

  // Common kind installation paths
  const commonPaths = isWindows ? [
    'C:\\Program Files\\kind\\kind.exe',
    'C:\\ProgramData\\kind\\kind.exe',
    'C:\\tools\\kind\\kind.exe'
  ] : [
    '/opt/homebrew/bin/kind',
    '/usr/local/bin/kind',
    '/usr/bin/kind',
    '/opt/local/bin/kind',
    '/usr/local/opt/kind/bin/kind'
  ];

  // Check common paths first
  for (const path of commonPaths) {
    if (existsSync(path)) {
      cachedKindPath = path;
      return path;
    }
  }

  // Try to find kind using 'which' or 'where' command
  try {
    const findCommand = isWindows ? 'where' : 'which';
    const result = execSync(`${findCommand} kind`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();

    const kindPath = result.split('\n')[0];
    if (result && kindPath && existsSync(kindPath)) {
      cachedKindPath = kindPath;
      return kindPath;
    }
  } catch {
    // Ignore errors and fall back to default
  }

  // Fall back to 'kind' and let the system PATH handle it
  cachedKindPath = 'kind';
  return 'kind';
}

/**
 * Clear cached paths (useful for testing)
 */
export function clearPathCache(): void {
  cachedKubectlPath = null;
  cachedKindPath = null;
}

/**
 * Check if kubectl is available
 * @returns true if kubectl is available, false otherwise
 */
export function isKubectlAvailable(): boolean {
  try {
    const kubectlPath = findKubectlPath();
    if (kubectlPath === 'kubectl') {
      // Try to execute kubectl version to verify it's available
      execSync('kubectl version --client --short', {
        stdio: ['ignore', 'ignore', 'ignore']
      });
      return true;
    }
    return existsSync(kubectlPath);
  } catch {
    return false;
  }
}

/**
 * Check if kind is available
 * @returns true if kind is available, false otherwise
 */
export function isKindAvailable(): boolean {
  try {
    const kindPath = findKindPath();
    if (kindPath === 'kind') {
      // Try to execute kind version to verify it's available
      execSync('kind version', {
        stdio: ['ignore', 'ignore', 'ignore']
      });
      return true;
    }
    return existsSync(kindPath);
  } catch {
    return false;
  }
}