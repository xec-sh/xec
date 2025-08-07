# @xec-sh/kit Examples

This directory contains examples demonstrating various features of @xec-sh/kit.

## Running Examples

Examples are written in TypeScript and need to be transpiled before running. Use the following command:

```bash
# From the kit package directory
yarn example examples/<category>/<example-name>.ts

# For example:
yarn example examples/reactive/reactive-form.ts
yarn example examples/basic/simple-prompts.ts
yarn example examples/cli-tool/todo-cli.ts
```

## Example Categories

### basic/
Basic prompt examples demonstrating fundamental kit features.

### reactive/
Examples showcasing the reactive system with real-time validation and computed values.

### advanced/
Complex examples using advanced components like tables, forms, and file pickers.

### cli-tool/
Complete CLI application examples.

### showcase/
Feature showcases and demonstrations.

## Interactive Examples

Most examples are interactive and will prompt for user input. Use:
- Arrow keys to navigate
- Enter to select/submit
- Ctrl+C to cancel