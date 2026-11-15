import type { PrismThemeOverrides } from '@omnitron-dev/prism/core';

export const xecTheme: PrismThemeOverrides = ({ mode }) => ({
  palette: {
    primary: { main: mode === 'dark' ? '#b8b0ff' : '#5b3fd3' },
    secondary: { main: mode === 'dark' ? '#83e4d2' : '#147d70' },
    background: { default: mode === 'dark' ? '#101116' : '#fafaf7', paper: mode === 'dark' ? '#191b23' : '#ffffff', neutral: mode === 'dark' ? '#20232d' : '#f0f0f5' },
    text: { primary: mode === 'dark' ? '#eeedf4' : '#20202b', secondary: mode === 'dark' ? '#a9abba' : '#626574' },
    divider: mode === 'dark' ? '#30323d' : '#dddde4',
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        mark: {
          color: 'inherit',
          backgroundColor: mode === 'dark' ? '#b8b0ff33' : '#5b3fd324',
          borderRadius: 2,
        },
      },
    },
    MuiBackdrop: { styleOverrides: { root: { backdropFilter: 'blur(4px)' } } },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
  },
});
