import { formatBytes, formatDate, matches, type HistoryEntry } from '../../core/index.ts';
import { locale, t } from '../../i18n/index.ts';
import { app } from '../store.ts';
import { chooseFolder, undoEntry } from '../actions.ts';
import { h } from '../dom.ts';

export const fmtSize = (n: number): string => formatBytes(n, locale());
export const fmtDate = (ms: number): string => formatDate(ms, locale());
export const fmtNum = (n: number): string => new Intl.NumberFormat(locale()).format(n);

export function stat(label: string, value: string, tone: '' | 'good' | 'warn' = ''): HTMLElement {
  return h('div', { class: `stat ${tone}` }, h('div', { class: 'stat-v' }, value), h('div', { class: 'stat-l' }, label));
}

export function needFolder(): HTMLElement {
  return h('section', { class: 'card empty' },
    h('h2', null, t('need.title')),
    h('p', null, t('need.body')),
    h('button', { class: 'btn primary', onclick: () => void chooseFolder() }, t('home.pick')));
}

/** Laporan sesudah: ringkasan hasil satu eksekusi. */
export function reportCard(entry: HistoryEntry): HTMLElement {
  const s = entry.summary;
  const title = t(`report.title.${entry.kind}` as 'report.title.organize');
  return h('section', { class: 'card report', 'aria-live': 'polite' },
    h('h2', null, title),
    h('div', { class: 'stats' },
      entry.kind === 'organize' || entry.kind === 'undo' ? stat(t('report.moved'), fmtNum(s.moved), 'good') : null,
      entry.kind === 'organize' || entry.kind === 'undo' ? stat(t('report.renamed'), fmtNum(s.renamed), 'good') : null,
      s.quarantined ? stat(t('report.quarantined'), fmtNum(s.quarantined), 'good') : null,
      s.trashed ? stat(entry.kind === 'purge' ? t('report.purged') : t('report.trashed'), fmtNum(s.trashed), 'good') : null,
      s.bytes ? stat(entry.kind === 'purge' ? t('report.freed') : t('report.potential'), fmtSize(s.bytes), 'good') : null,
      stat(t('report.skipped'), fmtNum(s.skipped), s.skipped ? 'warn' : ''),
      stat(t('report.failed'), fmtNum(s.failed), s.failed ? 'warn' : '')),
    s.quarantined ? h('p', { class: 'muted' }, t('report.quarantineNote', { folder: app.settings.quarantineFolder })) : null,
    (entry.kind === 'organize' || entry.kind === 'dedupe') && !entry.undone
      ? h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => void undoEntry(entry) }, t('report.undo')))
      : null);
}

export function lastReport(): HTMLElement | null {
  if (!app.lastReport) return null;
  const e = app.history.find((x) => x.id === app.lastReport!.entryId);
  return e ? reportCard(e) : null;
}

export function pageHead(title: string, sub?: string): HTMLElement {
  return h('header', { class: 'page-head' }, h('h1', null, title), sub ? h('p', { class: 'muted' }, sub) : null);
}

export function categoryOf(path: string, name: string, size: number): string {
  const r = app.settings.rules.find((x) => x.enabled && matches(x.match, { path, name, size }));
  return r ? r.name : t('common.other');
}
