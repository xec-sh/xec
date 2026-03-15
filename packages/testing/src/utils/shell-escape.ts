/**
 * Validate that a name contains only safe characters for shell commands.
 * Allows alphanumeric, hyphens, underscores, and dots.
 */
export function validateShellName(name: string, label: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error(`Invalid ${label}: "${name}". Only alphanumeric characters, hyphens, underscores, and dots are allowed.`);
  }
}

/**
 * Shell-escape a single argument by wrapping in single quotes.
 */
export function shellEscape(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
