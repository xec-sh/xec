/**
 * Build the set of regular expressions used to redact credentials from command
 * strings, output streams and emitted events.
 *
 * These live in their own module so that every layer — adapters, the execution
 * engine and its event emitter — redacts using exactly the same rules. A
 * pattern added here takes effect everywhere at once.
 *
 * A **new** array of fresh `RegExp` objects is returned on every call. The
 * patterns carry the `g` flag, so sharing instances between maskers would let
 * one masker's `lastIndex` make another skip a match — silently letting a
 * secret through.
 *
 * @returns Freshly constructed patterns, safe to use independently.
 */
export function createDefaultSensitivePatterns(): RegExp[] {
  return [
  // JSON string values for sensitive keys
  /"(api[_-]?key|apikey|password|token|secret|client[_-]?secret)":\s*"([^"]+)"/gi,
  // API keys and tokens - capture the value part
  /\b(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|authentication[_-]?token|private[_-]?key|secret[_-]?key)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
  // Authorization headers - preserve "Bearer" or "Basic" prefix
  /(Authorization:\s*)(Bearer|Basic)(\s+)([a-zA-Z0-9_\-/.+=]+)/gi,
  // AWS credentials
  /\b(aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
  // GitHub tokens with pattern - direct matches
  /\b(gh[ps]_[a-zA-Z0-9]{16,})/gi,
  // GitHub token assignments
  /\b(github[_-]?token)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
  // Generic tokens (including slack xoxb-, etc)
  /\b(token)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
  // Generic passwords - handle quoted and unquoted values (including template variables)
  /\b(password|passwd|pwd)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^\s]+))/gi,
  // Command line password arguments
  /(--password)(\s+)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
  // Command line secret arguments
  /(--client[_-]?secret|--secret)(\s+)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
  // SSH private keys (full replacement)
  /-----BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----[\s\S]+?-----END\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----/gi,
  // Environment variable assignments with secrets (including template variables)
  /\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|KEY|PASSWORD|PASSWD|PWD|APIKEY|API_KEY)[A-Z0-9_]*)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^\s]+))/gi,
  // Generic secret patterns
  /\b(secret|client[_-]?secret)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
  // Standalone Bearer tokens
  /\b(Bearer)(\s+)([a-zA-Z0-9_\-/.]+)/gi
  ];
}

/** Text substituted in place of a redacted value. */
export const DEFAULT_REDACTION = '[REDACTED]';
