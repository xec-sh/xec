# Xec documentation

Source for [xec.sh](https://xec.sh), built with Docusaurus. Contains the guides, API references, and examples for the Xec packages.

## Develop

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm docs:start
```

The development server runs at `http://localhost:3000` with hot reload.

## Verify

```sh
pnpm docs:check
pnpm --dir website typecheck
pnpm docs:build
pnpm docs:serve
```

Example checks validate documented APIs against source declarations. The production build checks links and anchors; inspect layout and interaction in the browser as well.

## Structure

| Path | Content |
| --- | --- |
| `docs/introduction` | Installation and architecture |
| `docs/core`, `docs/targets`, `docs/api` | Execution contracts and API reference |
| `docs/commands`, `docs/configuration`, `docs/scripting` | CLI and project workflows |
| `docs/ops`, `docs/kit` | Orchestration and terminal UI |
| `docs/guides`, `docs/recipes`, `docs/integrations` | Applied examples |
| `src` | Site components and styling |

Keep examples executable, describe actual behavior and limitations, and update documentation with the corresponding API change. Link to the authoritative reference instead of duplicating long option lists. Mermaid diagrams and local English search are enabled.

## Deploy

The [Pages workflow](../.github/workflows/deploy-website.yml) builds and deploys eligible changes to `main`. Its checks and path filters define the deployment trigger.

[Project overview](../README.md) · [MIT license](../LICENSE)
