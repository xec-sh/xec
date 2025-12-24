import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { platform } from 'os';

/**
 * Common paths where binaries might be installed
 */
const COMMON_BINARY_PATHS: Record<string, string[]> = {
  docker: [
    '/usr/local/bin/docker',
    '/opt/homebrew/bin/docker',
    '/usr/bin/docker',
    '/snap/bin/docker',
  ],
  'docker-compose': [
    '/usr/local/bin/docker-compose',
    '/opt/homebrew/bin/docker-compose',
    '/usr/bin/docker-compose',
    '/snap/bin/docker-compose',
  ],
  kind: [
    '/usr/local/bin/kind',
    '/opt/homebrew/bin/kind',
    '/usr/bin/kind',
  ],
  kubectl: [
    '/usr/local/bin/kubectl',
    '/opt/homebrew/bin/kubectl',
    '/usr/bin/kubectl',
  ],
  sshpass: [
    '/usr/local/bin/sshpass',
    '/opt/homebrew/bin/sshpass',
    '/usr/bin/sshpass',
  ],
  nc: [
    '/usr/bin/nc',
    '/bin/nc',
    '/usr/local/bin/nc',
    '/opt/homebrew/bin/nc',
  ],
};

/**
 * Extended PATH for common installation directories
 */
export const EXTENDED_PATH = [
  process.env['PATH'] || '',
  '/usr/local/bin',
  '/opt/homebrew/bin',
  '/usr/bin',
  '/bin',
  '/snap/bin',
].filter(Boolean).join(':');

/**
 * Cache for discovered binary paths
 */
const binaryPathCache = new Map<string, string | null>();

/**
 * Find a binary in common locations or via which/where
 */
export function findBinary(name: string): string | null {
  // Check cache first
  if (binaryPathCache.has(name)) {
    return binaryPathCache.get(name) ?? null;
  }

  // Check predefined common paths
  const commonPaths = COMMON_BINARY_PATHS[name];
  if (commonPaths) {
    for (const path of commonPaths) {
      if (existsSync(path)) {
        binaryPathCache.set(name, path);
        return path;
      }
    }
  }

  // Try to find via which (Unix) or where (Windows)
  try {
    const cmd = platform() === 'win32' ? `where ${name}` : `which ${name}`;
    const result = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, PATH: EXTENDED_PATH },
    }).trim();

    if (result) {
      // Take the first line in case of multiple results
      const lines = result.split('\n');
      const firstLine = lines[0];
      if (firstLine) {
        const path = firstLine.trim();
        binaryPathCache.set(name, path);
        return path;
      }
    }
  } catch {
    // Binary not found
  }

  binaryPathCache.set(name, null);
  return null;
}

/**
 * Check if a binary is available
 */
export function isBinaryAvailable(name: string): boolean {
  return findBinary(name) !== null;
}

/**
 * Execute a command using the discovered binary path
 */
export function execWithBinary(
  name: string,
  args: string,
  options: {
    silent?: boolean;
    env?: NodeJS.ProcessEnv;
    cwd?: string;
  } = {}
): string {
  const binaryPath = findBinary(name);
  if (!binaryPath) {
    throw new Error(`Binary '${name}' not found. Check if it's installed.`);
  }

  const command = `${binaryPath} ${args}`;
  const result = execSync(command, {
    encoding: 'utf8',
    stdio: options.silent ? 'pipe' : 'inherit',
    env: {
      ...process.env,
      ...options.env,
      PATH: EXTENDED_PATH,
    },
    cwd: options.cwd,
  });

  return result ? result.toString() : '';
}

/**
 * Get environment with extended PATH
 */
export function getExtendedEnv(additionalEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...additionalEnv,
    PATH: EXTENDED_PATH,
  };
}

/**
 * Clear the binary path cache (useful for testing)
 */
export function clearBinaryCache(): void {
  binaryPathCache.clear();
}

/**
 * Check if Docker is available
 */
export function isDockerAvailable(): boolean {
  if (!isBinaryAvailable('docker')) {
    return false;
  }

  try {
    execWithBinary('docker', '--version', { silent: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if kind is available
 */
export function isKindAvailable(): boolean {
  if (!isBinaryAvailable('kind')) {
    return false;
  }

  try {
    execWithBinary('kind', 'version', { silent: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if kubectl is available
 */
export function isKubectlAvailable(): boolean {
  if (!isBinaryAvailable('kubectl')) {
    return false;
  }

  try {
    execWithBinary('kubectl', 'version --client', { silent: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if sshpass is available
 */
export function isSshpassAvailable(): boolean {
  return isBinaryAvailable('sshpass');
}

/**
 * Get Docker path
 */
export function getDockerPath(): string | null {
  return findBinary('docker');
}

/**
 * Get kind path
 */
export function getKindPath(): string | null {
  return findBinary('kind');
}

/**
 * Get kubectl path
 */
export function getKubectlPath(): string | null {
  return findBinary('kubectl');
}
