import * as path from 'path';
import { promises as fs } from 'fs';

/**
 * Find the project root by looking for .xec directory
 */
export async function getProjectRoot(): Promise<string> {
  let currentDir = process.cwd();
  
  while (currentDir !== path.parse(currentDir).root) {
    try {
      const xecDir = path.join(currentDir, '.xec');
      await fs.access(xecDir);
      return currentDir;
    } catch {
      // .xec directory not found, move up
      currentDir = path.dirname(currentDir);
    }
  }
  
  // If no .xec directory found, use current working directory
  return process.cwd();
}

/**
 * Ensure .xec directory exists
 */
export async function ensureXecDirectory(): Promise<string> {
  const projectRoot = await getProjectRoot();
  const xecDir = path.join(projectRoot, '.xec');
  
  await fs.mkdir(xecDir, { recursive: true });
  return xecDir;
}

/**
 * Check if we're in a Xec project
 */
export async function isXecProject(): Promise<boolean> {
  try {
    const projectRoot = await getProjectRoot();
    const xecDir = path.join(projectRoot, '.xec');
    await fs.access(xecDir);
    return true;
  } catch {
    return false;
  }
}