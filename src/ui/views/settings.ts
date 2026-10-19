import { t, setLang } from '../../i18n/index.ts';
import { app } from '../store.ts';
import { h, confirmModal, toast } from '../dom.ts';
import { pageHead } from './common.ts';

export function settingsView(rerender: () => void): HTMLElement {
  const s = app.settings;
  const wrap = h('div', { class: 'view' }, pageHead(t('set.title')));
  const toggle = (label: string, hint: string, checked: boolean, on: (v: boolean) => void) => {
    const cb = h('input', { type: 'checkbox', checked });
    cb.addEventListener('change', () => on(cb.checked));
    return h('label', { class: 'chk block' }, cb, h('span', null, label, h('small', { class: 'muted' }, hint)));
  };
  const lang = h('select', { class: 'input', 'aria-label': t('set.language') },
    h('option', { value: 'id', selected: s.language === 'id' }, 'Bahasa Indonesia'), h('option', { value: 'en', selected: s.language === 'en' }, 'English'));
  lang.addEventListener('change', () => { s.language = lang.value as 'id' | 'en'; setLang(s.language); app.saveSettings(); rerender(); });
  const qf = h('input', { class: 'input mono', value: s.quarantineFolder, 'aria-label': t('set.quarantineName') });
  qf.addEventListener('change', () => {
    const v = qf.value.trim().replace(/[\\/]/g, '');
    if (v && !v.startsWith('.')) { s.quarantineFolder = v; app.saveSettings(); toast(t('set.saved')); } else qf.value = s.quarantineFolder;
  });

  wrap.append(
    h('section', { class: 'card' },
      h('label', { class: 'field' }, h('span', null, t('set.language')), lang),
      toggle(t('set.ignoreHidden'), t('set.ignoreHidden.hint'), s.ignoreHidden, (v) => { s.ignoreHidden = v; app.saveSettings(); }),
      toggle(t('set.ignoreProject'), t('set.ignoreProject.hint'), s.ignoreProjectFolders, (v) => { s.ignoreProjectFolders = v; app.saveSettings(); }),
      h('label', { class: 'field' }, h('span', null, t('set.quarantineName')), qf)),
    h('section', { class: 'card' },
      h('h2', null, t('set.platform.title')),
      h('p', null, t(`set.platform.${app.adapter.platform}` as 'set.platform.android')),
      h('h3', null, t('set.privacy.title')), h('p', null, t('set.privacy.body'))),
    h('section', { class: 'card' },
      h('h2', null, t('set.data.title')), h('p', { class: 'muted' }, t('set.data.body')),
      h('button', { class: 'btn danger', onclick: async () => {
        const ok = await confirmModal({ title: t('set.clearHistory'), body: t('set.clearHistory.body'), confirmLabel: t('set.clearHistory'), cancelLabel: t('common.cancel'), danger: true });
        if (ok) { app.history = []; app.saveHistory(); app.lastReport = null; rerender(); }
      } }, t('set.clearHistory'))));
  return wrap;
}
