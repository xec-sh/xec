# Xec Universal Command Execution System - Development Guide

## 🎯 Project Mission
Xec is a modern, type-safe command execution system built with TypeScript. It provides a unified API for executing commands across local, SSH, Docker, and Kubernetes environments with a syntax inspired by Google's zx.

## ⚠️ CRITICAL: Zero-Tolerance Reliability Policy

**This is a HIGH-RELIABILITY SYSTEM**. Commands executed through Xec may affect critical infrastructure. We DO NOT make assumptions, approximations, or partial implementations:

- **100% Runtime Compatibility**: All code MUST work identically on Node.js, Bun, and Deno
- **100% Type Safety**: No `any` types in public APIs, 100% type coverage
- **Zero Warnings**: No TypeScript warnings, no linter warnings, no deprecation warnings
- **Zero Core Dependencies**: Core package has ZERO external runtime dependencies
- **No "Good Enough"**: If it's not perfect, it's not ready
- **No Workarounds**: Fix the root cause, not the symptom
- **No Assumptions**: Test everything, verify everything, prove everything
- **No Silent Failures**: Every error must be caught, logged, and handled appropriately

**REMEMBER**: This framework executes commands that could affect production systems. A single bug could have catastrophic consequences. There is NO room for error.

## 📁 Monorepo Structure
```
xec/
├── apps/
│   └── xec/          # CLI application (@xec-sh/cli)
│── website/          # Documentation site (Docusaurus)
├── packages/
│   ├── core/         # Shell execution engine (@xec-sh/core)
│   ├── ops/          # DevOps operations library (@xec-sh/ops)
│   ├── kit/          # TUI/CLI components (@xec-sh/kit)
│   ├── loader/       # Script loading & modules (@xec-sh/loader)
│   └── testing/      # Shared test utilities (@xec-sh/testing)
├── experiments/      # Experimental features and prototypes
├── turbo.json        # Build orchestration
└── CLAUDE.md         # This file - project specification
```

## 🏗 Architecture

### Dependency Graph
```
┌──────────────────┐
│  @xec-sh/cli     │  Thin CLI wrapper
└────────┬─────────┘
         │
┌────────▼─────────┐
│  @xec-sh/ops     │  DevOps operations library
└────────┬─────────┘  (deploy, pipeline, workflow, health, discovery)
         │
┌────────▼─────────┐
│  @xec-sh/core    │  Shell execution engine
└────────┬─────────┘  (SSH, Docker, K8s adapters)
         │
┌────────┴────┬────────────┬──────────────┐
│ @xec-sh/kit │ @xec-sh/   │ @xec-sh/     │
│ TUI/CLI     │  loader    │  testing     │
│ components  │ Scripts &  │ Test utils   │
└─────────────┘ modules    └──────────────┘
                └──────────┘
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

### 1. ⚠️ Task Focus & Correctness First
**CRITICAL**: Only implement what is explicitly requested. No additional features, files, or "nice-to-haves" unless specified.

**Correctness is non-negotiable**:
- Code must be provably correct through types and tests
- Use mathematical rigor where applicable
- Referential transparency: same input always produces same output
- Pure functions by default, side effects explicitly marked

### 1.1. 🚫 No Duplicate Files
**CRITICAL**: When improving or fixing existing files, ALWAYS update the original files directly. NEVER create duplicate files with suffixes like `-enhanced`, `-fixed`, `-v2`, etc. This prevents code fragmentation and maintains consistency.

**Examples**:
- ✅ Update `text-input.ts` directly 
- ❌ Create `text-input-enhanced.ts`
- ✅ Modify `autocomplete.ts` in place
- ❌ Create `autocomplete-fixed.ts`

### 2. 🔒 Type Safety & Mathematical Rigor
```typescript
// ✅ Good - Type-safe with exhaustive checks
function execute(command: string, options: CommandOptions): Promise<ExecutionResult>

// ❌ Bad - Unsafe typing
function execute(command: any, options?: any): Promise<any>
```
- **No `any` types** - ZERO tolerance
- **Provably correct**: Use types to prove correctness at compile time
- **Full TypeScript strict mode**: All strict flags enabled
- **Exhaustive pattern matching**: All cases must be handled
- **Type coverage**: 100% of public APIs must be fully typed
- **Phantom types**: Use branded types for additional compile-time safety

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

### Zero-Tolerance Testing Philosophy
- **100% Coverage Required**: Every function, branch, and edge case MUST be tested
- **Real over Mock**: Prefer real implementations with fixtures over mocks
- **Test Public APIs**: Focus on testing public interfaces, not internals
- **Property-Based Testing**: Test invariants, not just examples
- **Mutation Testing**: >95% mutation score required - surviving mutants = missing tests
- **Cross-Runtime Testing**: Tests must pass on Node.js, Deno, and Bun
- **Fast Feedback**: Unit tests should run in milliseconds
- **Tests as Specification**: Tests define behavior and serve as living documentation

### Test Pyramid
```
         /\
        /  \  E2E Tests (5%)
       /    \
      /------\  Integration Tests (15%)
     /        \
    /----------\  Component Tests (30%)
   /            \
  /--------------\  Unit Tests (50%)
```

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
    ├── property/          # Property-based tests
    │   └── execution-properties.test.ts
    ├── mutation/          # Mutation tests
    │   └── mutation.config.ts
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

#### 3. Property-Based Tests
- Test invariants and mathematical properties
- Generate random inputs to find edge cases
- Ensure laws hold (associativity, commutativity, etc.)

```typescript
// Property-based test example
import * as fc from 'fast-check';

test.property('pipe composition is associative',
  fc.string(), fc.string(), fc.string(),
  async (cmd1, cmd2, cmd3) => {
    const left = await xec(cmd1).pipe(xec(cmd2)).pipe(xec(cmd3));
    const right = await xec(cmd1).pipe(xec(cmd2).pipe(xec(cmd3)));
    expect(left.stdout).toBe(right.stdout);
  }
);
```

#### 4. Mutation Tests
- Verify test suite quality
- All mutants must be killed
- >95% mutation score required

```typescript
// mutation.config.ts
export default {
  mutate: ['src/**/*.ts'],
  ignore: ['**/*.test.ts', '**/*.spec.ts'],
  testRunner: 'vitest',
  thresholds: {
    high: 95,
    low: 85,
    break: 80
  }
};
```

#### 5. End-to-End Tests
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

#### Testing Commands

```bash
# Run all tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test path/to/test.ts

# Run tests in watch mode
pnpm test --watch

# Run mutation testing
pnpm test:mutation

# Run property-based tests
pnpm test:property

# Run benchmarks
pnpm bench

# Run tests on different runtimes
node --test
bun test
deno test
```

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
import { withTempDir, withDocker, withSSH } from '@xec-sh/testing';

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

## 🔍 Troubleshooting Approach

### Systematic Diagnosis Process

1. **Identify Symptoms**
   - Collect all error messages and stack traces
   - Measure performance metrics (CPU, memory, I/O)
   - Detect behavioral anomalies
   - Check resource usage and limits

2. **Isolate Problem**
   - Binary search to find root cause
   - Create minimal reproduction case
   - Remove variables systematically
   - Test in isolation

3. **Form Hypotheses**
   - Analyze stack traces thoroughly
   - Review recent changes (git log/diff)
   - Check known issues and documentation
   - Consider environmental factors

4. **Verify Solution**
   - Test fix in isolation first
   - Confirm no side effects or regressions
   - Document solution and prevention
   - Add tests to prevent recurrence

### Debug Tools

```typescript
// Built-in debug utilities
import { trace, profile, inspect } from '@xec-sh/core/debug';

// Trace execution flow
const debugEngine = trace('execution', engine);

// Profile performance
const profiledExec = profile(xec);
console.log(profiledExec.stats);

// Inspect internal state
const state = inspect(engine);
```

### Common Issues & Solutions

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| Command hangs | Missing stream handler | Add timeout or check stream consumption |
| Memory leak | Unbounded buffer/cache | Implement size limits or TTL |
| Type errors in pipe | Incompatible adapters | Verify adapter options alignment |
| SSH connection fails | Key permissions | Check chmod 600 on private key |
| Docker not found | Missing Docker socket | Verify Docker daemon is running |
| Slow performance | Missing connection pooling | Enable adapter pooling |
| Lost output | Async race condition | Use proper stream handling |

## 🚀 Development Workflow

### Quick Start
```bash
# Initial setup
corepack enable              # Enable pnpm
pnpm install                 # Install dependencies
pnpm build                   # Build all packages

# Development
pnpm dev                     # Watch mode for all packages
pnpm test                    # Run unit tests
pnpm test:integration        # Run integration tests
pnpm test:e2e               # Run end-to-end tests
pnpm test:full              # Run all tests
pnpm test:coverage          # Run with coverage report
pnpm test:mutation          # Run mutation tests
pnpm bench                  # Run performance benchmarks

# Code quality
pnpm typecheck              # TypeScript validation
pnpm lint                   # ESLint checks
pnpm format                 # Prettier formatting
pnpm fix:all                # Fix all auto-fixable issues
pnpm audit                  # Security vulnerability check

# Documentation
pnpm docs:dev               # Start docs dev server
pnpm docs:build             # Build documentation
```

### Code Quality Gates

All code MUST pass these gates before commit:

- ✅ **Type checking**: `pnpm typecheck` (ZERO errors/warnings)
- ✅ **Linting**: `pnpm lint` (ZERO violations)
- ✅ **Formatting**: `pnpm format:check` (100% compliant)
- ✅ **Unit tests**: `pnpm test` (100% passing)
- ✅ **Coverage**: `pnpm test:coverage` (>95% for new code)
- ✅ **Integration tests**: `pnpm test:integration` (100% passing)
- ✅ **Mutation tests**: `pnpm test:mutation` (>95% killed)
- ✅ **Performance**: `pnpm bench` (no regressions)
- ✅ **Security**: `pnpm audit` (ZERO vulnerabilities)
- ✅ **Docs**: Update `/docs` if API changed
- ✅ **Changelog**: Update CHANGELOG.md for user-facing changes

### Pre-commit Checklist
1. **All Quality Gates Pass**: See above
2. **No Debug Code**: Remove all console.logs, debugger statements
3. **No TODO Comments**: Resolve or create issues
4. **API Compatibility**: Ensure no breaking changes without major version
5. **Cross-Runtime**: Test on Node.js, Deno, and Bun

### 📖 Documentation Updates
**CRITICAL**: When changing public APIs or documented features:
1. Update JSDoc comments in source
2. Update corresponding `/docs` pages
3. Update example code in `/packages/*/examples`
4. Add migration notes if breaking changes

## 🛠 Tools & Environment

### Required Tools
- Node.js 20+ (with corepack)
- pnpm (via corepack)
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
- **ZERO external dependencies** (non-negotiable)
- **100% ESM modules**
- **Platform-agnostic code** (Node.js, Deno, Bun)
- All adapters optional via lazy loading
- Comprehensive error types with stack traces
- Streaming-first APIs with backpressure handling
- Provably correct through types

### @xec-sh/cli
- Depends only on @xec-sh/core
- User-friendly error messages with suggestions
- Interactive prompts when appropriate
- Respect NO_COLOR and CI environment
- **Fast startup time** (<50ms required, <30ms target)
- Progressive enhancement based on TTY capabilities

### @xec-sh/testing
- **Zero production dependencies**
- Provides test helpers only
- Docker container management with lifecycle hooks
- Fixture generators with deterministic output
- Test environment validators
- Property-based testing utilities
- Mutation testing helpers

## ⚡ Performance Standards

### Performance Requirements

**Every performance-critical operation MUST have benchmarks:**

```typescript
import { bench, describe } from 'vitest';

describe('execution performance', () => {
  bench('simple command', async () => {
    await xec('echo test');
  });

  bench('piped commands', async () => {
    await xec('echo test').pipe(xec('grep test'));
  });

  bench('parallel execution', async () => {
    await Promise.all([
      xec('echo 1'),
      xec('echo 2'),
      xec('echo 3')
    ]);
  });
});
```

### Performance Targets

- **Command creation**: <100ns
- **Simple execution**: <5ms overhead
- **Pipe setup**: <200ns
- **SSH connection**: <100ms (pooled: <10ms)
- **Docker exec**: <50ms
- **Memory overhead**: <5MB per command
- **Startup time**: <50ms

### Optimization Guidelines

1. **Measure First**: Never optimize without benchmarks
2. **Stream Everything**: Never buffer entire outputs in memory
3. **Pool Resources**: Connection pooling for SSH/Docker
4. **Lazy Loading**: Load adapters only when needed
5. **Cache Wisely**: Cache with TTL and size limits
6. **Profile Regularly**: Run benchmarks in CI to catch regressions

### Memory Management
- Set strict buffer limits (default: 10MB)
- Clean up event listeners immediately
- Dispose resources with try/finally
- ZERO global state accumulation
- Monitor heap usage in tests

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
XECSH_DEBUG=* pnpm test

# Debug specific components
XECSH_DEBUG=ssh,docker pnpm test

# Debug with timing
XECSH_DEBUG_TIMING=true pnpm test
```

### Common Issues

#### SSH Tests Failing
```bash
# Check SSH container is running
docker ps | grep xecsh-test-ssh

# Restart SSH containers
pnpm --filter @xec-sh/core docker:restart
```

#### Docker Tests Failing
```bash
# Check Docker daemon
docker version

# Clean up test containers
docker rm -f $(docker ps -aq --filter "label=xecsh-test")
```

## 📊 Metrics for Success

### Code Quality Metrics
- **Test coverage**: >95% (100% for critical paths)
- **Mutation score**: >95%
- **Cyclomatic complexity**: <10 per function
- **Type coverage**: 100%
- **Bundle size**: <50KB (core)
- **Dependencies**: 0 (core)

### Performance Metrics
- **Operations/second**: >10K for simple commands
- **Memory overhead**: <5MB per command
- **Startup time**: <50ms
- **Connection pooling efficiency**: >90%

### Reliability Metrics
- **Error rate**: <0.01%
- **Mean time to recovery**: <1s
- **Resource leak rate**: 0%
- **Cross-runtime compatibility**: 100%

## 🚨 Red Flags - NEVER DO THIS

Watch out for these anti-patterns:

- 🚫 **External dependencies in core** - ZERO tolerance
- 🚫 **Runtime-specific code** - Must work on all runtimes
- 🚫 **Mutable global state** - All state must be immutable
- 🚫 **Implicit behavior** - Everything must be explicit
- 🚫 **Silent failures** - All errors must be handled
- 🚫 **Missing tests** - 100% coverage required
- 🚫 **Poor error messages** - Errors must be actionable
- 🚫 **Memory leaks** - All resources must be cleaned up
- 🚫 **Synchronous I/O in async context** - Always use async
- 🚫 **Uncaught promises** - All promises must be handled
- 🚫 **Type assertions without guards** - Validate at runtime
- 🚫 **Console.log in production** - Use proper logging
- 🚫 **Hardcoded values** - Use configuration
- 🚫 **Race conditions** - Proper synchronization required

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
pnpm dev                    # Start development mode
pnpm test                   # Run tests
pnpm fix:all               # Fix all issues

# Package specific
pnpm --filter @xec-sh/core test
pnpm --filter @xec-sh/cli build

# Release
pnpm changeset             # Create changeset
pnpm version              # Version packages
pnpm release              # Publish to npm
```

## 🌟 Remember

> "Perfection is achieved not when there is nothing more to add,
> but when there is nothing left to take away."
> — Antoine de Saint-Exupéry

Every line of code should embody this philosophy. We're not just building a command execution system; we're crafting a tool that teams will rely on for critical operations.

---

**Remember**:
- **Excellence through discipline** - Every feature exactly as requested
- **Zero-tolerance for errors** - This is a HIGH-RELIABILITY SYSTEM
- **Test everything** - If it's not tested, it's broken
- **Performance matters** - Measure, optimize, verify
- **Security first** - Never compromise on security

**Last Updated**: 2025-09-29
**Version**: 0.8.1
**Status**: Living Document