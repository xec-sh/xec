import '@omnitron-dev/prism/components/research/styles.css';
import './site.css';

import { createRoot } from 'react-dom/client';
import React, { useState, useEffect } from 'react';
import { LumenShell } from '@omnitron-dev/lumen-ui/runtime';
import { LumenSearchDialog } from '@omnitron-dev/lumen-ui/search';
import { DocSectionNav, MermaidDiagram } from '@omnitron-dev/lumen-ui';
import { PrismProvider, usePrismContext } from '@omnitron-dev/prism/core';

import { xecTheme } from './theme.ts';
import { ExecutionExplorer } from './execution-explorer.tsx';
import { OpenSearch, SearchPage, SearchTrigger, ThemeSelector } from './controls.tsx';

const islands = { DocSectionNav, MermaidDiagram, SearchTrigger, SearchPage, ThemeSelector, ExecutionExplorer };
function Content() {
  const { theme } = usePrismContext();
  const searchRoute = location.pathname.replace(/\/$/, '') === '/search';
  const [searchOpen, setSearchOpen] = useState(searchRoute);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        ((event.metaKey || event.ctrlKey) && event.key === 'k') ||
        (event.key === '/' && !target?.closest('input,textarea,[contenteditable]'))
      ) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  return (
    <OpenSearch.Provider value={() => setSearchOpen(true)}>
      <LumenShell theme={theme.palette.mode} currentPath={location.pathname} islands={islands} disablePrismProvider>
        <LumenSearchDialog
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          pagefindUrl="/pagefind/pagefind.js"
          initialQuery={searchRoute ? (new URLSearchParams(location.search).get('q') ?? '').slice(0, 256) : ''}
          maxResults={12}
        />
      </LumenShell>
    </OpenSearch.Provider>
  );
}
function Client() {
  return (
    <PrismProvider modeStorageKey="xec-theme" themeOverrides={xecTheme}>
      <Content />
    </PrismProvider>
  );
}
const host = document.getElementById('xec-interactive-root');
if (host) createRoot(host).render(<Client />);
