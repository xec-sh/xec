import '@omnitron-dev/prism/components/research/styles.css';
import './site.css';

import { createRoot } from 'react-dom/client';
import React, { useState, useEffect } from 'react';
import { LumenShell } from '@omnitron-dev/lumen-ui/runtime';
import { LumenSearchDialog } from '@omnitron-dev/lumen-ui/search';
import { DocSectionNav, MermaidDiagram } from '@omnitron-dev/lumen-ui';
import { PrismProvider, usePrismContext } from '@omnitron-dev/prism/core';

import { xecTheme, readTheme } from './theme.ts';
import { ExecutionExplorer } from './execution-explorer.tsx';
import { OpenSearch, SearchPage, SearchTrigger, ThemeSelector } from './controls.tsx';

const islands = { DocSectionNav, MermaidDiagram, SearchTrigger, SearchPage, ThemeSelector, ExecutionExplorer };
function Content() {
  const { theme } = usePrismContext();
  const searchRoute = location.pathname.replace(/\/$/, '') === '/search';
  const [searchOpen, setSearchOpen] = useState(searchRoute);
  useEffect(() => {
    document.documentElement.dataset.xecTheme = theme.palette.mode;
    document.documentElement.style.colorScheme = theme.palette.mode;
  }, [theme.palette.mode]);
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
        {searchOpen && (
          <div
            className="search-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget) setSearchOpen(false);
            }}
          >
            <LumenSearchDialog
              open
              onClose={() => setSearchOpen(false)}
              pagefindUrl="/pagefind/pagefind.js"
              initialQuery={searchRoute ? (new URLSearchParams(location.search).get('q') ?? '').slice(0, 256) : ''}
              maxResults={12}
            />
          </div>
        )}
      </LumenShell>
    </OpenSearch.Provider>
  );
}
function Client() {
  const [mode, setMode] = useState(readTheme);
  useEffect(() => {
    try {
      localStorage.setItem('xec-theme', mode);
    } catch {
      /* The choice still applies to this page. */
    }
    const sync = (event: StorageEvent) => {
      if (event.key === 'xec-theme' || event.key === null) setMode(readTheme());
    };
    addEventListener('storage', sync);
    return () => removeEventListener('storage', sync);
  }, [mode]);
  return (
    <PrismProvider mode={mode} onModeChange={setMode} themeOverrides={xecTheme} disableCssBaseline>
      <Content />
    </PrismProvider>
  );
}
const host = document.getElementById('xec-interactive-root');
if (host) createRoot(host).render(<Client />);
