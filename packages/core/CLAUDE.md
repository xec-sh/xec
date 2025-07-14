# @xec/core - Core Orchestration Engine

## Package Overview
The core package provides the infrastructure orchestration engine with declarative DSL, state management, and extensible module system.

## Directory Structure
```
packages/core/
├── src/
│   ├── context/          # Global context management
│   ├── core/             # Core types and validation
│   ├── dsl/              # Domain Specific Language
│   ├── engine/           # Execution engine
│   ├── integrations/     # External system adapters
│   ├── modules/          # Module system and registries
│   ├── patterns/         # Deployment patterns
│   ├── security/         # Security features
│   ├── state/            # State management
│   ├── stdlib/           # Standard library
│   └── utils/            # Utilities
├── docs/                 # Comprehensive documentation
├── examples/             # Usage examples
└── test/                 # Test suites
```

## Key Concepts

### 1. DSL (Domain Specific Language)
- **Task**: Basic unit of work
- **Recipe**: Collection of tasks with lifecycle management
- Location: `src/dsl/`

### 2. State Management
- **Event Sourcing**: Track all state changes
- **State Ledger**: Immutable state history
- **Lock Manager**: Prevent concurrent modifications
- Location: `src/state/`

### 3. Module System
- **Task Registry**: Custom task types
- **Helper Registry**: Utility functions
- **Pattern Registry**: Reusable deployment patterns
- **Integration Registry**: External system adapters
- Location: `src/modules/`

### 4. Integration Adapters
- AWS, Kubernetes, Terraform, Ush
- Location: `src/integrations/`

### 5. Deployment Patterns
- Blue-Green, Canary, Rolling Update, A/B Testing
- Location: `src/patterns/`

## Development Guide

### Adding a New Task Type
1. Create task implementation in `src/stdlib/`
2. Register in appropriate module registry
3. Add tests in `test/unit/`
4. Update documentation

### Adding a New Integration
1. Implement BaseAdapter interface in `src/integrations/`
2. Register in IntegrationRegistry
3. Add integration tests
4. Document usage

### Adding a New Pattern
1. Implement pattern in `src/patterns/`
2. Register in PatternRegistry
3. Add example in `examples/`
4. Add tests

## Testing

### Run All Tests
```bash
yarn test
```

### Run Specific Test
```bash
yarn test -- test/unit/dsl/task.test.ts
```

### Test Coverage
```bash
yarn test:coverage
```

## Common Issues

### Import Errors
- Check `src/index.ts` exports all public APIs
- Verify circular dependencies
- Use proper import paths

### State Management Issues
- Ensure proper event ordering
- Check lock acquisition/release
- Verify state persistence

### Module Loading Issues
- Check module registration
- Verify module dependencies
- Ensure proper initialization order

## Architecture Decisions

### Why Event Sourcing?
- Complete audit trail
- Time-travel debugging
- State reconstruction
- Distributed system coordination

### Why Module System?
- Extensibility without core changes
- Plugin architecture
- Clear separation of concerns
- Easy testing

### Why TypeScript Strict Mode?
- Catch errors at compile time
- Better IDE support
- Self-documenting code
- Easier refactoring

## Performance Considerations
- State operations are async for scalability
- Module loading is lazy
- Pattern matching is optimized
- Integration calls are batched when possible

## Security Features
- Encryption for sensitive data
- Secrets management
- Audit logging
- Input validation

## Debugging Tips
1. Enable debug logging: `DEBUG=xec:*`
2. Use state snapshots for debugging
3. Check event log for state changes
4. Use test helpers for isolated testing

## Future Enhancements
- Distributed state management
- More integration adapters
- Advanced scheduling algorithms
- Performance optimizations