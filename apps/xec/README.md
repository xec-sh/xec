# @xec-sh/cli

Run commands, TypeScript scripts, and configured tasks across local, SSH, Docker, and Kubernetes targets.

```sh
npm install -g @xec-sh/cli
xec --help
```

Requires Node.js 22.18 or later. Docker and Kubernetes targets also require `docker` and `kubectl`.

## Use

```sh
xec run check.ts
xec -e 'console.log((await $`git status --short`).stdout)'
xec on hosts.staging 'uptime'
xec in containers.app 'node --version'
xec in pods.api 'hostname'
xec watch local 'src/**/*.ts' --command 'npm test'
```

Define named targets and tasks in `.xec/config.yaml`. Project commands live in `.xec/commands` and appear in `xec --help`. Built-in command names take precedence over same-named script files; use `xec run ./file.ts` to select a file explicitly.

## Write scripts

Scripts receive `$`, `$target`, `kit`, and `log`. `$target` addresses the selected target; plain `xec run` uses the local machine. Explicit imports from Xec packages work too.

```typescript
// check.ts
const result = await $target`git status --short`;
console.log(result.stdout);
```

The CLI uses Core for execution, Ops for orchestration, Loader for scripts, and Kit for terminal UI. Use these packages directly when embedding the same capabilities in an application.

## Commands

| Command | Purpose |
| --- | --- |
| `run` | Execute a script, task, inline expression, or REPL |
| `on` / `in` | Execute on SSH hosts, containers, or pods |
| `watch` | Run a command or task when files change |
| `copy` / `forward` / `logs` | Transfer files, forward ports, and inspect output |
| `config` / `secrets` / `inspect` | Manage and inspect project configuration |
| `new` | Scaffold projects, scripts, commands, and tasks |
| `docker` | Manage Docker resources |

Run `xec <command> --help` for that command's options. Cancellation stops owned work and awaits bounded cleanup; JSON output excludes interactive progress.

[CLI reference](https://xec.sh/docs/commands/cli-reference) · [Script guide](https://xec.sh/docs/scripting/basics/typescript-setup) · [MIT license](../../LICENSE)
