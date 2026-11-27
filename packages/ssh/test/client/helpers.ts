import type { ClientChannel } from 'ssh2';

import { on } from 'node:events';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PUBLIC_KEY_PATH = join(__dirname, 'fixtures', 'id_rsa.pub');
export const PRIVATE_KEY_PATH = join(__dirname, 'fixtures', 'id_rsa');

export const fixturePrompt = '__xec_ready__';

/** ConPTY can emit terminal setup before the shell is ready to read input. */
export async function shellRoundTrip(shell: ClientChannel, send: () => void, marker: string): Promise<string> {
  let output = '', sent = false;
  for await (const [chunk] of on(shell, 'data', { signal: AbortSignal.timeout(10_000), close: ['end', 'close'] })) {
    output += chunk.toString();
    const text = stripVTControlCharacters(output);
    if (sent && text.includes(marker)) return text;
    if (!sent && text.includes(fixturePrompt)) { sent = true; send(); }
  }
  throw new Error('Fixture shell closed before completing the round trip');
}

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
