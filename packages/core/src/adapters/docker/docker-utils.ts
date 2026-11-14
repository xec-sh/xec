/**
 * Utilities for Docker command execution
 */

import { platform } from 'node:os';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

import { DockerError } from '../../core/error.js';

/**
 * Cache for Docker executable path
 */
let cachedDockerPath: string | null = null;

/**
 * Find Docker executable path
 * @returns Path to Docker executable or 'docker' if not found
 */
export function findDockerPath(): string {
  // Return cached value if available
  if (cachedDockerPath !== null) {
    return cachedDockerPath;
  }

  const isWindows = platform() === 'win32';

  // Common Docker installation paths
  const commonPaths = isWindows ? [
    'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
    'C:\\Program Files\\Docker\\docker.exe',
    'C:\\ProgramData\\DockerDesktop\\version-bin\\docker.exe'
  ] : [
    '/usr/local/bin/docker',
    '/usr/bin/docker',
    '/opt/homebrew/bin/docker',
    '/opt/local/bin/docker',
    '/usr/local/opt/docker/bin/docker',
    '/Applications/Docker.app/Contents/Resources/bin/docker'
  ];

  // Check common paths first
  for (const path of commonPaths) {
    if (existsSync(path)) {
      cachedDockerPath = path;
      return path;
    }
  }

  // Try to find Docker using 'which' or 'where' command
  try {
    const findCommand = isWindows ? 'where' : 'which';
    const result = execSync(`${findCommand} docker`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();

    const dockerPath = result.split('\n')[0]?.trimEnd();
    if (result && dockerPath && existsSync(dockerPath)) {
      cachedDockerPath = dockerPath;
      return dockerPath;
    }
  } catch {
    // Ignore errors from which/where command
  }

  // Fallback to 'docker' and let the system handle PATH resolution
  cachedDockerPath = 'docker';
  return 'docker';
}

/**
 * Clear cached Docker path (useful for testing)
 */
export function clearDockerPathCache(): void {
  cachedDockerPath = null;
}

/**
 * Get Docker command with proper path
 * @param args Docker command arguments
 * @returns Full command with Docker path
 */
export function getDockerCommand(...args: string[]): string {
  const dockerPath = findDockerPath();
  return [dockerPath, ...args].join(' ');
}

/** Resolve a name or unique ID prefix from a successfully read Docker inventory. */
export function parseContainerReference(output: string, container: string): string | null {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) {
    throw new DockerError(container, 'inspect', new Error('Invalid container name or ID'));
  }
  const matches: string[] = [];
  for (const line of output.split(/\r?\n/).filter(entry => entry.trim())) {
    let row: unknown;
    try { row = JSON.parse(line); }
    catch { throw new DockerError(container, 'inspect', new Error('Malformed Docker container inventory')); }
    if (!row || typeof row !== 'object' || !('ID' in row) || !('Names' in row) ||
      typeof row.ID !== 'string' || !/^[a-f0-9]{64}$/.test(row.ID) || typeof row.Names !== 'string') {
      throw new DockerError(container, 'inspect', new Error('Malformed Docker container inventory'));
    }
    if (row.ID.startsWith(container) || row.Names.split(',').includes(container)) matches.push(row.ID);
  }
  if (matches.length > 1) throw new DockerError(container, 'inspect', new Error('Ambiguous container reference'));
  return matches[0] ?? null;
}
