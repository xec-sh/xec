# @xec-sh/cli

`xec` — command-line tool for running commands, scripts, and tasks against
local, SSH, Docker, and Kubernetes targets. Built on
[@xec-sh/core](../../packages/core) and [@xec-sh/ops](../../packages/ops);
everything the CLI does is also available programmatically.

```bash
npm install -g @xec-sh/cli
```

Status: alpha. The API may change between minor versions until 1.0.

## Quick start

```bash
# Run a TypeScript/JavaScript file ($ and the kit prompts are in scope)
xec run deploy.ts

# Evaluate inline code, or open a REPL
xec -e 'await $`date`'
xec --repl

# Execute on SSH hosts — configured targets or direct user@host
xec on hosts.web-1 'uptime'
xec on deploy@server.com 'systemctl status nginx'
xec on 'hosts.web-*' 'uname -r' --parallel

# Execute in Docker containers and Kubernetes pods
xec in containers.app 'npm test'
xec in pods.webapp 'date'
xec in my-container 'hostname'          # bare container name also works
```

```bash
# Run a task defined in .xec/config.yaml
xec run deploy

# ...or run a task across targets
xec on hosts.* --task deploy --parallel

# Watch files and run a command on change
xec watch local "src/**/*.ts" --command "npm test"

# Configuration and secrets (secrets are encrypted at rest, AES-256-GCM)
xec config set api.endpoint "https://api.example.com"
xec config get api.endpoint
xec secrets set API_KEY
xec secrets get API_KEY

# Copy files between targets
xec copy local:./dist hosts.web-1:/srv/app
xec copy hosts.web-1:/var/log/nginx/*.log ./logs/

# Port forwarding (both directions) and logs
xec forward hosts.db 5432:5432
xec forward hosts.ci 8080:80 --reverse
xec logs pods.api -f

# Inspect resolved config, targets and tasks; scaffold new files
xec inspect
xec new script deploy
xec new task build --desc "Build the application"

# Docker management
xec docker ps
```

## Scripts

Files run by `xec run` (or by `xec on`/`xec in` with a script path) execute
with the Xec context already injected — no imports required:

```typescript
// deploy.ts
const branch = await $`git branch --show-current`;

const env = await kit.select({
  message: `Deploy ${branch}?`,
  options: [
    { value: 'staging', label: 'Staging' },
    { value: 'production', label: 'Production' },
  ],
});

await $.ssh('deploy@prod-1')`./deploy.sh ${env}`;
log.success('Deployed');
```

Injected globals include `$` (the @xec-sh/core engine), `log`, `kit` (the
@xec-sh/kit prompt toolkit), and `$target` — an engine pointed at the current
target: the local machine for plain `xec run`, the remote target when the
script runs via `xec on`/`xec in`. Scripts may import modules from CDNs
(`npm:`, `jsr:`, and friends) through @xec-sh/loader, with content-hash
integrity checking.

## Commands

| Command | Description |
|---------|-------------|
| `xec run <file \| task>` | Run a script file or a configured task; `-e` evaluates code, `--repl` opens a REPL |
| `xec on <hosts> <cmd>` | Execute on SSH hosts; wildcards and `--parallel` |
| `xec in <target> <cmd>` | Execute in Docker containers or Kubernetes pods |
| `xec watch <target> [paths...]` | Re-run `--command` or `--task` on file changes |
| `xec config get\|set <key>` | Read and write configuration (dot notation) |
| `xec secrets set\|get\|list\|delete` | Encrypted secret storage |
| `xec copy <src> <dest>` | Copy files between targets (`local:`, `hosts.`, `containers.`, `pods.` prefixes) |
| `xec forward <target> <ports>` | Port forwarding, including `--reverse` |
| `xec logs <target> [path]` | View or `--follow` logs from any target |
| `xec inspect [type] [name]` | Show resolved configuration, targets, tasks |
| `xec new [type] [name]` | Scaffold projects, scripts, commands, tasks |
| `xec docker <subcommand>` | Container/image/compose/network/volume management |

`xec <command>` with no matching built-in falls through to direct execution
(`xec echo hello`) or to a script file (`xec script.js`).

Targets, defaults, and tasks are defined in `.xec/config.yaml`. Custom
commands can be added per-project and appear in `xec --help` alongside the
built-ins.

## License

MIT
