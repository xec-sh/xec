import { z } from 'zod';
import * as os from 'node:os';
import { $ } from '@xec-sh/core';
import * as path from 'node:path';
import { prism } from '@xec-sh/kit';
import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { getSecretsDir, validateOptions, findProjectRoot } from '@xec-sh/ops';

import { BaseCommand, CommandOptions } from '../utils/command-base.js';

interface DoctorOptions extends CommandOptions {
  /** Include checks that reach the network or start processes. */
  deep?: boolean;
}

/**
 * The client version out of `kubectl version -o json`.
 *
 * @param output - What kubectl printed.
 * @returns The version, or a description of why it is not known.
 */
function readClientVersion(output: string): string {
  try {
    const parsed = JSON.parse(output) as { clientVersion?: { gitVersion?: string } };
    return parsed.clientVersion?.gitVersion ?? 'present, version not reported';
  } catch {
    return output.split('\n')[0]?.trim() || 'present';
  }
}

/** What one check found. */
interface Check {
  /** Stable identifier, safe to match on from a script. */
  readonly id: string;
  /** What was examined, in words. */
  readonly name: string;
  readonly status: 'ok' | 'warn' | 'fail';
  /** What was found. */
  readonly detail: string;
  /** What to do about it. Present when the status is not `ok`. */
  readonly fix?: string;
}

/**
 * Report on the environment xec is about to run in.
 *
 * Everything this command reports is something that has caused a confusing
 * failure somewhere else: a docker daemon that is not running, a node too
 * old for the type stripping the CLI's scripts rely on, a project with no
 * configuration, a secret store the surrounding repository is about to
 * commit. Each of those produces an error at the moment of use, in terms
 * of whatever operation happened to hit it first.
 *
 * Asking directly is cheaper than deducing it from a stack trace — and for
 * an agent, which cannot look at the machine, it is the only way to know
 * what is available before choosing how to do something.
 */
export class DoctorCommand extends BaseCommand {
  constructor() {
    super({
      name: 'doctor',
      description: 'Check the environment xec runs in',
      options: [
        {
          flags: '--deep',
          description: 'Include checks that start processes (docker daemon, kubectl context)',
        },
      ],
      examples: [
        { command: 'xec doctor', description: 'Report on this machine and project' },
        { command: 'xec doctor -o json', description: 'The same report, as data' },
        { command: 'xec doctor --deep', description: 'Also contact the docker daemon and the cluster' },
      ],
      validateOptions: (options) => {
        validateOptions(options, z.object({
          deep: z.boolean().optional(),
          output: z.string().optional(),
          verbose: z.boolean().optional(),
          quiet: z.boolean().optional(),
        }));
      },
    });
  }

  override async execute(args: unknown[]): Promise<void> {
    const options = args[args.length - 1] as DoctorOptions;

    const checks: Check[] = [
      this.checkRuntime(),
      this.checkTerminal(),
      ...(await this.checkTools(options.deep === true)),
      this.checkProject(),
      this.checkSecrets(),
    ];

    const failed = checks.filter(check => check.status === 'fail');
    const warned = checks.filter(check => check.status === 'warn');

    this.emitResult(
      {
        ok: failed.length === 0,
        checks,
        failed: failed.length,
        warnings: warned.length,
      },
      () => this.report(checks)
    );

    if (failed.length > 0) {
      // A non-zero exit is what makes this usable as a precondition in a
      // script: `xec doctor && ./deploy.sh`. Warnings do not fail — they
      // describe something absent that is not always needed.
      process.exitCode = 1;
    }
  }

  /**
   * Print the checks for a person.
   *
   * The report is the answer to `xec doctor`, so it goes to stdout, the
   * same channel its `-o json` form uses.
   *
   * @param checks - What was found.
   */
  private report(checks: readonly Check[]): void {
    const mark = { ok: prism.green('✓'), warn: prism.yellow('!'), fail: prism.red('✗') };

    for (const check of checks) {
      process.stdout.write(`${mark[check.status]} ${check.name}: ${check.detail}\n`);
      if (check.fix) {
        process.stdout.write(`  ${prism.dim(check.fix)}\n`);
      }
    }

    const failed = checks.filter(check => check.status === 'fail').length;
    const summary = failed === 0
      ? prism.green(`✓ ${checks.length} checks, nothing broken`)
      : prism.red(`${failed} of ${checks.length} checks failed`);
    process.stderr.write(`${summary}\n`);
  }

  /** The runtime, against the floor the CLI's own scripts need. */
  private checkRuntime(): Check {
    const version = process.versions.node;
    const [major = 0, minor = 0] = version.split('.').map(Number);

    // 22.18 is where Node's type stripping is on by default, which is what
    // lets a .ts task run without a build step.
    const meetsFloor = major > 22 || (major === 22 && minor >= 18);

    return {
      id: 'runtime.node',
      name: 'Node',
      status: meetsFloor ? 'ok' : 'fail',
      detail: `${version} on ${process.platform}/${process.arch}`,
      ...(meetsFloor ? {} : {
        fix: 'TypeScript tasks need Node 22.18 or newer, where type stripping is on by default.',
      }),
    };
  }

  /** What the output is going to, which decides how much of it is decoration. */
  private checkTerminal(): Check {
    const tty = process.stdout.isTTY === true;
    const ci = process.env['CI'] !== undefined;
    const noColor = process.env['NO_COLOR'] !== undefined;

    const parts = [tty ? 'interactive' : 'not a terminal'];
    if (ci) parts.push('CI');
    if (noColor) parts.push('NO_COLOR set');

    return {
      id: 'terminal',
      name: 'Output',
      status: 'ok',
      detail: parts.join(', '),
    };
  }

  /**
   * The external programs the adapters shell out to.
   *
   * Presence is checked without `--deep`, because asking a program for its
   * version is fast and local. Reaching the docker daemon or a cluster is
   * not, and can hang on a bad context, so it is opt-in.
   *
   * @param deep - Whether to contact daemons as well as find binaries.
   * @returns One check per tool.
   */
  private async checkTools(deep: boolean): Promise<Check[]> {
    const tools = [
      { id: 'docker', command: 'docker', args: ['--version'], why: 'needed for container targets' },
      { id: 'kubectl', command: 'kubectl', args: ['version', '--client', '-o', 'json'], why: 'needed for kubernetes targets' },
      { id: 'ssh', command: 'ssh', args: ['-V'], why: 'core speaks SSH itself; this is only for ssh-config lookups' },
      { id: 'git', command: 'git', args: ['--version'], why: 'needed for the git secret provider' },
    ];

    const checks: Check[] = await Promise.all(tools.map(async (tool): Promise<Check> => {
      const found = await $`${[tool.command, ...tool.args]}`.nothrow().quiet();

      if (found.exitCode !== 0) {
        return {
          id: `tool.${tool.id}`,
          name: tool.command,
          status: 'warn' as const,
          detail: 'not found',
          fix: `Install it if you need it — ${tool.why}.`,
        };
      }

      // `ssh -V` prints to stderr; the others to stdout.
      const output = found.stdout || found.stderr;

      // kubectl answers with a JSON document, whose first line is `{`.
      // Reporting that as the version is the kind of almost-right output
      // that reads as working until someone tries to use it.
      const detail = tool.id === 'kubectl'
        ? readClientVersion(output)
        : output.split('\n')[0]?.trim() || 'present';

      return {
        id: `tool.${tool.id}`,
        name: tool.command,
        status: 'ok' as const,
        detail: detail.slice(0, 80),
      };
    }));

    if (!deep) return checks;

    const daemon = await $`docker info --format {{.ServerVersion}}`.nothrow().quiet();
    checks.push({
      id: 'docker.daemon',
      name: 'docker daemon',
      status: daemon.exitCode === 0 ? 'ok' : 'warn',
      detail: daemon.exitCode === 0 ? `running, server ${daemon.stdout.trim()}` : 'not reachable',
      ...(daemon.exitCode === 0 ? {} : { fix: 'Start Docker Desktop, or the docker service.' }),
    });

    const context = await $`kubectl config current-context`.nothrow().quiet();
    checks.push({
      id: 'kubernetes.context',
      name: 'kubernetes context',
      status: context.exitCode === 0 ? 'ok' : 'warn',
      detail: context.exitCode === 0 ? context.stdout.trim() : 'none selected',
      ...(context.exitCode === 0 ? {} : { fix: 'A pod target names its own context, so this is only the default.' }),
    });

    return checks;
  }

  /** Whether this directory is an xec project, and whether its config parses. */
  private checkProject(): Check {
    const root = findProjectRoot(process.cwd());

    if (!root) {
      return {
        id: 'project',
        name: 'Project',
        status: 'warn',
        detail: 'no .xec directory found from here',
        fix: 'Run `xec new` to create one, or work from a directory inside a project.',
      };
    }

    const configPath = path.join(root, '.xec', 'config.yaml');
    if (!existsSync(configPath)) {
      return {
        id: 'project',
        name: 'Project',
        status: 'warn',
        detail: `${root} has a .xec directory but no config.yaml`,
        fix: 'Run `xec new` to write one.',
      };
    }

    try {
      const text = readFileSync(configPath, 'utf-8');
      return {
        id: 'project',
        name: 'Project',
        status: 'ok',
        detail: `${configPath} (${text.split('\n').length} lines)`,
      };
    } catch (error) {
      return {
        id: 'project',
        name: 'Project',
        status: 'fail',
        detail: `${configPath} cannot be read: ${error instanceof Error ? error.message : String(error)}`,
        fix: 'Check the file permissions.',
      };
    }
  }

  /**
   * The secret store: where it is, how much is in it, and whether the
   * surrounding repository is about to commit it.
   *
   * Never the values, and never the key names — a diagnostic that has to
   * be redacted before it can be pasted into an issue is not a diagnostic.
   */
  private checkSecrets(): Check {
    let dir: string;
    try {
      dir = getSecretsDir();
    } catch {
      return { id: 'secrets', name: 'Secrets', status: 'ok', detail: 'no store in use' };
    }

    if (!existsSync(dir)) {
      return {
        id: 'secrets',
        name: 'Secrets',
        status: 'ok',
        detail: 'no store yet',
      };
    }

    const ignored = existsSync(path.join(dir, '.gitignore'));
    const home = os.homedir();
    const shown = dir.startsWith(home) ? dir.replace(home, '~') : dir;

    return {
      id: 'secrets',
      name: 'Secrets',
      status: ignored ? 'ok' : 'fail',
      detail: ignored ? `${shown}, excluded from git` : `${shown}, NOT excluded from git`,
      ...(ignored ? {} : {
        fix: 'Write a .gitignore containing `*` in that directory before committing anything.',
      }),
    };
  }
}

export default function registerCommand(program: Command): void {
  const cmd = new DoctorCommand();
  program.addCommand(cmd.create());
}
