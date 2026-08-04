/**
 * What commands exist, without loading them.
 *
 * Every command module statically imports `@xec-sh/ops`, so importing all
 * twelve to discover their names — which is what listing them in `--help`
 * used to require — cost ~140ms on every single invocation, including
 * `xec --version`.
 *
 * This manifest carries only what help needs: a name, a description and any
 * aliases. The implementation is imported when the command is actually
 * invoked. Drift is not a risk you have to remember: `command-manifest.test.ts`
 * loads every module and fails if this list and reality disagree.
 */
export interface CommandManifestEntry {
  /** Command name, as typed. */
  name: string;
  /** One-line description, as shown in `xec --help`. */
  description: string;
  /** Alternative names accepted for this command. */
  aliases: string[];
  /** Module under `./commands/` that registers it. */
  module: string;
}

export const COMMAND_MANIFEST: readonly CommandManifestEntry[] = [
  { name: 'config', description: "Manage Xec configuration", aliases: ['conf', 'cfg'], module: 'config' },
  { name: 'copy', description: "Copy files between targets", aliases: ['cp'], module: 'copy' },
  { name: 'docker', description: "🐳 Comprehensive Docker management using fluent API", aliases: ['d'], module: 'docker' },
  { name: 'forward', description: "Forward ports from remote systems", aliases: ['fwd'], module: 'forward' },
  { name: 'in', description: "Execute commands in containers or Kubernetes pods", aliases: [], module: 'in' },
  { name: 'inspect', description: "Inspect and analyze xec project configuration, tasks, and resources", aliases: ['i'], module: 'inspect' },
  { name: 'logs', description: "View and stream logs from targets (interactive mode if no target specified)", aliases: ['l'], module: 'logs' },
  { name: 'new', description: "Initialize Xec in existing project or create new artifacts", aliases: ['n', 'init'], module: 'new' },
  { name: 'on', description: "Execute commands on SSH hosts", aliases: [], module: 'on' },
  { name: 'run', description: "Run an Xec script or task", aliases: ['r'], module: 'run' },
  { name: 'secrets', description: "Manage secrets securely", aliases: ['secret', 's'], module: 'secrets' },
  { name: 'watch', description: "Watch files for changes and execute commands", aliases: [], module: 'watch' },
];

/**
 * Find the manifest entry a user's first argument refers to.
 *
 * @param token - The first non-flag argument, if any.
 * @returns The matching entry, by name or alias.
 */
export function findCommand(token: string | undefined): CommandManifestEntry | undefined {
  if (!token) return undefined;
  return COMMAND_MANIFEST.find(
    entry => entry.name === token || entry.aliases.includes(token)
  );
}
