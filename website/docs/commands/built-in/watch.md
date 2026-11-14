---
title: watch
description: Watch scoped directories and run commands, tasks, or scripts
---

# watch {#watch}

Watch files on a local, SSH, Docker or Kubernetes target and run an action when
changes are observed. Use a small source directory instead of an entire checkout
when generated files and dependencies are not relevant.

## Synopsis {#synopsis}

```bash
xec watch <target> [paths...] [options]
```

## Arguments {#arguments}

- `<target>`: `local`, `hosts.name`, `containers.name` or `pods.name`.
- `[paths...]`: directories to watch; defaults to the current directory.

## Options {#options}

| Option | Meaning |
| --- | --- |
| `--command <command>` | Execute a shell command on the selected target. |
| `--task <task>` | Run a configured Xec task. |
| `--script <script>` | Execute a JavaScript or TypeScript script through Xec. |
| `--pattern <pattern>` | Include a basename pattern; may be repeated. |
| `--exclude <pattern>` | Exclude paths; semantics depend on the target, below. |
| `-d, --debounce <ms>` | Delay the action after a change burst; default `300`. |
| `--initial` | Run once after the watcher is ready. |
| `--poll` | Use filesystem polling for a **local** target. |
| `--interval <ms>` | Local poll interval or remote fallback interval; default `1000`. |
| `-p, --profile <profile>` | Select a configuration profile. |
| `-i, --interactive` | Prompt for the target, paths and action. |
| `-c, --config <path>` | Select a configuration file. |
| `--dry-run` | Print the selected target, paths and action without starting them. |
| `--quiet`, `--verbose` | Control diagnostic output. |

Supply one action: `--command`, `--task` or `--script`.

## Examples {#examples}

```bash
xec watch local src --pattern '*.ts' --command 'pnpm test'
xec watch local src --script ./scripts/build.ts --initial
xec watch local src styles --pattern '*.ts' --pattern '*.css' --task build
xec watch local src --poll --interval 1000 --command 'pnpm build'
xec watch hosts.dev /app/src --command 'systemctl reload myapp'
xec watch containers.app /src --pattern '*.js' --command 'npm run build'
xec watch pods.frontend /app --exclude node_modules --task reload
xec watch local --interactive
```

## Pattern Syntax {#pattern-syntax}

`--pattern` matches a **basename**, not a full relative path. Use simple `*` and
`?` patterns, for example `*.ts` or `config?.json`. Repeat the option for multiple
file types. Brace expansion and recursive path globs are not a supported matcher
contract.

A local positional path such as `src/**/*.ts` selects the `src` watch root and
matches its final basename segment recursively. Prefer an explicit root and
`--pattern '*.ts'`; this also makes the scanned scope clear.

## Exclude Patterns {#exclude-patterns}

For local watching, exclusions are literal path fragments. Use `node_modules`,
`.git`, `dist` or `.test.`; `**/*.test.*` is not a local exclusion glob.

```bash
xec watch local src --exclude .test. --exclude generated --task build
```

On remote targets, exclusions are passed to `inotifywait --exclude`, whose
matcher is a regular expression. The stat-based remote fallback does not provide
per-file exclusion events.

## Action Types {#action-types}

Commands run on the selected target. Scripts use Xec's script loader with the
selected target and execution engine in their context. Tasks use the project's
configured task definition. A failed action is reported and watching continues.

## Debouncing {#debouncing}

Changes within the quiet interval are combined into one scheduled action. A
longer interval reduces work while saving several files:

```bash
xec watch local src --task build --debounce 1000
```

Debouncing is not a build scheduler: a later change can start an action while a
previous action is still running. Workflows that must serialize or coordinate
builds should own that policy through the [Ops workflow API](../../ops/workflow.md).

## Polling vs Native Watchers {#polling-vs-native-watchers}

Native local watching uses Node's `fs.watch` and depends on operating-system
notifications. Select `--poll` for a filesystem where those notifications are
unreliable. Polling scans the selected roots every interval and observes file
identity, size and modification metadata; it can detect atomic replacements even
when a writer preserves the modification time.

Polling costs filesystem work proportional to the selected files. It does not
observe changes that are created and removed entirely between two scans. Neither
mode is a durable event journal.

## Remote Watching Implementation {#remote-watching-implementation}

SSH, Docker and Kubernetes targets run `inotifywait` through their target's
command execution. When that tool is unavailable, the remote shell falls back to
comparing the maximum file modification time. `--interval` is rounded to whole
seconds, with a minimum of one second. GNU and BSD `stat` are supported.

This fallback reports directory-level changes, not a lossless sequence of file
additions and deletions; a change that leaves the maximum modification time
unchanged may not be detected. `--poll` selects the local FileWatcher backend and
does not force a different remote transport. There is no automatic reconnect
promise when a remote watch process or connection fails.

## Error Handling {#error-handling}

The local watcher becomes ready only when all roots have been admitted. Missing
or unreadable roots fail before the readiness message or initial action. A later
watcher error or unexpected closure fails the foreground command and releases its
watch resources. Action failures are separate: they are logged while the watcher
continues observing.

## Signal Handling {#signal-handling}

The first `SIGINT` or `SIGTERM` cancels the command and waits for its owned actions
and watcher cleanup. Xec reports elapsed cleanup time. A second termination
signal explicitly forces exit; it can leave cleanup incomplete. There is no
`SIGUSR1` configuration-reload handler.

## Exit Codes {#exit-codes}

Exit status is `130` after `SIGINT` and `143` after `SIGTERM`. A successful dry run
returns `0`; watcher setup or runtime errors use the shared
[CLI exit codes](../cli-reference.md#exit-codes), including `10` for a missing
path and `11` for permission denial.

## Configuration {#configuration}

Command defaults belong under `commands.watch` in `.xec/config.yaml`:

```yaml
commands:
  watch:
    debounce: 300
    poll: false
    interval: 1000
    initial: false
```

## Programmatic Watching {#programmatic-watching}

The shared watcher is available from `@xec-sh/loader/watch`. Its defaults differ
from the CLI: a `200` ms debounce, script extensions only and exclusions for
`node_modules`, `.git`, `dist`, `coverage` and `.turbo`. Set `extensions: []` to
observe every file type. `ignore` contains literal path fragments.

```typescript
import { FileWatcher } from '@xec-sh/loader/watch';

const watcher = new FileWatcher(['src', 'styles'], {
  poll: true, pollInterval: 1000, extensions: [],
});
watcher.on('change', event => console.log(event.type, event.relativePath));
watcher.on('error', error => { console.error(error); process.exitCode = 1; });
watcher.once('ready', () => console.log('All roots are watched'));
watcher.start();
// The owner later calls watcher.close().
```

Attach listeners before `start()`. `ready` means every selected root is watched;
`error` closes the watcher and `close` reports that lifecycle boundary. Events
contain an absolute `path` and a `relativePath` relative to the watch root.
`persistent` defaults to `true`; use `false` only for a background watcher that
must not keep the process alive. `close()` is idempotent. Starting an already
started watcher creates no duplicate subscription; a closed watcher cannot be
restarted.

The caller owns any initial build. The watcher does not synthesize an initial
file change or serialize asynchronous event handlers.

## Related Commands {#related-commands}

- [run](run.md): execute scripts and tasks.
- [on](on.md): execute commands on SSH hosts.
- [in](in.md): execute commands in containers or pods.
- [logs](logs.md): inspect target logs.
