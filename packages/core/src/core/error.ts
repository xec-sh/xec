export class ExecutionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ExecutionError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class CommandError extends ExecutionError {
  constructor(
    public readonly command: string,
    public readonly exitCode: number,
    public readonly signal: string | undefined,
    public readonly stdout: string,
    public readonly stderr: string,
    public readonly duration: number
  ) {
    // Sanitize command for error message to avoid exposing sensitive paths
    const sanitizedCommand = sanitizeCommandForError(command);
    super(`Command failed with exit code ${exitCode}: ${sanitizedCommand}`, 'COMMAND_FAILED', {
      exitCode,
      signal,
      stdout,
      stderr,
      duration
    });
    this.name = 'CommandError';
  }
}

/**
 * Sanitize command for error messages to avoid exposing sensitive information
 */
export function sanitizeCommandForError(command: string): string {
  // Skip sanitization in test environment to avoid test failures
  if (process.env['NODE_ENV'] === 'test' || process.env['JEST_WORKER_ID'] !== undefined) {
    return command;
  }

  // Skip sanitization if explicitly disabled (default behavior)
  if (process.env['XEC_SANITIZE_COMMANDS'] !== 'true') {
    return command;
  }

  // Extract just the command name without arguments
  const parts = command.trim().split(/\s+/);
  if (parts.length === 0) return command;

  const baseCommand = parts[0];
  if (!baseCommand) return command;

  // For common commands that might expose sensitive paths, just show the command
  const sensitiveCommands = ['cat', 'ls', 'rm', 'cp', 'mv', 'chmod', 'chown', 'find', 'grep'];
  const commandName = baseCommand.split('/').pop() || baseCommand;

  if (sensitiveCommands.includes(commandName) && parts.length > 1) {
    return `${commandName} [arguments hidden]`;
  }

  // For other commands, show limited info
  if (parts.length > 3) {
    return `${baseCommand} ... (${parts.length - 1} arguments)`;
  }

  return command;
}

export class ConnectionError extends ExecutionError {
  constructor(
    public readonly host: string,
    public readonly originalError: Error
  ) {
    super(`Failed to connect to ${host}: ${originalError.message}`, 'CONNECTION_FAILED', {
      host,
      originalError: originalError.message
    });
    this.name = 'ConnectionError';
  }
}

export class TimeoutError extends ExecutionError {
  constructor(
    public readonly command: string,
    public readonly timeout: number
  ) {
    super(`Command timed out after ${timeout}ms: ${command}`, 'TIMEOUT', {
      command,
      timeout
    });
    this.name = 'TimeoutError';
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