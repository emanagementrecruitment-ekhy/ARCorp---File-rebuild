import {
  buildPlan, findDuplicates, formatBytes, itemsToOperations, newId, pickKeeper, pushHistory, runOperations, summarize, undoOperations,
  type HistoryEntry, type KeeperStrategy, type OpResult, type Operation, type RootHandle,
} from '../core/index.ts';
import { t } from '../i18n/index.ts';
import { app } from './store.ts';
import { confirmModal, h, toast } from './dom.ts';

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function withBusy<T>(label: string, fn: (set: (done: number, total?: number) => void) => Promise<T>, cancel?: () => void): Promise<T> {
  app.busy = { label, cancel };
  app.emit();
  const set = (done: number, total?: number) => {
    if (app.busy) {
      app.busy.done = done;
      app.busy.total = total;
      app.emit();
    }
  };
  return fn(set).finally(() => {
    app.busy = null;
    app.emit();
  });
}

export async function chooseFolder(): Promise<void> {
  if (app.adapter.needsPermissionExplainer) {
    const ok = await confirmModal({
      title: t('perm.title'),
      body: h('div', null, h('p', null, t('perm.body1')), h('p', null, t('perm.body2'))),
      confirmLabel: t('perm.continue'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
  }
  try {
    const res = await app.adapter.pickFolder();
    if (!res) return;
    if ('error' in res) {
      toast(res.error.startsWith('protected') ? t('err.protected') : t('err.unreadable'));
      return;
    }
    await selectRoot(res);
  } catch (e) {
    toast(t('err.generic', { msg: msg(e) }));
  }
}

export async function openRecent(r: RootHandle): Promise<void> {
  try {
    if (!(await app.adapter.openRoot(r))) {
      app.forgetRoot(r.id);
      app.emit();
      toast(t('err.rootGone'));
      return;
    }
    await selectRoot(r);
  } catch (e) {
    toast(t('err.generic', { msg: msg(e) }));
  }
}

async function selectRoot(r: RootHandle): Promise<void> {
  app.root = r;
  app.rememberRoot(r);
  app.lastReport = null;
  await rescan();
}

export async function rescan(): Promise<void> {
  const root = app.root;
  if (!root) return;
  try {
    app.entries = await withBusy(t('busy.scan'), (set) =>
      app.adapter.scan(root, scanOpts(), (n) => set(n)),
    );
    app.scannedAt = Date.now();
    app.plan = null;
    app.groups = null;
    app.dup = { keeper: new Map(), marked: new Set() };
  } catch (e) {
    toast(t('err.generic', { msg: msg(e) }));
  }
  app.emit();
}

const scanOpts = () => ({
  ignoreHidden: app.settings.ignoreHidden,
  ignoreProjectFolders: app.settings.ignoreProjectFolders,
  quarantineFolder: app.settings.quarantineFolder,
});

export function ensurePlan() {
  if (!app.plan) {
    app.plan = buildPlan(app.entries, app.settings);
    app.planSelected = new Set(app.plan.items.map((i) => i.id));
  }
  return app.plan;
}

function batchFolder(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${app.settings.quarantineFolder}/${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}-${newId().slice(-4)}`;
}

async function execute(kind: HistoryEntry['kind'], root: RootHandle, ops: Operation[], sizes: Map<string, number>, undoOf?: string): Promise<HistoryEntry> {
  const results = await withBusy(t('busy.apply'), async (set) => {
    set(0, ops.length);
    const r = await runOperations((o) => app.adapter.apply(root, o, { quarantineFolder: app.settings.quarantineFolder }), ops);
    set(ops.length, ops.length);
    return r;
  });
  const entry: HistoryEntry = { id: newId(), ts: Date.now(), kind, rootId: root.id, rootName: root.name, results, summary: summarize(results, sizes), undoOf };
  app.history = pushHistory(app.history, entry);
  app.saveHistory();
  app.lastReport = { kind, entryId: entry.id };
  return entry;
}

export async function applyOrganize(): Promise<void> {
  const root = app.root;
  const plan = app.plan;
  if (!root || !plan) return;
  const items = plan.items.filter((i) => app.planSelected.has(i.id));
  if (items.length === 0) return;
  const moves = items.filter((i) => i.action !== 'rename').length;
  const renames = items.filter((i) => i.action !== 'move').length;
  const ok = await confirmModal({
    title: t('org.confirm.title'),
    body: h('div', null,
      h('p', null, t('org.confirm.body', { n: items.length, moves, renames })),
      h('ul', { class: 'plain' },
        h('li', null, t('org.confirm.safe1')),
        h('li', null, t('org.confirm.safe2')),
        h('li', null, t('org.confirm.safe3'))),
    ),
    confirmLabel: t('org.confirm.go', { n: items.length }),
    cancelLabel: t('common.cancel'),
  });
  if (!ok) return;
  try {
    await execute('organize', root, itemsToOperations(items), new Map(items.map((i) => [i.from, i.size])));
    await rescan();
  } catch (e) {
    toast(t('err.generic', { msg: msg(e) }));
  }
  app.emit();
}

export async function startDuplicateScan(): Promise<void> {
  const root = app.root;
  if (!root) return;
  let cancelled = false;
  try {
    const groups = await withBusy(t('busy.dupes'), (set) =>
      findDuplicates(
        app.entries,
        (paths, mode) => app.adapter.hash(root, paths, mode),
        (p) => set(p.done, p.total),
        () => cancelled,
      ),
      () => (cancelled = true),
    );
    app.groups = groups;
    app.dupStrategy = 'best';
    applyStrategy('best');
  } catch (e) {
    if (msg(e) !== 'cancelled') toast(t('err.generic', { msg: msg(e) }));
  }
  app.emit();
}

export function applyStrategy(strategy: KeeperStrategy): void {
  app.dup = { keeper: new Map(), marked: new Set() };
  for (const g of app.groups ?? []) {
    const keep = pickKeeper(g, strategy, app.settings);
    app.dup.keeper.set(g.hash, keep.path);
    for (const f of g.files) if (f.path !== keep.path) app.dup.marked.add(f.path);
  }
}

export async function applyDedupe(mode: 'quarantine' | 'trash'): Promise<void> {
  const root = app.root;
  if (!root || !app.groups) return;
  const sizes = new Map<string, number>();
  const batch = batchFolder();
  const ops: Operation[] = [];
  for (const g of app.groups) {
    for (const f of g.files) {
      if (!app.dup.marked.has(f.path)) continue;
      sizes.set(f.path, f.size);
      ops.push(mode === 'trash' ? { type: 'trash', from: f.path } : { type: 'quarantine', from: f.path, to: `${batch}/${f.path}` });
    }
  }
  if (ops.length === 0) return;
  const bytes = [...sizes.values()].reduce((a, b) => a + b, 0);
  const ok = await confirmModal({
    title: t(mode === 'trash' ? 'dup.confirm.titleTrash' : 'dup.confirm.title'),
    body: h('div', null,
      h('p', null, t('dup.confirm.body', { n: ops.length, size: formatBytes(bytes, localeFor()) })),
      h('p', null, t(mode === 'trash' ? 'dup.confirm.noteTrash' : 'dup.confirm.noteQuarantine', { folder: app.settings.quarantineFolder })),
      h('p', null, t('dup.confirm.keep'))),
    confirmLabel: t('dup.confirm.go', { n: ops.length }),
    cancelLabel: t('common.cancel'),
  });
  if (!ok) return;
  try {
    await execute('dedupe', root, ops, sizes);
    await rescan();
  } catch (e) {
    toast(t('err.generic', { msg: msg(e) }));
  }
  app.emit();
}

const localeFor = () => (app.settings.language === 'id' ? 'id-ID' : 'en-US');

export async function undoEntry(entry: HistoryEntry): Promise<void> {
  const { ops, irreversible } = undoOperations(entry);
  if (ops.length === 0) {
    toast(t('hist.nothingToUndo'));
    return;
  }
  const root: RootHandle = { id: entry.rootId, name: entry.rootName };
  const ok = await confirmModal({
    title: t('hist.undo.title'),
    body: h('div', null,
      h('p', null, t('hist.undo.body', { n: ops.length })),
      irreversible.length ? h('p', { class: 'warn' }, t('hist.undo.irreversible', { n: irreversible.length })) : null),
    confirmLabel: t('hist.undo.go'),
    cancelLabel: t('common.cancel'),
  });
  if (!ok) return;
  try {
    if (!(await app.adapter.openRoot(root))) {
      toast(t('err.rootGone'));
      return;
    }
    const undo = await execute('undo', root, ops, new Map(), entry.id);
    const bad = undo.results.filter((r: OpResult) => r.status === 'failed' || (r.status === 'skipped' && r.reason !== 'missing')).length;
    if (bad === 0) {
      entry.undone = true;
      app.saveHistory();
      toast(t('hist.undo.done', { n: undo.summary.moved + undo.summary.renamed || ops.length }));
    } else toast(t('hist.undo.partial', { bad }));
    if (app.root?.id === root.id) await rescan();
  } catch (e) {
    toast(t('err.generic', { msg: msg(e) }));
  }
  app.emit();
}

export async function listQuarantine() {
  if (!app.root) return [];
  try {
    return await app.adapter.scan(app.root, { ...scanOpts(), onlyUnder: app.settings.quarantineFolder });
  } catch {
    return [];
  }
}

export async function purgeQuarantine(): Promise<void> {
  const root = app.root;
  if (!root) return;
  const files = await listQuarantine();
  if (files.length === 0) {
    toast(t('quar.empty'));
    return;
  }
  const bytes = files.reduce((n, f) => n + f.size, 0);
  const ok = await confirmModal({
    title: t('quar.purge.title'),
    body: h('div', null, h('p', { class: 'warn' }, t('quar.purge.body', { n: files.length, size: formatBytes(bytes, localeFor()) })), h('p', null, t('quar.purge.type', { word: t('quar.purge.word') }))),
    confirmLabel: t('quar.purge.go'),
    cancelLabel: t('common.cancel'),
    danger: true,
    typeToConfirm: t('quar.purge.word'),
  });
  if (!ok) return;
  try {
    await execute('purge', root, files.map((f) => ({ type: 'discard' as const, from: f.path })), new Map(files.map((f) => [f.path, f.size])));
    toast(t('quar.purge.done', { size: formatBytes(bytes, localeFor()) }));
  } catch (e) {
    toast(t('err.generic', { msg: msg(e) }));
  }
  app.emit();
}
