import { createOptimizedMasker } from '../utils/optimized-masker.js';
import { isRecoverable, classifyFailure, type FailureKind } from './failure-kind.js';
import { DEFAULT_REDACTION, createDefaultSensitivePatterns } from '../utils/sensitive-patterns.js';

export class ExecutionError extends Error {
  /**
   * Stable, machine-readable reason this failed.
   *
   * Branch on this rather than on {@link message}: wording changes between
   * versions and locales, the classification does not.
   */
  public readonly kind: FailureKind;

  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, any>,
    kind?: FailureKind
  ) {
    super(message);
    this.name = 'ExecutionError';
    this.kind = kind ?? classifyFailure({ code, message });
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Whether reconnecting and retrying is a sensible response.
   *
   * @returns `true` for transport failures a fresh connection may fix.
   */
  get recoverable(): boolean {
    return isRecoverable(this.kind);
  }
}

export class CommandError extends ExecutionError {
  constructor(
    public readonly command: string,
    public readonly exitCode: number,
    public readonly signal: string | undefined,
    public readonly stdout: string,
    public readonly stderr: string,
    public readonly duration: number,
    /** Where the caller wrote this command, if it was captured. */
    public readonly callSite: string = ''
  ) {
    // Sanitize command for error message to avoid exposing sensitive paths
    const sanitizedCommand = sanitizeCommandForError(command);

    // The head of stderr is the diagnosis; without it the message names the
    // command and the code but not the reason, and the first thing every
    // caller does is print error.stderr by hand. stderr reaches this point
    // already masked by the adapter, so no secret enters the message.
    const stderrHead = stderr.trim().split('\n').slice(0, 5).join('\n');
    const detail = stderrHead ? `\n${stderrHead}` : '';

    const meaning = explainExitCode(exitCode);
    const code = meaning ? `${exitCode} (${meaning})` : String(exitCode);

    // The frame turns "which of these fourteen commands failed?" into a click.
    const at = callSite ? `\n    at ${callSite}` : '';

    super(`Command failed with exit code ${code}: ${sanitizedCommand}${detail}${at}`, 'COMMAND_FAILED', {
      exitCode,
      signal,
      stdout,
      stderr,
      duration,
      callSite
    }, 'command-failed');
    this.name = 'CommandError';
  }
}

/** Redacts credentials using the same rules as output, events and echoes. */
const maskCommand = createOptimizedMasker(createDefaultSensitivePatterns(), DEFAULT_REDACTION);

/**
 * Redact credentials from a command before it appears in an error message.
 *
 * This used to *truncate* instead — `cat /etc/passwd` became
 * `cat [arguments hidden]`, and anything over three words became
 * `docker ... (6 arguments)`. That was worse on both counts it was meant to
 * serve: the user could no longer tell which command failed, while a secret
 * in the first three words survived untouched and one in an unlisted command
 * was never considered.
 *
 * Redaction is the control that actually works, it is what every other layer
 * already applies, and it leaves the command readable.
 *
 * Set `XEC_SANITIZE_COMMANDS=false` to opt out entirely. There is deliberately
 * no test-environment bypass: NODE_ENV=test and VITEST_WORKER_ID are routinely
 * set in CI, so keying off them would disable a security control exactly where
 * build logs are most widely readable.
 *
 * @param command - The command string.
 * @returns The command with credentials redacted.
 */
export function sanitizeCommandForError(command: string): string {
  if (process.env['XEC_SANITIZE_COMMANDS'] === 'false') {
    return command;
  }

  return maskCommand(command);
}

/**
 * What an exit code usually means, for the codes that carry real information.
 *
 * A bare "exit code 137" is a lookup task for the reader; "137 (killed —
 * SIGKILL, commonly an out-of-memory kill)" is the answer they were going to
 * look up. Deliberately not exhaustive: only entries that change what the
 * reader would do next.
 */
const EXIT_CODE_MEANINGS: Record<number, string> = {
  2: 'misuse of shell builtins',
  126: 'command found but not executable',
  127: 'command not found',
  128: 'invalid exit argument',
  130: 'interrupted — SIGINT (Ctrl-C)',
  134: 'aborted — SIGABRT',
  137: 'killed — SIGKILL, commonly an out-of-memory kill',
  139: 'segmentation fault',
  141: 'broken pipe — SIGPIPE, the reader closed early',
  143: 'terminated — SIGTERM, commonly an orchestrator stopping the process',
};

/**
 * Explain an exit code, when there is something worth explaining.
 *
 * @param exitCode - The process exit code.
 * @returns A short explanation, or an empty string.
 */
export function explainExitCode(exitCode: number): string {
  return EXIT_CODE_MEANINGS[exitCode] ?? '';
}

export class ConnectionError extends ExecutionError {
  constructor(
    public readonly host: string,
    public readonly originalError: Error
  ) {
    super(`Failed to connect to ${host}: ${originalError.message}`, 'CONNECTION_FAILED', {
      host,
      originalError: originalError.message
    }, classifyFailure(originalError) === 'unknown' ? 'connection-refused' : classifyFailure(originalError));
    this.name = 'ConnectionError';
  }
}

export class TimeoutError extends ExecutionError {
  constructor(
    public readonly command: string,
    public readonly timeout: number
  ) {
    // The timed-out command may carry credentials — a piped sudo password, a
    // bearer token in a curl header — so it is sanitized before it reaches the
    // message, stack traces and any logger that captures them.
    const safeCommand = sanitizeCommandForError(command);

    super(`Command timed out after ${timeout}ms: ${safeCommand}`, 'TIMEOUT', {
      command: safeCommand,
      timeout
    }, 'timeout');
    this.name = 'TimeoutError';
  }
}

/**
 * Output exceeded the configured `maxBuffer`.
 *
 * This must be loud: the previous behaviour discarded everything collected so
 * far and reported an empty stdout with exit code 0 — total data loss shaped
 * exactly like success. Node's own `exec` and execa both kill the process and
 * fail when the cap is hit, and callers rightly expect the same here.
 *
 * The truncated head of the output is preserved on the error so the caller
 * can still see what the command was producing.
 */
export class MaxBufferExceededError extends ExecutionError {
  constructor(
    public readonly limit: number,
    public readonly stream: 'stdout' | 'stderr',
    /** Output collected before the cap was hit, truncated at the limit. */
    public partialStdout: string = '',
    public partialStderr: string = ''
  ) {
    super(
      `${stream} exceeded maxBuffer of ${limit} bytes; output truncated and process terminated`,
      'MAX_BUFFER_EXCEEDED',
      { limit, stream }
    );
    this.name = 'MaxBufferExceededError';
  }
}

export class DockerError extends ExecutionError {
  constructor(
    public readonly container: string,
    public readonly operation: string,
    public readonly originalError: Error
  ) {
    super(`Docker operation '${operation}' failed for container ${container}: ${originalError.message}`, 'DOCKER_ERROR', {
      container,
      operation,
      originalError: originalError.message
    });
    this.name = 'DockerError';
  }
}

export class AdapterError extends ExecutionError {
  constructor(
    public readonly adapter: string,
    public readonly operation: string,
    public readonly originalError?: Error
  ) {
    let message: string;

    if (originalError) {
      // Handle specific error cases for better error messages
      const err = originalError as any;
      if (err.code === 'ENOENT' && err.syscall === 'spawn') {
        // Check if it's a cwd-related error
        if (err.message.includes('No such file or directory')) {
          message = err.message;
        } else {
          message = `spawn ENOENT: No such file or directory`;
        }
      } else {
        message = `Adapter '${adapter}' failed during '${operation}': ${originalError.message}`;
      }
    } else {
      message = `Adapter '${adapter}' failed during '${operation}'`;
    }

    super(message, 'ADAPTER_ERROR', {
      adapter,
      operation,
      originalError: originalError?.message
    });
    this.name = 'AdapterError';
  }
}

export class KubernetesError extends ExecutionError {
  constructor(
    message: string,
    public readonly pod: string,
    public readonly namespace?: string,
    public readonly container?: string,
    details?: Record<string, any>
  ) {
    super(message, 'KUBERNETES_ERROR', {
      pod,
      namespace,
      container,
      ...details
    });
    this.name = 'KubernetesError';
  }
}