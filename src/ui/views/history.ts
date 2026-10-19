import { t } from '../../i18n/index.ts';
import { app } from '../store.ts';
import { listQuarantine, purgeQuarantine, undoEntry } from '../actions.ts';
import { clear, h } from '../dom.ts';
import { fmtDate, fmtNum, fmtSize, pageHead, stat } from './common.ts';

export function historyView(): HTMLElement {
  const wrap = h('div', { class: 'view' }, pageHead(t('hist.title'), t('hist.sub')));

  // Karantina
  const qBox = h('section', { class: 'card' }, h('h2', null, t('quar.title')), h('p', { class: 'muted' }, t('quar.body', { folder: app.settings.quarantineFolder })));
  if (!app.root) qBox.append(h('p', { class: 'muted' }, t('quar.needFolder')));
  else {
    const info = h('div', { class: 'stats' });
    qBox.append(info, h('button', { class: 'btn danger', onclick: () => void purgeQuarantine() }, t('quar.purge')));
    void listQuarantine().then((files) => {
      clear(info);
      info.append(stat(t('report.files'), fmtNum(files.length)), stat(t('report.size'), fmtSize(files.reduce((n, f) => n + f.size, 0))));
    });
  }
  wrap.append(qBox);

  if (app.history.length === 0) {
    wrap.append(h('section', { class: 'card empty' }, h('p', null, t('hist.empty'))));
    return wrap;
  }
  const ul = h('ul', { class: 'hist' });
  for (const e of app.history) {
    const s = e.summary;
    const undoable = (e.kind === 'organize' || e.kind === 'dedupe') && !e.undone && e.results.some((r) => r.status === 'ok' && r.op.type !== 'trash' && r.op.type !== 'discard');
    ul.append(h('li', { class: 'card' },
      h('div', { class: 'row between wrap' },
        h('div', null, h('strong', null, t(`report.title.${e.kind}` as 'report.title.organize')), ' ', h('span', { class: 'muted' }, `· ${e.rootName} · ${fmtDate(e.ts)}`)),
        e.undone ? h('span', { class: 'tag blue' }, t('hist.undone')) : null),
      h('div', { class: 'stats small' },
        s.moved ? stat(t('report.moved'), fmtNum(s.moved)) : null,
        s.renamed ? stat(t('report.renamed'), fmtNum(s.renamed)) : null,
        s.quarantined ? stat(t('report.quarantined'), fmtNum(s.quarantined)) : null,
        s.trashed ? stat(e.kind === 'purge' ? t('report.purged') : t('report.trashed'), fmtNum(s.trashed)) : null,
        s.failed ? stat(t('report.failed'), fmtNum(s.failed), 'warn') : null,
        s.skipped ? stat(t('report.skipped'), fmtNum(s.skipped), 'warn') : null),
      s.trashed && e.kind === 'dedupe' ? h('p', { class: 'muted' }, t('hist.trashNote')) : null,
      h('details', null, h('summary', null, t('hist.details')),
        h('ul', { class: 'plain mono small' }, e.results.slice(0, 300).map((r) =>
          h('li', null, `${r.status === 'ok' ? '✓' : r.status === 'skipped' ? '↷' : '✗'} ${r.op.from}${r.op.to ? ` → ${r.op.to}` : ''}${r.reason ? ` (${r.reason})` : ''}`)))),
      undoable ? h('button', { class: 'btn', onclick: () => void undoEntry(e) }, t('hist.undo')) : null));
  }
  wrap.append(ul);
  return wrap;
}
