import type { LumenSidebarItem, LumenPageLayoutProps } from '@omnitron-dev/lumen';

import React from 'react';
import { Link, Button } from '@omnitron-dev/prism/ui';
import { PortalIslandHost } from '@omnitron-dev/lumen-ui/runtime';
import { PrismProvider, PrismThemeScript } from '@omnitron-dev/prism/core';
import { DocSidebar, type DocSidebarItem } from '@omnitron-dev/prism/components/doc-layout';
import { DocLayout, LumenFooter, DocPagination, DocSectionNav } from '@omnitron-dev/lumen-ui';

import { Home } from './home.tsx';
import { xecTheme } from './theme.ts';
import { SearchTrigger, ThemeSelector } from './controls.tsx';
import { mainItems, MainNavigation, MobileNavigation } from './navigation.tsx';

export function SiteLayout({ children, document: doc, documents, config }: LumenPageLayoutProps) {
  const byId = new Map(documents.map((item) => [item.id, item]));
  const byRoute = new Map(documents.map((item) => [item.routePath, item]));
  const items = config.sidebars.docs ?? [];
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
  const sidebarItems = (entries: LumenSidebarItem[], parent = 'root'): DocSidebarItem[] => entries.map((item, itemIndex) => {
    const id = `${parent}/${itemIndex}`;
    if (item.type === 'category') {
      const landing = item.href ? byRoute.get(item.href) : undefined;
      return { id, label: item.label, children: [
        ...(item.href ? [{ id: landing?.id ?? `${id}/overview`, label: 'Overview', href: item.href }] : []),
        ...sidebarItems(item.items, id),
      ] };
    }
    const target = item.type === 'doc' ? byId.get(item.id) : undefined;
    const href = item.type === 'link' ? item.href : target?.routePath;
    if (!href) throw new Error(`Missing sidebar document: ${JSON.stringify(item)}`);
    return { id: target?.id ?? id, href, label: item.label || target?.title || href };
  });
  const sidebarProps = { items: sidebarItems(items), activeId: doc.id, title: 'The Xec manual' };
  const headings = (doc.headers ?? [])
    .filter((item) => item.depth === 2 || item.depth === 3)
    .map((item) => ({ ...item, level: item.depth }));
  const home = doc.frontmatter?.layout === 'home';
  const page = doc.id.startsWith('page:');
  return (
    <PrismProvider modeStorageKey="xec-theme" themeOverrides={xecTheme}>
      <link rel="icon" href="/img/favicon.svg" type="image/svg+xml" />
      <PrismThemeScript modeStorageKey="xec-theme" />
      <div className="xec-site">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header className="site-header">
          <a className="brand" href="/" aria-label="Xec home">
            <span>
              xec<span className="brand-period">.</span>
            </span>
          </a>
          <MainNavigation currentPath={doc.routePath} />
          <div className="header-actions">
            <PortalIslandHost islandId="search" component="SearchTrigger" hydrate="load" props={{}}>
              <SearchTrigger />
            </PortalIslandHost>
            <PortalIslandHost islandId="theme" component="ThemeSelector" hydrate="load" props={{}}>
              <ThemeSelector />
            </PortalIslandHost>
            <Button className="source-link" component="a" href="https://github.com/xec-sh/xec" target="_blank" rel="noopener noreferrer" size="small">
              GitHub ↗
            </Button>
          </div>
          <div className="mobile-nav">
            <PortalIslandHost islandId="main-navigation" component="MobileNavigation" hydrate="load"
              props={{ items: mainItems, activeId: doc.routePath, title: 'Navigation', label: 'Open navigation', iconOnly: true }}>
              <MobileNavigation items={mainItems} activeId={doc.routePath} title="Navigation" label="Open navigation" iconOnly disabled />
            </PortalIslandHost>
          </div>
        </header>
        <noscript><div className="static-navigation"><MainNavigation currentPath={doc.routePath} /></div></noscript>
        {home ? (
          <Home />
        ) : (
          <>
            <div className="document-context">
              <Link href="/docs/introduction">Documentation</Link>
              <span>/</span>
              <strong>{doc.title}</strong>
            </div>
            {!page && (
              <div className="mobile-document-nav">
                <PortalIslandHost islandId="section-navigation" component="MobileNavigation" hydrate="load"
                  props={{ ...sidebarProps, label: 'Browse documentation' }}>
                  <MobileNavigation {...sidebarProps} label="Browse documentation" disabled />
                </PortalIslandHost>
                <noscript><nav aria-label="Mobile documentation"><DocSidebar {...sidebarProps} /></nav></noscript>
              </div>
            )}
            <DocLayout
              sidebar={
                !page && (
                  <nav aria-label="Documentation sections">
                    <PortalIslandHost islandId="documentation-navigation" component="DocSidebar" hydrate="load" props={sidebarProps}>
                      <DocSidebar {...sidebarProps} />
                    </PortalIslandHost>
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
                      <Link href={`${doc.routePath}.md`} target="_blank" rel="noopener noreferrer">Read Markdown ↗</Link>
                      <Link href="/llms.txt" target="_blank" rel="noopener noreferrer">Agent index ↗</Link>
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
                { label: 'GitHub ↗', href: 'https://github.com/xec-sh/xec', external: true },
                { label: 'npm ↗', href: 'https://www.npmjs.com/package/@xec-sh/cli', external: true },
                { label: 'Lumen ↗', href: 'https://omnitron.dev/docs/lumen/overview', external: true },
              ],
            },
          ]}
        />
        <div className="site-colophon">
          <span>MADE FOR BUILDERS.</span>
          <span>Static pages. Local search. Built with <Link href="https://omnitron.dev/" target="_blank" rel="noopener noreferrer">Lumen + Prism</Link>.</span>
        </div>
        <div id="xec-interactive-root" />
      </div>
    </PrismProvider>
  );
}
