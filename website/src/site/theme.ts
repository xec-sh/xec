import type { ThemeMode } from '@omnitron-dev/prism/theme';
import type { PrismThemeOverrides } from '@omnitron-dev/prism/core';

export const xecTheme: PrismThemeOverrides = ({ mode }) => ({
  palette: {
    primary: { main: mode === 'dark' ? '#b8b0ff' : '#5b3fd3' },
    secondary: { main: mode === 'dark' ? '#83e4d2' : '#147d70' },
    background: { default: mode === 'dark' ? '#101116' : '#fafaf7', paper: mode === 'dark' ? '#191b23' : '#ffffff' },
    text: { primary: mode === 'dark' ? '#eeedf4' : '#20202b', secondary: mode === 'dark' ? '#a9abba' : '#626574' },
    divider: mode === 'dark' ? '#30323d' : '#dddde4',
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
  },
});

export function readTheme(): ThemeMode {
  try {
    const value = localStorage.getItem('xec-theme');
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export const themeBootstrap = `(function(){var value;try{value=localStorage.getItem('xec-theme')}catch(_){}var mode=value==='light'||value==='dark'?value:matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';document.documentElement.dataset.xecTheme=mode;document.documentElement.style.colorScheme=mode})();`;
