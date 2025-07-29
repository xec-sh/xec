# @xec-sh/core

Universal execution engine providing a unified API for running commands across local, SSH, Docker, and Kubernetes environments.

## Installation

```bash
npm install @xec-sh/core
```

## Documentation

- 🌐 [Official Documentation](https://xec.sh/docs/projects/core)
- 📚 [API Reference](https://xec.sh/docs/projects/core/api-reference)
- 🚀 [Getting Started](https://xec.sh/docs/projects/core/getting-started/first-steps)
- 💡 [Examples](https://github.com/xec-sh/xec/tree/main/packages/core/examples)

## Features

- **Universal API** - Same syntax works everywhere
- **Template Literals** - Safe command interpolation with automatic escaping
- **Type Safety** - Full TypeScript support with IntelliSense
- **Streaming** - Real-time output without buffering
- **Connection Pooling** - Automatic SSH connection reuse
- **Error Handling** - Result-based pattern with detailed context

## Basic Usage

```typescript
import { $ } from '@xec-sh/core';

// Local execution
await $`echo "Hello, World!"`;

// Variables are automatically escaped
const filename = "file with spaces.txt";
await $`touch ${filename}`;

// Error handling
const result = await $`grep pattern file.txt`.nothrow();
if (!result.isSuccess()) {
  console.log('Pattern not found');
}
```

## Execution Adapters

### SSH

```typescript
const ssh = $.ssh({ host: 'server.com', username: 'user' });

// Execute commands
await ssh`uname -a`;
await ssh`df -h`;

// File transfer
await ssh.uploadFile('./local.txt', '/remote/path.txt');
await ssh.downloadFile('/remote/file.txt', './local-copy.txt');

// SSH tunnels
const tunnel = await ssh.tunnel({
  localPort: 5433,
  remoteHost: 'localhost',
  remotePort: 5432
});
```

### Docker

```typescript
// Execute in existing container
const docker = $.docker({ container: 'my-app' });
await docker`ps aux`;

// Create new container
const container = await $.docker({ 
  image: 'node:18',
  name: 'test-container'
}).start();

await container.exec`npm test`;
await container.stop();
await container.remove();
```

### Kubernetes

```typescript
const k8s = $.k8s({ namespace: 'default' });
const pod = k8s.pod('my-app-pod');

// Execute commands
await pod.exec`hostname`;

// Stream logs
await pod.follow(line => console.log(line));

// Port forwarding
const forward = await pod.portForward(8080, 80);
console.log(`Access at localhost:${forward.localPort}`);
```

## Advanced Features

### Parallel Execution

```typescript
import { parallel } from '@xec-sh/core';

const results = await parallel([
  $`npm install`,
  $`npm run build`,
  $`npm test`
], { maxConcurrent: 2 });
```

### Configuration

```typescript
// Global configuration
import { configure } from '@xec-sh/core';

configure({
  shell: '/bin/bash',
  timeout: 30000,
  env: { NODE_ENV: 'production' }
});

// Per-command configuration
await $`npm test`
  .cwd('/app')
  .env({ NODE_ENV: 'test' })
  .timeout(60000)
  .retry(3);
```

### Event System

```typescript
$.on('command:start', (event) => {
  console.log(`Starting: ${event.command}`);
});

$.on('command:error', (event) => {
  console.error(`Failed: ${event.error.message}`);
});
```

## API Reference

### Core Functions
- `$` - Main execution function
- `$.ssh()` - SSH adapter
- `$.docker()` - Docker adapter
- `$.k8s()` - Kubernetes adapter
- `configure()` - Global configuration
- `parallel()` - Parallel execution

### Utilities
- `escapeShellArg()` - Shell argument escaping
- `quoteShellArg()` - Shell argument quoting
- `RuntimeDetector` - Runtime detection
- `ProcessPromise` - Promise-based process handling

## More Documentation

- 📖 [Full API Reference](https://xec.sh/docs/projects/core/api-reference)
- 🔧 [Configuration Guide](https://xec.sh/docs/projects/core/core-features/configuration)
- 🎯 [Advanced Features](https://xec.sh/docs/projects/core/advanced)
- 🐛 [Troubleshooting](https://xec.sh/docs/projects/cli/troubleshooting)

## Contributing

See [Contributing Guide](https://github.com/xec-sh/xec/blob/main/CONTRIBUTING.md)

## Links

- 🌐 [Website](https://xec.sh)
- 📖 [Documentation](https://xec.sh/docs)
- 💬 [GitHub Discussions](https://github.com/xec-sh/xec/discussions)
- 🐛 [Issue Tracker](https://github.com/xec-sh/xec/issues)
- 📦 [npm Package](https://www.npmjs.com/package/@xec-sh/core)

## License

MIT © [Xec Contributors](https://github.com/xec-sh/xec/graphs/contributors)