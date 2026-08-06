import type { SensitivePattern } from './optimized-masker.js';

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
 * Each rule declares what a redaction should leave behind, so the output
 * format is a property of the rule rather than of how many parentheses it
 * happens to contain. See `RedactionShape`.
 *
 * @returns Freshly constructed rules, safe to use independently.
 */
export function defaultSensitiveRules(): SensitivePattern[] {
  return [
  // JSON string values for sensitive keys
  { pattern: /"(api[_-]?key|apikey|password|token|secret|client[_-]?secret)":\s*"([^"]+)"/gi, shape: 'json' },
  // API keys and tokens - capture the value part
  { pattern: /\b(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|authentication[_-]?token|private[_-]?key|secret[_-]?key)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi, shape: 'assignment' },
  // Authorization headers - preserve "Bearer" or "Basic" prefix
  { pattern: /(Authorization:\s*)(Bearer|Basic)(\s+)([a-zA-Z0-9_\-/.+=]+)/gi, shape: 'scheme' },
  // AWS credentials
  { pattern: /\b(aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi, shape: 'assignment' },
  // GitHub tokens with pattern - direct matches
  { pattern: /\b(gh[ps]_[a-zA-Z0-9]{16,})/gi, shape: 'whole' },
  // GitHub token assignments
  { pattern: /\b(github[_-]?token)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi, shape: 'assignment' },
  // Generic tokens (including slack xoxb-, etc)
  { pattern: /\b(token)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi, shape: 'assignment' },
  // Generic passwords - handle quoted and unquoted values (including template variables)
  { pattern: /\b(password|passwd|pwd)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^\s]+))/gi, shape: 'assignment' },
  // Command line password arguments
  { pattern: /(--password)(\s+)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi, shape: 'label' },
  // Command line secret arguments
  { pattern: /(--client[_-]?secret|--secret)(\s+)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi, shape: 'label' },
  // Any PEM private key, whatever the algorithm, replaced whole.
  //
  // The body must not span another `-----BEGIN`, which is what keeps this
  // linear: a header with no matching footer — a truncated key, or a log full
  // of them — otherwise made every candidate scan to end-of-input, and 800 KB
  // of such output took 6.8 seconds. Blocks in a bundle still match one by one,
  // and `-----BEGIN CERTIFICATE-----` is left alone.
  { pattern: /-----BEGIN[^-]{0,64}PRIVATE\s+KEY(?:\s+BLOCK)?-----(?:(?!-----BEGIN)[\s\S]){0,65536}?-----END[^-]{0,64}PRIVATE\s+KEY(?:\s+BLOCK)?-----/gi, shape: 'whole' },
  // Environment variable assignments with secrets (including template variables).
  //
  // Case is the signal, and dropping it was the bug. Written `[A-Z]…KEY…`
  // but compiled with `i`, this matched any word containing "key" past the
  // first position — `monkey=banana`, `donkey=grey`, `whiskey=irish` all
  // had their values replaced, corrupting ordinary output on every command
  // that printed one.
  //
  // Requiring the secret word to be a whole component fixed that and broke
  // something worse: `PGPASSWORD` is one component, and it is the most
  // common name for a secret there is. So are `APIKEY` and `GITHUBTOKEN`.
  //
  // Two alternatives instead. Uppercase names match anywhere in the name,
  // because an uppercase identifier is an environment variable and one
  // ending in PASSWORD is a password; the cost is `MONKEY=`, which nobody
  // writes. Lowercase names must be composite — `db_password`, not
  // `monkey` — because a lowercase word containing "key" is usually a word.
  { pattern: /\b((?:[A-Z0-9_-]*(?:SECRET|TOKEN|KEY|PASSWORD|PASSWD|PWD|APIKEY)[A-Z0-9_-]*)|(?:[a-z0-9]+[_-][a-z0-9_-]*(?:secret|token|key|password|passwd|pwd|apikey)[a-z0-9_-]*))(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^\s]+))/g, shape: 'assignment' },

  // Generic secret patterns
  { pattern: /\b(secret|client[_-]?secret)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi, shape: 'assignment' },
  // Credentials embedded in a URL: postgres://user:pw@host, redis://, mongodb+srv://…
  //
  // Anchored on the literal `://` rather than on the scheme. Starting with the
  // character class `[a-z]` gave the engine a candidate start position at every
  // letter, and the greedy scheme scan then walked to end-of-input and back at
  // each one — quadratic. On 200 KB of ordinary output that cost 29 seconds,
  // which surfaced as commands appearing to hang, since every result is masked.
  // The bounds keep the userinfo scan linear on pathological input too.
  { pattern: /(:\/\/[^\s:/@]{1,256}):([^\s@]{1,256})@/g, shape: 'url-userinfo' },
  // Provider-issued tokens, matched by their documented prefixes.
  { pattern: /\bAIza[0-9A-Za-z_-]{20,}/g, shape: 'whole' },
  { pattern: /\bxox[abposr]-[0-9A-Za-z-]{10,}/gi, shape: 'whole' },
  { pattern: /\b(?:sk|pk|rk)_(?:live|test)_[0-9A-Za-z]{10,}/g, shape: 'whole' },
  { pattern: /\bglpat-[0-9A-Za-z_-]{16,}/g, shape: 'whole' },
  { pattern: /\bnpm_[0-9A-Za-z]{30,}/g, shape: 'whole' },
  { pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, shape: 'whole' },
  // Deliberately NOT matched: a bare 40-character AWS secret. It has no
  // prefix to key off, and a pattern broad enough to catch it also redacts
  // every git SHA in the output — verified. Corrupting real output is worse
  // than missing a key that only appears without any surrounding context;
  // assigned to a variable or a URL, it is caught by the rules above.
  // Basic-auth on a command line: curl -u user:password
  { pattern: /(-u|--user)(\s+)([^\s:]+):([^\s]+)/g, shape: 'basic-auth' },
  // Standalone Bearer tokens
  { pattern: /\b(Bearer)(\s+)([a-zA-Z0-9_\-/.]+)/gi, shape: 'label' },
  ];
}

/**
 * The same rules as bare expressions.
 *
 * `sensitiveDataMasking.patterns` is declared as `RegExp[]`, and a caller
 * who reads the defaults to extend them gets what that type promises.
 * Derived rather than duplicated: two lists of the same patterns drift,
 * and the one that drifts is always the one nobody is looking at.
 *
 * @returns Freshly constructed patterns.
 */
export function createDefaultSensitivePatterns(): RegExp[] {
  return defaultSensitiveRules().map(rule => rule.pattern);
}

/** Text substituted in place of a redacted value. */
export const DEFAULT_REDACTION = '[REDACTED]';
