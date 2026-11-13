# Contributing to Xec

Welcome to Xec! We're excited to have you contribute to the universal command execution system. This guide will help you get started and ensure your contributions align with our project standards.

## 🎯 Table of Contents

- [Philosophy & Principles](#philosophy--principles)
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)

## 🌟 Philosophy & Principles

Before contributing, please understand our core principles. For comprehensive development guidelines, testing strategy, and architecture details, see [AGENTS.md](./AGENTS.md).

### 1. ⚠️ Task Focus
**CRITICAL**: Only implement what is explicitly requested. No additional features or files unless specified.

### 2. 📝 Change Tracking
Document behavior changes in the owning API/operations page and in meaningful
commits. Release notes are generated from committed history; an ignored local
`CHANGES.md` file is not release evidence.

### 3. 🔒 Type Safety First
- No `any` types in public APIs
- Full TypeScript strict mode
- Comprehensive type definitions

### 4. 📦 Error Handling with Result Pattern
```typescript
// ✅ Use Result pattern
return { ok: false, error: new ExecutionError('Failed', 'ERROR_CODE') };

// ❌ Avoid throwing in public APIs
throw new Error('Failed');
```

### 5. 🧪 Test Everything
- 90%+ code coverage target
- Tests before implementation (TDD)
- Real implementations over mocks

## 📜 Code of Conduct

We are committed to providing a friendly, safe, and welcoming environment for all contributors. Please:

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on what is best for the community
- Show empathy towards other community members

## 🚀 Getting Started

### Prerequisites

- **Node.js** 24+ (recommend using [nvm](https://github.com/nvm-sh/nvm))
- **Git** 2.25+
- **pnpm** pinned by `packageManager` (via Corepack)
- **Docker** (optional, for testing adapters)
- **kubectl** (optional, for Kubernetes adapter testing)

### Quick Start

1. **Fork the repository**
   - Go to https://github.com/xec-sh/xec
   - Click "Fork" button
   - Clone your fork:
     ```bash
     git clone https://github.com/YOUR_USERNAME/xec.git
     cd xec
     ```

2. **Set up remotes**
   ```bash
   git remote add upstream https://github.com/xec-sh/xec.git
   git fetch upstream
   ```

3. **Enable Corepack and install dependencies**
   ```bash
   corepack enable    # Enables pnpm
   pnpm install       # Install all dependencies
   ```

4. **Build the project**
   ```bash
   pnpm build         # Build all packages
   ```

5. **Run tests**
   ```bash
   pnpm test          # Run all tests
   ```

## 🏗 Development Setup

### Monorepo Structure

```
xec/
├── apps/
│   └── xec/          # CLI application (@xec-sh/cli)
├── website/          # Documentation site
├── packages/
│   ├── core/         # Core execution engine (@xec-sh/core)
│   ├── ops/          # Infrastructure and release operations
│   └── testing/      # Shared testing utilities
├── docker/           # Test containers
├── .xec/             # Project-specific commands
├── scripts/release.ts # Verified release entry point
├── AGENTS.md         # AI assistant instructions
└── turbo.json        # Build orchestration
```

### Environment Setup

1. **Install recommended VSCode extensions**:
   ```json
   {
     "recommendations": [
       "dbaeumer.vscode-eslint",
       "esbenp.prettier-vscode",
       "ms-vscode.vscode-typescript-next",
       "orta.vscode-jest"
     ]
   }
   ```

2. **Configure Git hooks**:
   ```bash
   pnpm install  # Automatically sets up Lefthook
   ```

3. **Set up test containers** (optional):
   ```bash
   pnpm --filter @xec-sh/core docker:start
   ```

## 🔄 Development Workflow

### 1. Sync with upstream
```bash
git fetch upstream
git checkout main
git merge upstream/main
```

### 2. Create a feature branch
```bash
git checkout -b <type>/<short-description>
# Examples:
# feat/add-retry-logic
# fix/ssh-connection-leak
# docs/update-api-reference
```

### 3. Make your changes

Follow these steps:

1. **Update documentation** - Explain the resulting behavior and recovery contracts
2. **Write failing tests** - TDD approach
3. **Implement the feature** - Make tests pass
4. **Update documentation** - Keep docs in sync
5. **Run quality checks**:
   ```bash
   pnpm test            # Run tests
   pnpm fix:all         # Fix linting/formatting
   pnpm build           # Ensure it builds
   ```

### 4. Commit your changes

Follow our [commit conventions](#commit-guidelines):
```bash
git add .
git commit -m "feat(core): add retry logic for network operations"
```

### 5. Push and create PR
```bash
git push origin feat/add-retry-logic
```

Then create a Pull Request on GitHub.

## 💻 Coding Standards

### TypeScript Guidelines

```typescript
// ✅ Good: Explicit types, clear naming
export interface ExecutionOptions {
  timeout?: number;
  retries?: number;
  env?: Record<string, string>;
}

export async function execute(
  command: string,
  options: ExecutionOptions = {}
): Promise<Result<string>> {
  // Implementation
}

// ❌ Bad: Any types, unclear naming
export async function run(cmd: any, opts?: any): Promise<any> {
  // Implementation
}
```

### Key Principles

1. **Single Responsibility** - Each module/function does one thing well
2. **Composition over Inheritance** - Build complex behavior from simple functions
3. **Immutability** - Prefer immutable data structures
4. **Explicit over Implicit** - Clear, self-documenting code
5. **Error Handling** - Use Result pattern for recoverable errors

### Code Style Rules

- Use 2 spaces for indentation
- Maximum line length: 100 characters
- Use single quotes for strings
- Add trailing commas in multi-line structures
- Order imports: external → internal → relative
- Use early returns to reduce nesting

## 🧪 Testing Guidelines

### Test Structure

```
test/
├── unit/           # Isolated component tests
├── integration/    # Component interaction tests
├── fixtures/       # Test data and mocks
└── helpers/        # Test utilities
```

### Writing Tests

```typescript
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { TestEnvironment } from '@xec-sh/testing';

describe('FeatureName', () => {
  let env: TestEnvironment;

  beforeEach(async () => {
    env = await TestEnvironment.setup();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  test('should handle specific scenario', async () => {
    // Arrange
    const input = 'test-input';
    
    // Act
    const result = await myFunction(input);
    
    // Assert
    expect(result.ok).toBe(true);
    expect(result.value).toBe('expected-output');
  });
});
```

### Test Categories

1. **Unit Tests** - Test individual functions/classes
2. **Integration Tests** - Test component interactions
3. **Adapter Tests** - Test specific adapter implementations
4. **E2E Tests** - Test complete user workflows

### Running Tests

```bash
# All tests
pnpm test

# Specific workspace
pnpm --filter @xec-sh/core test

# Watch mode
pnpm test --watch

# Coverage report
pnpm test --coverage

# Specific test file
pnpm test path/to/test.spec.ts

# Integration tests only
pnpm test:integration
```

## 📚 Documentation

### Where to Document

| Type | Location | Format |
|------|----------|--------|
| API Documentation | Source code | JSDoc with examples |
| Architecture | `/docs` | Markdown |
| Package Usage | Package `README.md` | Markdown with examples |
| Examples | `/examples` | Runnable code |
| Tutorials | `/docs` | Docusaurus |

### Documentation Standards

```typescript
/**
 * Executes a command in the specified environment
 * 
 * @param command - The command to execute
 * @param options - Execution options
 * @returns A Result containing the output or an error
 * 
 * @example
 * ```typescript
 * const result = await execute('ls -la', { 
 *   timeout: 5000,
 *   cwd: '/tmp' 
 * });
 * 
 * if (result.ok) {
 *   console.log(result.value);
 * }
 * ```
 */
export async function execute(
  command: string,
  options: ExecutionOptions = {}
): Promise<Result<string>> {
  // Implementation
}
```

## 📝 Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/):

### Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(cli): add progress bar for long operations` |
| `fix` | Bug fix | `fix(core): prevent memory leak in SSH connections` |
| `docs` | Documentation | `docs(readme): update installation instructions` |
| `style` | Code style | `style(core): format with prettier` |
| `refactor` | Code refactoring | `refactor(cli): extract command parser` |
| `perf` | Performance | `perf(core): optimize connection pooling` |
| `test` | Tests | `test(ssh): add timeout scenarios` |
| `build` | Build system | `build: update turbo configuration` |
| `ci` | CI/CD | `ci: add coverage reporting` |
| `chore` | Maintenance | `chore: update dependencies` |

### Scope

Common scopes:
- `core` - Core package changes
- `cli` - CLI package changes
- `ssh` - SSH adapter
- `docker` - Docker adapter
- `k8s` - Kubernetes adapter

### Examples

```bash
# Simple
git commit -m "feat(cli): add --quiet flag"

# With body
git commit -m "fix(core): handle SIGTERM gracefully

- Add signal handlers for graceful shutdown
- Clean up resources before exit
- Wait for pending operations to complete

Fixes #123"

# Breaking change
git commit -m "feat(core)!: change Result API

BREAKING CHANGE: Result.value is now Result.data
```

## 🔄 Pull Request Process

### Before Creating a PR

- [ ] Update the relevant API and operations documentation
- [ ] All tests pass (`pnpm test`)
- [ ] Code is formatted (`pnpm fix:all`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Documentation is updated
- [ ] Commit messages follow conventions

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix (non-breaking change)
- [ ] New feature (non-breaking change)
- [ ] Breaking change
- [ ] Documentation update

## Changes Made
- List specific changes
- Include relevant details

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Documentation and release-facing commit descriptions updated
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No new warnings
```

### Review Process

1. **Automated Checks** - CI must pass
2. **Code Review** - At least 1 approval required
3. **Testing** - Reviewer may request additional tests
4. **Documentation** - Must be complete and accurate

### After Merge

- Delete your feature branch
- Sync your fork with upstream
- Celebrate! 🎉

## 📦 Release Process

Releases are explicit operator actions. Start with a clean checkout and current
frozen dependencies, then review and prepare immutable archives:

```bash
pnpm install --frozen-lockfile
pnpm release 0.12.0 --dry-run
pnpm release 0.12.0 --prepare
```

Use the intended next version instead of `0.12.0`. Preparation builds in an
isolated Git snapshot, validates exports and dependencies, and tests the packed
SSH runtime. It does not publish or push. After candidate acceptance, the release
operator runs `pnpm release 0.12.0 --resume` to publish the exact saved archives.

Read [Verified package releases](./website/docs/ops/release.md) before publishing.
It covers partial publication, OTP, exact tag pushes, GitHub-only recovery and
prerelease channels. Never recover by deleting published versions or replacing
historical Git tags. The reusable implementation is `@xec-sh/ops/release`; keep
repository-specific packaging in its isolated recipe rather than copying the
release engine.

## 🛠 Common Tasks

### Adding a New Adapter

1. Create adapter file:
   ```typescript
   // packages/core/src/adapters/my-adapter.ts
   export class MyAdapter extends BaseAdapter {
     // Implementation
   }
   ```

2. Add tests:
   ```typescript
   // packages/core/test/unit/adapters/my-adapter.test.ts
   ```

3. Update documentation:
   - Add to API reference
   - Create usage guide
   - Add examples

### Adding a CLI Command

1. Create command file:
   ```typescript
   // apps/xec/src/commands/my-command.ts
   export const myCommand = new Command('my-command')
     .description('Description')
     .action(async (options) => {
       // Implementation
     });
   ```

2. Register in CLI
3. Add tests
4. Update help documentation

### Debugging

1. **Enable debug output**:
   ```bash
   DEBUG=xec:* pnpm test
   ```

2. **Use VSCode debugger**:
   - Set breakpoints
   - Use included launch configurations

3. **Verbose mode**:
   ```bash
   pnpm xec --verbose <command>
   ```

## 🚨 Troubleshooting

### Common Issues

1. **Build fails**
   ```bash
   pnpm clean
   pnpm install
   pnpm build
   ```

2. **Tests fail locally but pass in CI**
   - Check Node.js version
   - Clear test cache: `pnpm test --clearCache`
   - Check for timing issues

3. **Type errors**
   ```bash
   pnpm fix:types
   ```

### Getting Help

1. Check existing [issues](https://github.com/xec-sh/xec/issues)
2. Review [documentation](https://xec.sh)
3. Ask in [discussions](https://github.com/xec-sh/xec/discussions)
4. Join our [Discord](https://discord.gg/xec) (if available)

## 🎯 Final Checklist

Before submitting any contribution:

- [ ] Behavior changes documented in the owning guide
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Code follows style guide
- [ ] Commits follow conventions
- [ ] PR description is complete

---

Thank you for contributing to Xec! Your efforts help make command execution universal and seamless for developers worldwide. 🚀