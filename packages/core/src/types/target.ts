/**
 * Where a command runs, as a value.
 *
 * A target used to be four things at once — a key in the configuration
 * (`hosts.web-1`), a shorthand for such a key (`web-1`), a direct
 * specification (`deploy@host:2222`), and a resolved object — and each layer
 * parsed them again in its own way. The bugs that produced were not variants
 * of each other; they were the same bug appearing wherever a string was
 * interpreted:
 *
 * - `on local 'x'` reached an SSH host literally named "local" as the local
 *   user, because inference ran before the word was recognised;
 * - `hosts.deploy@server.example.com`, an explicit reference to a configured
 *   target, was read as the user `hosts.deploy` on `server.example.com`,
 *   discarding the port and credentials the operator had written down;
 * - `deploy@server.com` — the example in the CLI's own help — resolved to a
 *   machine named "deploy@server.com", because the parser demanded a
 *   hostname without dots;
 * - a port could not be given at all on some paths, and a mistyped key in the
 *   configuration silently produced no target rather than an error.
 *
 * One parser, one shape, one place to be right. The URI form is canonical
 * because it is unambiguous — `ssh://user@host:22`, `docker://api`,
 * `k8s://namespace/pod/container`, `local://` — and the shorthands people
 * actually type are defined as sugar over it rather than as parallel
 * dialects.
 *
 * @module
 */

/** The environments a command can run in. */
export type TargetKind = 'local' | 'ssh' | 'docker' | 'kubernetes';

/** A machine reached over SSH. */
export interface SshTarget {
  readonly kind: 'ssh';
  readonly host: string;
  readonly user?: string;
  readonly port?: number;
}

/** A container, addressed by name or id. */
export interface DockerTarget {
  readonly kind: 'docker';
  readonly container: string;
}

/** A pod, optionally one container inside it. */
export interface KubernetesTarget {
  readonly kind: 'kubernetes';
  readonly pod: string;
  readonly namespace: string;
  readonly container?: string;
}

/** This machine. */
export interface LocalTarget {
  readonly kind: 'local';
}

export type Target = LocalTarget | SshTarget | DockerTarget | KubernetesTarget;

/**
 * The outcome of reading a target from text.
 *
 * Parsing returns a value rather than throwing, because "this is not a
 * target" is an ordinary answer that callers act on — a word that names no
 * target may be a task, a script or a command to run locally, and the
 * decision belongs to the caller, not to the parser.
 */
export type TargetParse =
  | { readonly ok: true; readonly target: Target }
  | { readonly ok: false; readonly reason: string };

/** Names that address a configured bucket rather than a machine directly. */
const BUCKET_PREFIXES = ['hosts.', 'containers.', 'pods.'] as const;

/** A port must be a port; "22abc" is a mistake, not a number. */
function parsePort(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  const port = Number(text);
  return port >= 1 && port <= 65535 ? port : null;
}

/**
 * Split `[user@]host[:port]`.
 *
 * The user is taken from the FIRST `@` and the port from the LAST `:`, so an
 * IPv6 address in brackets and a hostname containing dots both survive. The
 * previous implementation refused any hostname with a dot, which excluded
 * essentially every real machine.
 */
function parseAuthority(authority: string): TargetParse {
  if (authority === '') return { ok: false, reason: 'no host given' };

  let user: string | undefined;
  let rest = authority;

  const at = rest.indexOf('@');
  if (at !== -1) {
    user = rest.slice(0, at);
    rest = rest.slice(at + 1);
    if (user === '') return { ok: false, reason: 'empty user before @' };
    if (rest === '') return { ok: false, reason: 'no host after @' };
  }

  // Bracketed IPv6 keeps its colons; anything after the closing bracket is
  // the port.
  if (rest.startsWith('[')) {
    const close = rest.indexOf(']');
    if (close === -1) return { ok: false, reason: 'unclosed [ in address' };
    const host = rest.slice(1, close);
    const tail = rest.slice(close + 1);
    if (tail === '') return { ok: true, target: { kind: 'ssh', host, ...(user ? { user } : {}) } };
    if (!tail.startsWith(':')) return { ok: false, reason: `unexpected ${JSON.stringify(tail)} after address` };
    const port = parsePort(tail.slice(1));
    if (port === null) return { ok: false, reason: `not a port: ${tail.slice(1)}` };
    return { ok: true, target: { kind: 'ssh', host, port, ...(user ? { user } : {}) } };
  }

  const colon = rest.lastIndexOf(':');
  if (colon === -1) {
    return { ok: true, target: { kind: 'ssh', host: rest, ...(user ? { user } : {}) } };
  }

  // More than one colon and no brackets: an IPv6 literal written bare.
  // `::1` is a host, not the host ":" on port 1 — the disambiguation every
  // tool applies, and the reason brackets exist when a port is meant.
  if (rest.indexOf(':') !== colon) {
    return { ok: true, target: { kind: 'ssh', host: rest, ...(user ? { user } : {}) } };
  }

  const host = rest.slice(0, colon);
  const port = parsePort(rest.slice(colon + 1));
  if (host === '') return { ok: false, reason: 'no host before port' };
  if (port === null) return { ok: false, reason: `not a port: ${rest.slice(colon + 1)}` };

  return { ok: true, target: { kind: 'ssh', host, port, ...(user ? { user } : {}) } };
}

/** `k8s://namespace/pod[/container]`, with `default` when omitted. */
function parseKubernetesPath(path: string): TargetParse {
  const parts = path.split('/').filter(part => part !== '');

  if (parts.length === 1) {
    return { ok: true, target: { kind: 'kubernetes', namespace: 'default', pod: parts[0]! } };
  }
  if (parts.length === 2) {
    return { ok: true, target: { kind: 'kubernetes', namespace: parts[0]!, pod: parts[1]! } };
  }
  if (parts.length === 3) {
    return {
      ok: true,
      target: { kind: 'kubernetes', namespace: parts[0]!, pod: parts[1]!, container: parts[2]! },
    };
  }

  return { ok: false, reason: 'expected namespace/pod or namespace/pod/container' };
}

/**
 * Read a target from its canonical URI form.
 *
 * @param input - `ssh://…`, `docker://…`, `k8s://…` or `local://`.
 * @returns The target, or why the text is not one.
 */
export function parseTargetUri(input: string): TargetParse {
  const separator = input.indexOf('://');
  if (separator === -1) return { ok: false, reason: 'not a target URI' };

  const scheme = input.slice(0, separator).toLowerCase();
  const body = input.slice(separator + 3);

  switch (scheme) {
    case 'local':
      return body === ''
        ? { ok: true, target: { kind: 'local' } }
        : { ok: false, reason: 'local:// takes nothing after the scheme' };

    case 'ssh':
      return parseAuthority(body);

    case 'docker':
      return body === ''
        ? { ok: false, reason: 'docker:// needs a container' }
        : { ok: true, target: { kind: 'docker', container: body } };

    case 'k8s':
    case 'kubernetes':
      return body === ''
        ? { ok: false, reason: 'k8s:// needs a pod' }
        : parseKubernetesPath(body);

    default:
      return { ok: false, reason: `unknown target scheme: ${scheme}` };
  }
}

/**
 * Whether the text names a configured target rather than a machine.
 *
 * A name carrying a bucket prefix is a reference, and a reference outranks
 * anything the same text might also look like: `hosts.deploy@example.com`
 * names a configured host whose key happens to contain an `@`, and reading
 * it as a direct specification quietly discarded that host's configuration.
 */
export function isConfigReference(input: string): boolean {
  return BUCKET_PREFIXES.some(prefix => input.startsWith(prefix));
}

/**
 * Read a target from the text a person types.
 *
 * Only forms that are unambiguous on their own are accepted here: a URI, the
 * word `local`, `user@host`, and a `host:port` pair. A bare word is NOT a
 * target — it may equally be a configured name, a task or a command, and
 * guessing is what sent `xec on local 'x'` to a nonexistent SSH machine.
 * Callers resolve bare words against the configuration first and fall back
 * to this only for what the configuration does not know.
 *
 * @param input - The text as given.
 * @returns The target, or why the text is not one on its own.
 */
export function parseTarget(input: string): TargetParse {
  const text = input.trim();
  if (text === '') return { ok: false, reason: 'empty target' };

  if (text.includes('://')) return parseTargetUri(text);
  if (text === 'local') return { ok: true, target: { kind: 'local' } };
  if (isConfigReference(text)) {
    return { ok: false, reason: `${text} names a configured target; resolve it against the configuration` };
  }
  if (text.includes('@')) return parseAuthority(text);

  // `host:port` is unambiguous; a bare word is not.
  const colon = text.lastIndexOf(':');
  if (colon !== -1 && parsePort(text.slice(colon + 1)) !== null) {
    return parseAuthority(text);
  }

  return { ok: false, reason: `${text} is not a target on its own` };
}

/**
 * Render a target in its canonical form.
 *
 * Round-tripping is the property that makes the type trustworthy: whatever a
 * target came from, printing and re-reading it yields the same value, so it
 * can be logged, stored in a fleet result, and passed between processes
 * without a second dialect appearing.
 *
 * @param target - The target.
 * @returns Its URI.
 */
export function formatTarget(target: Target): string {
  switch (target.kind) {
    case 'local':
      return 'local://';
    case 'ssh': {
      const user = target.user ? `${target.user}@` : '';
      const host = target.host.includes(':') ? `[${target.host}]` : target.host;
      const port = target.port === undefined ? '' : `:${target.port}`;
      return `ssh://${user}${host}${port}`;
    }
    case 'docker':
      return `docker://${target.container}`;
    case 'kubernetes': {
      const container = target.container ? `/${target.container}` : '';
      return `k8s://${target.namespace}/${target.pod}${container}`;
    }
    default: {
      // Unreachable while Target is a closed union; present so a new kind
      // fails here rather than silently rendering as undefined somewhere.
      const exhaustive: never = target;
      throw new Error(`Unknown target kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * A short label for output a person reads.
 *
 * @param target - The target.
 * @returns Its name without the scheme noise.
 */
export function describeTarget(target: Target): string {
  switch (target.kind) {
    case 'local':
      return 'local';
    case 'ssh':
      return target.user ? `${target.user}@${target.host}` : target.host;
    case 'docker':
      return target.container;
    case 'kubernetes':
      return `${target.namespace}/${target.pod}${target.container ? `/${target.container}` : ''}`;
    default: {
      const exhaustive: never = target;
      throw new Error(`Unknown target kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}
