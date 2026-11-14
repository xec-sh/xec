import type { LumenSidebarItem, LumenPageLayoutProps } from '@omnitron-dev/lumen';

import React from 'react';
import { Button } from '@omnitron-dev/prism/ui';
import { PrismProvider } from '@omnitron-dev/prism/core';
import { PortalIslandHost } from '@omnitron-dev/lumen-ui/runtime';
import { DocLayout, LumenFooter, DocPagination, DocSectionNav } from '@omnitron-dev/lumen-ui';

import { Home } from './home.tsx';
import { xecTheme, themeBootstrap } from './theme.ts';
import { SearchTrigger, ThemeSelector } from './controls.tsx';

const navigation = [
  ['Learn', '/docs/introduction'],
  ['Build a CLI', '/docs/commands/overview'],
  ['Orchestrate', '/docs/ops'],
  ['Terminal UI', '/docs/kit'],
  ['Reference', '/docs/commands/cli-reference'],
];
export function SiteLayout({ children, document: doc, documents, config }: LumenPageLayoutProps) {
  const byId = new Map(documents.map((item) => [item.id, item]));
  const byRoute = new Map(documents.map((item) => [item.routePath, item]));
  const items = config.sidebars.docs ?? [];
  const contains = (entries: LumenSidebarItem[]): boolean =>
    entries.some((item) =>
      item.type === 'doc'
        ? item.id === doc.id
        : item.type === 'category' && (item.href === doc.routePath || contains(item.items))
    );
  const flatten = (entries: LumenSidebarItem[]): string[] =>
    entries.flatMap((item) =>
      item.type === 'doc'
        ? [item.id]
        : item.type === 'category'
          ? [...(item.href && byRoute.get(item.href) ? [byRoute.get(item.href)!.id] : []), ...flatten(item.items)]
          : []
    );
  const ordered = [...new Set(flatten(items))].map((id) => byId.get(id));
  const index = ordered.findIndex((item) => item?.id === doc.id);
  const adjacent = (item: typeof doc | undefined) =>
    item?.routePath ? { href: item.routePath, label: item.title } : undefined;
  const sidebar = (entries: LumenSidebarItem[]): React.ReactNode => (
    <ul>
      {entries.map((item, i) => {
        if (item.type === 'category')
          return (
            <li key={i}>
              <details open={item.collapsed === false || item.href === doc.routePath || contains(item.items)}>
                <summary>{item.label}</summary>
                {item.href && (
                  <a
                    className="sidebar-overview"
                    href={item.href}
                    aria-current={item.href === doc.routePath ? 'page' : undefined}
                  >
                    Overview
                  </a>
                )}
                {sidebar(item.items)}
              </details>
            </li>
          );
        const target = item.type === 'doc' ? byId.get(item.id) : undefined;
        const href = item.type === 'link' ? item.href : target?.routePath;
        if (!href) throw new Error(`Missing sidebar document: ${JSON.stringify(item)}`);
        return (
          <li key={i}>
            <a href={href} aria-current={target?.id === doc.id ? 'page' : undefined}>
              {item.label || target?.title}
            </a>
          </li>
        );
      })}
    </ul>
  );
  const headings = (doc.headers ?? [])
    .filter((item) => item.depth === 2 || item.depth === 3)
    .map((item) => ({ ...item, level: item.depth }));
  const home = doc.frontmatter?.layout === 'home';
  const page = doc.id.startsWith('page:');
  return (
    <PrismProvider mode="dark" themeOverrides={xecTheme} disableCssBaseline>
      <link rel="icon" href="/img/favicon.svg" type="image/svg+xml" />
      <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      <div className="xec-site">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header className="site-header">
          <a className="brand" href="/" aria-label="Xec home">
            <img src="/img/logo.svg" alt="" width={32} height={32} />
            <span>
              xec<span className="brand-period">.</span>
            </span>
          </a>
          <nav aria-label="Main navigation">
            {navigation.map(([label, href]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </nav>
          <div className="header-actions">
            <PortalIslandHost islandId="search" component="SearchTrigger" hydrate="load" props={{}}>
              <SearchTrigger />
            </PortalIslandHost>
            <PortalIslandHost islandId="theme" component="ThemeSelector" hydrate="load" props={{}}>
              <ThemeSelector />
            </PortalIslandHost>
            <Button className="source-link" component="a" href="https://github.com/xec-sh/xec" size="small">
              GitHub ↗
            </Button>
          </div>
          <details className="mobile-nav">
            <summary>Menu</summary>
            <nav aria-label="Mobile main navigation">
              {navigation.map(([label, href]) => (
                <a key={href} href={href}>
                  {label}
                </a>
              ))}
            </nav>
          </details>
        </header>
        {home ? (
          <Home />
        ) : (
          <>
            <div className="document-context">
              <a href="/docs/introduction">Documentation</a>
              <span>/</span>
              <strong>{doc.title}</strong>
            </div>
            {!page && (
              <details className="mobile-document-nav">
                <summary>Browse documentation</summary>
                <nav aria-label="Mobile documentation">{sidebar(items)}</nav>
              </details>
            )}
            <DocLayout
              sidebar={
                !page && (
                  <nav aria-label="Documentation sections">
                    <p className="sidebar-label">THE XEC MANUAL</p>
                    {sidebar(items)}
                  </nav>
                )
              }
              sectionNav={
                headings.length > 0 && (
                  <>
                    <p className="sidebar-label">ON THIS PAGE</p>
                    <PortalIslandHost
                      islandId="page-sections"
                      component="DocSectionNav"
                      hydrate="load"
                      props={{ headings }}
                    >
                      <DocSectionNav headings={headings} />
                    </PortalIslandHost>
                    <div className="page-tools">
                      <a href={`${doc.routePath}.md`}>Read Markdown ↗</a>
                      <a href="/llms.txt">Agent index ↗</a>
                    </div>
                  </>
                )
              }
            >
              <div id="main-content" tabIndex={-1}>
                {children}
              </div>
              {index >= 0 && <DocPagination prev={adjacent(ordered[index - 1])} next={adjacent(ordered[index + 1])} />}
            </DocLayout>
          </>
        )}
        <LumenFooter
          copyright="Xec · Open source / MIT"
          columns={[
            {
              title: 'Start',
              items: [
                { label: 'Install', href: '/docs/introduction/installation' },
                { label: 'Quick start', href: '/docs/introduction/quick-start' },
                { label: 'Choose a workflow', href: '/docs/introduction/when-to-use' },
              ],
            },
            {
              title: 'Build',
              items: [
                { label: 'Execution engine', href: '/docs/core/execution-engine/overview' },
                { label: 'Project commands', href: '/docs/commands/custom/creating-commands' },
                { label: 'Kit examples', href: '/docs/kit' },
              ],
            },
            {
              title: 'Connect',
              items: [
                { label: 'GitHub ↗', href: 'https://github.com/xec-sh/xec' },
                { label: 'npm ↗', href: 'https://www.npmjs.com/package/@xec-sh/cli' },
                { label: 'Lumen ↗', href: 'https://omnitron.dev/docs/lumen/overview' },
              ],
            },
          ]}
        />
        <div className="site-colophon">
          <span>MADE FOR BUILDERS.</span>
          <span>Static pages. Local search. Built with Lumen + Prism.</span>
        </div>
        <div id="xec-interactive-root" />
      </div>
    </PrismProvider>
  );
}
