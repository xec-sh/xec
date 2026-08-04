/**
 * Makes rendered Mermaid diagrams readable.
 *
 * An architecture diagram is often wider than the column it sits in, so the
 * page shows it shrunk to the point where the labels are unreadable. This adds
 * a fullscreen viewer with pan and zoom, and rounds the node corners to match
 * the rest of the site.
 *
 * Mermaid renders asynchronously and Docusaurus swaps pages client-side, so
 * this uses a delegated click handler plus a MutationObserver rather than
 * binding to elements that may not exist yet.
 */

if (typeof window !== 'undefined' && !window.__xecMermaidBound) {
  window.__xecMermaidBound = true;

  document.addEventListener('click', event => {
    const button = event.target.closest('.mermaid-expand-button');
    const container =
      button?.closest('.docusaurus-mermaid-container, .mermaid') ??
      event.target.closest('.docusaurus-mermaid-container, .mermaid');

    if (!container || event.target.closest('.mermaid-fullscreen-overlay')) return;

    const svg = container.querySelector('svg');
    if (!svg) return;

    event.preventDefault();
    event.stopPropagation();
    showFullscreen(svg);
  });
}

export function onRouteDidUpdate() {
  decorate();
  startObserver();
}

let observing = false;

function startObserver() {
  if (typeof window === 'undefined' || observing) return;
  observing = true;

  new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true });
}

function decorate() {
  for (const rect of document.querySelectorAll('.mermaid rect, .docusaurus-mermaid-container rect')) {
    const radius = parseFloat(rect.getAttribute('rx') ?? '0');
    if (radius < 5) {
      rect.setAttribute('rx', '8');
      rect.setAttribute('ry', '8');
    }
  }

  for (const container of document.querySelectorAll('.docusaurus-mermaid-container, .mermaid')) {
    if (container.dataset['expandReady'] === 'true') continue;

    const svg = container.querySelector('svg');
    if (!svg) continue;

    container.dataset['expandReady'] = 'true';
    svg.style.cursor = 'zoom-in';

    const button = document.createElement('button');
    button.className = 'mermaid-expand-button';
    button.type = 'button';
    button.setAttribute('aria-label', 'Open diagram fullscreen');
    button.title = 'Open fullscreen';
    button.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>' +
      '<line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
    container.appendChild(button);
  }
}

/**
 * Copy an SVG with every id rewritten.
 *
 * Mermaid puts markers and gradients in `<defs>` and refers to them by id. Two
 * copies of the same diagram in one document would both define those ids, and
 * `url(#arrowhead)` resolves to whichever came first — so arrowheads vanish
 * from one of them.
 */
function cloneWithFreshIds(svg) {
  const suffix = `_fs_${Math.random().toString(36).slice(2, 8)}`;
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let markup = svg.outerHTML;

  for (const { id } of svg.querySelectorAll('[id]')) {
    const from = escape(id);
    markup = markup
      .replace(new RegExp(`id="${from}"`, 'g'), `id="${id}${suffix}"`)
      .replace(new RegExp(`url\\(#${from}\\)`, 'g'), `url(#${id}${suffix})`)
      .replace(new RegExp(`href="#${from}"`, 'g'), `href="#${id}${suffix}"`);
  }

  return markup;
}

function showFullscreen(source) {
  if (document.querySelector('.mermaid-fullscreen-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'mermaid-fullscreen-overlay';

  const stage = document.createElement('div');
  stage.className = 'mermaid-fullscreen-stage';
  stage.innerHTML = cloneWithFreshIds(source);

  const rect = source.getBoundingClientRect();
  const clone = stage.querySelector('svg');

  if (clone) {
    clone.classList.add('mermaid-fullscreen-svg');

    // Mermaid sets width="100%", which collapses inside a flex stage.
    clone.removeAttribute('width');
    clone.removeAttribute('height');

    const box = clone.viewBox?.baseVal;
    const aspect =
      box && box.width > 0 && box.height > 0
        ? box.width / box.height
        : (rect.width || 800) / (rect.height || 600);

    let width = window.innerWidth * 0.92;
    let height = width / aspect;

    if (height > window.innerHeight * 0.88) {
      height = window.innerHeight * 0.88;
      width = height * aspect;
    }

    clone.style.cssText = `width:${width}px;height:${height}px;display:block;pointer-events:none;`;
  }

  const view = { scale: 1, x: 0, y: 0 };
  const apply = () => {
    stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  };
  const zoomBy = factor => {
    view.scale = Math.max(0.3, Math.min(8, view.scale * factor));
    apply();
  };

  const toolbar = document.createElement('div');
  toolbar.className = 'mermaid-fullscreen-toolbar';

  const addButton = (label, title, onClick, extraClass) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mermaid-toolbar-button${extraClass ? ` ${extraClass}` : ''}`;
    button.textContent = label;
    button.title = title;
    button.addEventListener('click', event => {
      event.stopPropagation();
      onClick();
    });
    toolbar.appendChild(button);
  };

  addButton('+', 'Zoom in', () => zoomBy(1.25));
  addButton('−', 'Zoom out', () => zoomBy(0.8));
  addButton('1:1', 'Reset zoom', () => {
    view.scale = 1;
    view.x = 0;
    view.y = 0;
    apply();
  });
  addButton('×', 'Close (Esc)', () => close(), 'mermaid-toolbar-close');

  overlay.append(stage, toolbar);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  let origin = null;
  stage.style.cursor = 'grab';

  stage.addEventListener('mousedown', event => {
    origin = { x: event.clientX - view.x, y: event.clientY - view.y };
    stage.style.cursor = 'grabbing';
    event.preventDefault();
  });

  const onMove = event => {
    if (!origin) return;
    view.x = event.clientX - origin.x;
    view.y = event.clientY - origin.y;
    apply();
  };

  const onUp = () => {
    origin = null;
    stage.style.cursor = 'grab';
  };

  const onWheel = event => {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.1 : 0.9);
  };

  const onKey = event => {
    if (event.key === 'Escape') close();
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  overlay.addEventListener('wheel', onWheel, { passive: false });
  overlay.addEventListener('click', event => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);

  function close() {
    overlay.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
}
