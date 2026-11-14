import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, process.env.LUMEN_OUT_DIR || 'build');
const baseline = JSON.parse(readFileSync(join(root, 'src/data/route-contract.json'), 'utf8'));
const failures = [];
const pages = new Map();
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (entry.name.endsWith('.html')) {
      const html = readFileSync(file, 'utf8');
      let route =
        '/' +
        relative(output, file)
          .replaceAll('\\', '/')
          .replace(/\.html$/, '')
          .replace(/\/index$/, '');
      if (route === '/index') route = '/';
      const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
      if (duplicates.length) failures.push(`${route}: duplicate IDs: ${[...new Set(duplicates)].join(', ')}`);
      pages.set(route, { html, ids: new Set(ids) });
    }
  }
}
scan(output);
let anchors = 0;
for (const original of baseline) {
  const page = pages.get(original.route);
  if (!page) {
    failures.push(`Missing original route: ${original.route}`);
    continue;
  }
  for (const anchor of original.anchors) {
    anchors++;
    if (!page.ids.has(anchor)) failures.push(`Missing original section: ${original.route}#${anchor}`);
  }
}
let links = 0;
for (const [route, { html }] of pages) {
  for (const [, attribute, raw] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
    if (!raw || raw.startsWith('//') || /^(?:mailto|tel|data):/.test(raw)) continue;
    const url = new URL(raw.replaceAll('&amp;', '&'), `https://xec.sh${route}`);
    if (url.origin !== 'https://xec.sh') continue;
    links++;
    const path = decodeURIComponent(url.pathname).replace(/\/$/, '') || '/';
    const page = pages.get(path);
    if (page) {
      if (url.hash && !page.ids.has(decodeURIComponent(url.hash.slice(1))))
        failures.push(`${route}: broken anchor ${raw}`);
    } else if (!existsSync(join(output, path))) failures.push(`${route}: missing ${attribute} ${raw}`);
  }
}
for (const file of ['pagefind/pagefind.js', 'llms.txt', 'CNAME']) {
  if (!existsSync(join(output, file))) failures.push(`Missing site artifact: ${file}`);
}
if (readFileSync(join(output, 'CNAME'), 'utf8').trim() !== 'xec.sh') failures.push('Custom domain must remain xec.sh');
console.log(
  `${pages.size} pages; ${baseline.length} preserved routes; ${anchors} preserved anchors; ${links} local links/assets checked`
);
for (const failure of failures) console.error(failure);
if (failures.length) process.exitCode = 1;
