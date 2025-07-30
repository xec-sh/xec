# @xec-sh/core - Core Execution Engine

## 🎯 Package Mission
Universal command execution engine providing a unified API for executing commands across local, SSH, Docker, and Kubernetes environments with a syntax inspired by Google's zx.

## 🏛 Architecture

### Core Components

```
src/
├── core/                    # Core engine components
│   ├── execution-engine.ts  # Main execution engine
│   ├── command.ts          # Command configuration
│   ├── result.ts           # Execution results
│   ├── error.ts            # Error hierarchy
│   └── process-promise.ts  # Async process handling
├── adapters/               # Environment adapters
│   ├── base-adapter.ts     # Abstract base
│   ├── local-adapter.ts    # Local execution
│   ├── ssh-adapter.ts      # SSH with pooling
│   ├── docker-adapter.ts   # Docker containers
│   └── kubernetes-adapter.ts # K8s pods
├── utils/                  # Utilities
│   ├── ssh-tunnel.ts       # SSH port forwarding
│   ├── docker-api.ts       # Docker lifecycle
│   ├── kubernetes-api.ts   # K8s enhancements
│   ├── parallel.ts         # Parallel execution
│   ├── retry-adapter.ts    # Retry logic
│   └── cache.ts           # Result caching
└── types/                  # TypeScript definitions
```

### Design Principles

1. **Adapter Pattern** - Extensible architecture for new environments
2. **Template Literal API** - Natural shell-like syntax
3. **Process Promises** - Async/await with streaming
4. **Immutable Configuration** - Functional chaining
5. **Type Safety** - Full TypeScript support

## 📋 Feature Implementation Status

### ✅ Phase 1: Critical Fixes (Completed)
- Fixed API inconsistencies
- Added resource disposal
- Improved password security
- Fixed configuration handling

### ✅ Phase 2: API Unification (Completed)
- Mutable configuration support
- Relative path support for cd()
- Utility exports
- PWD method

### ✅ Phase 3: Performance (Completed)
- SSH connection pooling
- Command batching
- Result caching
- Parallel execution

### ✅ Phase 4: Advanced Features (Completed)
- **SSH Tunnels** - Port forwarding with dynamic ports
- **Docker Compose** - Full compose support
- **Kubernetes Port Forwarding** - Forward ports from pods
- **Log Streaming** - Real-time logs from containers/pods
- **Enhanced APIs** - docker-api.ts, kubernetes-api.ts

### 🚧 Phase 5: Modularity (In Progress)
- Plugin system architecture
- Separation of high-level features
- Enhanced event system

## 🔧 Key Features

### SSH Enhancements
```typescript
// Connection pooling (automatic)
const ssh = $.ssh({ host: 'server' });
await ssh`command1`; // Creates connection
await ssh`command2`; // Reuses connection

// SSH tunnels
const tunnel = await ssh.tunnel({
  remoteHost: 'db.internal',
  remotePort: 5432
});
```

### Docker Lifecycle
```typescript
// Full container management
const container = await $.docker({
  image: 'node:20',
  volumes: { '/app': './src' }
}).start();

await container.exec`npm test`;
await container.follow(line => console.log(line));
await container.stop();
```

### Kubernetes Operations
```typescript
// Enhanced pod API
const pod = $.k8s().pod('web-app');
const forward = await pod.portForward(8080, 80);
await pod.follow(line => console.log(line));
await pod.copyTo('./config.yaml', '/app/config.yaml');
```

## 🧪 Testing Strategy

### Test Organization
- **Unit Tests** - Component isolation
- **Integration Tests** - Real environment testing
- **Docker-based Tests** - SSH scenarios
- **Mock Adapter** - For unit testing

### Running Tests
```bash
yarn test                # All tests
yarn test:unit          # Unit only
yarn test:integration   # Integration only
yarn test:ssh           # SSH specific
```

## ⚡ Performance Optimizations

1. **Connection Pooling** - SSH connections reused
2. **Lazy Adapter Loading** - Load on demand
3. **Stream Buffering** - Efficient memory usage
4. **Result Caching** - Optional command caching
5. **Parallel Execution** - Concurrent commands

## 🚨 Known Limitations

1. **SSH Stdin** - Limited streaming stdin over SSH
2. **Process Groups** - Can't kill remote process trees
3. **TTY Limitations** - Limited interactive TTY support
4. **SOCKS Proxy** - Not yet implemented for SSH

## 🔐 Security Considerations

1. **Password Handling** - Secure memory buffers
2. **SSH Keys** - Validation and secure storage
3. **Log Sanitization** - Automatic secret masking
4. **Connection Security** - Strict host key checking

## 🎯 Usage Guidelines

### DO ✅
- Use connection pooling for multiple SSH commands
- Leverage streaming for large outputs
- Use typed errors for proper handling
- Dispose of resources properly

### DON'T ❌
- Create connections in tight loops
- Store passwords in plain text
- Ignore resource cleanup
- Mix adapter types unnecessarily

## 🔮 Future Roadmap

1. **Plugin System** - Extensible architecture
2. **Remote Docker** - Docker over SSH
3. **Pipeline Operators** - Better pipe support
4. **WebSocket Adapter** - Browser execution
5. **Distributed Execution** - Multi-host command execution

## 📚 Related Documentation

- [API Reference](./docs/API.md)
- [Examples](./examples/)
- [Migration Guide](./docs/MIGRATION.md)
- [Security Guide](./docs/SECURITY.md)