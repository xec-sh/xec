# Xec Universal Command Execution System

## 🎯 Project Overview
Xec is a modern universal command execution system built with TypeScript, providing seamless command execution across local, SSH, Docker, and Kubernetes environments.

## 📁 Monorepo Structure
```
xec/
├── apps/
│   ├── xec/          # CLI application (@xec-sh/cli)
│   └── docs/         # Documentation site
├── packages/
│   ├── core/         # Core execution engine (@xec-sh/core)
│   └── test-utils/   # Shared testing utilities
├── docker/           # Test containers for different environments
└── turbo.json        # Build configuration
```

## 🏗 Architecture
```
┌─────────────────┐
│  @xec-sh/cli    │ User Interface Layer
└────────┬────────┘
         │ depends on
         ▼                 
┌─────────────────┐  
│ @xec-sh/core    │  Execution Engine
└─────────────────┘  (with adapters)
```

## 🚀 Quick Start
```bash
# Setup
corepack enable       # Enable Yarn 4.9.2
yarn install          # Install dependencies
yarn build            # Build all packages

# Development
yarn test             # Run tests
yarn dev              # Development mode
yarn fix:all          # Auto-fix linting and formatting
```

## 📋 Development Principles

### 1. ⚠️ Task Focus
**CRITICAL**: Only implement what is explicitly requested. No additional features or files unless specified.

### 2. 📝 Change Tracking
**MANDATORY**: All code changes MUST be documented in `CHANGES.md` (root directory).
- Follow the format in `CHANGES.md.example`
- Group changes by category (Features, Improvements, Fixes, Security, etc.)
- Write user-focused descriptions
- The file will be automatically processed and cleared during release

### 3. 🔒 Type Safety
- No `any` types in public APIs
- Full TypeScript strict mode
- Comprehensive type definitions

### 4. 📦 Error Handling
```typescript
// ✅ Use Result pattern
return { ok: false, error: new ExecutionError('Failed', 'ERROR_CODE') };

// ❌ Avoid throwing
throw new Error('Failed');
```

### 5. 🧩 Composition
Build complex behavior from simple, composable functions.

### 6. 📐 Module Boundaries
- Single responsibility
- No circular dependencies
- Explicit exports

### 7. 🧪 Testing
- 90%+ code coverage
- Unit tests for all public APIs
- Integration tests for interactions
- Real implementations over mocks

### 8. 📝 Documentation
- JSDoc with examples
- Parameter descriptions
- Error scenarios
- Usage examples

### 9. 🚀 Performance
- Lazy loading
- Stream processing
- Connection pooling
- Efficient caching

### 10. 🔄 State Management
- Immutable updates
- No global mutable state
- Explicit state passing

### 11. 🛡 Security
- No secrets in logs
- Input sanitization
- Secure defaults
- Key validation

## 🔧 Current Implementation Status

### ✅ Completed Features
- **Core Engine** - Universal execution with adapters
- **SSH** - Connection pooling, tunnels, file transfer
- **Docker** - Lifecycle management, compose, streaming
- **Kubernetes** - Port forwarding, log streaming, file ops
- **CLI** - Script execution, dynamic commands
- **Testing** - Comprehensive test utilities

### 🚧 In Progress
- Plugin system architecture
- Enhanced event system
- Performance optimizations

## 📚 Package Overview

### @xec-sh/core
The execution engine providing:
- Template literal API (`$\`command\``)
- Multi-environment adapters
- SSH tunnels and connection pooling
- Docker lifecycle management
- Kubernetes enhancements
- Event system and monitoring

### @xec-sh/cli
Command-line interface featuring:
- JavaScript/TypeScript script execution
- Dynamic command system
- Built-in commands for common tasks
- Interactive prompts
- Configuration management

### @xec-sh/test-utils
Testing utilities including:
- Docker container management
- SSH test helpers
- Kubernetes test clusters
- Shared test configurations

## 🧪 Testing

```bash
# Run all tests
yarn test

# Package-specific tests
yarn workspace @xec-sh/core test
yarn workspace @xec-sh/cli test

# SSH integration tests
yarn workspace @xec-sh/core test:ssh

# Start test containers
yarn workspace @xec-sh/core docker:start
```

## 🛠 Tools & Paths
- **Docker**: `/usr/local/bin/docker`
- **kubectl**: `/usr/local/bin/kubectl`
- **Homebrew tools**: `/opt/homebrew/bin/`
  - kind, sshpass, netcat

## 📖 Documentation
- [Core Package](./packages/core/CLAUDE.md)
- [CLI Package](./apps/xec/CLAUDE.md)
- [Test Utils](./packages/test-utils/CLAUDE.md)
- [Examples](./packages/core/examples/)

## ⚡ Quick Reference

### Do's ✅
- Follow requested specifications exactly
- Use Result pattern for errors
- Write comprehensive tests
- Document public APIs
- Use TypeScript strict mode
- Keep modules focused
- Handle resources properly

### Don'ts ❌
- Add unrequested features
- Use `any` in public APIs
- Throw exceptions directly
- Use synchronous I/O
- Create global state
- Skip tests
- Leave resources uncleaned

## 🔮 Roadmap
1. **Plugin System** - Extensible architecture
2. **Performance** - Further optimizations
3. **Security** - Enhanced secret management
4. **Monitoring** - Advanced metrics
5. **Distribution** - npm publishing

---

**Remember**: Excellence through discipline. Every feature exactly as requested, every API fully tested, every resource properly managed.