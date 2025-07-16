# CLI Commands Test Coverage

This document outlines the test coverage for all new CLI commands added to the xec CLI application.

## Test Files Created

### 1. audit.test.ts
Tests for the audit command including:
- Show/list audit logs
- Export audit data in different formats
- Filter audit logs by user, action, date
- Error handling

### 2. config.test.ts  
Tests for the config command including:
- Get configuration values
- Set configuration values
- List all configuration
- Initialize configuration interactively
- Global vs local config handling
- Validation of config values

### 3. deploy.test.ts
Tests for the deploy command including:
- Deploy to specified targets
- Dry run deployments
- Deployment with tags
- Rollback deployments
- List deployment history
- Show deployment status
- Force deployments
- Error handling

### 4. integration.test.ts
Tests for the integration command including:
- List available integrations
- Add new integrations
- Configure integrations
- Test integration connections
- Remove integrations
- Handle connection failures
- Show integration status

### 5. inventory.test.ts
Tests for the inventory command including:
- List all hosts
- Filter by groups and tags
- Show host details
- Add/remove/edit hosts
- Import inventory from files
- Export inventory in different formats
- Validate host connectivity

### 6. module.test.ts
Tests for the module command including:
- List installed modules
- Show module information
- Install/uninstall modules
- Update modules
- Search module registry
- Create module scaffolds
- Validate modules
- Handle installation failures
- Publish modules

### 7. secrets.test.ts
Tests for the secrets command including:
- List all secrets
- Get secret values
- Set secrets interactively and from stdin
- Delete secrets with confirmation
- Rotate secrets
- Export/import secrets
- Validate secret format
- Show secret metadata

### 8. state.test.ts
Tests for the state command including:
- Show current state
- List state history
- Lock/unlock state
- Push/pull state
- Show state diffs
- Backup/restore state
- Handle state conflicts
- Migrate state format
- Show resource details

### 9. validate.test.ts
Tests for the validate command including:
- Validate recipe files
- Show validation errors and warnings
- Validate entire projects
- Strict mode validation
- Output in different formats
- Validate specific components
- Auto-fix issues
- Schema compliance
- Custom validation rules
- Dependency validation

## Running Tests

To run all tests:
```bash
npm test
```

To run tests for a specific command:
```bash
npm test -- audit.test.ts
```

To run tests with coverage:
```bash
npm test -- --coverage
```

## Test Structure

All test files follow a consistent structure:
1. Import necessary dependencies and mocks
2. Set up mocks for @xec/core and file system operations
3. Create test suites for each subcommand
4. Test both success and error scenarios
5. Verify console output and file operations
6. Clean up mocks after each test

## Mock Strategy

- **@xec/core**: All core functionality is mocked to isolate CLI behavior
- **fs/promises**: File operations are mocked to avoid actual file I/O
- **@inquirer/prompts**: User input prompts are mocked for predictable testing
- **Console methods**: Mocked to capture and verify output

## Coverage Goals

Each command should have:
- ✅ Basic functionality tests
- ✅ Error handling tests  
- ✅ Option/flag handling tests
- ✅ Output format tests
- ✅ Integration with core library tests

## Next Steps

1. Run the full test suite to identify any issues
2. Add integration tests that test commands end-to-end
3. Add performance tests for commands that process large datasets
4. Set up continuous integration to run tests on every commit