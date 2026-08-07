import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

/**
 * Approval for a configuration that runs commands when it is loaded.
 *
 * `${cmd:...}` executes a shell command at load time. That is a documented
 * feature and a useful one — `${cmd:git rev-parse --short HEAD}` belongs in
 * a config. It also means a configuration file is executable code, and
 * configuration files arrive by `git clone`. Without a gate, entering a
 * directory and running any xec command runs its author's commands.
 *
 * The model is direnv's, and VS Code's workspace trust: approval is
 * explicit, per file, and keyed to the file's *content*, so an edit after
 * approval needs approving again. Everything else about the config keeps
 * working untouched — only `${cmd:}` is gated, so the vast majority of
 * configurations never see this.
 *
 * Fails closed. When nothing can be asked — CI, a pipe, a hook — the
 * substitution is refused with the command to run to approve it, rather
 * than executed on the assumption that silence means consent.
 */

/** Where approvals live. Owner-only; it is a list of things you trust. */
function trustFilePath(): string {
  return path.join(os.homedir(), '.xec', 'trusted-configs.json');
}

/**
 * Whether a configuration's text contains a command substitution.
 *
 * Checked before anything else: a config without one needs no approval and
 * must never be made to ask for one.
 */
export function usesCommandSubstitution(content: string): boolean {
  // The same shape the interpolator recognises, minus an escaped `\${`.
  return /(?<!\\)\$\{cmd:/.test(content);
}

/** The commands a configuration would run, for showing to a human. */
export function commandsIn(content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(/(?<!\\)\$\{cmd:([^}]*)\}/g)) {
    const command = match[1]?.trim();
    if (command) found.add(command);
  }
  return [...found];
}

/** Identity of an approval: which file, and exactly what was in it. */
function fingerprint(configPath: string, content: string): string {
  return createHash('sha256')
    .update(path.resolve(configPath))
    .update('\0')
    .update(content)
    .digest('hex');
}

async function readStore(): Promise<Record<string, { path: string; approvedAt: string }>> {
  try {
    const raw = await fs.readFile(trustFilePath(), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, { path: string; approvedAt: string }>) : {};
  } catch {
    // No store, or one that cannot be read or parsed. Nothing is approved.
    return {};
  }
}

/**
 * Whether this exact configuration has been approved.
 *
 * @param configPath - Path to the configuration file.
 * @param content - Its text, as read.
 * @returns True when an approval recorded for this content exists.
 */
export async function isTrusted(configPath: string, content: string): Promise<boolean> {
  const store = await readStore();
  return Object.hasOwn(store, fingerprint(configPath, content));
}

/**
 * Record approval for this exact configuration.
 *
 * @param configPath - Path to the configuration file.
 * @param content - Its text, as read.
 * @param now - Timestamp to record, for a deterministic test.
 */
export async function trust(configPath: string, content: string, now: Date = new Date()): Promise<void> {
  const file = trustFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });

  const store = await readStore();
  store[fingerprint(configPath, content)] = {
    path: path.resolve(configPath),
    approvedAt: now.toISOString(),
  };

  // Owner-only: the list says which code this user has agreed to run.
  await fs.writeFile(file, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
}

/**
 * Withdraw approval for a configuration, whatever content was approved.
 *
 * @param configPath - Path to the configuration file.
 * @returns How many approvals were removed.
 */
export async function revokeTrust(configPath: string): Promise<number> {
  const resolved = path.resolve(configPath);
  const store = await readStore();

  let removed = 0;
  for (const [key, entry] of Object.entries(store)) {
    if (entry.path === resolved) {
      delete store[key];
      removed += 1;
    }
  }

  if (removed > 0) {
    await fs.writeFile(trustFilePath(), `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  }
  return removed;
}

/** Every approval on record, newest first. */
export async function listTrusted(): Promise<Array<{ path: string; approvedAt: string }>> {
  const store = await readStore();
  return Object.values(store).sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));
}

/**
 * The message shown when a configuration wants to run commands and has not
 * been approved.
 *
 * It names them. "This config runs commands" is not something anyone can
 * make a decision about; the commands themselves are.
 */
export function untrustedMessage(configPath: string, content: string): string {
  const commands = commandsIn(content);
  const listed = commands.map(c => `    ${c}`).join('\n');

  return (
    `${configPath} runs commands when it is loaded, and has not been approved.\n\n` +
    `${listed}\n\n` +
    'These run as you, with your credentials, every time any xec command reads\n' +
    'this configuration. Review them, then approve with:\n\n' +
    `    xec config trust\n\n` +
    'Approval is recorded against the file\'s current content, so an edit\n' +
    'requires approving again. Set XEC_TRUST_CONFIG=1 to approve for one run\n' +
    'without recording it — for a pipeline whose configuration you own.'
  );
}

/** The escape hatch for a pipeline running a configuration it owns. */
export function trustedByEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env['XEC_TRUST_CONFIG'];
  return value === '1' || value === 'true';
}
