# Xec Documentation

Official documentation for the **Xec Universal Command Execution System** - a unified TypeScript API for seamless command execution across local, SSH, Docker, and Kubernetes environments.

## 🌐 Live Documentation

Visit [xec.sh](https://xec.sh) for the full documentation experience.

## 📚 Documentation Structure

```
docs/
├── introduction/           # Getting started & core concepts
│   ├── what-is-xec.md     # Universal command execution system
│   ├── quick-start.md     # 5-minute introduction
│   ├── installation.md    # Installation methods
│   ├── core-concepts.md   # Execution engine, adapters, targets
│   └── architecture.md    # System architecture overview
├── execution-engine/      # Core execution engine (@xec-sh/core)
│   ├── template-literals.md  # $`command` syntax
│   ├── adapters/          # Multi-environment adapters
│   └── features/          # Advanced capabilities
├── commands/              # CLI commands reference
│   ├── built-in/          # Core commands
│   ├── custom/            # Creating custom commands
│   └── cli-reference.md   # Complete CLI reference
├── configuration/         # Configuration system
│   ├── config-file.md     # .xec/config.yaml structure
│   ├── targets/           # Target definitions
│   └── tasks/             # Task automation
├── api/                   # API documentation
├── changelog/             # Version history
└── i18n/                  # Internationalization
    └── ru/                # Russian translation
```

## 🚀 Development

### Prerequisites

```bash
# Enable pnpm
corepack enable

# Install dependencies
pnpm install
```

### Local Development

```bash
# Start development server with hot reload
pnpm start

# The site opens at http://localhost:3000
```

### Production Build

```bash
# Build static site
pnpm build

# Test production build locally
pnpm serve
```

## ✍️ Writing Documentation

### Documentation Standards

Following the **Surgical Precision Requirement** from our docs-spec:

1. **No approximations** - Every behavior must be described exactly as implemented
2. **Code verification** - All examples must be tested against actual implementation
3. **Complete enumeration** - All possible values, options, and their effects must be documented
4. **Implementation-based** - Documentation must reflect the actual code behavior

### Page Template

```markdown
---
title: Feature Name
description: One-line description
keywords: [tag1, tag2, tag3]
source_files:
  - packages/core/src/feature.ts
key_functions:
  - functionName()
verification_date: 2025-08-03
---

# Feature Name

## Implementation Reference

**Source Files:**
- `packages/core/src/feature.ts` - Main implementation

**Key Functions:**
- `functionName()` - Description (lines X-Y)

## Overview

Brief description of the feature.

## Examples

\`\`\`typescript
// Verified example
await $\`command\`;
\`\`\`

## API Reference

Complete API documentation...
```

### Features

- **🎨 Syntax Highlighting** - TypeScript, JavaScript, Bash, YAML, and more
- **📊 Mermaid Diagrams** - Architecture and flow diagrams
- **🔍 Local Search** - Full-text search with docusaurus-search-local
- **🌍 Internationalization** - English and Russian support
- **📝 MDX Support** - React components in Markdown
- **🎯 Admonitions** - Notes, warnings, tips, and info boxes

### Code Examples

Always verify examples against implementation:

```typescript
// ✅ Good - Verified against actual API
await $.docker({ container: 'app' })`npm test`;

// ❌ Bad - Hypothetical API
await $.docker.run('app').command('npm test');
```

## 🌐 Deployment

### Automatic Deployment

Pushes to `main` branch automatically deploy via GitHub Actions.

### Manual Deployment

```bash
# Deploy to GitHub Pages
GIT_USER=<github-username> pnpm deploy
```

## ⚙️ Configuration

### Site Configuration

- **Production URL**: https://xec.sh
- **Base URL**: `/`
- **Organization**: xec-sh
- **Project**: xec

### Search Configuration

Local search powered by `@easyops-cn/docusaurus-search-local`:
- **Languages**: English, Russian
- **Index Blogs**: false
- **Highlight Search Terms**: true

### Theme Configuration

- **Primary Color**: `#2e8555`
- **Dark Mode**: Enabled
- **Code Theme**: Prism with TypeScript support
- **Navbar**: Fixed with version dropdown
- **Footer**: Links to GitHub, Discord, documentation

## 📋 Content Guidelines

### v0.8.0 Documentation Standards

1. **Implementation References** - Every page must reference source files
2. **Verified Examples** - All code examples tested against v0.8.0
3. **Complete Coverage** - All CLI commands, API methods, and options documented
4. **Performance Metrics** - Based on actual measurements, not estimates

### Documentation Types

1. **Conceptual** - Explain what and why
2. **Procedural** - Step-by-step guides
3. **Reference** - Complete API documentation
4. **Examples** - Real-world use cases

## 🤝 Contributing

### Adding Documentation

1. Create new `.md` file in appropriate directory
2. Add frontmatter with metadata
3. Write content following standards
4. Test all code examples
5. Submit PR with verification notes

### Translations

To add a new language:

1. Copy `i18n/en` to `i18n/<lang>`
2. Translate content files
3. Update `docusaurus.config.js` with locale
4. Test language switching

## 📊 Analytics

The site includes:
- Page view tracking
- Search query analysis
- Popular content identification
- User journey mapping

## 🐛 Troubleshooting

### Common Issues

**Build fails with module errors:**
```bash
pnpm store prune
rm -rf node_modules
pnpm install
```

**Search not working:**
```bash
pnpm build
pnpm serve  # Test with production build
```

**Broken links:**
```bash
pnpm build  # Will report broken links
```

## 📄 License

MIT © [Xec Contributors](https://github.com/xec-sh/xec/graphs/contributors)

---

<div align="center">
  <strong>Documentation for the Universal Command Execution System</strong>
  <br>
  <sub>Making infrastructure automation universal, type-safe, and delightful</sub>
</div>