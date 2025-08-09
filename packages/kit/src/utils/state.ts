// State persistence utilities

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

const STATE_DIR = path.join(os.tmpdir(), '.kit-state');

/**
 * Save state to temporary storage
 */
export async function saveState(key: string, state: any): Promise<void> {
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    const filePath = path.join(STATE_DIR, `${key}.json`);
    await fs.writeFile(filePath, JSON.stringify(state, null, 2));
  } catch (error) {
    // Silently fail for now
    console.error('Failed to save state:', error);
  }
}

/**
 * Load state from temporary storage
 */
export async function loadState(key: string): Promise<any | null> {
  try {
    const filePath = path.join(STATE_DIR, `${key}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Clear state from temporary storage
 */
export async function clearState(key: string): Promise<void> {
  try {
    const filePath = path.join(STATE_DIR, `${key}.json`);
    await fs.unlink(filePath);
  } catch {
    // Ignore if file doesn't exist
  }
}