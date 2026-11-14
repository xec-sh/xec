# Xec documentation

The source for [xec.sh](https://xec.sh). Built with **Lumen 0.4.8** and **Prism 0.4.8**, using published npm packages.

## Develop

From the repository root:

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

Xec runs the production build and its route checks. Lumen compiles Markdown, highlights code, verifies links and builds the Pagefind search index. The route contract preserves 153 published documentation URLs and their section anchors. Browser tests cover desktop/mobile navigation, all six example tabs, copy feedback, persistent light/dark/system themes, search and the active section indicator.

## Structure

| Path | Responsibility |
| --- | --- |
| `docs/` | Guides, API references and executable examples |
| `pages/` | Homepage and search routes |
| `lumen.config.ts` | Canonical Lumen configuration; broken links and anchors fail the build |
| `src/site/` | Xec identity and layouts built from Prism and Lumen components |
| `src/data/examples.json` | The exact copyable TypeScript examples shown on the homepage |
| `src/data/sidebars.json` | Documentation navigation |
| `src/data/route-contract.json` | Published URL and section-anchor contract |
| `scripts/build.ts` | Xec orchestration of compilation and route verification |
| `tests/` | Browser acceptance checks |

The homepage switches between real source examples; it does not execute shell commands in the browser. Library APIs, CLI entry points and platform prerequisites stay explicit. The site uses static HTML and selective Lumen islands; it requires no application server.

## Deploy

The [Pages workflow](../.github/workflows/deploy-website.yml) verifies eligible changes and deploys `website/build` to the existing `xec.sh` custom domain. Pull requests build and test without deploying. `pnpm docs:deploy` dispatches that same workflow; there is no separate local deployment implementation.

[Project overview](../README.md) · [MIT license](../LICENSE)
