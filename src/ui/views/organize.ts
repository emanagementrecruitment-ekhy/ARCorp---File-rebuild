import type { PlanItem } from '../../core/index.ts';
import { t } from '../../i18n/index.ts';
import { app } from '../store.ts';
import { applyOrganize, ensurePlan } from '../actions.ts';
import { clear, h } from '../dom.ts';
import { fmtDate, fmtNum, fmtSize, lastReport, needFolder, pageHead, stat } from './common.ts';

type Sort = 'from' | 'to' | 'size' | 'date';
const ui = { q: '', rule: '', action: '', sort: 'from' as Sort, desc: false, limit: 150 };

export function organizeView(): HTMLElement {
  if (!app.root) return h('div', { class: 'view' }, pageHead(t('nav.organize')), needFolder());
  const plan = ensurePlan();
  const wrap = h('div', { class: 'view' }, pageHead(t('org.title'), t('org.sub')));
  const rep = lastReport();
  if (rep && app.lastReport?.kind !== 'dedupe') wrap.append(rep);

  if (plan.items.length === 0) {
    wrap.append(h('section', { class: 'card empty' }, h('h2', null, t('org.none.title')), h('p', null, t('org.none.body', { n: fmtNum(plan.unchanged) }))));
    return wrap;
  }

  wrap.append(h('section', { class: 'card' },
    h('div', { class: 'notice' }, t('org.simulation')),
    h('div', { class: 'stats' },
      stat(t('report.toMove'), fmtNum(plan.items.filter((i) => i.action !== 'rename').length)),
      stat(t('report.toRename'), fmtNum(plan.items.filter((i) => i.action !== 'move').length)),
      stat(t('report.tidy'), fmtNum(plan.unchanged), 'good'),
      stat(t('report.newFolders'), fmtNum(plan.newFolders.length)))));

  const listBox = h('div');
  const footer = h('div', { class: 'actionbar' });

  const rules = [...new Set(plan.items.map((i) => i.ruleName))].sort();
  const search = h('input', { class: 'input', type: 'search', placeholder: t('common.search'), 'aria-label': t('common.search'), value: ui.q });
  search.addEventListener('input', () => { ui.q = search.value; ui.limit = 150; draw(); });
  const ruleSel = h('select', { class: 'input', 'aria-label': t('org.filter.rule') },
    h('option', { value: '' }, t('org.filter.allRules')), rules.map((r) => h('option', { value: r, selected: r === ui.rule }, r)));
  ruleSel.addEventListener('change', () => { ui.rule = ruleSel.value; ui.limit = 150; draw(); });
  const actSel = h('select', { class: 'input', 'aria-label': t('org.filter.action') },
    h('option', { value: '' }, t('org.filter.allActions')),
    (['move', 'rename', 'move+rename'] as const).map((a) => h('option', { value: a, selected: a === ui.action }, t(`org.action.${a}` as 'org.action.move'))));
  actSel.addEventListener('change', () => { ui.action = actSel.value; ui.limit = 150; draw(); });
  const sortSel = h('select', { class: 'input', 'aria-label': t('common.sort') },
    (['from', 'to', 'size', 'date'] as const).map((s) => h('option', { value: s, selected: s === ui.sort }, t(`org.sort.${s}` as 'org.sort.from'))));
  sortSel.addEventListener('change', () => { ui.sort = sortSel.value as Sort; draw(); });
  const descBtn = h('button', { class: 'btn', 'aria-label': t('common.reverse'), onclick: () => { ui.desc = !ui.desc; draw(); } }, ui.desc ? '↓' : '↑');

  wrap.append(h('section', { class: 'card' },
    h('div', { class: 'toolbar' }, search, ruleSel, actSel, h('div', { class: 'row' }, sortSel, descBtn)),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn', onclick: () => { filtered().forEach((i) => app.planSelected.add(i.id)); draw(); } }, t('org.selectShown')),
      h('button', { class: 'btn', onclick: () => { filtered().forEach((i) => app.planSelected.delete(i.id)); draw(); } }, t('org.unselectShown'))),
    listBox), footer);

  function filtered(): PlanItem[] {
    const q = ui.q.trim().toLowerCase();
    const list = plan.items.filter((i) =>
      (!q || i.from.toLowerCase().includes(q) || i.to.toLowerCase().includes(q)) && (!ui.rule || i.ruleName === ui.rule) && (!ui.action || i.action === ui.action));
    const dir = ui.desc ? -1 : 1;
    list.sort((a, b) => {
      switch (ui.sort) {
        case 'size': return (a.size - b.size) * dir;
        case 'date': return (a.mtime - b.mtime) * dir;
        case 'to': return a.to.localeCompare(b.to) * dir;
        default: return a.from.localeCompare(b.from) * dir;
      }
    });
    return list;
  }

  function draw(): void {
    const list = filtered();
    clear(listBox);
    listBox.append(h('p', { class: 'muted' }, t('org.showing', { shown: Math.min(list.length, ui.limit), total: list.length })));
    const ul = h('ul', { class: 'items' });
    for (const i of list.slice(0, ui.limit)) {
      const cb = h('input', { type: 'checkbox', checked: app.planSelected.has(i.id), 'aria-label': i.from });
      cb.addEventListener('change', () => { cb.checked ? app.planSelected.add(i.id) : app.planSelected.delete(i.id); drawFooter(); });
      ul.append(h('li', { class: 'item' },
        h('label', { class: 'item-main' }, cb,
          h('div', { class: 'item-paths' },
            h('div', { class: 'from' }, i.from),
            h('div', { class: 'to' }, '→ ', i.to))),
        h('div', { class: 'item-meta' },
          h('span', { class: `tag ${i.action === 'rename' ? 'blue' : ''}` }, t(`org.action.${i.action}` as 'org.action.move')),
          h('span', { class: 'tag' }, i.ruleName),
          i.conflictResolved ? h('span', { class: 'tag warn' }, t('org.conflict')) : null,
          h('span', { class: 'muted' }, `${fmtSize(i.size)} · ${fmtDate(i.mtime)}`))));
    }
    listBox.append(ul);
    if (list.length > ui.limit) listBox.append(h('button', { class: 'btn', onclick: () => { ui.limit += 150; draw(); } }, t('common.more')));
    drawFooter();
  }

  function drawFooter(): void {
    clear(footer);
    const n = plan.items.filter((i) => app.planSelected.has(i.id)).length;
    footer.append(h('div', { class: 'muted' }, t('org.selected', { n: fmtNum(n), total: fmtNum(plan.items.length) })),
      h('button', { class: 'btn primary', disabled: n === 0, onclick: () => void applyOrganize() }, t('org.run', { n: fmtNum(n) })));
  }

  draw();
  return wrap;
}
