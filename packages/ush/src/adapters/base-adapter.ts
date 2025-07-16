import { Command } from '../core/command.js';
import { ProgressReporter } from '../utils/progress.js';
import { StreamHandler } from '../core/stream-handler.js';
import { getAuditLogger } from '../utils/audit-logger.js';
import { TimeoutError, AdapterError } from '../core/error.js';
import { ExecutionResult, ExecutionResultImpl } from '../core/result.js';

export interface SensitiveDataMaskingConfig {
  enabled: boolean;
  patterns: RegExp[];
  replacement: string;
}

export interface BaseAdapterConfig {
  defaultTimeout?: number;
  defaultCwd?: string;
  defaultEnv?: Record<string, string>;
  defaultShell?: string | boolean;
  encoding?: BufferEncoding;
  maxBuffer?: number;
  throwOnNonZeroExit?: boolean;
  sensitiveDataMasking?: Partial<SensitiveDataMaskingConfig>;
  auditLogging?: boolean;
}

interface ResolvedBaseAdapterConfig extends Omit<Required<BaseAdapterConfig>, 'sensitiveDataMasking' | 'auditLogging'> {
  sensitiveDataMasking: SensitiveDataMaskingConfig;
  auditLogging: boolean;
}

export abstract class BaseAdapter {
  protected config: ResolvedBaseAdapterConfig;
  protected abstract readonly adapterName: string;

  constructor(config: BaseAdapterConfig = {}) {
    // Default sensitive data patterns
    // Using named groups for better clarity in replacement
    const defaultPatterns = [
      // API keys and tokens - capture the value part
      /\b(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|authentication[_-]?token|private[_-]?key|secret[_-]?key)(\s*[:=]\s*["']?)([a-zA-Z0-9_\-/.]+)(["']?)/gi,
      // Authorization headers (Bearer, Basic) - match the entire value after "Authorization:"
      /(Authorization:\s*)(Bearer\s+[a-zA-Z0-9_\-/.]+|Basic\s+[a-zA-Z0-9+/]+=*)/gi,
      // AWS credentials
      /\b(aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key)(\s*[:=]\s*["']?)([a-zA-Z0-9+/]+)(["']?)/gi,
      // GitHub tokens with pattern
      /\b(gh[ps]_[a-zA-Z0-9]{36,})/gi,
      // GitHub token assignments
      /\b(github[_-]?token)(\s*[:=]\s*["']?)([a-zA-Z0-9_\-]+)(["']?)/gi,
      // Generic passwords
      /\b(password|passwd|pwd)(\s*[:=]\s*["']?)([^\s"']+)(["']?)/gi,
      // SSH private keys (full replacement)
      /-----BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----[\s\S]+?-----END\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----/gi,
      // Environment variable assignments with secrets
      /\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|KEY|PASSWORD|PASSWD|PWD|APIKEY|API_KEY)[A-Z0-9_]*)(\s*=\s*["']?)([^\s"']+)(["']?)/gi
    ];

    this.config = {
      defaultTimeout: config.defaultTimeout ?? 120000, // 2 minutes
      defaultCwd: config.defaultCwd ?? process.cwd(),
      defaultEnv: config.defaultEnv ?? {},
      defaultShell: config.defaultShell ?? true,
      encoding: config.encoding ?? 'utf8',
      maxBuffer: config.maxBuffer ?? 10 * 1024 * 1024, // 10MB
      throwOnNonZeroExit: config.throwOnNonZeroExit ?? true,
      sensitiveDataMasking: {
        enabled: config.sensitiveDataMasking?.enabled ?? true,
        patterns: config.sensitiveDataMasking?.patterns ?? defaultPatterns,
        replacement: config.sensitiveDataMasking?.replacement ?? '[REDACTED]'
      },
      auditLogging: config.auditLogging ?? false
    };
  }

  abstract execute(command: Command): Promise<ExecutionResult>;
  
  abstract isAvailable(): Promise<boolean>;
  
  // Synchronous execution (optional - adapters can implement if they support it)
  executeSync?(command: Command): ExecutionResult;

  protected mergeCommand(command: Command): Command {
    return {
      ...command,
      cwd: command.cwd ?? this.config.defaultCwd,
      env: { ...this.config.defaultEnv, ...command.env },
      timeout: command.timeout ?? this.config.defaultTimeout,
      shell: command.shell ?? this.config.defaultShell,
      stdout: command.stdout ?? 'pipe',
      stderr: command.stderr ?? 'pipe'
    };
  }

  protected createStreamHandler(options?: { onData?: (chunk: string) => void }): StreamHandler {
    return new StreamHandler({
      encoding: this.config.encoding,
      maxBuffer: this.config.maxBuffer,
      onData: options?.onData ? (chunk: string) => {
        // Apply masking to streaming data
        const maskedChunk = this.maskSensitiveData(chunk);
        options.onData!(maskedChunk);
      } : undefined
    });
  }

  protected createProgressReporter(command: Command): ProgressReporter | null {
    if (!command.progress?.enabled) {
      return null;
    }

    return new ProgressReporter({
      enabled: true,
      onProgress: command.progress.onProgress,
      updateInterval: command.progress.updateInterval,
      reportLines: command.progress.reportLines,
      prefix: this.adapterName
    });
  }

  protected async handleTimeout(
    promise: Promise<any>,
    timeout: number,
    command: string,
    cleanup?: () => void
  ): Promise<any> {
    if (timeout <= 0) {
      return promise;
    }

    const timeoutPromise = new Promise((_, reject) => {
      const timer = setTimeout(() => {
        if (cleanup) cleanup();
        reject(new TimeoutError(command, timeout));
      }, timeout);

      promise.finally(() => clearTimeout(timer));
    });

    return Promise.race([promise, timeoutPromise]);
  }

  protected maskSensitiveData(text: string): string {
    if (!this.config.sensitiveDataMasking.enabled || !text) {
      return text;
    }

    let maskedText = text;
    
    for (const pattern of this.config.sensitiveDataMasking.patterns) {
      // Create a copy of the pattern with global flag to ensure all matches are replaced
      const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      
      maskedText = maskedText.replace(globalPattern, (match, ...args) => {
        // Special case for SSH keys - replace entire key
        if (match.includes('BEGIN') && match.includes('PRIVATE KEY')) {
          return this.config.sensitiveDataMasking.replacement;
        }
        
        // Special case for GitHub tokens that match the pattern directly
        if (match.match(/^gh[ps]_[a-zA-Z0-9]{36,}$/)) {
          return this.config.sensitiveDataMasking.replacement;
        }
        
        // The last two args are offset and full string, remove them
        const groups = args.slice(0, -2);
        
        // If no capture groups, replace the whole match
        if (groups.length === 0 || groups.every(g => g === undefined)) {
          return this.config.sensitiveDataMasking.replacement;
        }
        
        // For patterns with 4 groups (key, separator, value, optional quote)
        if (groups.length === 4 && groups[0] && groups[1] !== undefined && groups[2]) {
          // If separator includes opening quote, don't add closing quote
          const separator = groups[1];
          const hasOpenQuote = separator.includes('"') || separator.includes("'");
          const closeQuote = hasOpenQuote ? '' : (groups[3] || '');
          return groups[0] + separator.replace(/["']$/, '') + this.config.sensitiveDataMasking.replacement + closeQuote;
        }
        
        // For patterns with 3 groups (key, separator, value)
        if (groups.length === 3 && groups[0] && groups[1] !== undefined && groups[2]) {
          return groups[0] + groups[1] + this.config.sensitiveDataMasking.replacement;
        }
        
        // For Authorization headers (2 groups)
        if (groups.length === 2 && groups[0] && groups[1]) {
          return groups[0] + this.config.sensitiveDataMasking.replacement;
        }
        
        // For single group patterns
        if (groups.length === 1 && groups[0]) {
          return this.config.sensitiveDataMasking.replacement;
        }
        
        // Default: try to preserve structure if possible
        if (match.includes('=')) {
          const [key, ] = match.split('=', 2);
          return key + '=' + this.config.sensitiveDataMasking.replacement;
        } else if (match.includes(':')) {
          const [key, ] = match.split(':', 2);
          return key + ': ' + this.config.sensitiveDataMasking.replacement;
        }
        
        // Fallback - replace the whole match
        return this.config.sensitiveDataMasking.replacement;
      });
    }
    
    return maskedText;
  }

  protected createResultSync(
    stdout: string,
    stderr: string,
    exitCode: number,
    signal: string | undefined,
    command: string,
    startTime: number,
    endTime: number,
    context?: { host?: string; container?: string }
  ): ExecutionResult {
    // Apply sensitive data masking
    const maskedStdout = this.maskSensitiveData(stdout);
    const maskedStderr = this.maskSensitiveData(stderr);
    const maskedCommand = this.maskSensitiveData(command);

    const result = new ExecutionResultImpl(
      maskedStdout,
      maskedStderr,
      exitCode,
      signal,
      maskedCommand,
      endTime - startTime,
      new Date(startTime),
      new Date(endTime),
      this.adapterName,
      context?.host,
      context?.container
    );

    // Note: Audit logging is not available in sync mode
    
    if (this.config.throwOnNonZeroExit && exitCode !== 0) {
      result.throwIfFailed();
    }

    return result;
  }
  
  protected async createResult(
    stdout: string,
    stderr: string,
    exitCode: number,
    signal: string | undefined,
    command: string,
    startTime: number,
    endTime: number,
    context?: { host?: string; container?: string }
  ): Promise<ExecutionResult> {
    // Apply sensitive data masking
    const maskedStdout = this.maskSensitiveData(stdout);
    const maskedStderr = this.maskSensitiveData(stderr);
    const maskedCommand = this.maskSensitiveData(command);

    const result = new ExecutionResultImpl(
      maskedStdout,
      maskedStderr,
      exitCode,
      signal,
      maskedCommand,
      endTime - startTime,
      new Date(startTime),
      new Date(endTime),
      this.adapterName,
      context?.host,
      context?.container
    );

    // Log command execution for audit if enabled
    if (this.config.auditLogging) {
      const auditLogger = getAuditLogger({ enabled: true });
      await auditLogger.logCommandExecution(
        command,
        this.adapterName,
        exitCode === 0 ? 'success' : 'failure',
        {
          exitCode,
          signal,
          duration: endTime - startTime,
          host: context?.host,
          container: context?.container
        }
      );
    }

    if (this.config.throwOnNonZeroExit && exitCode !== 0) {
      result.throwIfFailed();
    }

    return result;
  }

  protected buildCommandString(command: Command): string {
    if (command.args && command.args.length > 0) {
      return `${command.command} ${command.args.join(' ')}`;
    }
    return command.command;
  }

  protected async handleAbortSignal(
    signal: AbortSignal | undefined,
    cleanup: () => void
  ): Promise<void> {
    if (!signal) return;

    if (signal.aborted) {
      cleanup();
      throw new AdapterError(this.adapterName, 'execute', new Error('Operation aborted'));
    }

    const abortHandler = () => {
      cleanup();
    };

    signal.addEventListener('abort', abortHandler, { once: true });
  }

  protected createCombinedEnv(baseEnv: Record<string, string>, commandEnv?: Record<string, string>): Record<string, string> {
    const combined: Record<string, string> = {};
    
    // Copy process.env, filtering out undefined values
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        combined[key] = value;
      }
    }
    
    // Override with baseEnv
    Object.assign(combined, baseEnv);
    
    // Override with commandEnv
    if (commandEnv) {
      Object.assign(combined, commandEnv);
    }
    
    return combined;
  }

  updateConfig(config: Partial<BaseAdapterConfig>): void {
    // Handle sensitiveDataMasking separately to ensure proper merging
    const newSensitiveDataMasking = config.sensitiveDataMasking
      ? {
          enabled: config.sensitiveDataMasking.enabled ?? this.config.sensitiveDataMasking.enabled,
          patterns: config.sensitiveDataMasking.patterns ?? this.config.sensitiveDataMasking.patterns,
          replacement: config.sensitiveDataMasking.replacement ?? this.config.sensitiveDataMasking.replacement
        }
      : this.config.sensitiveDataMasking;

    this.config = {
      defaultTimeout: config.defaultTimeout ?? this.config.defaultTimeout,
      defaultCwd: config.defaultCwd ?? this.config.defaultCwd,
      defaultEnv: config.defaultEnv ?? this.config.defaultEnv,
      defaultShell: config.defaultShell ?? this.config.defaultShell,
      encoding: config.encoding ?? this.config.encoding,
      maxBuffer: config.maxBuffer ?? this.config.maxBuffer,
      throwOnNonZeroExit: config.throwOnNonZeroExit ?? this.config.throwOnNonZeroExit,
      sensitiveDataMasking: newSensitiveDataMasking,
      auditLogging: config.auditLogging ?? this.config.auditLogging
    };
  }

  getConfig(): Readonly<ResolvedBaseAdapterConfig> {
    return { ...this.config };
  }
}