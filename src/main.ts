import './ui/styles.css';
import { detectAdapter } from './platform/index.ts';
import { setLang, t, type Key } from './i18n/index.ts';
import { app, type Route } from './ui/store.ts';
import { clear, h } from './ui/dom.ts';
import { homeView } from './ui/views/home.ts';
import { organizeView } from './ui/views/organize.ts';
import { dupesView } from './ui/views/dupes.ts';
import { filesView } from './ui/views/files.ts';
import { rulesView } from './ui/views/rules.ts';
import { historyView } from './ui/views/history.ts';
import { settingsView } from './ui/views/settings.ts';

const ICONS: Record<Route, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  organize: 'M3 7h6l2 2h10v10H3zM8 14h8',
  dupes: 'M8 8h11v11H8zM5 16V5h11',
  files: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
  rules: 'M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 .7-1.5-1L15 4h-4l-.5 2.7-1.5 1L7 7l-2 4 2 1v2l-2 1 2 4 2-.7 1.5 1L11 20h4l.5-2.7 1.5-1 2 .7 2-4-2-1z',
};
const ORDER: Route[] = ['home', 'organize', 'dupes', 'files', 'rules', 'history', 'settings'];

function icon(route: Route): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ico');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', ICONS[route]);
  svg.append(p);
  return svg;
}

const root = document.getElementById('app')!;
const nav = h('nav', { class: 'nav', 'aria-label': 'Menu' });
const main = h('main', { id: 'main', tabindex: '-1' });
const overlay = h('div', { class: 'busy', hidden: true, role: 'alert', 'aria-live': 'assertive' });
root.append(
  h('div', { class: 'shell' },
    h('aside', { class: 'side' }, h('div', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, '▤'), 'Berkas Rapi'), nav),
    main),
  overlay);

export function navigate(route: Route, push = true): void {
  app.route = route;
  if (push) {
    try { history.pushState({ route }, ''); } catch { /* file:// tertentu */ }
  }
  render();
  main.scrollTo?.({ top: 0 });
}
window.addEventListener('popstate', (e) => {
  const r = (e.state as { route?: Route } | null)?.route;
  app.route = r ?? 'home';
  render();
});

function renderNav(): void {
  clear(nav);
  for (const r of ORDER) {
    nav.append(h('button', { class: 'nav-item', 'aria-current': app.route === r ? 'page' : null, onclick: () => navigate(r) }, icon(r), h('span', null, t(`nav.${r}` as Key))));
  }
}

function renderBusy(): void {
  const b = app.busy;
  overlay.hidden = !b;
  clear(overlay);
  if (!b) return;
  const pct = b.total ? Math.min(100, Math.round(((b.done ?? 0) / b.total) * 100)) : null;
  overlay.append(h('div', { class: 'busy-card' },
    h('div', { class: 'spinner', 'aria-hidden': 'true' }),
    h('strong', null, b.label),
    pct !== null ? h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: `width:${pct}%` })) : null,
    b.total ? h('span', { class: 'muted' }, `${b.done ?? 0} / ${b.total}`) : b.done ? h('span', { class: 'muted' }, t('busy.found', { n: b.done })) : null,
    b.cancel ? h('button', { class: 'btn', onclick: () => b.cancel?.() }, t('common.cancel')) : null));
}

function render(): void {
  renderNav();
  clear(main);
  const go = (r: Route) => navigate(r);
  switch (app.route) {
    case 'organize': main.append(organizeView()); break;
    case 'dupes': main.append(dupesView()); break;
    case 'files': main.append(filesView()); break;
    case 'rules': main.append(rulesView(render)); break;
    case 'history': main.append(historyView()); break;
    case 'settings': main.append(settingsView(render)); break;
    default: main.append(homeView(go));
  }
}

app.adapter = detectAdapter();
setLang(app.settings.language);
app.subscribe(() => {
  renderBusy();
  if (!app.busy) render(); // selama proses berjalan, jangan bangun ulang halaman
});
try { history.replaceState({ route: 'home' }, ''); } catch { /* abaikan */ }
render();
