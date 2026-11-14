import { defineLumenConfig } from '@omnitron-dev/lumen';

import { SiteLayout } from './src/site/layout.tsx';
import sidebars from './src/data/sidebars.json' with { type: 'json' };

export default defineLumenConfig({
  title: 'Xec',
  tagline: 'TypeScript for the work around your code.',
  url: 'https://xec.sh',
  baseUrl: '/',
  srcDir: 'docs',
  pagesDir: 'pages',
  publicDir: 'static',
  outDir: process.env.LUMEN_OUT_DIR || 'build',
  clientEntry: 'src/site/client.tsx',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  sidebars,
  theme: { defaultMode: 'dark', layout: SiteLayout },
});
