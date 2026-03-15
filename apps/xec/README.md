# @xec-sh/cli

Command-line tool for executing commands, scripts, and tasks across local, SSH, Docker, and Kubernetes environments.

## Install

```bash
pnpm add -g @xec-sh/cli
```

## Quick Start

```bash
# Run a TypeScript/JavaScript file
xec run deploy.ts

# Evaluate inline code
xec run -e 'await $`date`'

# Start an interactive REPL
xec run --repl

# Execute on a remote host via SSH (parallel supported)
xec on prod-server 'docker ps'
xec on user@host.com 'uptime'

# Execute inside a Docker container or K8s pod
xec in my-container 'npm test'
xec in pod:webapp 'hostname'
```

```bash
# Watch files and re-execute on change
xec watch 'npm test'

# Task runner (reads .xec/config.yaml)
xec tasks run deploy

# Configuration management
xec config set api.endpoint "https://api.example.com"
xec config get api.endpoint

# Secret management
xec secrets set API_KEY
xec secrets get API_KEY

# File transfer between targets
xec copy ./local.txt prod-server:/remote/path.txt

# Port forwarding
xec forward prod-server 5432:5432

# View remote logs
xec logs prod-server /var/log/app.log

# Inspect system information
xec inspect

# Scaffold a new project or script
xec new script deploy.ts

# Docker container management
xec docker ps
```

```typescript
// deploy.ts -- Scripts have access to the full xec API
import '@xec-sh/cli';

await $`npm run build`;

const env = await select({
  message: 'Deploy to?',
  options: [
    { value: 'staging', label: 'Staging' },
    { value: 'production', label: 'Production' },
  ],
});

await $.ssh('prod-server')`./deploy.sh ${env}`;
log.success('Deployed!');
```

## Commands

| Command | Description |
|---------|-------------|
| `xec run <script>` | Execute scripts, inline code (`-e`), REPL (`--repl`), or tasks |
| `xec on <host> <cmd>` | Execute commands on remote SSH hosts (supports parallel) |
| `xec in <target> <cmd>` | Execute in Docker containers or Kubernetes pods |
| `xec watch <cmd>` | Watch files and auto-execute on changes |
| `xec tasks` | List and run tasks defined in config |
| `xec config` | View and manage configuration |
| `xec secrets` | Manage secrets securely |
| `xec copy <src> <dest>` | Transfer files between local and remote targets |
| `xec forward <target> <ports>` | Port forwarding to any target |
| `xec logs <target> [path]` | View logs from any target |
| `xec inspect` | Inspect system and environment information |
| `xec new <type> [name]` | Scaffold new projects, scripts, or configs |
| `xec docker` | Docker container management |

## Features

- Thin wrapper over @xec-sh/ops -- all operations available programmatically
- Universal script execution with automatic `$target` injection based on context
- TypeScript and JavaScript files executed with automatic transpilation
- CDN module loading (npm, jsr, esm.sh, unpkg, skypack, jsdelivr)
- Interactive REPL with full xec context
- SSH execution with connection pooling and parallel host targeting
- Docker and Kubernetes container execution
- File watching with auto-re-execution
- YAML-based task definitions with parameters
- Configuration management with profiles and variable interpolation
- Encrypted secret management
- File transfer, port forwarding, and log viewing across targets
- Shell completion generation
- Built with commander

## License

MIT
