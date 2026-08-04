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
  // Credentials embedded in a URL: postgres://user:pw@host, redis://, mongodb+srv://…
  /([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):([^\s@]+)@/gi,
  // Provider-issued tokens, matched by their documented prefixes.
  /\bAIza[0-9A-Za-z_-]{20,}/g,
  /\bxox[abposr]-[0-9A-Za-z-]{10,}/gi,
  /\b(?:sk|pk|rk)_(?:live|test)_[0-9A-Za-z]{10,}/g,
  /\bglpat-[0-9A-Za-z_-]{16,}/g,
  /\bnpm_[0-9A-Za-z]{30,}/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  // Deliberately NOT matched: a bare 40-character AWS secret. It has no
  // prefix to key off, and a pattern broad enough to catch it also redacts
  // every git SHA in the output — verified. Corrupting real output is worse
  // than missing a key that only appears without any surrounding context;
  // assigned to a variable or a URL, it is caught by the rules above.
  // Basic-auth on a command line: curl -u user:password
  /(-u|--user)(\s+)([^\s:]+):([^\s]+)/g,
  // Any PEM private key, not just the four algorithms listed below.
  /-----BEGIN[^-]*PRIVATE KEY(?: BLOCK)?-----[\s\S]+?-----END[^-]*PRIVATE KEY(?: BLOCK)?-----/gi,
  // Standalone Bearer tokens
  /\b(Bearer)(\s+)([a-zA-Z0-9_\-/.]+)/gi
  ];
}

/** Text substituted in place of a redacted value. */
export const DEFAULT_REDACTION = '[REDACTED]';
