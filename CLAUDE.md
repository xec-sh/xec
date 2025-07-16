# Xec Infrastructure Orchestration System

## Project Overview
Xec is a TypeScript-based infrastructure orchestration system inspired by Ansible and Terraform, built as a monorepo with clear separation of concerns.

## Monorepo Structure
```
xec/
├── apps/
│   └── xec/           # CLI application (@xec/cli)
├── packages/
│   ├── core/          # Core orchestration engine (@xec/core)
│   └── ush/           # Universal shell execution engine (@xec/ush)
```

## Quick Navigation
- [CLI Documentation](./apps/xec/CLAUDE.md)
- [Core Documentation](./packages/core/CLAUDE.md)
- [Ush Documentation](./packages/ush/CLAUDE.md)

## Key Commands
```bash
# Install dependencies
yarn install

# Build all packages
yarn build

# Run tests
yarn test

# Development mode
yarn dev

# Type checking
yarn typecheck

# Linting
yarn lint
```

## Architecture Overview
```
┌─────────────────┐
│  @xec/cli   │ User Interface Layer
│   (apps/xec)   │
└────────┬────────┘
         │ depends on
         ├─────────────────┐
         ▼                 ▼
┌─────────────────┐  ┌─────────────────┐
│ @xec/core   │  │ @xec/ush   │
│(packages/core)  │─►│(packages/ush)  │
└─────────────────┘  └─────────────────┘
  Orchestration Layer   Execution Layer
```

## Development Guidelines

### When Making Changes
1. **Check dependencies**: Changes in lower layers affect upper layers
2. **Run tests**: Each package has comprehensive test suites
3. **Update documentation**: Keep CLAUDE.md files in sync with changes
4. **Follow patterns**: Each package has established patterns and conventions

### Common Tasks

#### Adding a New Feature
1. Determine the appropriate layer (ush, core, or cli)
2. Follow the existing patterns in that package
3. Add tests for the new feature
4. Update relevant documentation

#### Fixing Bugs
1. Reproduce the issue with a test
2. Fix the bug in the appropriate package
3. Ensure all tests pass across the monorepo
4. Update CHANGELOG if significant

#### Refactoring
1. Start from the lowest affected layer
2. Update dependent packages incrementally
3. Run `yarn build` to ensure compilation
4. Run `yarn test` to ensure functionality

## Testing Strategy
- **Unit Tests**: Each package has extensive unit tests
- **Integration Tests**: Test interactions between packages
- **E2E Tests**: Test complete workflows through the CLI

## Build System
- **Turborepo**: Manages build orchestration and caching
- **TypeScript**: All packages use TypeScript with strict mode
- **Yarn Workspaces**: Manages dependencies across packages

## Common Issues and Solutions

### Build Errors
- Run `yarn clean` to clear build artifacts
- Check TypeScript versions are consistent
- Ensure all dependencies are installed with `yarn install`

### Test Failures
- Check if changes in lower layers broke upper layer tests
- Use focused tests during development: `yarn test -- path/to/test`
- Mock external dependencies appropriately

### Type Errors
- Run `yarn typecheck` to see all type errors
- Check for missing type exports in package indices
- Ensure proper type imports between packages

## Package-Specific Details
See individual CLAUDE.md files in each package for detailed information:
- [apps/xec/CLAUDE.md](./apps/xec/CLAUDE.md) - CLI implementation details
- [packages/core/CLAUDE.md](./packages/core/CLAUDE.md) - Core framework details
- [packages/ush/CLAUDE.md](./packages/ush/CLAUDE.md) - Execution engine details