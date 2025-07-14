# Xec Core Tests

## Test Structure

```
test/
├── unit/              # Unit tests
│   ├── core/         # Core modules (errors, types, validation)
│   ├── dsl/          # DSL modules (task, recipe)
│   ├── engine/       # Engine modules (scheduler, phase-builder, executor)
│   ├── context/      # Context modules (globals)
│   └── utils/        # Utility modules (logger)
├── integration/       # Integration tests (placeholder)
├── e2e/              # End-to-end tests (placeholder)
├── fixtures/         # Test fixtures
└── helpers/          # Test helpers and utilities
```

## Test Coverage

Current test coverage: ~24.44%

### Well-tested modules (>90% coverage):
- **core/errors.ts** - 100% - Custom error classes
- **core/validation.ts** - 100% - Input validation using AJV
- **dsl/task.ts** - 100% - Task builder DSL
- **dsl/recipe.ts** - 98.27% - Recipe builder DSL
- **engine/scheduler.ts** - 91.87% - Task scheduling and dependency management
- **engine/phase-builder.ts** - 96.45% - Phase management
- **context/globals.ts** - 99.27% - Global context functions

### Modules needing tests:
- **context/builder.ts** - Context builder
- **context/provider.ts** - Context provider
- **engine/executor.ts** - Recipe executor (depends on context modules)
- **All modules/** - modules, integrations, state, utils/logger

## Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- test/unit/core/errors.test.ts
```

## Test Guidelines

1. **Unit Tests**: Test individual functions and classes in isolation
2. **Mock Dependencies**: Use vitest's `vi.mock()` for external dependencies
3. **Test Coverage**: Aim for >90% coverage for critical modules
4. **Test Organization**: Group related tests using `describe()` blocks
5. **Test Naming**: Use descriptive test names that explain what is being tested

## TODO

1. Complete context module tests (builder, provider)
2. Complete executor tests after context modules are done
3. Add integration tests for module system
4. Add integration tests for state management
5. Add e2e tests for complete recipe execution
6. Improve overall test coverage to >90%