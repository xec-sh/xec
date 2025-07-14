# @xec/ush - Universal Execution Engine

## Package Overview
Ush (Universal Execution) is a command execution library inspired by Google's zx, providing a unified API for executing commands across different environments (local, SSH, Docker).

> **IMPORTANT**: When working with this project, follow the AIDM (Autonomous Iterative Development Methodology) described in `/ai/aidm.md`. This includes phases: comprehensive analysis, architectural modeling, phased implementation with quality control, automatic verification and documentation.

## Architecture Decisions

### 1. Adapter Pattern
- **Decision**: Use adapter pattern for execution contexts
- **Reasoning**: Allows extensibility and clean separation of concerns
- **Alternatives Considered**: Strategy pattern (too simple), Plugin system (too complex)

### 2. Template Literal API
- **Decision**: Implement zx-style template literals with tagged template functions
- **Reasoning**: Provides intuitive syntax and automatic escaping
- **Implementation**: Proxy-based approach for chainable API

### 3. Error Handling
- **Decision**: Custom error classes with inheritance hierarchy
- **Reasoning**: Allows specific error handling and rich error information
- **Pattern**: ExecutionError → CommandError, ConnectionError, TimeoutError, DockerError

## Key Implementation Patterns

### 1. Execution Flow
```
ExecutionEngine → Adapter Selection → Command Preparation → Execution → Result Processing
```

### 2. Configuration Merging
- Global config (ExecutionEngine)
- Adapter-specific config
- Command-specific config
- Priority: Command > Adapter > Global

### 3. Stream Handling
- StreamHandler class for buffering and transformation
- Support for line-by-line processing
- Maximum buffer size protection

## Testing Patterns

**IMPORTANT**: All tests MUST be created in the `test/` directory, NOT in `src/`. Never create tests in `src/__tests__` or any subdirectory of `src/`.

### Testing Best Practices

**AVOID MOCKS WHERE POSSIBLE**: Tests should be as close to real situations as possible. Prefer:
- Using real implementations over mocks
- Testing actual behavior rather than mocked responses
- Cross-platform tests that adapt to the current environment
- Integration tests that verify real interactions

Only use mocks when:
- Testing external services (network calls, databases)
- Simulating error conditions that are hard to reproduce
- Isolating unit tests from system dependencies

### Test Directory Structure
```
test/
├── unit/           # Unit tests for individual components
│   ├── adapters/   # Tests for adapter implementations
│   ├── core/       # Tests for core functionality
│   ├── ssh/        # Tests for SSH functionality
│   │   └── base/   # SSH base tests (adapted from node-ssh)
│   └── utils/      # Tests for utility functions
├── integration/    # Integration tests
├── e2e/           # End-to-end tests
├── fixtures/      # Test fixtures
├── helpers/       # Test utilities and helpers
└── spec-compliance.test.ts  # Specification compliance tests
```

### Mock Setup for spawn (ESM) - Use Sparingly

**Note**: This section shows how to mock when absolutely necessary. Prefer real implementations when possible.

```typescript
// Correct pattern for mocking spawn in ESM modules (when necessary)
// Create mock function outside describe block
const mockSpawn = jest.fn();

// Mock the module
jest.mock('node:child_process', () => ({
  spawn: mockSpawn
}));

// Use mockSpawn directly in tests
mockSpawn.mockReturnValue(createMockProcess());
```

### Cross-Platform Testing Example

The `shell-escape.test.ts` demonstrates good testing practices:
- Tests adapt to the current platform instead of mocking
- Uses conditional test execution (describe.skip) for platform-specific tests
- Verifies behavior rather than exact implementation details

### Creating Mock Processes
```typescript
const createMockProcess = (stdout = '', stderr = '', exitCode = 0) => {
  const process = new EventEmitter() as any;
  process.stdout = new Readable({ read() {} });
  process.stderr = new Readable({ read() {} });
  process.stdin = new Writable({ write() {} });
  
  // Emit data
  process.stdout.push(stdout);
  process.stdout.push(null);
  process.stderr.push(stderr);
  process.stderr.push(null);
  
  // Emit exit
  setImmediate(() => {
    process.emit('exit', exitCode, null);
  });
  
  return process;
};
```

## Common Pitfalls

1. **TypeScript Module Imports**: Use `node:` prefix for Node.js built-ins in ESM
2. **Environment Variables**: Always filter undefined values when merging
3. **Signal Types**: Use `as any` for process.kill signal parameter
4. **Bun Detection**: Use `@ts-ignore` for Bun global checks
5. **Jest ESM Mocking**: Must create mock functions outside describe blocks
6. **Mock Clear**: Use `jest.clearAllMocks()` in beforeEach to reset state
7. **Module Resolution**: Jest can't resolve `.js` imports in tests - use jest.config moduleNameMapper

## API Quick Reference

### Basic Usage
```typescript
await $`command`                         // Execute with global $
await $.run`command`                     // Explicit run method
```

### Configuration
```typescript
$.cd('/path')                           // Change directory
$.env({ VAR: 'value' })                 // Set environment
$.timeout(5000)                         // Set timeout
$.shell('bash')                         // Set shell
```

### Adapters
```typescript
$.local()                               // Local execution
$.ssh({ host, username })               // SSH execution
$.docker({ container })                 // Docker execution
```

### Error Handling
```typescript
try {
  await $`command`;
} catch (error) {
  if (error instanceof CommandError) {
    // Handle command failure
  }
}
```

## File Structure

```
src/
├── core/               # Core classes and interfaces
│   ├── command.ts      # Command model
│   ├── error.ts        # Error classes
│   ├── execution-engine.ts  # Main engine
│   ├── result.ts       # Result model
│   └── stream-handler.ts    # Stream processing
├── adapters/           # Execution adapters
│   ├── base-adapter.ts      # Base class
│   ├── local-adapter.ts     # Local execution
│   ├── ssh-adapter.ts       # SSH execution
│   ├── docker-adapter.ts    # Docker execution
│   └── mock-adapter.ts      # Testing mock
├── utils/              # Utility functions
│   ├── shell-escape.ts      # Command escaping
│   ├── runtime-detect.ts    # Runtime detection
│   └── process-utils.ts     # Process helpers
└── index.ts            # Public API

test/
├── unit/               # Unit tests
│   ├── adapters/       # Adapter tests
│   ├── core/           # Core tests
│   └── utils/          # Utility tests
├── integration/        # Integration tests
└── helpers/            # Test utilities
```

## Development Workflow

**IMPORTANT for AI assistants**: When working with this project, strictly follow the AIDM methodology:
- **Phase 1**: Analyze requirements and existing code before making changes
- **Phase 2**: Design solution with architectural decision justification
- **Phase 3**: Implement incrementally with built-in quality control
- **Phase 4**: Verify edge cases and performance
- **Phase 5**: Update documentation and CLAUDE.md

1. **Adding New Features**:
   - Update types in command.ts
   - Implement in appropriate adapter
   - Add tests following existing patterns
   - Update examples

2. **Testing**:
   - Unit tests for individual components
   - Integration tests for adapter interactions
   - Mock adapter for user testing scenarios

3. **Documentation**:
   - Update README.md for user-facing changes
   - Update this file for implementation details
   - Add JSDoc comments for public APIs

## Performance Considerations

1. **Connection Pooling**: SSH adapter reuses connections
2. **Stream Buffering**: Limited to prevent memory issues
3. **Lazy Loading**: Adapters loaded on demand
4. **Process Cleanup**: Proper cleanup on timeouts/aborts

## Security Notes

1. **Command Escaping**: Automatic for template literals
2. **Path Sanitization**: Prevent directory traversal
3. **Credential Handling**: Never log sensitive data
4. **Environment Isolation**: Careful env var handling

## Future Enhancements

1. **Kubernetes Adapter**: Execute in K8s pods
2. **Remote Docker**: Docker over SSH
3. **Pipeline Operators**: Better pipe support
4. **Progress Reporting**: Real-time progress
5. **Retry Mechanisms**: Built-in retry logic

## Implementation Notes

### Template Literal API
The template literal API uses a Proxy to create a callable object that also has methods:
```typescript
const $ = new Proxy((() => {}) as any, {
  get(target, prop) { /* return methods */ },
  apply(target, thisArg, args) { /* handle template literal call */ }
});
```

### SSH Connection Pooling
Connections are stored by key `username@host:port` and reused. Idle connections are cleaned up every minute.

### Docker Auto-Create
When enabled, temporary containers are created with names like `temp-ush-{timestamp}-{random}` and tracked for cleanup.

### Bun.spawn Integration
When Bun runtime is detected, the LocalAdapter uses Bun.spawn instead of child_process.spawn for better performance.

## Known Limitations

1. **SSH Streaming**: SSH adapter doesn't support true streaming stdin due to ssh2 library limitations
2. **Docker TTY**: Interactive TTY mode has limited support
3. **Process Killing**: SSH adapter can't reliably kill remote processes
4. **Pipe Chaining**: Full pipe support between ProcessPromises not yet implemented

## AIDM Application in This Project

This project was developed following the AIDM methodology:

### Phase 1: Analysis
- Analyzed the specification in `docs/spec.md`
- Studied reference implementations (webpod SSH, zx library)
- Identified key requirements: unified API, multiple adapters, Bun support

### Phase 2: Architecture
- Chose adapter pattern for extensibility
- Designed template literal API with Proxy
- Created error hierarchy for specific handling
- Planned configuration merging strategy

### Phase 3: Implementation
- Built core components iteratively (errors → adapters → engine)
- Each component was tested mentally before implementation
- Added comprehensive error handling from the start

### Phase 4: Verification
- Created test suite with mock adapter
- Verified TypeScript compilation
- Tested edge cases (environment variables, signal handling)

### Phase 5: Documentation
- Created comprehensive README with examples
- Added inline code comments
- Documented known limitations and future enhancements
- This CLAUDE.md serves as architectural documentation

When extending this project, continue following AIDM principles for consistent quality.