# Xec Documentation Site

This is the official documentation website for the Xec Universal Command Execution Platform, built with [Docusaurus 3.8.1](https://docusaurus.io/).

## 🚀 Quick Start

### Installation

```bash
# From the root of the monorepo
cd apps/docs
yarn install
```

### Local Development

```bash
# Start the development server
yarn start

# The site will be available at http://localhost:3000
```

### Build

```bash
# Build the static site
yarn build

# Test the production build locally
yarn serve
```

## 🌐 Internationalization

The documentation supports two languages:
- English (default)
- Russian

### Working with Translations

```bash
# Write new translation files
yarn write-translations

# Update heading IDs
yarn write-heading-ids
```

## 📁 Project Structure

```
apps/docs/
├── docs/                # English documentation
│   ├── intro.md
│   ├── getting-started/
│   ├── guides/
│   └── api/
├── i18n/               # Internationalization
│   └── ru/             # Russian translations
├── src/                # React components and pages
│   ├── components/
│   ├── css/
│   └── pages/
├── static/             # Static assets
│   └── img/
├── docusaurus.config.ts
└── sidebars.ts
```

## 🎨 Customization

### Theme Configuration

The site uses the classic Docusaurus theme with custom styling. Main customizations are in:
- `src/css/custom.css` - Global styles and CSS variables (including Mermaid and KaTeX styling)
- `docusaurus.config.ts` - Site configuration

### Enhanced Features

The documentation includes several enhanced features:

1. **Mermaid Diagrams**: Create flowcharts, sequence diagrams, and more
   ```markdown
   ```mermaid
   graph TD
       A[Start] --> B[End]
   ```
   ```

2. **Math Formulas**: Write mathematical expressions
   - Inline: `$E = mc^2$`
   - Block: `$$\int_0^1 x^2 dx = \frac{1}{3}$$`

3. **Image Optimization**: Automatic responsive image generation
4. **Sitemap Generation**: SEO-friendly sitemap at `/sitemap.xml`

See the [Features Demo](/docs/examples/features-demo) for live examples.

### Adding New Documentation

1. Create a new `.md` or `.mdx` file in the appropriate directory
2. Add front matter with metadata:
   ```markdown
   ---
   id: unique-id
   title: Page Title
   sidebar_position: 1
   ---
   ```
3. Update `sidebars.ts` if needed

### Adding Translations

1. Create the corresponding file in `i18n/ru/docusaurus-plugin-content-docs/current/`
2. Translate the content
3. Update `i18n/ru/code.json` for UI strings

## 🚀 Deployment

The site is automatically deployed to GitHub Pages with a custom domain.

### Configuration

- **Production URL**: https://xec.sh
- **Base URL**: `/` (root path for custom domain)
- **Custom Domain**: `xec.sh` (configured via CNAME file)

### GitHub Pages Setup

1. **Automatic Deployment**: Changes to `main` branch trigger deployment via GitHub Actions (`.github/workflows/deploy-docs.yml`)
2. **Custom Domain**: The `static/CNAME` file contains `xec.sh` and is copied to the build directory
3. **DNS Configuration**: Your domain's DNS should have:
   - A record pointing to `185.199.108.153`
   - A record pointing to `185.199.109.153`
   - A record pointing to `185.199.110.153`
   - A record pointing to `185.199.111.153`
   - CNAME record for `www` pointing to `xec-sh.github.io`

### Important: Base URL Configuration

The `baseUrl` in `docusaurus.config.ts` depends on your deployment method:
- **With custom domain** (xec.sh): Use `baseUrl: '/'`
- **Without custom domain** (xec-sh.github.io/xec): Use `baseUrl: '/xec/'`

Current configuration uses the custom domain setup.

### Manual Deployment

```bash
# Build and deploy to GitHub Pages
GIT_USER=<GITHUB_USERNAME> yarn deploy
```

### Automatic Deployment

The site is automatically deployed using GitHub Actions when:
- Changes are pushed to the `main` branch
- Changes affect files in `apps/docs/**`
- The workflow is manually triggered

## 📝 Writing Guidelines

### Markdown Features

- Use front matter for page metadata
- Support for MDX components
- Code blocks with syntax highlighting
- Admonitions (:::note, :::tip, :::warning, etc.)
- Tabs for code examples
- **Mermaid diagrams** for flowcharts, sequence diagrams, etc.
- **Mathematical formulas** using KaTeX syntax
- **Optimized images** with automatic responsive generation
- **Collapsible sections** using `<details>` tags
- **Keyboard shortcuts** with `<kbd>` tags

### Best Practices

1. **Clear Structure**: Use proper heading hierarchy
2. **Code Examples**: Provide practical, runnable examples
3. **Cross-references**: Link to related documentation
4. **Consistency**: Follow the established style guide
5. **Accessibility**: Include alt text for images

## 🔧 Configuration

### Search

The site is pre-configured for Algolia DocSearch. To enable:
1. Apply for DocSearch at https://docsearch.algolia.com/
2. Update the Algolia configuration in `docusaurus.config.ts`

### Analytics

To add analytics:
1. Install the appropriate plugin
2. Configure in `docusaurus.config.ts`

## 🐛 Troubleshooting

### Common Issues

1. **Build errors**: Clear the cache with `yarn clear`
2. **Translation issues**: Run `yarn write-translations`
3. **Module errors**: Ensure you're using Node.js 18+

### GitHub Pages Issues

**Problem: Only styles.css is visible on GitHub Pages**

This typically means the `baseUrl` is misconfigured:

1. Check `docusaurus.config.ts`:
   - For custom domain (xec.sh): `baseUrl: '/'`
   - For GitHub subdomain: `baseUrl: '/xec/'`

2. Ensure `static/CNAME` exists with your custom domain

3. Verify the build output:
   ```bash
   yarn build
   ls -la build/  # Should show index.html, assets/, docs/, etc.
   ```

4. Check GitHub Pages settings in your repository

### Development Tips

- Use `yarn typecheck` to check TypeScript types
- The site hot-reloads during development
- Check the browser console for errors
- Test production build locally with `yarn build && yarn serve`

## 📚 Resources

- [Docusaurus Documentation](https://docusaurus.io/)
- [MDX Documentation](https://mdxjs.com/)
- [Infima CSS Framework](https://infima.dev/)

## 📄 License

The documentation is licensed under MIT, same as the main Xec project.