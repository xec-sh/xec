# Xec Documentation Site

## Overview
This is the official documentation website for the Xec Universal Command Execution Platform, built with Docusaurus 3.8.1.

## Quick Commands
```bash
# Development
yarn start              # Start dev server on http://localhost:3000
yarn build             # Build static site
yarn serve             # Serve production build locally

# Translations
yarn write-translations # Generate translation files
yarn write-heading-ids  # Update heading IDs

# Deployment
yarn deploy            # Deploy to GitHub Pages
```

## Project Structure
```
apps/docs/
├── docs/                      # English documentation (main content)
│   ├── intro.md              # Introduction page
│   ├── overview.md           # Platform overview
│   ├── getting-started/      # Getting started guides
│   ├── guides/               # In-depth guides
│   │   ├── cli/             # CLI documentation
│   │   ├── core/            # Core framework docs
│   │   └── ush/             # USH documentation
│   ├── tutorials/            # Step-by-step tutorials
│   ├── api/                  # API reference
│   │   ├── cli/             # CLI API docs
│   │   ├── core/            # Core API docs
│   │   └── ush/             # USH API docs
│   └── reference/            # Reference materials
├── i18n/                     # Internationalization
│   └── ru/                   # Russian translations
├── src/                      # React components and pages
│   ├── components/           # Reusable components
│   │   └── HomepageFeatures/ # Feature showcase component
│   ├── css/                  # Global styles
│   │   └── custom.css       # Theme customization
│   └── pages/               # Custom pages
│       └── index.tsx        # Homepage
├── static/                   # Static assets
│   └── img/                 # Images and icons
├── docusaurus.config.ts     # Main configuration
├── sidebars.ts              # Sidebar configuration
└── package.json             # Dependencies
```

## Key Features

### 1. Internationalization (i18n)
- **Languages**: English (default) and Russian
- **Translation files**: Located in `i18n/ru/`
- **UI strings**: Defined in `i18n/ru/code.json`
- **Content**: Mirrored structure in `i18n/ru/docusaurus-plugin-content-docs/`

### 2. Theme Customization
- **Color scheme**: Blue primary color (#2563eb)
- **Dark mode**: Fully supported with automatic detection
- **Custom CSS**: Variables defined in `src/css/custom.css`
- **Logo**: Separate light/dark versions

### 3. Navigation Structure
- **Main navbar**: Guides, API dropdown, Blog, Version selector, Language selector
- **Sidebars**: Separate sidebars for guides and each API package
- **Footer**: Three-column layout with links

### 4. Homepage
- **Hero section**: Gradient background with quick start code
- **Features**: Three main features with custom SVG icons
- **Ecosystem**: Cards for each package (@xec-sh/cli, core, ush)
- **Use cases**: Grid layout showcasing different scenarios
- **CTA section**: Call-to-action with buttons

## Configuration Details

### Docusaurus Config (`docusaurus.config.ts`)
- **URL**: https://xec-js.github.io/xec/
- **Base URL**: /xec/ (for GitHub Pages)
- **Organization**: xec-js
- **Features**: Blog, docs versioning, i18n

### Sidebars (`sidebars.ts`)
- **guideSidebar**: Main documentation structure
- **cliSidebar**: CLI-specific documentation
- **coreSidebar**: Core package documentation
- **ushSidebar**: USH package documentation

### Styling
- **Font**: Inter for UI, monospace for code
- **Shadows**: Custom shadow variables for depth
- **Cards**: Hover effects and transitions
- **Code blocks**: Syntax highlighting with Prism

## Writing Guidelines

### Documentation Standards
1. **Front matter**: Always include id, title, and sidebar_position
2. **Headers**: Use proper hierarchy (# for title, ## for sections)
3. **Code examples**: Provide practical, runnable examples
4. **Links**: Use relative links for internal navigation
5. **Images**: Store in static/img with descriptive names

### Content Types
- **Guides**: How-to articles with step-by-step instructions
- **Tutorials**: Complete projects from start to finish
- **Reference**: Technical specifications and API details
- **Concepts**: Explanations of core ideas and architecture

### Translations
1. Mirror the English file structure in i18n/ru/
2. Translate all content, including code comments
3. Keep technical terms consistent
4. Update UI strings in code.json

## Deployment

### GitHub Pages Setup
1. Repository settings > Pages > Source: GitHub Actions
2. Workflow file: `.github/workflows/deploy-docs.yml`
3. Automatic deployment on push to main branch

### Manual Deployment
```bash
GIT_USER=<username> yarn deploy
```

## Common Tasks

### Adding a New Page
1. Create .md file in appropriate directory
2. Add front matter with metadata
3. Update sidebars.ts if needed
4. Create Russian translation

### Adding a Component
1. Create component in src/components/
2. Use TypeScript for type safety
3. Follow existing naming conventions
4. Import in pages as needed

### Updating Translations
1. Run `yarn write-translations`
2. Edit generated files in i18n/
3. Test with language switcher

## Troubleshooting

### Build Issues
- Clear cache: `yarn clear`
- Check Node version (18+)
- Verify all imports

### Translation Issues
- Ensure file paths match exactly
- Check for missing translations in code.json
- Verify locale configuration

### Styling Issues
- Check CSS module imports
- Verify theme variables
- Test in both light/dark modes

## Future Enhancements
- [ ] Algolia DocSearch integration
- [ ] Analytics setup
- [ ] More language support
- [ ] Video tutorials
- [ ] Interactive examples
- [ ] API playground