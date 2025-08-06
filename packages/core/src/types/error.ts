/**
 * Context information for enhanced error reporting
 */
export interface ErrorContext {
  command?: string;
  cwd?: string;
  adapter?: string;
  host?: string;
  container?: string;
  pod?: string;
  exitCode?: number;
  signal?: string;
  duration?: number;
  timestamp?: Date;
  env?: Record<string, string>;
}

/**
 * Suggestion for fixing an error
 */
export interface ErrorSuggestion {
  message: string;
  command?: string;
  link?: string;
  documentation?: string;
}

/**
 * Enhanced error details
 */
export interface EnhancedErrorDetails {
  code: string;
  message?: string;
  context: ErrorContext;
  suggestions: ErrorSuggestion[];
  relatedErrors?: string[] | Error[];
  systemInfo?: {
    platform: string;
    arch: string;
    nodeVersion: string;
  };
}