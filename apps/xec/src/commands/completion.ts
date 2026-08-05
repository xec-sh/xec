import { z } from 'zod';
import { Command } from 'commander';
import { UserError, validateOptions } from '@xec-sh/ops';

import { COMMAND_MANIFEST } from '../utils/command-manifest.js';
import { BaseCommand, CommandOptions } from '../utils/command-base.js';

interface CompletionOptions extends CommandOptions {
  /** Emit the names a shell asked for, rather than the script that asks. */
  complete?: string;
}

/** Shells this command can write a script for. */
const SHELLS = ['bash', 'zsh', 'fish'] as const;
type Shell = (typeof SHELLS)[number];

/**
 * Completion, including the things only this project knows.
 *
 * A static list of subcommands is the easy half and the less useful one.
 * What an operator actually cannot remember is the name of the host in
 * `xec on hosts.<tab>` — which lives in their configuration, changes when
 * they edit it, and no generated script can contain.
 *
 * So the emitted script is a thin one: it asks `xec completion --complete`
 * for candidates at the moment of the tab. That costs a process per
 * completion, which is what every modern CLI has concluded is the right
 * trade — a stale list is worse than a fast wrong answer.
 */
export class CompletionCommand extends BaseCommand {
  constructor() {
    super({
      name: 'completion',
      description: 'Print a shell completion script',
      arguments: '[shell]',
      options: [
        {
          flags: '--complete <line>',
          description: 'Internal: list candidates for a partial command line',
        },
      ],
      examples: [
        { command: 'xec completion bash >> ~/.bashrc', description: 'Install for bash' },
        { command: 'xec completion zsh > ~/.zfunc/_xec', description: 'Install for zsh' },
        { command: 'xec completion fish > ~/.config/fish/completions/xec.fish', description: 'Install for fish' },
      ],
      validateOptions: (options) => {
        validateOptions(options, z.object({
          complete: z.string().optional(),
          output: z.string().optional(),
          verbose: z.boolean().optional(),
          quiet: z.boolean().optional(),
        }));
      },
    });
  }

  override async execute(args: unknown[]): Promise<void> {
    const options = args[args.length - 1] as CompletionOptions;

    if (options.complete !== undefined) {
      await this.emitCandidates(options.complete);
      return;
    }

    const shell = typeof args[0] === 'string' ? args[0] : undefined;

    if (!shell) {
      throw new UserError(
        `Which shell? One of: ${SHELLS.join(', ')}\n` +
        '  e.g. xec completion zsh > ~/.zfunc/_xec'
      );
    }

    if (!(SHELLS as readonly string[]).includes(shell)) {
      throw new UserError(`No completion script for '${shell}'. Supported: ${SHELLS.join(', ')}`);
    }

    process.stdout.write(this.script(shell as Shell));
  }

  /**
   * Candidates for a partial command line, one per line.
   *
   * Called by the emitted script on every tab, so it must not load a
   * command module or open a connection: the manifest and the parsed
   * configuration are enough, and both are cheap.
   *
   * @param line - The words typed so far, space separated.
   */
  private async emitCandidates(line: string): Promise<void> {
    const words = line.trim().split(/\s+/).filter(Boolean);
    // `xec on hosts.` ends in a separator, so the word being completed is
    // empty — which a plain split cannot distinguish from having finished
    // the previous word.
    const partial = line.endsWith(' ') ? '' : words[words.length - 1] ?? '';
    const command = words[0] === 'xec' ? words[1] : words[0];

    // The first word: a command name.
    if (words.length <= 1 || (words.length === 2 && words[0] === 'xec' && !line.endsWith(' '))) {
      this.emitLines(
        COMMAND_MANIFEST
          .map(entry => entry.name)
          .filter(name => name.startsWith(partial))
      );
      return;
    }

    // After a command that takes a target, the configured targets.
    if (command && ['on', 'in', 'copy', 'logs', 'watch', 'forward'].includes(command)) {
      this.emitLines(await this.targetNames(partial));
      return;
    }

    if (command === 'run') {
      this.emitLines(await this.taskNames(partial));
      return;
    }

    this.emitLines([]);
  }

  /** Names of configured targets, in the form a command accepts. */
  private async targetNames(partial: string): Promise<string[]> {
    try {
      await this.initializeConfig({});
    } catch {
      // No project here, or a configuration that does not parse. A tab
      // that reports an error is worse than one that offers nothing.
      return [];
    }

    const targets = this.xecConfig?.targets as
      | Record<string, Record<string, unknown> | undefined>
      | undefined;
    if (!targets) return [];

    // `hosts`, `containers` and `pods` hold named targets. `local` and
    // `defaults` are not groups — `local` is one target and `defaults`
    // describes the others — so walking every key offered `local.type` and
    // `defaults.ssh` as things you could run a command on.
    const groups = ['hosts', 'containers', 'pods'] as const;

    const names: string[] = ['local'];
    for (const group of groups) {
      const entries = targets[group];
      if (!entries || typeof entries !== 'object') continue;
      for (const name of Object.keys(entries)) {
        names.push(`${group}.${name}`);
      }
    }

    return names.filter(name => name.startsWith(partial)).sort();
  }

  /** Names of configured tasks. */
  private async taskNames(partial: string): Promise<string[]> {
    try {
      await this.initializeConfig({});
    } catch {
      return [];
    }

    const tasks = this.xecConfig?.tasks as Record<string, unknown> | undefined;
    if (!tasks) return [];

    return Object.keys(tasks).filter(name => name.startsWith(partial)).sort();
  }

  /** One candidate per line, which is what every shell's `$(...)` expects. */
  private emitLines(values: readonly string[]): void {
    if (values.length > 0) {
      process.stdout.write(`${values.join('\n')}\n`);
    }
  }

  /**
   * The script a shell should source.
   *
   * @param shell - Which shell.
   * @returns The script text.
   */
  private script(shell: Shell): string {
    if (shell === 'bash') {
      return `# xec completion for bash
# Install: xec completion bash >> ~/.bashrc
_xec_complete() {
  local line="\${COMP_LINE}"
  local candidates
  candidates="$(xec completion --complete "\${line}" 2>/dev/null)"
  COMPREPLY=($(compgen -W "\${candidates}" -- "\${COMP_WORDS[COMP_CWORD]}"))
}
complete -F _xec_complete xec
`;
    }

    if (shell === 'zsh') {
      return `#compdef xec
# xec completion for zsh
# Install: xec completion zsh > ~/.zfunc/_xec  (with ~/.zfunc on $fpath)
_xec() {
  local -a candidates
  candidates=(\${(f)"$(xec completion --complete "\${words[*]}" 2>/dev/null)"})
  _describe 'xec' candidates
}
_xec "$@"
`;
    }

    return `# xec completion for fish
# Install: xec completion fish > ~/.config/fish/completions/xec.fish
function __xec_complete
  xec completion --complete (commandline -cp) 2>/dev/null
end
complete -c xec -f -a '(__xec_complete)'
`;
  }
}

export default function registerCommand(program: Command): void {
  const cmd = new CompletionCommand();
  program.addCommand(cmd.create());
}
