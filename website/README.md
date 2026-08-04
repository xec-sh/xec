# Xec Documentation Site

Docusaurus site for [xec.sh](https://xec.sh) — the documentation of the Xec
command execution system.

## Development

```bash
# From the repository root
corepack enable
pnpm install

# From website/
pnpm start        # dev server with hot reload at http://localhost:3000
pnpm build        # static production build (also reports broken links)
pnpm serve        # serve the production build locally
pnpm typecheck    # TypeScript check of site code
```

## Content layout

```
docs/
├── introduction/     # What Xec is, quick start, installation
├── core/             # @xec-sh/core: execution engine, adapters
├── targets/          # Target configuration: local, SSH, Docker, Kubernetes
├── commands/         # CLI command reference
├── configuration/    # .xec/config.yaml, tasks, profiles
├── scripting/        # Writing and running scripts
├── api/              # Generated API reference
├── guides/           # Task-oriented guides
├── recipes/          # Short, focused how-tos
├── patterns/         # Larger architectural patterns
├── integrations/     # CI systems and external tooling
├── migration/        # Moving from Make, npm scripts, shell scripts, ...
├── ops/              # @xec-sh/ops documentation
└── cli/              # CLI usage details
```

Mermaid diagrams are enabled (` ```mermaid ` fences). Search is local
(`@easyops-cn/docusaurus-search-local`), English only.

## Writing rules

The documentation standard for this site: every statement must match the
implementation.

1. Verify each code example against the built packages before committing —
   examples that cannot run do not ship.
2. Enumerate option values completely, or link to the source of truth, rather
   than approximating.
3. When a public API changes, its page changes in the same pull request.
4. No superlatives; numbers only where they were measured.

## Deployment

Pushes to `main` that touch `website/**` deploy automatically via
`.github/workflows/deploy-website.yml`. `pnpm build` runs on pull requests as
a check. Manual deployment: `GIT_USER=<github-username> pnpm deploy`.

## License

MIT
