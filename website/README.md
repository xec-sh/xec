# Xec documentation

Lumen builds the guides, API reference and executable examples for xec.sh. Prism supplies the shared theme. The website manifest and workspace lockfile pin the published packages used locally and on GitHub Pages. [Website dependencies](./package.json)

## Develop

Run these commands from the repository root.

```sh
pnpm install --frozen-lockfile
pnpm docs:start
```

Lumen serves the site with live source updates. The terminal prints its local address.

## Verify

```sh
pnpm docs:check
pnpm --dir website typecheck
pnpm docs:build
pnpm --dir website test:examples
pnpm --dir website exec playwright install chromium
pnpm --dir website test:browser
```

The workspace pins a parser fix for the copy of picomatch 4.0.7 used by its own build tools. Lumen carries the fix in its bundled compiler. Recheck both distributions when upgrading the matcher. [Reviewed patch](../patches/picomatch@4.0.7.patch)

Xec runs the production build and its route checks. Lumen compiles Markdown, highlights code, verifies links and builds the Pagefind search index. The route contract verifies the published documentation URLs and their section anchors. Browser tests cover desktop/mobile navigation, all six example tabs, copy feedback, persistent light/dark/system themes, search and the active section indicator.

## Structure

| Path | Responsibility |
| --- | --- |
| `docs/` | Guides, API references and executable examples |
| `pages/` | Homepage and search routes |
| `lumen.config.ts` | Lumen site configuration and link validation |
| `src/site/` | Xec identity and layouts built from Prism and Lumen components |
| `src/data/examples.json` | The exact copyable TypeScript examples shown on the homepage |
| `src/data/sidebars.json` | Documentation navigation |
| `src/data/route-contract.json` | Published URL and section-anchor contract |
| [Xec project tasks](../.xec/config.yaml) | The `docs:build` task compiles the site and checks its routes |
| `tests/` | Browser acceptance checks |

The homepage lets readers select and copy real source examples. Static HTML serves each page. Lumen islands enable search, navigation and interactive examples.

Prism applies the saved `xec-theme` preference before the first paint. The server and client use the same provider and palettes. Site CSS maps Xec’s layout tokens to the provider’s variables.

## Deploy

GitHub Pages publishes the verified `website/build` directory to xec.sh after a change lands on `main`. Pull requests run the build and tests. To trigger the same deployment manually, run `pnpm docs:deploy`. [Pages workflow](../.github/workflows/deploy-website.yml)

[Project overview](../README.md) · [MIT license](../LICENSE)
