/**
 * Machine-readable classification of why an execution failed.
 *
 * Consumers need to branch on *why* something failed — reconnect after a
 * daemon restart, re-prompt on bad credentials, surface a missing container
 * differently from a crashed one. Without a stable classification they are
 * forced to pattern-match on error text, which breaks whenever a message is
 * reworded or a dependency changes its wording.
 */
export type FailureKind =
  /** The command ran to completion and exited non-zero. */
  | 'command-failed'
  /** The command exceeded its time budget and was killed. */
  | 'timeout'
  /**
   * The transport was established and then went away — a restarted Docker
   * daemon, a dropped SSH session, a closed pod stream. Reconnecting and
   * retrying is usually the right response.
   */
  | 'connection-lost'
  /** The transport could never be established. */
  | 'connection-refused'
  /** Credentials were rejected. Retrying with the same credentials will not help. */
  | 'authentication'
  /** The named container, pod, host or file does not exist. */
  | 'not-found'
  /** The operation was understood but not permitted. */
  | 'permission-denied'
  /** The caller passed something invalid; retrying will not help. */
  | 'invalid-usage'
  /**
   * The server's host key did not match the recorded one. Never retry: the
   * peer may be an impostor, and an automatic reconnect would hand it another
   * chance at the session.
   */
  | 'host-key-mismatch'
  /** Nothing matched. Treat as non-recoverable. */
  | 'unknown';

/**
 * Failure kinds worth retrying after re-establishing the connection.
 *
 * Deliberately narrow: retrying an authentication failure or a missing
 * container only turns one error into several.
 */
const RECOVERABLE: ReadonlySet<FailureKind> = new Set<FailureKind>([
  'connection-lost',
  'connection-refused',
]);

/**
 * Report whether reconnecting and retrying is a sensible response.
 *
 * @param kind - The classified failure.
 * @returns `true` when a fresh connection may succeed.
 */
export function isRecoverable(kind: FailureKind): boolean {
  return RECOVERABLE.has(kind);
}

/**
 * Node `errno` codes mapped to their failure kind.
 *
 * Checked before any text matching, since an errno is authoritative and
 * locale-independent.
 */
const ERRNO_KINDS: Readonly<Record<string, FailureKind>> = {
  EHOSTKEY: 'host-key-mismatch',
  ECONNREFUSED: 'connection-refused',
  ENOTFOUND: 'connection-refused',
  EHOSTUNREACH: 'connection-refused',
  ENETUNREACH: 'connection-refused',
  ECONNRESET: 'connection-lost',
  EPIPE: 'connection-lost',
  ETIMEDOUT: 'timeout',
  EACCES: 'permission-denied',
  EPERM: 'permission-denied',
  ENOENT: 'not-found',
};

/**
 * Message fragments that identify a failure kind when no errno is available.
 *
 * Docker and kubectl report transport problems as text on stderr, so this
 * layer exists to translate them once — in the engine — rather than in every
 * consumer. Order matters: the first match wins.
 */
const MESSAGE_KINDS: ReadonlyArray<readonly [RegExp, FailureKind]> = [
  // `REMOTE HOST IDENTIFICATION HAS CHANGED` is the banner OpenSSH prints
  // above the explanation, and it is what survives when stderr is
  // truncated to its first lines. Without it that case classified as
  // `unknown` — and an unknown connection failure is treated as refused,
  // which is recoverable, so the retry reconnected through whatever had
  // changed the key.
  [/host key verification failed|host key .* not match|is not in .* host key checking|remote host identification has changed/i, 'host-key-mismatch'],
  [/cannot connect to the docker daemon|docker daemon is not running|is the docker daemon running/i, 'connection-refused'],
  [/connection (?:reset|lost|closed)|broken pipe|unexpected eof|eof$/i, 'connection-lost'],
  [/connection refused|could not resolve host|no route to host/i, 'connection-refused'],
  [/authentication fail(?:ed|ure)|permission denied \(publickey|all configured authentication methods failed|unauthorized/i, 'authentication'],
  [/no such (?:container|file|directory|object|host)|not found/i, 'not-found'],
  [/permission denied|access is denied|forbidden/i, 'permission-denied'],
  [/timed out|timeout/i, 'timeout'],
];

/**
 * Classify an arbitrary error into a stable {@link FailureKind}.
 *
 * @param error - Any thrown value: an `Error`, an errno-bearing object, or a
 *   string from a process's stderr.
 * @returns The classification, or `unknown` when nothing matches.
 *
 * @example
 * ```typescript
 * try {
 *   await docker.listContainers();
 * } catch (error) {
 *   if (isRecoverable(classifyFailure(error))) {
 *     await reconnect();
 *   }
 * }
 * ```
 */
export function classifyFailure(error: unknown): FailureKind {
  if (error === null || error === undefined) {
    return 'unknown';
  }

  const candidate = error as { code?: unknown; errno?: unknown; message?: unknown; kind?: unknown };

  // An already-classified error keeps its verdict.
  if (typeof candidate.kind === 'string' && VALID_KINDS.has(candidate.kind)) {
    return candidate.kind as FailureKind;
  }

  if (typeof candidate.code === 'string') {
    const byErrno = ERRNO_KINDS[candidate.code];
    if (byErrno) {
      return byErrno;
    }
  }

  const message =
    typeof candidate.message === 'string'
      ? candidate.message
      : typeof error === 'string'
        ? error
        : '';

  if (message.length > 0) {
    for (const [pattern, kind] of MESSAGE_KINDS) {
      if (pattern.test(message)) {
        return kind;
      }
    }
  }

  // Aggregate errors (multiple address families) carry the real cause inside.
  const nested = (error as { errors?: unknown }).errors;
  if (Array.isArray(nested)) {
    for (const inner of nested) {
      const kind = classifyFailure(inner);
      if (kind !== 'unknown') {
        return kind;
      }
    }
  }

  return 'unknown';
}

/**
 * Every valid {@link FailureKind}, used to validate a pre-set `kind`.
 *
 * A Set rather than a `Record<FailureKind, true>`: the values were never
 * read — `kind in LOOKUP` does not look at them — so ten `true`s sat there
 * meaning nothing, and each could be flipped to `false` without changing
 * behaviour or failing a test. A membership test is what this is.
 */
const VALID_KINDS: ReadonlySet<string> = new Set<FailureKind>([
  'command-failed',
  'timeout',
  'connection-lost',
  'connection-refused',
  'authentication',
  'not-found',
  'permission-denied',
  'invalid-usage',
  'host-key-mismatch',
  'unknown',
]);

/**
 * Map a process outcome to an exit code, following the shell convention.
 *
 * A process killed by a signal reports no exit code. Coalescing that to 0
 * made a SIGKILL — an OOM kill, an orchestrator stopping a pod — read as
 * success. Shells report `128 + signum` for this, so callers that only look
 * at the number still see a failure.
 *
 * @param exitCode - The reported exit code, or null/undefined if signalled.
 * @param signal - The terminating signal name, if any.
 * @returns The exit code to report.
 */
export function resolveExitCode(
  exitCode: number | null | undefined,
  signal?: string | null
): number {
  if (typeof exitCode === 'number') {
    return exitCode;
  }

  if (signal) {
    return 128 + (SIGNAL_NUMBERS[signal] ?? 0);
  }

  return 0;
}

/** Signal numbers needed for the `128 + signum` convention. */
const SIGNAL_NUMBERS: Readonly<Record<string, number>> = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGILL: 4,
  SIGABRT: 6,
  SIGFPE: 8,
  SIGKILL: 9,
  SIGSEGV: 11,
  SIGPIPE: 13,
  SIGALRM: 14,
  SIGTERM: 15,
};
