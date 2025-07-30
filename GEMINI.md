# Gemini Project Analysis: Xec Universal Command Execution System

This document provides a comprehensive overview of the `xec` monorepo, its architecture, packages, and development workflows. It is intended to be a single source of truth for understanding the project.

## 1. Project Overview

Xec is a TypeScript-based universal command execution and automation system inspired by tools like Ansible and Terraform. It provides a command-line interface (CLI), a core execution engine, and a universal shell execution engine. The project is structured as a monorepo using Yarn Workspaces and Turborepo.

## 2. Monorepo Structure

The repository is organized into applications (`apps`) and reusable packages (`packages`).

```
xec/
├── apps/
│   ├── docs/          # Documentation website (@xec-sh/docs)
│   └── xec/           # CLI application (@xec-sh/cli)
├── packages/
│   ├── core/          # Core execution engine (@xec-sh/core)
│   └── ush/           # Universal shell execution engine (@xec-sh/core)
├── .github/           # CI/CD workflows
├── scripts/           # Automation scripts (publishing, etc.)
├── package.json       # Root package.json with monorepo scripts
├── tsconfig.json      # Root TypeScript configuration
└── turbo.json         # Turborepo configuration
```

## 3. Architecture

The project follows a layered architecture, ensuring a clear separation of concerns.

```
┌─────────────────┐
│  @xec-sh/cli    │  User Interface Layer (apps/xec)
│ (Commander.js)  │  - Handles user input, command parsing, and output.
└────────┬────────┘  - Features dynamic commands and interactive prompts.
         │
         │ depends on
         ├─────────────────┐
         ▼                 ▼
┌─────────────────┐  ┌─────────────────┐
│  @xec-sh/core   │  │  @xec-sh/core    │  Execution Layer (packages/ush)
│  (Automation)   │◄─┤ (zx-inspired)   │  - Executes commands (local, SSH, Docker).
└─────────────────┘  └─────────────────┘  - Provides a unified, chainable API.
  Core Logic Layer (packages/core)
  - Defines DSL (Tasks, Recipes).
  - Manages state via event sourcing.
  - Extensible module and integration system.
```

## 4. Key Packages & Applications

### 4.1. `@xec-sh/cli` (Application)

- **Location**: `apps/xec`
- **Description**: The main entry point for users. It's a powerful CLI built with `commander.js`.
- **Key Features**:
    - **Dynamic Commands**: Users can add their own commands by placing files in a `.xec/commands/` directory.
    - **Xec Scripts**: A `zx`-like scripting experience for automation tasks.
    - **Interactive Prompts**: Uses `@clack/prompts` for a better user experience.
    - **Project Isolation**: Uses a `.xec/` directory to store project-specific configurations, recipes, and scripts.

### 4.2. `@xec-sh/core` (Package)

- **Location**: `packages/core`
- **Description**: The brain of the system. It handles the execution and automation logic.
- **Key Concepts**:
    - **DSL**: A Domain Specific Language with `Task` (a unit of work) and `Recipe` (a collection of tasks).
    - **State Management**: Uses event sourcing for an auditable and immutable state history.
    - **Module System**: Extensible through registries for tasks, helpers, patterns, and integrations.
    - **Integrations**: Adapters for external systems like AWS, Kubernetes, and a direct integration with `@xec-sh/core`.

### 4.3. `@xec-sh/core` (Package)

- **Location**: `packages/ush`
- **Description**: A "Universal Shell" execution engine inspired by Google's `zx`.
- **Key Features**:
    - **Adapter Pattern**: Supports different execution contexts (local, SSH, Docker) through a clean adapter interface.
    - **Template Literal API**: Offers an intuitive `$`-based API for running commands, with automatic argument escaping.
    - **Configuration**: Chainable API for setting environment variables, timeouts, and current working directory.
    - **Error Handling**: Provides custom, detailed error classes.

### 4.4. `@xec-sh/docs` (Application)

- **Location**: `docs`
- **Description**: The official documentation website built with Docusaurus.
- **Features**:
    - **Internationalization (i18n)**: Supports English and Russian.
    - **Content**: Contains guides, tutorials, API references, and conceptual documentation for all packages.
    - **Deployment**: Deployed automatically to GitHub Pages via GitHub Actions.

## 5. Development Workflow

### 5.1. Setup

The project uses Yarn 4. Make sure you have `corepack` enabled.

```bash
# Enable corepack to manage package manager versions
corepack enable

# Install all dependencies from the root directory
yarn install
```

### 5.2. Common Commands

All commands should be run from the root of the monorepo. `turbo` is used to run scripts across packages efficiently.

```bash
# Build all packages and apps
yarn build

# Run all tests
yarn test

# Run tests in development (watch) mode
yarn dev

# Run linter across the codebase
yarn lint

# Automatically fix linting and formatting issues
yarn fix:all

# Start the documentation website in development mode
yarn docs:start
```

### 5.3. Making Changes

1.  **Identify the right package**: Determine which layer (`ush`, `core`, or `cli`) your change belongs to.
2.  **Follow existing patterns**: Adhere to the established coding style, architecture, and testing patterns within the target package.
3.  **Add tests**: Each package has a `test/` directory. New features or bug fixes must be accompanied by tests.
4.  **Update documentation**: If the change affects users, update the relevant documentation in `docs` and any relevant `CLAUDE.md` or `README.md` files.

## 6. Testing Strategy

- **Unit Tests**: Each package has its own unit tests to verify individual components in isolation.
    - `@xec-sh/core` uses `vitest`.
    - `@xec-sh/cli` and `@xec-sh/core` use `jest`.
- **Integration Tests**: Test the interactions between different packages (e.g., `cli` using `core`).
- **Test Location**: Tests are located in the `test/` directory of each package. **Do not** create tests inside the `src/` directory.
- **Mocking**: Mocks should be avoided where possible in favor of testing against real implementations. Use mocks only for external services or to simulate hard-to-reproduce errors.

## 7. Build System

- **Turborepo**: Used as the high-level build system to manage and cache tasks like `build`, `test`, and `lint`.
- **TypeScript**: The entire codebase is written in TypeScript with strict mode enabled. Each package has its own `tsconfig.json`.
- **Yarn Workspaces**: Manages dependencies and links local packages together.
- **ESLint & Prettier**: Used for code quality and consistent formatting. Configuration is at the root (`eslint.config.js`, `prettier.config.js`).
- **Lefthook**: Used for git hooks to enforce quality standards before commits.
- **Changesets**: Used for versioning and publishing packages.
