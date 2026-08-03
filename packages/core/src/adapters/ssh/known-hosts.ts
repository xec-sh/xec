import * as os from 'node:os';
import * as path from 'node:path';
import { createHmac } from 'node:crypto';
import { readFile, appendFile, mkdir } from 'node:fs/promises';

/**
 * How a server's host key is checked before a session is established.
 *
 * - `accept-new` — accept and record a key the first time a host is seen, but
 *   refuse a key that differs from the recorded one. This is OpenSSH's
 *   `StrictHostKeyChecking=accept-new` and the default here: it catches the
 *   attack that matters — someone intercepting a host you have already used —
 *   without breaking the first connection to a new machine.
 * - `strict` — the host must already be present in `known_hosts`. Correct for
 *   CI and production, where an unknown host is itself suspicious.
 * - `off` — no verification. Only for disposable environments such as test
 *   fixtures whose host keys are regenerated on every rebuild.
 */
export type HostKeyChecking = 'accept-new' | 'strict' | 'off';

/** Outcome of checking a presented host key. */
export type HostKeyVerdict =
  | { readonly ok: true; readonly reason: 'known' | 'accepted-new' | 'disabled' }
  | { readonly ok: false; readonly reason: 'changed' | 'unknown'; readonly message: string };

/** One usable entry parsed out of a `known_hosts` file. */
interface KnownHostEntry {
  /** Literal host patterns, or `null` when the entry is hashed. */
  readonly patterns: readonly string[] | null;
  /** HMAC-SHA1 salt for a hashed entry. */
  readonly hashSalt: Buffer | null;
  /** Expected HMAC-SHA1 digest for a hashed entry. */
  readonly hashValue: Buffer | null;
  /** Key algorithm, e.g. `ssh-ed25519`. */
  readonly keyType: string;
  /** Base64 of the public key blob, exactly as ssh2 presents it. */
  readonly key: string;
  /** `@revoked` entries deny the key outright. */
  readonly revoked: boolean;
}

/** Default location of the user's `known_hosts` file. */
export function defaultKnownHostsPath(): string {
  return path.join(os.homedir(), '.ssh', 'known_hosts');
}

/**
 * Render the host portion of a `known_hosts` entry.
 *
 * Non-default ports are bracketed, matching OpenSSH: `[example.com]:2222`.
 *
 * @param host - Hostname or address.
 * @param port - TCP port.
 * @returns The host token used for lookup and for writing new entries.
 */
export function formatHostToken(host: string, port: number): string {
  return port === 22 ? host : `[${host}]:${port}`;
}

/**
 * Parse the contents of a `known_hosts` file.
 *
 * Unparseable lines are skipped rather than failing the whole file: a single
 * malformed entry must not lock a user out of every host.
 *
 * @param contents - Raw file text.
 * @returns The entries that could be understood.
 */
export function parseKnownHosts(contents: string): KnownHostEntry[] {
  const entries: KnownHostEntry[] = [];

  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();

    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    let fields = line.split(/\s+/);
    let revoked = false;

    // Optional marker: @cert-authority or @revoked.
    if (fields[0]?.startsWith('@')) {
      const marker = fields[0];
      fields = fields.slice(1);

      if (marker === '@revoked') {
        revoked = true;
      } else {
        // Certificate authorities need CA signature validation, which this
        // implementation does not perform. Ignoring the entry is safe: it can
        // only cause a host to be treated as unknown, never as trusted.
        continue;
      }
    }

    const [hosts, keyType, key] = fields;

    if (!hosts || !keyType || !key) {
      continue;
    }

    if (hosts.startsWith('|1|')) {
      // Hashed form: |1|<base64 salt>|<base64 hmac>
      const parts = hosts.split('|');

      if (parts.length !== 4 || !parts[2] || !parts[3]) {
        continue;
      }

      entries.push({
        patterns: null,
        hashSalt: Buffer.from(parts[2], 'base64'),
        hashValue: Buffer.from(parts[3], 'base64'),
        keyType,
        key,
        revoked,
      });
      continue;
    }

    entries.push({
      patterns: hosts.split(','),
      hashSalt: null,
      hashValue: null,
      keyType,
      key,
      revoked,
    });
  }

  return entries;
}

/**
 * Test whether an entry covers a host token.
 *
 * Supports the literal, hashed and wildcard forms OpenSSH writes.
 */
function entryMatchesHost(entry: KnownHostEntry, hostToken: string): boolean {
  if (entry.hashSalt && entry.hashValue) {
    const digest = createHmac('sha1', entry.hashSalt).update(hostToken).digest();
    return digest.equals(entry.hashValue);
  }

  if (!entry.patterns) {
    return false;
  }

  for (const pattern of entry.patterns) {
    if (pattern === hostToken) {
      return true;
    }

    if (pattern.includes('*') || pattern.includes('?')) {
      // Translate the glob to a regex, escaping everything else.
      const source = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

      if (new RegExp(`^${source}$`).test(hostToken)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Verifies server host keys against a `known_hosts` file.
 *
 * Without this an SSH client accepts whatever key the far end presents, so a
 * machine-in-the-middle can transparently read every command and credential
 * sent over the session. `ssh2` performs no verification unless a verifier is
 * supplied — it must be supplied.
 */
export class KnownHostsVerifier {
  private entries: KnownHostEntry[] | null = null;

  /**
   * @param mode - Checking policy.
   * @param knownHostsPath - File to consult; defaults to `~/.ssh/known_hosts`.
   */
  constructor(
    private readonly mode: HostKeyChecking = 'accept-new',
    private readonly knownHostsPath: string = defaultKnownHostsPath()
  ) {}

  /**
   * Check a presented host key.
   *
   * @param host - Hostname or address being connected to.
   * @param port - TCP port.
   * @param keyBlob - The public key exactly as presented by the server.
   * @returns Whether the connection may proceed, and why.
   */
  async verify(host: string, port: number, keyBlob: Buffer): Promise<HostKeyVerdict> {
    if (this.mode === 'off') {
      return { ok: true, reason: 'disabled' };
    }

    const hostToken = formatHostToken(host, port);
    const presented = keyBlob.toString('base64');
    const entries = await this.load();

    const matching = entries.filter(entry => entryMatchesHost(entry, hostToken));

    for (const entry of matching) {
      if (entry.key === presented) {
        if (entry.revoked) {
          return {
            ok: false,
            reason: 'changed',
            message:
              `The host key for ${hostToken} is marked @revoked in ${this.knownHostsPath}. ` +
              `Refusing to connect.`,
          };
        }

        return { ok: true, reason: 'known' };
      }
    }

    if (matching.length > 0) {
      // A key is on record and it is not this one. This is the case host key
      // checking exists for, so it fails in every mode.
      return {
        ok: false,
        reason: 'changed',
        message:
          `HOST KEY VERIFICATION FAILED for ${hostToken}. A different key is on record in ` +
          `${this.knownHostsPath}. This can mean the host was rebuilt — or that the ` +
          `connection is being intercepted. Nothing was sent to the server. If the change ` +
          `is expected, remove the old entry:\n  ssh-keygen -R ${hostToken}`,
      };
    }

    if (this.mode === 'strict') {
      return {
        ok: false,
        reason: 'unknown',
        message:
          `Host ${hostToken} is not in ${this.knownHostsPath} and host key checking is ` +
          `'strict'. Add it with 'ssh-keyscan', or connect once with 'accept-new' to ` +
          `record it.`,
      };
    }

    await this.record(hostToken, keyBlob);
    return { ok: true, reason: 'accepted-new' };
  }

  /**
   * Read and cache `known_hosts`.
   *
   * A missing file is an empty set, not an error: a first-ever connection is
   * normal and is handled by the mode.
   */
  private async load(): Promise<KnownHostEntry[]> {
    if (this.entries) {
      return this.entries;
    }

    try {
      this.entries = parseKnownHosts(await readFile(this.knownHostsPath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.entries = [];
      } else {
        throw error;
      }
    }

    return this.entries;
  }

  /**
   * Append a newly trusted host key.
   *
   * A write failure must not fail the connection — the key was accepted on
   * policy, and losing the record only means the next connection re-accepts it.
   */
  private async record(hostToken: string, keyBlob: Buffer): Promise<void> {
    const keyType = readKeyType(keyBlob);
    const line = `${hostToken} ${keyType} ${keyBlob.toString('base64')}\n`;

    try {
      await mkdir(path.dirname(this.knownHostsPath), { recursive: true, mode: 0o700 });
      await appendFile(this.knownHostsPath, line, { mode: 0o600 });
      this.entries?.push(...parseKnownHosts(line));
    } catch {
      // Deliberately ignored; see the doc comment.
    }
  }
}

/**
 * Extract the algorithm name from an SSH public key blob.
 *
 * The wire format begins with a 4-byte big-endian length followed by the
 * algorithm name, so the type is read rather than guessed.
 *
 * @param keyBlob - The public key blob.
 * @returns The algorithm name, or `ssh-unknown` if the blob is malformed.
 */
function readKeyType(keyBlob: Buffer): string {
  if (keyBlob.length < 4) {
    return 'ssh-unknown';
  }

  const length = keyBlob.readUInt32BE(0);

  if (length === 0 || length > 64 || keyBlob.length < 4 + length) {
    return 'ssh-unknown';
  }

  return keyBlob.subarray(4, 4 + length).toString('ascii');
}
