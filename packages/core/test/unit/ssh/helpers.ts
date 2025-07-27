import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PUBLIC_KEY_PATH = join(__dirname, 'fixtures', 'id_rsa.pub');
export const PRIVATE_KEY_PATH = join(__dirname, 'fixtures', 'id_rsa');
export const PRIVATE_KEY_PPK_PATH = join(__dirname, 'fixtures', 'id_rsa.ppk');

export function wait(delay: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, delay)
  })
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
