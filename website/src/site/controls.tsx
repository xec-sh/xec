import type { ThemeMode } from '@omnitron-dev/prism/theme';

import { usePrismContext } from '@omnitron-dev/prism/core';
import React, { useState, useContext, createContext } from 'react';
import { Menu, Button, Tooltip, MenuItem, IconButton } from '@omnitron-dev/prism/ui';

import { ThemeIcon, SearchIcon } from './icons.tsx';

export const OpenSearch = createContext<() => void>(() => {});
export function SearchTrigger({ full = false }: { full?: boolean }) {
  const open = useContext(OpenSearch);
  return (
    <Button
      className="search-trigger"
      variant={full ? 'outlined' : 'text'}
      onClick={open}
      startIcon={<SearchIcon />}
      aria-label="Search documentation"
    >
      Search{!full && <kbd>⌘ K</kbd>}
    </Button>
  );
}
export function SearchPage() {
  return <SearchTrigger full />;
}
export function ThemeSelector() {
  const { settings, setMode } = usePrismContext();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const mode = settings.mode;
  return (
    <>
      <Tooltip title={`Color theme: ${mode}`}>
        <IconButton
          aria-label={`Color theme: ${mode}`}
          aria-haspopup="menu"
          aria-expanded={Boolean(anchor)}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <ThemeIcon mode={mode} />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {(['system', 'light', 'dark'] as ThemeMode[]).map((value) => (
          <MenuItem
            key={value}
            selected={mode === value}
            onClick={() => {
              setMode(value);
              setAnchor(null);
            }}
          >
            <ThemeIcon mode={value} sx={{ mr: 1 }} />
            {value[0].toUpperCase() + value.slice(1)}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
