import { beforeReport } from '../../core/index.ts';
import { t } from '../../i18n/index.ts';
import { app } from '../store.ts';
import { chooseFolder, ensurePlan, openRecent, rescan, startDuplicateScan } from '../actions.ts';
import { h } from '../dom.ts';
import { fmtDate, fmtNum, fmtSize, lastReport, pageHead, stat } from './common.ts';

export function homeView(go: (r: 'organize' | 'dupes' | 'files') => void): HTMLElement {
  const root = app.root;
  const wrap = h('div', { class: 'view' }, pageHead(t('home.title'), t('home.sub')));

  wrap.append(h('div', { class: 'privacy' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), t('home.privacy')));

  if (!root) {
    wrap.append(h('section', { class: 'card hero' },
      h('h2', null, t('home.start')),
      h('ol', { class: 'steps' }, h('li', null, t('home.step1')), h('li', null, t('home.step2')), h('li', null, t('home.step3'))),
      h('button', { class: 'btn primary big', onclick: () => void chooseFolder() }, t('home.pick'))));
  } else {
    const plan = ensurePlan();
    const rep = beforeReport(app.entries, plan, app.groups);
    wrap.append(h('section', { class: 'card' },
      h('div', { class: 'row between wrap' },
        h('div', null, h('h2', null, root.name), h('p', { class: 'muted' }, t('home.scanned', { when: fmtDate(app.scannedAt) }))),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => void rescan() }, t('home.rescan')),
          h('button', { class: 'btn', onclick: () => void chooseFolder() }, t('home.change')))),
      h('h3', null, t('report.before')),
      h('div', { class: 'stats' },
        stat(t('report.files'), fmtNum(rep.files)),
        stat(t('report.size'), fmtSize(rep.bytes)),
        stat(t('report.toMove'), fmtNum(rep.toMove), rep.toMove ? 'warn' : 'good'),
        stat(t('report.toRename'), fmtNum(rep.toRename), rep.toRename ? 'warn' : 'good'),
        stat(t('report.tidy'), fmtNum(rep.alreadyTidy), 'good'),
        stat(t('report.newFolders'), fmtNum(rep.newFolders)),
        stat(t('report.dupFiles'), app.groups ? fmtNum(rep.duplicateFiles) : '—', rep.duplicateFiles ? 'warn' : ''),
        stat(t('report.reclaimable'), app.groups ? fmtSize(rep.reclaimableBytes) : '—', rep.reclaimableBytes ? 'warn' : '')),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', onclick: () => go('organize') }, t('home.preview')),
        h('button', { class: 'btn', onclick: () => { go('dupes'); if (!app.groups) void startDuplicateScan(); } }, app.groups ? t('home.viewDupes') : t('home.findDupes')),
        h('button', { class: 'btn', onclick: () => go('files') }, t('nav.files')))));
    const r = lastReport();
    if (r) wrap.append(r);
  }

  const others = app.recentRoots.filter((r) => r.id !== root?.id);
  if (others.length) {
    wrap.append(h('section', { class: 'card' },
      h('h3', null, t('home.recent')),
      h('ul', { class: 'list' }, others.map((r) =>
        h('li', null, h('button', { class: 'linklike', onclick: () => void openRecent(r) }, r.name))))));
  }
  return wrap;
}
