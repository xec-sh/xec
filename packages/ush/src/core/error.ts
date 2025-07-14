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
    super(`Command failed with exit code ${exitCode}: ${command}`, 'COMMAND_FAILED', {
      exitCode,
      signal,
      stdout,
      stderr,
      duration
    });
    this.name = 'CommandError';
  }
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
    super(`Docker operation '${operation}' failed for container ${container}`, 'DOCKER_ERROR', {
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