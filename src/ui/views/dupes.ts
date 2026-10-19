import { reclaimableBytes } from '../../core/index.ts';
import { t } from '../../i18n/index.ts';
import { app } from '../store.ts';
import { applyDedupe, applyStrategy, startDuplicateScan } from '../actions.ts';
import { clear, h, toast } from '../dom.ts';
import { fmtDate, fmtNum, fmtSize, lastReport, needFolder, pageHead, stat } from './common.ts';

const ui = { limit: 40 };

export function dupesView(): HTMLElement {
  if (!app.root) return h('div', { class: 'view' }, pageHead(t('nav.dupes')), needFolder());
  const wrap = h('div', { class: 'view' }, pageHead(t('dup.title'), t('dup.sub')));
  const rep = lastReport();
  if (rep && app.lastReport?.kind === 'dedupe') wrap.append(rep);

  if (!app.groups) {
    wrap.append(h('section', { class: 'card empty' },
      h('h2', null, t('dup.start.title')),
      h('p', null, t('dup.start.body')),
      h('button', { class: 'btn primary', onclick: () => void startDuplicateScan() }, t('dup.start.go'))));
    return wrap;
  }
  const groups = app.groups;
  if (groups.length === 0) {
    wrap.append(h('section', { class: 'card empty' }, h('h2', null, t('dup.none.title')), h('p', null, t('dup.none.body'))));
    return wrap;
  }

  const summary = h('div', { class: 'stats' });
  const list = h('div');
  const footer = h('div', { class: 'actionbar' });

  const stratSel = h('select', { class: 'input', 'aria-label': t('dup.strategy') },
    (['best', 'oldest', 'newest', 'shortest-path', 'manual'] as const).map((s) =>
      h('option', { value: s, selected: s === app.dupStrategy }, t(`dup.strategy.${s}` as 'dup.strategy.best'))));
  stratSel.addEventListener('change', () => {
    app.dupStrategy = stratSel.value as typeof app.dupStrategy;
    if (app.dupStrategy !== 'manual') applyStrategy(app.dupStrategy);
    draw();
  });

  const modeSel = app.adapter.canTrash
    ? h('select', { class: 'input', 'aria-label': t('dup.mode') },
        h('option', { value: 'quarantine', selected: app.dupMode === 'quarantine' }, t('dup.mode.quarantine')),
        h('option', { value: 'trash', selected: app.dupMode === 'trash' }, t(`dup.mode.trash.${app.adapter.platform === 'macos' ? 'mac' : 'win'}` as 'dup.mode.trash.win')))
    : null;
  modeSel?.addEventListener('change', () => { app.dupMode = modeSel.value as typeof app.dupMode; draw(); });

  wrap.append(
    h('section', { class: 'card' }, h('div', { class: 'notice' }, t('dup.notice')), summary,
      h('div', { class: 'toolbar' },
        h('label', { class: 'field' }, h('span', null, t('dup.strategy')), stratSel),
        modeSel ? h('label', { class: 'field' }, h('span', null, t('dup.mode')), modeSel) : null),
      h('p', { class: 'muted' }, t('dup.strategy.note'))),
    h('section', null, list), footer);

  function draw(): void {
    const marked = app.dup.marked.size;
    const reclaim = reclaimableBytes(groups, app.dup.keeper);
    clear(summary);
    summary.append(
      stat(t('dup.groups'), fmtNum(groups.length)),
      stat(t('report.dupFiles'), fmtNum(groups.reduce((n, g) => n + g.files.length - 1, 0)), 'warn'),
      stat(t('report.reclaimable'), fmtSize(groups.reduce((n, g) => n + g.size * (g.files.length - 1), 0)), 'warn'),
      stat(t('dup.flagged'), `${fmtNum(marked)} · ${fmtSize(reclaim)}`));
    clear(list);
    for (const g of groups.slice(0, ui.limit)) {
      const keep = app.dup.keeper.get(g.hash);
      list.append(h('article', { class: 'card group' },
        h('div', { class: 'row between wrap' },
          h('strong', null, t('dup.groupHead', { n: g.files.length, size: fmtSize(g.size) })),
          h('span', { class: 'muted' }, t('dup.saves', { size: fmtSize(g.size * (g.files.length - 1)) }))),
        h('ul', { class: 'items' }, g.files.map((f) => {
          const isKeep = keep === f.path;
          const radio = h('input', { type: 'radio', name: `keep-${g.hash}`, checked: isKeep, 'aria-label': t('dup.keepThis') });
          radio.addEventListener('change', () => {
            const prev = app.dup.keeper.get(g.hash);
            if (prev) app.dup.marked.add(prev);
            app.dup.keeper.set(g.hash, f.path);
            app.dup.marked.delete(f.path);
            app.dupStrategy = 'manual';
            stratSel.value = 'manual';
            draw();
          });
          const flag = h('input', { type: 'checkbox', checked: app.dup.marked.has(f.path), disabled: isKeep, 'aria-label': t('dup.flag') });
          flag.addEventListener('change', () => {
            if (flag.checked) {
              const remaining = g.files.filter((x) => x.path !== f.path && !app.dup.marked.has(x.path));
              if (remaining.length === 0) { flag.checked = false; toast(t('dup.mustKeep')); return; }
              app.dup.marked.add(f.path);
            } else app.dup.marked.delete(f.path);
            drawFooter(); drawSummaryOnly();
          });
          return h('li', { class: `item ${isKeep ? 'keep' : ''}` },
            h('div', { class: 'item-paths' },
              h('div', { class: 'from' }, f.path),
              h('div', { class: 'muted' }, `${fmtSize(f.size)} · ${fmtDate(f.mtime)}`)),
            h('div', { class: 'item-meta' },
              h('label', { class: 'chk' }, radio, t('dup.keep')),
              h('label', { class: 'chk' }, flag, t('dup.flag'))));
        }))));
    }
    if (groups.length > ui.limit) list.append(h('button', { class: 'btn', onclick: () => { ui.limit += 40; draw(); } }, t('common.more')));
    drawFooter();
  }
  function drawSummaryOnly(): void {
    clear(summary);
    const reclaim = reclaimableBytes(groups, app.dup.keeper);
    summary.append(
      stat(t('dup.groups'), fmtNum(groups.length)),
      stat(t('report.dupFiles'), fmtNum(groups.reduce((n, g) => n + g.files.length - 1, 0)), 'warn'),
      stat(t('report.reclaimable'), fmtSize(groups.reduce((n, g) => n + g.size * (g.files.length - 1), 0)), 'warn'),
      stat(t('dup.flagged'), `${fmtNum(app.dup.marked.size)} · ${fmtSize(markedBytes() || reclaim)}`));
  }
  function markedBytes(): number {
    let n = 0;
    for (const g of groups) for (const f of g.files) if (app.dup.marked.has(f.path)) n += f.size;
    return n;
  }
  function drawFooter(): void {
    clear(footer);
    const n = app.dup.marked.size;
    footer.append(h('div', { class: 'muted' }, t('dup.footer', { n: fmtNum(n), size: fmtSize(markedBytes()) })),
      h('button', { class: 'btn primary', disabled: n === 0, onclick: () => void applyDedupe(app.dupMode) },
        t(app.dupMode === 'trash' ? 'dup.runTrash' : 'dup.run', { n: fmtNum(n) })));
  }

  draw();
  return wrap;
}
