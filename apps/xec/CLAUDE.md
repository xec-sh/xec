# @xec-sh/cli - Command Line Interface

## 🎯 Package Mission
Command-line interface for Xec universal command execution system, providing intuitive multi-environment command execution with a focus on simplicity and user experience. The CLI follows the principle of "think about WHERE to run, then WHAT to run."

## 🏛 Architecture

```
src/
├── main.ts               # CLI entry point
├── commands/             # Built-in commands
│   ├── on.ts            # SSH execution (NEW)
│   ├── in.ts            # Container/pod execution (NEW)
│   ├── config.ts        # Configuration management
│   ├── copy.ts          # File transfer
│   ├── docker.ts        # Docker operations (DEPRECATED)
│   ├── env.ts           # Environment variables
│   ├── exec.ts          # Direct execution (DEPRECATED)
│   ├── init.ts          # Project initialization
│   ├── k8s.ts           # Kubernetes operations (DEPRECATED)
│   ├── list.ts          # List resources
│   ├── ssh.ts           # SSH operations (DEPRECATED)
│   ├── version.ts       # Version info
│   └── watch.ts         # File watching
├── utils/
│   ├── config.ts        # YAML configuration support
│   ├── direct-execution.ts # Smart command routing (NEW)
│   └── dynamic-commands.ts # Dynamic command loading
└── bin/xec              # Executable entry
```

## 🚀 Key Features

### Script Execution
Direct JavaScript/TypeScript file execution with enhanced utilities:
```bash
# Run files directly
xec deploy.js
xec setup.ts

# Evaluate inline code
xec -e "console.log('Hello')"

# Watch mode
xec dev.js --watch
```

### Dynamic Commands
Extensible command system via `.xec/commands/`:
```javascript
// .xec/commands/deploy.js
export default {
  name: 'deploy',
  description: 'Deploy application',
  options: [
    { flag: '-e, --env <env>', description: 'Environment' }
  ],
  async action(options) {
    await $`npm run deploy:${options.env}`;
  }
};
```

### Built-in Commands
- **config** - Manage configuration
- **copy** - Transfer files between environments
- **docker** - Docker container operations
- **env** - Environment variable management
- **exec** - Execute commands directly
- **init** - Initialize new projects
- **inspect** - Inspect and analyze project configuration, tasks, and resources
- **k8s** - Kubernetes pod operations
- **ssh** - SSH connections and tunnels
- **watch** - Watch files for changes

## 📝 Script Environment

### Global Utilities
When running scripts, these are available globally:
```javascript
// Command execution (@xec-sh/core)
await $`ls -la`;
const ssh = $.ssh({ host: 'server' });
await ssh`uptime`;

// File system
cd('/path');
console.log(pwd());
const files = await glob('**/*.js');

// Interactive prompts
const name = await question('Name?');
const proceed = await confirm('Continue?');

// Utilities
await sleep(1000);
echo(chalk.green('Success!'));
log.info('Processing...');

// HTTP
const res = await fetch('https://api.example.com');
const data = await res.json();
```

### Environment Variables
```javascript
// Access
const apiKey = env('API_KEY', 'default');

// Set
setEnv('NODE_ENV', 'production');

// Load from file
await loadEnv('.env.local');
```

## 🔧 Configuration

### Project Structure
```
.xec/
├── config.yaml      # Project configuration (YAML)
├── commands/        # Custom commands
├── scripts/         # Shared scripts
└── cache/          # Cache directory
```

### Unified Configuration (YAML)
The CLI uses a unified YAML configuration system shared with @xec-sh/core:

```yaml
# .xec/config.yaml
name: my-project
description: My project configuration

defaults:
  timeout: 30s
  shell: /bin/bash
  env:
    NODE_ENV: production

hosts:
  prod:
    host: prod.example.com
    username: deploy
    privateKeyPath: ~/.ssh/id_rsa

containers:
  app:
    name: myapp-prod
    
pods:
  web:
    name: web-deployment
    namespace: production

aliases:
  deploy: xec on prod deploy.sh
  logs: xec in app tail -f /var/log/app.log
```

### Config Priority
1. Command line arguments (highest)
2. Environment variables (XEC_*)
3. Active profile settings
4. `.xec/config.yaml` (project)
5. `~/.xec/config.yaml` (global)
6. Default values (lowest)

## 📋 Command Patterns

### SSH Operations
```bash
# Connect
xec ssh connect user@host

# Tunnel
xec ssh tunnel user@host 8080:80

# Execute
xec ssh exec user@host "uptime"
```

### Docker Operations
```bash
# List containers
xec docker ps

# Execute in container
xec docker exec my-app "npm test"

# View logs
xec docker logs my-app --follow
```

### Kubernetes Operations
```bash
# List pods
xec k8s pods -n production

# Execute in pod
xec k8s exec web-app "date"

# Port forward
xec k8s port-forward web-app 8080:80
```

## 🎨 Interactive Features

### Prompts
Using @clack/prompts for rich interactions:
- Text input with validation
- Single/multi-select
- Confirmations
- Password input
- Progress indicators

### Output Control
```bash
# JSON output
xec command --json

# Verbose logging
xec command --verbose

# Quiet mode
xec command --quiet

# No color
xec command --no-color
```

## ⚡ Performance

- **Lazy Loading** - Commands loaded on demand
- **Fast Startup** - Minimal core dependencies
- **Streaming** - Efficient output handling
- **Caching** - Configuration and command cache

## 🚨 Development Guidelines

### Adding Commands
1. Create file in `src/commands/`
2. Export command configuration
3. Use consistent option patterns
4. Include help text and examples

### Script Best Practices
1. Handle errors gracefully
2. Use logging utilities
3. Validate user input
4. Provide clear feedback
5. Support both interactive and CI modes

## 🔮 Future Enhancements

- Plugin system for community commands
- Web-based command builder
- AI command suggestions
- Remote execution dashboard
- Integrated secret management