# Configuration Options

## Working Directory

### Setting Working Directory

```javascript
// Change directory for one command
await $`ls`.cwd('/tmp');

// Change directory for all subsequent commands
const $tmp = $.cd('/tmp');
await $tmp`pwd`;                  // /tmp
await $tmp`ls`;                   // Lists /tmp contents

// Relative paths work too
const $project = $.cd('./my-project');
await $project`npm install`;
await $project`npm test`;
```

### Working Directory Best Practices

```javascript
// Use absolute paths for clarity
const $root = $.cd('/var/www/app');

// Chain directory changes
const $src = $root.cd('src');
const $tests = $src.cd('../tests');

// Get current working directory
const cwd = await $`pwd`;
console.log(`Working in: ${cwd.stdout.trim()}`);
```

## Environment Variables

### Setting Environment Variables

```javascript
// Set for one command
await $`node app.js`.env({ NODE_ENV: 'production' });

// Set for all subsequent commands
const $prod = $.env({ 
  NODE_ENV: 'production',
  PORT: '3000',
  API_KEY: 'secret'
});

await $prod`node server.js`;     // Runs with all env vars

// Extend existing environment
const $extended = $prod.env({ 
  DEBUG: 'true' 
}); // Keeps previous vars + adds DEBUG
```

### Environment Variable Patterns

```javascript
// Load from .env file
const dotenv = require('dotenv');
const envVars = dotenv.config().parsed;
const $withEnv = $.env(envVars);

// Override system environment
const $clean = $.env({}, { replace: true }); // Clean environment

// Conditional environment
const $dev = $.env({
  NODE_ENV: process.env.CI ? 'test' : 'development'
});
```

## Timeout Control

### Basic Timeout Usage

```javascript
// Set timeout for one command (in milliseconds)
await $`sleep 10`.timeout(5000); // Fails after 5 seconds

// Set default timeout
const $quick = $.timeout(3000);  // 3 second timeout
await $quick`curl https://slow-api.com`;

// Disable timeout
await $`long-running-task`.timeout(0); // No timeout
```

### Advanced Timeout Patterns

```javascript
// Different timeouts for different operations
const $api = $.timeout(5000);     // 5s for API calls
const $build = $.timeout(300000); // 5min for builds
const $deploy = $.timeout(600000); // 10min for deploys

// Timeout with retry
async function reliableCommand(cmd) {
  for (let i = 0; i < 3; i++) {
    try {
      return await $`${cmd}`.timeout(5000);
    } catch (error) {
      if (error.message.includes('timeout') && i < 2) {
        console.log(`Attempt ${i + 1} timed out, retrying...`);
        continue;
      }
      throw error;
    }
  }
}
```

## Shell Selection

### Choosing a Shell

```javascript
// Use specific shell
const $bash = $.shell('/bin/bash');
await $bash`echo $BASH_VERSION`;

const $zsh = $.shell('/bin/zsh');
await $zsh`echo $ZSH_VERSION`;

// Disable shell (direct execution)
const $direct = $.shell(false);
await $direct`/usr/bin/node --version`; // No shell interpolation
```

### Shell-Specific Features

```javascript
// Bash-specific features
const $bash = $.shell('/bin/bash');
await $bash`echo ${PIPESTATUS[@]}`; // Bash array
await $bash`[[ -f file.txt ]] && echo "exists"`;

// POSIX-compliant shell
const $sh = $.shell('/bin/sh');
await $sh`[ -f file.txt ] && echo "exists"`;

// PowerShell (on Windows)
const $ps = $.shell('powershell.exe');
await $ps`Get-Process | Where-Object {$_.CPU -gt 100}`;
```

## Adapter Configuration

### Local Adapter Options

```javascript
const $local = $.local({
  shell: '/bin/bash',
  env: { PATH: '/usr/local/bin:/usr/bin:/bin' },
  cwd: '/home/user'
});
```

### SSH Adapter Options

```javascript
const $ssh = $.ssh({
  host: 'server.com',
  username: 'deploy',
  port: 2222,
  privateKey: fs.readFileSync('/home/user/.ssh/id_rsa'),
  passphrase: 'key-passphrase',
  readyTimeout: 30000,
  keepaliveInterval: 10000
});
```

### Docker Adapter Options

```javascript
const $docker = $.docker({
  container: 'my-app',
  user: 'appuser',
  workdir: '/app',
  env: { NODE_ENV: 'production' }
});
```

### Kubernetes Adapter Options

```javascript
const $k8s = $.k8s({
  pod: 'my-app-xyz',
  container: 'app',
  namespace: 'production',
  kubeconfig: '/path/to/kubeconfig'
});
```

## Global Configuration

### Setting Defaults

```javascript
// Configure global defaults
$.defaults({
  timeout: 30000,
  shell: '/bin/bash',
  env: { LANG: 'en_US.UTF-8' }
});

// Override for specific use
const $fast = $.timeout(5000);
const $slow = $.timeout(0);
```

### Configuration Inheritance

```javascript
// Base configuration
const $base = $.env({ API_URL: 'https://api.example.com' })
               .timeout(10000)
               .shell('/bin/bash');

// Inherit and extend
const $prod = $base.env({ NODE_ENV: 'production' });
const $dev = $base.env({ NODE_ENV: 'development', DEBUG: 'true' });
```

## Next Steps

- Explore [Error Handling](./error-handling.md) strategies
- Learn about [Retry Logic](./retry-logic.md)
- See [Environment-specific Configuration](./environments.md)