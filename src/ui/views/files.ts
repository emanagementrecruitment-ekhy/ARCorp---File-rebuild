import { t } from '../../i18n/index.ts';
import { app } from '../store.ts';
import { clear, h } from '../dom.ts';
import { categoryOf, fmtDate, fmtNum, fmtSize, needFolder, pageHead } from './common.ts';
import { splitExt } from '../../core/index.ts';

type Sort = 'name' | 'size' | 'date' | 'path';
const ui = { q: '', cat: '', minMb: '', sort: 'name' as Sort, desc: false, limit: 200 };

export function filesView(): HTMLElement {
  if (!app.root) return h('div', { class: 'view' }, pageHead(t('nav.files')), needFolder());
  const wrap = h('div', { class: 'view' }, pageHead(t('files.title'), t('files.sub', { n: fmtNum(app.entries.length) })));
  const cats = [...new Set(app.entries.map((e) => categoryOf(e.path, e.name, e.size)))].sort();
  const box = h('div');

  const q = h('input', { class: 'input', type: 'search', placeholder: t('common.search'), 'aria-label': t('common.search'), value: ui.q });
  q.addEventListener('input', () => { ui.q = q.value; ui.limit = 200; draw(); });
  const cat = h('select', { class: 'input', 'aria-label': t('files.category') }, h('option', { value: '' }, t('files.allCategories')),
    cats.map((c) => h('option', { value: c, selected: c === ui.cat }, c)));
  cat.addEventListener('change', () => { ui.cat = cat.value; ui.limit = 200; draw(); });
  const min = h('input', { class: 'input', type: 'number', min: '0', placeholder: t('files.minMb'), 'aria-label': t('files.minMb'), value: ui.minMb });
  min.addEventListener('input', () => { ui.minMb = min.value; draw(); });
  const sort = h('select', { class: 'input', 'aria-label': t('common.sort') },
    (['name', 'size', 'date', 'path'] as const).map((s) => h('option', { value: s, selected: s === ui.sort }, t(`files.sort.${s}` as 'files.sort.name'))));
  sort.addEventListener('change', () => { ui.sort = sort.value as Sort; draw(); });
  const dir = h('button', { class: 'btn', 'aria-label': t('common.reverse'), onclick: () => { ui.desc = !ui.desc; dir.textContent = ui.desc ? '↓' : '↑'; draw(); } }, ui.desc ? '↓' : '↑');

  wrap.append(h('section', { class: 'card' }, h('div', { class: 'toolbar' }, q, cat, min, h('div', { class: 'row' }, sort, dir)), box));

  function draw(): void {
    const needle = ui.q.trim().toLowerCase();
    const minBytes = ui.minMb ? Number(ui.minMb) * 1024 * 1024 : 0;
    const list = app.entries.filter((e) =>
      (!needle || e.path.toLowerCase().includes(needle)) && (!ui.cat || categoryOf(e.path, e.name, e.size) === ui.cat) && e.size >= minBytes);
    const d = ui.desc ? -1 : 1;
    list.sort((a, b) => {
      switch (ui.sort) {
        case 'size': return (a.size - b.size) * d;
        case 'date': return (a.mtime - b.mtime) * d;
        case 'path': return a.path.localeCompare(b.path) * d;
        default: return a.name.localeCompare(b.name) * d;
      }
    });
    clear(box);
    box.append(h('p', { class: 'muted' }, t('org.showing', { shown: Math.min(list.length, ui.limit), total: fmtNum(list.length) })));
    const ul = h('ul', { class: 'items' });
    for (const e of list.slice(0, ui.limit)) {
      ul.append(h('li', { class: 'item' },
        h('div', { class: 'item-paths' }, h('div', { class: 'from' }, e.path), h('div', { class: 'muted' }, `${fmtSize(e.size)} · ${fmtDate(e.mtime)}`)),
        h('div', { class: 'item-meta' }, h('span', { class: 'tag' }, categoryOf(e.path, e.name, e.size)), h('span', { class: 'tag blue' }, splitExt(e.name).ext || '—'))));
    }
    box.append(ul);
    if (list.length > ui.limit) box.append(h('button', { class: 'btn', onclick: () => { ui.limit += 200; draw(); } }, t('common.more')));
  }
  draw();
  return wrap;
}
