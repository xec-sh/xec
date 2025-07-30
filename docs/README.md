# Xec Documentation

Official documentation website for the Xec Universal Command Execution System, built with Docusaurus.

## Development

```bash
# Install dependencies
yarn install

# Start development server
yarn start

# Build for production
yarn build

# Test production build
yarn serve
```

## Structure

```
docs/              # English documentation
├── intro.md       # Introduction
├── getting-started/   # Quick start guides
├── projects/      # Package documentation
│   ├── core/      # @xec-sh/core docs
│   └── cli/       # @xec-sh/cli docs
i18n/              # Translations
└── ru/            # Russian translation
```

## Writing Documentation

### Page Structure

```markdown
---
sidebar_position: 1
---

# Title

Brief description.

## Section

Content with examples.
```

### Features

- **Code Blocks** - Syntax highlighting for multiple languages
- **Mermaid Diagrams** - Flowcharts and diagrams support
- **Math Support** - KaTeX for mathematical expressions
- **MDX Components** - React components in Markdown
- **Internationalization** - Multi-language support

## Deployment

The site is deployed to GitHub Pages at [xec.sh](https://xec.sh).

### Automatic Deployment

Pushes to `main` branch trigger deployment via GitHub Actions.

### Manual Deployment

```bash
GIT_USER=<username> yarn deploy
```

## Configuration

- **URL**: https://xec.sh
- **Base URL**: `/`
- **Languages**: English (default), Russian
- **Theme**: Classic with custom styling

## License

MIT