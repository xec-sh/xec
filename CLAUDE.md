# Xec Universal Command Execution System - Development Guide

## 🎯 Project Mission
Xec is a modern, type-safe command execution system built with TypeScript. It provides a unified API for executing commands across local, SSH, Docker, and Kubernetes environments with a syntax inspired by Google's zx.

## 📁 Monorepo Structure
```
xec/
├── apps/
│   └── xec/          # CLI application (@xec-sh/cli)
│── docs/             # Documentation site (Docusaurus)
├── packages/
│   ├── core/         # Core execution engine (@xec-sh/core)
│   └── test-utils/   # Shared testing utilities (@xec-sh/test-utils)
├── docker/           # Test containers for different environments
├── experiments/      # Experimental features and prototypes
├── turbo.json        # Build orchestration
└── CLAUDE.md         # This file - project specification
```

## 🏗 Architecture

### Dependency Graph
```
┌─────────────────┐
│  @xec-sh/cli    │ User Interface Layer
└────────┬────────┘
         │ depends on
         ▼                 
┌─────────────────┐  
│ @xec-sh/core    │  Execution Engine
└────────┬────────┘  (with adapters)
         │ uses for testing
         ▼
┌──────────────────┐
│@xec-sh/test-utils│ Testing Infrastructure
└──────────────────┘
```

### Core Components

#### @xec-sh/core
```
src/
├── core/                    # Core engine components
│   ├── execution-engine.ts  # Main execution orchestrator
│   ├── command.ts          # Re-exports types from types/command.js
│   ├── result.ts           # Result implementation & re-exports from types/result.js
│   ├── error.ts            # Error class implementations
│   ├── enhanced-error.ts   # Enhanced error classes with suggestions
│   ├── process-context.ts  # Process context & promise building
│   ├── process-output.ts   # ProcessOutput implementation
│   └── pipe-implementation.ts # Pipe functionality
├── types/                  # TypeScript type definitions
│   ├── command.ts          # Command, adapter options, stream types
│   ├── process.ts          # ProcessPromise, PipeTarget, PipeOptions
│   ├── result.ts           # ExecutionResult interface
│   ├── error.ts            # Error context & suggestion types
│   ├── execution.ts        # ExecutionConfig, ExecutionEngineConfig, Docker options
│   ├── engine.ts           # CallableExecutionEngine type
│   ├── events.ts           # Event system types
│   └── disposable.ts       # Disposable interface
├── adapters/               # Environment adapters
│   ├── base-adapter.ts     # Abstract base & shared logic
│   ├── local/              # Local process execution
│   │   ├── index.ts        # Local adapter implementation
│   │   └── runtime-detect.ts # Runtime detection utilities
│   ├── ssh/                # SSH with connection pooling
│   │   ├── index.ts        # SSH adapter implementation
│   │   ├── ssh.ts          # SSH connection management
│   │   ├── ssh-key-validator.ts # SSH key validation
│   │   ├── secure-password.ts # Secure password handling
│   │   └── connection-pool-metrics.ts # Connection pool metrics
│   ├── docker/             # Docker container execution
│   │   ├── index.ts        # Docker adapter implementation
│   │   ├── docker-api.ts   # Docker client wrapper
│   │   └── docker-fluent-api.ts # Fluent API for Docker
│   ├── kubernetes/         # Kubernetes pod execution
│   │   ├── index.ts        # Kubernetes adapter implementation
│   │   └── kubernetes-api.ts # K8s client wrapper
│   ├── mock/               # Mock adapter for testing
│   │   └── index.ts        # Mock adapter implementation
│   └── remote-docker/      # Remote Docker execution
│       └── index.ts        # Remote Docker adapter
├── utils/                  # Shared utilities & helpers
│   ├── stream.ts          # Stream handling utilities
│   ├── parallel.ts        # Parallel execution helpers
│   ├── cache.ts           # Result caching layer
│   ├── optimized-masker.ts # Optimized sensitive data masking
│   └── ... (other shared utilities)
```

#### @xec-sh/cli
```
src/
├── commands/              # CLI command implementations
├── utils/                 # CLI-specific utilities
├── config/                # Configuration management
└── index.ts              # CLI entry point
```

## 📋 Development Principles

### 1. ⚠️ Task Focus
**CRITICAL**: Only implement what is explicitly requested. No additional features, files, or "nice-to-haves" unless specified.

### 1.1. 🚫 No Duplicate Files
**CRITICAL**: When improving or fixing existing files, ALWAYS update the original files directly. NEVER create duplicate files with suffixes like `-enhanced`, `-fixed`, `-v2`, etc. This prevents code fragmentation and maintains consistency.

**Examples**:
- ✅ Update `text-input.ts` directly 
- ❌ Create `text-input-enhanced.ts`
- ✅ Modify `autocomplete.ts` in place
- ❌ Create `autocomplete-fixed.ts`

### 2. 🔒 Type Safety First
```typescript
// ✅ Good
function execute(command: string, options: CommandOptions): Promise<ExecutionResult>

// ❌ Bad
function execute(command: any, options?: any): Promise<any>
```
- No `any` types in public APIs
- Use `unknown` when type is truly unknown
- Full TypeScript strict mode
- Comprehensive type definitions

### 3. 📦 Error Handling
```typescript
// ✅ Use Result pattern for recoverable errors
return { ok: false, error: new ExecutionError('Failed', 'ERROR_CODE') };

// ✅ Throw for programming errors
throw new TypeError('Expected string, got number');

// ❌ Don't throw for expected failures
throw new Error('Command exited with code 1');
```

### 4. 🧩 Composition Over Inheritance
- Build complex behavior from simple, composable functions
- Prefer plain objects and interfaces over classes
- Use functional programming patterns where appropriate

### 5. 📐 Module Boundaries
- Single responsibility per module
- No circular dependencies
- Explicit exports (no `export *`)
- Co-locate related functionality

### 6. 🚀 Performance
- Lazy loading for optional dependencies
- Stream processing for large outputs
- Connection pooling for SSH/Docker
- Efficient caching with TTL

### 7. 🔄 State Management
- Immutable configuration objects
- No global mutable state
- Explicit state passing
- Functional update patterns

### 8. 🛡 Security
- No secrets in logs or error messages
- Input sanitization for shell commands
- Secure defaults (fail closed)
- SSH key validation
- Password masking in outputs

### 9. 📝 Documentation
```typescript
/**
 * Execute a command in the specified environment
 * 
 * @param command - The command to execute
 * @param options - Execution options
 * @returns Promise resolving to execution result
 * 
 * @example
 * ```typescript
 * const result = await execute('ls -la', { cwd: '/tmp' });
 * console.log(result.stdout);
 * ```
 * 
 * @throws {ValidationError} If command is invalid
 */
```
- JSDoc for all public APIs
- Include examples in documentation
- Document error scenarios
- Keep comments concise and valuable

### 10. 🔄 API Consistency
- Consistent naming conventions
- Predictable method signatures
- Uniform error handling
- Same patterns across adapters

## 🖥️ TUI Application Testing

### tui-tester Module
For comprehensive testing of Terminal User Interface applications, use the `tui-tester` module which provides automated testing capabilities similar to Playwright for web applications:

```typescript
import { createTester, type Snapshot } from "tui-tester";

// Example: Testing a TUI application
const tester = createTester('npx tsx ./examples/my-app.ts', {
  cwd: '/path/to/project',
  cols: 80,
  rows: 24,
  shell: '/bin/zsh',
});

// Start the application
await tester.start();

// Send input
await tester.sendText('hello');
await tester.sendKey('Enter');

// Take screenshots for comparison
const snapshot = await tester.takeSnapshot('test-state');
const output = snapshot.capture.raw;

// Stop the application
await tester.stop();
```

### TUI Testing Best Practices
1. **Visual Testing**: Compare terminal output snapshots between implementations
2. **Input Simulation**: Test keyboard input, mouse events, and special key combinations
3. **State Verification**: Verify that UI state changes correctly in response to events
4. **Cross-Implementation Testing**: Compare behavior between original (Go/Rust) and TypeScript implementations
5. **Terminal Compatibility**: Test with different terminal sizes and capabilities

### Example: Comparing Implementations
See `packages/terex/examples/tui-tester.ts` for a complete example of comparing Bubble Tea (Go) vs Terex (TypeScript) implementations.

### Real TUI Testing Requirements
**IMPORTANT**: For reliable TUI application testing, especially when comparing implementations:
- Use `tui-tester` module for automated terminal interaction
- Test in real terminal environments, not mocked ones
- Compare actual terminal output byte-for-byte when possible
- Account for timing differences between implementations
- Test edge cases like window resizing, alt-screen toggling, and signal handling

## 🧪 Testing Strategy

### Testing Philosophy
- **Real over Mock**: Prefer real implementations with fixtures over mocks
- **Test Public APIs**: Focus on testing public interfaces, not internals
- **Coverage Goals**: 90%+ for critical paths, 80%+ overall
- **Fast Feedback**: Unit tests should run in milliseconds

### Test Structure
Tests mirror the source code structure:
```
packages/core/
├── src/
│   ├── adapters/
│   │   └── ssh-adapter.ts
│   └── utils/
│       └── stream.ts
└── test/
    ├── unit/              # Unit tests (isolated)
    │   ├── adapters/
    │   │   └── ssh-adapter.test.ts
    │   └── utils/
    │       └── stream.test.ts
    ├── integration/       # Integration tests (with dependencies)
    │   ├── adapters/
    │   │   └── ssh-adapter.integration.test.ts
    │   └── scenarios/
    │       └── multi-adapter.test.ts
    └── e2e/              # End-to-end tests (full system)
        └── cli-commands.test.ts
```

### Test Types

#### 1. Unit Tests
- Test individual functions/classes in isolation
- Mock only external dependencies (filesystem, network)
- Use fixtures for test data
- Should be fast (<100ms per test)

```typescript
// Good unit test
describe('maskSensitiveData', () => {
  it('should mask passwords in command output', () => {
    const input = 'password=secret123';
    const result = maskSensitiveData(input);
    expect(result).toBe('password=[REDACTED]');
  });
});
```

#### 2. Integration Tests
- Test interactions between components
- Use real implementations where possible
- May use Docker containers for external services
- Test error propagation and recovery

```typescript
// Integration test with real SSH
describeSSH('SSH Adapter Integration', () => {
  it('should execute commands over SSH', async () => {
    const adapter = new SSHAdapter();
    const result = await adapter.execute({
      command: 'echo "test"',
      adapterOptions: { 
        host: 'test-container',
        username: 'test'
      }
    });
    expect(result.stdout).toBe('test\n');
  });
});
```

#### 3. End-to-End Tests
- Test complete user workflows
- Use the CLI as users would
- Verify documentation examples work
- Test cross-adapter scenarios

```typescript
// E2E test
describe('CLI E2E', () => {
  it('should execute script with multiple adapters', async () => {
    const scriptPath = fixtures.path('multi-adapter.js');
    const result = await runCLI(['run', scriptPath]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Success');
  });
});
```

### Testing Best Practices

#### Use Real Implementations
```typescript
// ✅ Good - Real file operations with temp directory
it('should write file', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'));
  try {
    await writeFile(path.join(tmpDir, 'test.txt'), 'content');
    const content = await fs.readFile(path.join(tmpDir, 'test.txt'), 'utf-8');
    expect(content).toBe('content');
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

// ❌ Bad - Mocking filesystem
it('should write file', async () => {
  const mockFs = { writeFile: jest.fn() };
  await writeFile('test.txt', 'content');
  expect(mockFs.writeFile).toHaveBeenCalledWith('test.txt', 'content');
});
```

#### Test Utilities
```typescript
// Use test utilities for common patterns
import { withTempDir, withDocker, withSSH } from '@xec-sh/test-utils';

it('should process files', withTempDir(async (tmpDir) => {
  // tmpDir is automatically cleaned up
  await processFiles(tmpDir);
}));

describeDocker('Docker tests', () => {
  it('should run in container', withDocker('ubuntu', async (container) => {
    // container is automatically started/stopped
    const result = await executeInContainer(container, 'ls');
    expect(result.exitCode).toBe(0);
  }));
});
```

#### Mock Sparingly
Only mock when:
- Testing error conditions that are hard to reproduce
- External services that would make tests slow/flaky
- To achieve specific code coverage goals

```typescript
// ✅ Good - Mocking network failure
it('should handle connection timeout', async () => {
  jest.spyOn(ssh, 'connect').mockRejectedValue(new Error('ETIMEDOUT'));
  await expect(sshAdapter.execute(cmd)).rejects.toThrow('Connection timeout');
});

// ❌ Bad - Mocking everything
it('should execute command', async () => {
  const mockSSH = { execCommand: jest.fn().mockResolvedValue({ stdout: 'test' }) };
  // This doesn't test actual SSH behavior
});
```

### Test Organization

#### Naming Conventions
- `*.test.ts` - Unit tests
- `*.integration.test.ts` - Integration tests  
- `*.e2e.test.ts` - End-to-end tests
- `*.perf.test.ts` - Performance benchmarks

#### Test Helpers
```typescript
// Create descriptive test helpers
export function describeSSH(name: string, fn: () => void) {
  const hasSSH = process.env.XECSH_TEST_SSH === 'true';
  (hasSSH ? describe : describe.skip)(name, fn);
}

export function describeDocker(name: string, fn: () => void) {
  const hasDocker = isDockerAvailable();
  (hasDocker ? describe : describe.skip)(name, fn);
}
```

## 🚀 Development Workflow

### Quick Start
```bash
# Initial setup
corepack enable              # Enable Yarn 4.9.2
yarn install                 # Install dependencies
yarn build                   # Build all packages

# Development
yarn dev                     # Watch mode for all packages
yarn test                    # Run unit tests
yarn test:integration        # Run integration tests
yarn test:e2e               # Run end-to-end tests
yarn test:full              # Run all tests

# Code quality
yarn typecheck              # TypeScript validation
yarn lint                   # ESLint checks
yarn format                 # Prettier formatting
yarn fix:all                # Fix all auto-fixable issues

# Documentation
yarn docs:dev               # Start docs dev server
yarn docs:build             # Build documentation
```

### Pre-commit Checklist
1. **Tests Pass**: `yarn test:full`
2. **Types Valid**: `yarn typecheck`
3. **Lint Clean**: `yarn lint`
4. **Format Correct**: `yarn format:check`
5. **Docs Updated**: Update `/docs` if API changed
6. **Changelog**: Update CHANGELOG.md for user-facing changes

### 📖 Documentation Updates
**CRITICAL**: When changing public APIs or documented features:
1. Update JSDoc comments in source
2. Update corresponding `/docs` pages
3. Update example code in `/packages/*/examples`
4. Add migration notes if breaking changes

## 🛠 Tools & Environment

### Required Tools
- Node.js 20+ (with corepack)
- Yarn 4.9.2 (via corepack)
- Docker (for integration tests)
- kubectl (for Kubernetes tests)

### Optional Tools
- kind (Kubernetes in Docker)
- sshpass (for password SSH tests)
- Various package managers for testing

### Environment Variables
```bash
# Testing
XECSH_TEST_SSH=true          # Enable SSH integration tests
XECSH_TEST_DOCKER=true       # Enable Docker integration tests
XECSH_TEST_K8S=true          # Enable Kubernetes tests

# Development
XECSH_DEBUG=true             # Enable debug logging
XECSH_NO_COLOR=true          # Disable colored output
```

## 📚 Package Guidelines

### @xec-sh/core
- Zero CLI dependencies
- Minimal external dependencies
- All adapters optional via lazy loading
- Comprehensive error types
- Streaming-first APIs

### @xec-sh/cli
- Depends only on @xec-sh/core
- User-friendly error messages
- Interactive prompts when appropriate
- Respect NO_COLOR and CI environment
- Fast startup time (<100ms)

### @xec-sh/test-utils
- Zero production dependencies
- Provides test helpers only
- Docker container management
- Fixture generators
- Test environment validators

## ⚡ Performance Guidelines

### Startup Performance
- Lazy load adapters on first use
- Minimize synchronous requires
- Use dynamic imports for optional features
- Cache configuration parsing

### Runtime Performance
- Stream large outputs instead of buffering
- Pool connections (SSH, Docker)
- Implement request coalescing
- Use native Node.js APIs where possible

### Memory Management
- Set reasonable buffer limits
- Clean up event listeners
- Dispose resources properly
- Avoid global state accumulation

## 🔐 Security Guidelines

### Command Execution
- Always escape shell arguments
- Validate adapter options
- Sanitize error messages
- Use secure defaults

### Credential Handling
- Never log passwords or keys
- Mask sensitive data in output
- Use secure password handlers
- Validate SSH keys before use

### Process Isolation
- Set appropriate uid/gid
- Limit resource usage
- Validate file paths
- Prevent directory traversal

## 🚧 Current Status

### ✅ Completed
- Core execution engine
- All environment adapters
- SSH connection pooling
- Docker lifecycle management
- Kubernetes enhancements
- CLI implementation
- Test infrastructure

### 🔄 In Progress
- Performance optimizations
- Plugin system design
- Enhanced monitoring

### 📅 Planned
- Browser adapter (WebContainers)
- Remote execution protocol
- Distributed execution
- Advanced caching strategies

## 🔧 Debugging

### Debug Output
```bash
# Enable all debug output
XECSH_DEBUG=* yarn test

# Debug specific components
XECSH_DEBUG=ssh,docker yarn test

# Debug with timing
XECSH_DEBUG_TIMING=true yarn test
```

### Common Issues

#### SSH Tests Failing
```bash
# Check SSH container is running
docker ps | grep xecsh-test-ssh

# Restart SSH containers
yarn workspace @xec-sh/core docker:restart
```

#### Docker Tests Failing
```bash
# Check Docker daemon
docker version

# Clean up test containers
docker rm -f $(docker ps -aq --filter "label=xecsh-test")
```

## 🎯 Decision Log

### Why Template Literals?
- Familiar shell-like syntax
- Natural multiline support
- Tagged template flexibility
- TypeScript type inference

### Why Adapters?
- Clean separation of concerns
- Easy to add new environments
- Testable in isolation
- Pluggable architecture

### Why Result Pattern?
- Explicit error handling
- No unexpected throws
- Better TypeScript types
- Functional composition

### Why Monorepo?
- Shared development tooling
- Atomic cross-package changes
- Unified testing strategy
- Single source of truth

## 📝 Contributing

### Code Style
- 2 spaces indentation
- No semicolons (Prettier)
- Single quotes for strings
- Trailing commas in multiline

### Commit Messages
```
type(scope): description

- feat(core): add kubernetes adapter
- fix(cli): handle empty arguments
- docs(ssh): update connection examples
- test(docker): add lifecycle tests
- perf(ssh): optimize connection pooling
```

### Pull Request Process
1. Create feature branch
2. Write tests first (TDD)
3. Implement feature
4. Update documentation
5. Run full test suite
6. Submit PR with description

## 🏃 Quick Commands

```bash
# Most common development commands
yarn dev                    # Start development mode
yarn test                   # Run tests
yarn fix:all               # Fix all issues

# Package specific
yarn workspace @xec-sh/core test
yarn workspace @xec-sh/cli build

# Release
yarn changeset             # Create changeset
yarn version              # Version packages
yarn release              # Publish to npm
```

---

**Remember**: Excellence through discipline. Every feature exactly as requested, every API fully tested, every resource properly managed.