/**
 * Execution result interface representing the outcome of a command execution
 */
export interface ExecutionResult {
  // Basic data
  stdout: string;                       // Standard output
  stderr: string;                       // Error output

  /**
   * stdout and stderr merged in the order this process observed them.
   *
   * Separate streams lose the interleaving, which for a build or a deploy is
   * the story: which step was running when the error appeared.
   *
   * The order is the parent's read order, not the child's write order —
   * stdout and stderr are separate pipes and the OS makes no ordering
   * guarantee between them, so writes microseconds apart may be batched and
   * appear grouped. Gaps of milliseconds, which is what matters for reading
   * a log, are preserved. Only merging the descriptors in the child
   * (`2>&1`) gives an exact order, and that costs the ability to tell the
   * streams apart.
   */
  stdall: string;
  exitCode: number;                     // Exit code
  signal?: string;                      // Exit signal

  // Status
  ok: boolean;                          // Success status (exitCode === 0)
  cause?: string;                       // Error cause (exitCode or signal) when not ok

  // Metadata
  command: string;                      // Executed command
  duration: number;                     // Execution time (ms)
  startedAt: Date;                      // Start time
  finishedAt: Date;                     // Finish time

  // Context
  adapter: string;                      // Used adapter
  host?: string;                        // Host (for SSH)
  container?: string;                   // Container (for Docker)

  // Methods
  toMetadata(): object;
  throwIfFailed(): void;

  text(): string;
  json<T = any>(): T;
  lines(): string[];
  buffer(): Buffer;
}