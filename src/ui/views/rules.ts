import { defaultSettings, renderFileName, renderFolder, type Rule, type Settings } from '../../core/index.ts';
import { t } from '../../i18n/index.ts';
import { app } from '../store.ts';
import { h, toast } from '../dom.ts';
import { pageHead } from './common.ts';

const csv = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean);

export function rulesView(rerender: () => void): HTMLElement {
  const s = app.settings;
  const wrap = h('div', { class: 'view' }, pageHead(t('rules.title'), t('rules.sub')));
  const change = (redraw = false) => { app.saveSettings(); if (redraw) rerender(); };

  // Penamaan
  const sampleName = 'Laporan Keuangan Q1.PDF';
  const sample = h('code', { class: 'preview' });
  const refreshSample = () => {
    const now = Date.now();
    sample.textContent = `${sampleName}  →  ${renderFileName({ name: sampleName, mtime: now }, s.naming)}`;
  };
  const tmpl = h('input', { class: 'input mono', value: s.naming.template, 'aria-label': t('rules.naming.template') });
  tmpl.addEventListener('input', () => { s.naming.template = tmpl.value; refreshSample(); change(); });
  const toggle = (label: string, checked: boolean, on: (v: boolean) => void, hint?: string) => {
    const cb = h('input', { type: 'checkbox', checked });
    cb.addEventListener('change', () => on(cb.checked));
    return h('label', { class: 'chk block' }, cb, h('span', null, label, hint ? h('small', { class: 'muted' }, hint) : null));
  };
  refreshSample();
  wrap.append(h('section', { class: 'card' },
    h('h2', null, t('rules.naming.title')),
    toggle(t('rules.naming.enabled'), s.naming.enabled, (v) => { s.naming.enabled = v; refreshSample(); change(); }),
    h('label', { class: 'field' }, h('span', null, t('rules.naming.template')), tmpl),
    h('p', { class: 'muted' }, t('rules.naming.tokens')),
    toggle(t('rules.naming.slug'), s.naming.slugify, (v) => { s.naming.slugify = v; refreshSample(); change(); }),
    sample,
    toggle(t('rules.organizeFolders'), s.organizeFolders, (v) => { s.organizeFolders = v; change(); }, t('rules.organizeFolders.hint'))));

  // Aturan folder
  const list = h('div');
  s.rules.forEach((r, idx) => list.append(ruleCard(r, idx, s, change)));
  const fallback = h('input', { class: 'input mono', value: s.fallbackFolder, 'aria-label': t('rules.fallback') });
  fallback.addEventListener('input', () => { s.fallbackFolder = fallback.value; change(); });
  wrap.append(h('section', { class: 'card' },
    h('h2', null, t('rules.folders.title')),
    h('p', { class: 'muted' }, t('rules.folders.tokens')),
    list,
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn', onclick: () => { s.rules.push({ id: `r-${Date.now().toString(36)}`, name: t('rules.new'), enabled: true, match: { exts: [] }, folderTemplate: 'Baru/{yyyy}' }); change(true); } }, t('rules.add')),
      h('button', { class: 'btn', onclick: () => { const d = defaultSettings(); s.rules = d.rules; s.fallbackFolder = d.fallbackFolder; s.naming = d.naming; change(true); toast(t('rules.resetDone')); } }, t('rules.reset'))),
    h('label', { class: 'field' }, h('span', null, t('rules.fallback')), fallback)));

  // Impor/ekspor: salin-tempel supaya aturan sama di semua perangkat
  const ta = h('textarea', { class: 'input mono', rows: '8', 'aria-label': t('rules.json') });
  ta.value = JSON.stringify({ rules: s.rules, fallbackFolder: s.fallbackFolder, naming: s.naming, organizeFolders: s.organizeFolders }, null, 2);
  wrap.append(h('section', { class: 'card' },
    h('h2', null, t('rules.share.title')), h('p', { class: 'muted' }, t('rules.share.body')), ta,
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(ta.value); toast(t('rules.copied')); } catch { ta.select(); toast(t('rules.copyManual')); } } }, t('rules.copy')),
      h('button', { class: 'btn primary', onclick: () => {
        try {
          const j = JSON.parse(ta.value) as Partial<Settings>;
          const rules = validateRules(j.rules);
          s.rules = rules;
          if (typeof j.fallbackFolder === 'string') s.fallbackFolder = j.fallbackFolder;
          if (j.naming && typeof j.naming.template === 'string') s.naming = { enabled: Boolean(j.naming.enabled), template: j.naming.template, slugify: Boolean(j.naming.slugify) };
          if (typeof j.organizeFolders === 'boolean') s.organizeFolders = j.organizeFolders;
          change(true); toast(t('rules.imported'));
        } catch { toast(t('rules.invalid')); }
      } }, t('rules.apply')))));
  return wrap;
}

function validateRules(v: unknown): Rule[] {
  if (!Array.isArray(v)) throw new Error('rules');
  return v.map((r, i) => {
    const o = r as Partial<Rule>;
    if (typeof o.folderTemplate !== 'string' || typeof o.name !== 'string') throw new Error(`rule ${i}`);
    const m = (o.match ?? {}) as Rule['match'];
    return {
      id: typeof o.id === 'string' ? o.id : `r-${i}`, name: o.name, enabled: o.enabled !== false, folderTemplate: o.folderTemplate,
      nameTemplate: typeof o.nameTemplate === 'string' ? o.nameTemplate : undefined,
      match: {
        exts: Array.isArray(m.exts) ? m.exts.map(String) : undefined,
        nameContains: Array.isArray(m.nameContains) ? m.nameContains.map(String) : undefined,
        pathContains: Array.isArray(m.pathContains) ? m.pathContains.map(String) : undefined,
        nameRegex: typeof m.nameRegex === 'string' ? m.nameRegex : undefined,
        minSize: typeof m.minSize === 'number' ? m.minSize : undefined,
        maxSize: typeof m.maxSize === 'number' ? m.maxSize : undefined,
      },
    };
  });
}

function ruleCard(r: Rule, idx: number, s: Settings, change: (redraw?: boolean) => void): HTMLElement {
  const input = (value: string, label: string, on: (v: string) => void, mono = false) => {
    const el = h('input', { class: `input${mono ? ' mono' : ''}`, value, 'aria-label': label });
    el.addEventListener('input', () => on(el.value));
    return h('label', { class: 'field' }, h('span', null, label), el);
  };
  const en = h('input', { type: 'checkbox', checked: r.enabled, 'aria-label': t('rules.enabled') });
  en.addEventListener('change', () => { r.enabled = en.checked; change(); });
  const prev = h('code', { class: 'preview' });
  const refresh = () => {
    const f = { path: 'sumber/contoh.pdf', name: 'contoh.pdf', mtime: Date.now() };
    prev.textContent = `${t('rules.example')}: ${renderFolder(r.folderTemplate, f, r.name) || '(root)'}`;
  };
  refresh();
  return h('article', { class: `rule ${r.enabled ? '' : 'off'}` },
    h('div', { class: 'row between wrap' },
      h('label', { class: 'chk' }, en, h('strong', null, r.name)),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', disabled: idx === 0, 'aria-label': t('rules.up'), onclick: () => { [s.rules[idx - 1], s.rules[idx]] = [s.rules[idx]!, s.rules[idx - 1]!]; change(true); } }, '↑'),
        h('button', { class: 'btn small', disabled: idx === s.rules.length - 1, 'aria-label': t('rules.down'), onclick: () => { [s.rules[idx + 1], s.rules[idx]] = [s.rules[idx]!, s.rules[idx + 1]!]; change(true); } }, '↓'),
        h('button', { class: 'btn small danger', 'aria-label': t('rules.delete'), onclick: () => { s.rules.splice(idx, 1); change(true); } }, '✕'))),
    h('div', { class: 'grid2' },
      input(r.name, t('rules.name'), (v) => { r.name = v; change(); }),
      input(r.folderTemplate, t('rules.folder'), (v) => { r.folderTemplate = v; refresh(); change(); }, true),
      input((r.match.exts ?? []).join(', '), t('rules.exts'), (v) => { r.match.exts = csv(v); change(); }, true),
      input((r.match.nameContains ?? []).join(', '), t('rules.keywords'), (v) => { r.match.nameContains = csv(v); change(); })),
    prev);
}
