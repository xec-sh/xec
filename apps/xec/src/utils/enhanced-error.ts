import type { ErrorContext, ErrorSuggestion, EnhancedErrorDetails } from '@xec-sh/core';

import { ExecutionError } from '@xec-sh/core';

export type { ErrorContext, ErrorSuggestion, EnhancedErrorDetails };

/**
 * Enhanced error class with suggestions and detailed context
 */
export class EnhancedExecutionError extends ExecutionError {
  public readonly context: ErrorContext;
  public readonly suggestions: ErrorSuggestion[];
  public readonly relatedErrors?: string[];
  public readonly systemInfo?: any;

  constructor(
    message: string,
    code: string,
    context: ErrorContext = {},
    suggestions: ErrorSuggestion[] = []
  ) {
    super(message, code, { context, suggestions });
    this.name = 'EnhancedExecutionError';
    this.context = context;
    this.suggestions = suggestions;

    // Add system info
    this.systemInfo = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version
    };
  }

  /**
   * Add a suggestion to the error
   */
  addSuggestion(suggestion: ErrorSuggestion): this {
    this.suggestions.push(suggestion);
    return this;
  }

  /**
   * Format error for display
   */
  format(verbose = false): string {
    const lines: string[] = [];

    // Main error message
    lines.push(`Error: ${this.message}`);
    lines.push(`Code: ${this.code}`);

    // Context information
    if (Object.keys(this.context).length > 0) {
      lines.push('');
      lines.push('Context:');
      if (this.context.command) lines.push(`  Command: ${this.context.command}`);
      if (this.context.adapter) lines.push(`  Adapter: ${this.context.adapter}`);
      if (this.context.host) lines.push(`  Host: ${this.context.host}`);
      if (this.context.container) lines.push(`  Container: ${this.context.container}`);
      if (this.context.pod) lines.push(`  Pod: ${this.context.pod}`);
      if (this.context.cwd) lines.push(`  Directory: ${this.context.cwd}`);
      if (this.context.duration) lines.push(`  Duration: ${this.context.duration}ms`);
    }

    // Suggestions
    if (this.suggestions.length > 0) {
      lines.push('');
      lines.push('Suggestions:');
      this.suggestions.forEach((suggestion, i) => {
        lines.push(`  ${i + 1}. ${suggestion.message}`);
        if (suggestion.command) {
          lines.push(`     Try: ${suggestion.command}`);
        }
        if (suggestion.documentation) {
          lines.push(`     See: ${suggestion.documentation}`);
        }
      });
    }

    // System info in verbose mode
    if (verbose && this.systemInfo) {
      lines.push('');
      lines.push('System:');
      lines.push(`  Platform: ${this.systemInfo.platform}`);
      lines.push(`  Architecture: ${this.systemInfo.arch}`);
      lines.push(`  Node Version: ${this.systemInfo.nodeVersion}`);
    }

    // Stack trace in verbose mode
    if (verbose && this.stack) {
      lines.push('');
      lines.push('Stack Trace:');
      lines.push(this.stack);
    }

    return lines.join('\n');
  }
}

/**
 * Enhanced command error with automatic suggestions
 */
export class EnhancedCommandError extends EnhancedExecutionError {
  constructor(
    command: string,
    public readonly exitCode: number,
    public readonly signal: string | undefined,
    public readonly stdout: string,
    public readonly stderr: string,
    public readonly duration: number,
    adapter = 'local'
  ) {
    const context: ErrorContext = {
      command,
      adapter,
      duration,
      timestamp: new Date()
    };

    const suggestions = generateCommandErrorSuggestions(
      command,
      exitCode,
      stderr,
      adapter
    );

    super(
      `Command failed with exit code ${exitCode}: ${command}`,
      'COMMAND_FAILED',
      context,
      suggestions
    );

    this.name = 'EnhancedCommandError';
  }
}

/**
 * Enhanced connection error with network diagnostics
 */
export class EnhancedConnectionError extends EnhancedExecutionError {
  constructor(
    public readonly host: string,
    public readonly originalError: Error,
    public readonly port?: number,
    adapter = 'ssh'
  ) {
    const context: ErrorContext = {
      host,
      adapter,
      timestamp: new Date()
    };

    const suggestions = generateConnectionErrorSuggestions(
      host,
      originalError,
      port,
      adapter
    );

    super(
      `Failed to connect to ${host}${port ? ':' + port : ''}: ${originalError.message}`,
      'CONNECTION_FAILED',
      context,
      suggestions
    );

    this.name = 'EnhancedConnectionError';
  }
}

/**
 * Enhanced timeout error with performance tips
 */
export class EnhancedTimeoutError extends EnhancedExecutionError {
  constructor(
    command: string,
    public readonly timeout: number,
    adapter = 'local'
  ) {
    const context: ErrorContext = {
      command,
      adapter,
      duration: timeout,
      timestamp: new Date()
    };

    const suggestions = generateTimeoutErrorSuggestions(
      command,
      timeout,
      adapter
    );

    super(
      `Command timed out after ${timeout}ms: ${command}`,
      'TIMEOUT',
      context,
      suggestions
    );

    this.name = 'EnhancedTimeoutError';
  }
}

/**
 * Generate suggestions for command errors
 */
function generateCommandErrorSuggestions(
  command: string,
  exitCode: number,
  stderr: string,
  adapter: string
): ErrorSuggestion[] {
  const suggestions: ErrorSuggestion[] = [];

  // Common exit codes
  // eslint-disable-next-line default-case
  switch (exitCode) {
    case 1:
      suggestions.push({
        message: 'General error - check command syntax and arguments',
        documentation: 'https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html'
      });
      break;
    case 2:
      suggestions.push({
        message: 'Misuse of shell command - check syntax',
        command: `man ${command.split(' ')[0]}`
      });
      break;
    case 126:
      suggestions.push({
        message: 'Command cannot execute - check permissions',
        command: `ls -la ${command.split(' ')[0]}`
      });
      break;
    case 127: {
      suggestions.push({
        message: 'Command not found - check if installed',
        command: `which ${command.split(' ')[0]}`
      });
      // Also add install suggestion for 127 exit code
      const cmdName = command.split(' ')[0];
      if (cmdName) {
        suggestions.push({
          message: `Command '${cmdName}' not found - install it first`,
          command: getInstallCommand(cmdName)
        });
      }
      break;
    }
    case 128:
      suggestions.push({
        message: 'Invalid argument to exit',
        documentation: 'https://tldp.org/LDP/abs/html/exitcodes.html'
      });
      break;
  }

  // Adapter-specific suggestions
  if (adapter === 'ssh') {
    suggestions.push({
      message: 'Check SSH connection and remote environment',
      command: 'ssh -v <host> "which <command>"'
    });
  } else if (adapter === 'docker') {
    suggestions.push({
      message: 'Check if command exists in container',
      command: 'docker exec <container> which <command>'
    });
  } else if (adapter === 'kubernetes') {
    suggestions.push({
      message: 'Check if command exists in pod',
      command: 'kubectl exec <pod> -- which <command>'
    });
  }

  // Parse common error patterns from stderr
  if (stderr.includes('Permission denied')) {
    suggestions.push({
      message: 'Permission denied - check file permissions or run with appropriate privileges',
      command: adapter === 'local' ? 'sudo <command>' : undefined
    });
  }

  if (stderr.includes('No such file or directory')) {
    suggestions.push({
      message: 'File or directory not found - check paths',
      command: 'ls -la <path>'
    });
  }

  if (stderr.includes('command not found') || stderr.includes('not found')) {
    const cmdName = command.split(' ')[0];
    suggestions.push({
      message: `Command '${cmdName}' not found - install it first`,
      command: getInstallCommand(cmdName!)
    });
  }

  return suggestions;
}

/**
 * Generate suggestions for connection errors
 */
function generateConnectionErrorSuggestions(
  host: string,
  error: Error,
  port?: number,
  adapter?: string
): ErrorSuggestion[] {
  const suggestions: ErrorSuggestion[] = [];
  const errorMsg = error.message.toLowerCase();

  // Add a general connection suggestion first
  suggestions.push({
    message: 'Check network connectivity and host availability',
    command: `ping ${host}`
  });

  if (errorMsg.includes('enotfound') || errorMsg.includes('getaddrinfo')) {
    suggestions.push({
      message: 'Host not found - check hostname or DNS',
      command: `nslookup ${host}`
    });
    suggestions.push({
      message: 'Try using IP address instead of hostname',
      command: `ping ${host}`
    });
  }

  if (errorMsg.includes('econnrefused')) {
    suggestions.push({
      message: `Connection refused - check if service is running on port ${port || 'default'}`,
      command: port ? `nc -zv ${host} ${port}` : `ping ${host}`
    });

    if (adapter === 'ssh') {
      suggestions.push({
        message: 'Check if SSH service is running',
        command: `ssh -v ${host}`
      });
    }
  }

  if (errorMsg.includes('etimedout') || errorMsg.includes('timeout')) {
    suggestions.push({
      message: 'Connection timeout - check network connectivity',
      command: `ping -c 4 ${host}`
    });
    suggestions.push({
      message: 'Check firewall rules',
      documentation: 'https://xec.sh/docs/projects/cli/troubleshooting'
    });
  }

  if (errorMsg.includes('authentication') || errorMsg.includes('permission')) {
    suggestions.push({
      message: 'Authentication failed - check credentials',
      documentation: 'https://xec.sh/docs/projects/cli/troubleshooting'
    });

    if (adapter === 'ssh') {
      suggestions.push({
        message: 'Check SSH key permissions',
        command: 'chmod 600 ~/.ssh/id_rsa'
      });
    }
  }

  return suggestions;
}

/**
 * Generate suggestions for timeout errors
 */
function generateTimeoutErrorSuggestions(
  command: string,
  timeout: number,
  adapter: string
): ErrorSuggestion[] {
  const suggestions: ErrorSuggestion[] = [];

  suggestions.push({
    message: `Increase timeout (current: ${timeout}ms)`,
    command: `xec --timeout ${timeout * 2}ms "${command}"`
  });

  if (command.includes('install') || command.includes('download')) {
    suggestions.push({
      message: 'Long-running installation/download detected - consider running in background',
      command: `nohup ${command} &`
    });
  }

  if (adapter === 'ssh') {
    suggestions.push({
      message: 'Check SSH connection stability',
      command: 'xec config set ssh.keepaliveInterval 30'
    });
  }

  if (adapter === 'docker' || adapter === 'kubernetes') {
    suggestions.push({
      message: 'Check container/pod resources',
      command: adapter === 'docker'
        ? 'docker stats <container>'
        : 'kubectl top pod <pod>'
    });
  }

  suggestions.push({
    message: 'Run command directly to see why it\'s slow',
    documentation: 'https://xec.sh/docs/projects/cli/troubleshooting'
  });

  return suggestions;
}

/**
 * Get install command for common tools
 */
function getInstallCommand(command: string): string {
  const commonCommands: Record<string, string> = {
    git: 'brew install git || apt-get install git || yum install git',
    node: 'brew install node || curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -',
    docker: 'brew install docker || curl -fsSL https://get.docker.com | sh',
    kubectl: 'brew install kubectl || snap install kubectl --classic',
    npm: 'Installed with Node.js',
    yarn: 'npm install -g yarn',
    python: 'brew install python || apt-get install python3',
    pip: 'python -m ensurepip',
    make: 'brew install make || apt-get install build-essential',
    curl: 'brew install curl || apt-get install curl',
    wget: 'brew install wget || apt-get install wget',
    jq: 'brew install jq || apt-get install jq',
    aws: 'brew install awscli || pip install awscli',
    gcloud: 'brew install google-cloud-sdk',
    az: 'brew install azure-cli'
  };

  return commonCommands[command] || `Check package manager for '${command}'`;
}

/**
 * Create enhanced error from standard error
 */
export function enhanceError(
  error: Error,
  context?: ErrorContext
): EnhancedExecutionError {
  // If it's already enhanced, just add context
  if (error instanceof EnhancedExecutionError) {
    if (context) {
      Object.assign(error.context, context);
    }
    return error;
  }

  // Convert standard errors
  if (error.name === 'CommandError') {
    const cmdError = error as any;
    return new EnhancedCommandError(
      cmdError.command,
      cmdError.exitCode,
      cmdError.signal,
      cmdError.stdout,
      cmdError.stderr,
      cmdError.duration,
      context?.adapter
    );
  }

  if (error.name === 'ConnectionError') {
    const connError = error as any;
    return new EnhancedConnectionError(
      connError.host,
      connError.originalError,
      connError.port,
      context?.adapter
    );
  }

  if (error.name === 'TimeoutError') {
    const timeoutError = error as any;
    return new EnhancedTimeoutError(
      timeoutError.command,
      timeoutError.timeout,
      context?.adapter
    );
  }

  // Generic enhancement
  return new EnhancedExecutionError(
    error.message,
    'UNKNOWN_ERROR',
    context || {},
    [{
      message: 'An unexpected error occurred',
      documentation: 'https://xec.sh/docs/projects/cli/troubleshooting'
    }]
  );
}