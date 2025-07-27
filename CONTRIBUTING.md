# Contributing to Xec

Thank you for your interest in contributing to Xec! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Debugging](#debugging)
- [Common Tasks](#common-tasks)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/xec.git
   cd xec
   ```
3. Add the upstream repository:
   ```bash
   git remote add upstream https://github.com/xec-sh/xec.git
   ```

## Development Setup

### Prerequisites

- Node.js 18+ 
- Yarn 1.22+
- Git

### Installation

```bash
# Install dependencies
yarn install

# Build all packages
yarn build

# Run tests
yarn test
```

## Project Structure

Xec is a monorepo with the following structure:

```
xec/
├── apps/
│   └── xec/           # CLI application (@xec-sh/cli)
├── packages/
│   ├── core/          # Core execution engine (@xec-sh/core)
│   └── ush/           # Universal shell execution engine (@xec-sh/core)
├── package.json       # Root package.json
├── turbo.json         # Turborepo configuration
└── README.md          # Project documentation
```

Each package has its own:
- `src/` - Source code
- `test/` - Tests
- `README.md` - Package documentation

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Make Your Changes

Follow these guidelines:
- Write code in TypeScript
- Add tests for new functionality
- Update documentation as needed
- Follow existing code patterns

### 3. Run Tests Locally

```bash
# Test all packages
yarn test

# Test specific package
yarn test packages/ush

# Run type checking
yarn build

# Format and lint code
yarn fix:all
```

### 4. Commit Your Changes

See [Commit Guidelines](#commit-guidelines) below.

## Testing

### Test Structure

- **Unit Tests**: `test/unit/` - Test individual components
- **Integration Tests**: `test/integration/` - Test component interactions
- **E2E Tests**: Test complete workflows through the CLI

### Writing Tests

```typescript
import { test, expect, describe } from '@jest/globals';

describe('Feature Name', () => {
  test('should do something', async () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = await myFunction(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

### Running Tests

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test --watch

# Run tests with coverage
yarn test --coverage

# Run specific test file
yarn test path/to/test.ts
```

## Code Style

### TypeScript Guidelines

- Use TypeScript strict mode
- Prefer interfaces over type aliases for object shapes
- Use explicit return types for public APIs
- Avoid `any` type - use `unknown` if type is truly unknown

### General Guidelines

- Use meaningful variable and function names
- Keep functions small and focused
- Add JSDoc comments for public APIs
- Use early returns to reduce nesting
- Prefer async/await over callbacks

### Formatting

The project uses Prettier and ESLint for code formatting:

```bash
# Format and fix all files
yarn fix:all

# Check formatting without fixing
yarn lint
```

## Commit Guidelines

We follow conventional commits specification:

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test additions or modifications
- `chore`: Maintenance tasks
- `perf`: Performance improvements

### Examples

```bash
# Feature
git commit -m "feat(ush): add retry logic for network errors"

# Bug fix
git commit -m "fix(core): handle undefined adapter gracefully"

# Documentation
git commit -m "docs(readme): update installation instructions"

# With body
git commit -m "feat(cli): add progress indicators

- Add spinner for long operations
- Show progress bar for file transfers
- Update UI to be more responsive"
```

## Pull Request Process

### Before Submitting

1. **Update from upstream**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Ensure all tests pass**:
   ```bash
   yarn test
   yarn build
   ```

3. **Update documentation** if needed

4. **Add tests** for new functionality

### Submitting a PR

1. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Create a Pull Request on GitHub

3. Fill out the PR template with:
   - Clear description of changes
   - Related issue numbers
   - Test plan
   - Screenshots (if UI changes)

### PR Review Process

- PRs require at least one approval
- Address review feedback promptly
- Keep PRs focused - one feature/fix per PR
- Ensure CI passes

## Debugging

### VSCode Configuration

The project includes VSCode debug configurations in `.vscode/launch.json`:

- Debug current test file
- Debug all tests
- Debug CLI execution

### Common Debugging Tips

1. **Use verbose mode** for more output:
   ```typescript
   const engine = new ExecutionEngine({ verbose: true });
   ```

2. **Enable debug logging**:
   ```bash
   DEBUG=xec:* yarn test
   ```

3. **Use breakpoints** in VSCode or `debugger` statements

## Common Tasks

### Adding a New Feature

1. **Determine the appropriate package**:
   - `ush`: Shell execution functionality
   - `core`: Execution and automation logic
   - `cli`: User interface

2. **Write tests first** (TDD approach)

3. **Implement the feature**

4. **Update documentation**:
   - Package README.md
   - API documentation
   - Examples if applicable

### Fixing a Bug

1. **Reproduce the issue** with a failing test

2. **Fix the bug**

3. **Verify the test passes**

4. **Check for regressions**

### Adding a New Adapter (ush)

1. Create adapter file in `packages/ush/src/adapters/`
2. Extend `BaseAdapter` class
3. Implement required methods
4. Add comprehensive tests
5. Update documentation

### Updating Dependencies

```bash
# Update dependencies interactively
yarn upgrade-interactive

# Update specific package
yarn workspace @xec-sh/core add package-name@latest

# Update all workspaces
yarn workspaces foreach install
```

## Performance Considerations

- Minimize synchronous operations
- Use streaming for large data
- Implement proper connection pooling
- Add benchmarks for performance-critical code

## Security

- Never commit secrets or credentials
- Validate all user inputs
- Use secure defaults
- Follow OWASP guidelines
- Report security issues privately

## Documentation

### Where to Document

- **API Changes**: Update TypeScript interfaces and JSDoc
- **New Features**: Update package README.md
- **Examples**: Add to `examples/` directory
- **Architecture**: Update documentation

### Documentation Style

- Use clear, concise language
- Include code examples
- Explain the "why" not just the "what"
- Keep examples runnable

## Getting Help

- Check existing issues and PRs
- Read package documentation
- Review test files for examples
- Ask questions in issues

## License

By contributing to Xec, you agree that your contributions will be licensed under the same license as the project.