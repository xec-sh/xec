/**
 * Execution result interface representing the outcome of a command execution
 */
export interface ExecutionResult {
  // Basic data
  stdout: string;                       // Standard output
  stderr: string;                       // Error output
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