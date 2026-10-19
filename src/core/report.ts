import type { DuplicateGroup, FileEntry, HistoryEntry, OpResult, Plan } from './types.ts';

export interface BeforeReport {
  files: number;
  bytes: number;
  toMove: number;
  toRename: number;
  alreadyTidy: number;
  newFolders: number;
  duplicateGroups: number;
  duplicateFiles: number;
  reclaimableBytes: number;
}

export function beforeReport(entries: FileEntry[], plan: Plan, groups: DuplicateGroup[] | null): BeforeReport {
  const dupFiles = groups ? groups.reduce((n, g) => n + g.files.length - 1, 0) : 0;
  const reclaim = groups ? groups.reduce((n, g) => n + g.size * (g.files.length - 1), 0) : 0;
  return {
    files: entries.length,
    bytes: entries.reduce((n, e) => n + e.size, 0),
    toMove: plan.items.filter((i) => i.action !== 'rename').length,
    toRename: plan.items.filter((i) => i.action !== 'move').length,
    alreadyTidy: plan.unchanged,
    newFolders: plan.newFolders.length,
    duplicateGroups: groups?.length ?? 0,
    duplicateFiles: dupFiles,
    reclaimableBytes: reclaim,
  };
}

export function summarize(results: OpResult[], sizes: Map<string, number>): HistoryEntry['summary'] {
  const s = { moved: 0, renamed: 0, quarantined: 0, trashed: 0, failed: 0, skipped: 0, bytes: 0 };
  for (const r of results) {
    if (r.status === 'failed') s.failed++;
    else if (r.status === 'skipped') s.skipped++;
    else if (r.op.type === 'move') {
      const fromDir = r.op.from.slice(0, Math.max(0, r.op.from.lastIndexOf('/')));
      const toDir = (r.op.to ?? '').slice(0, Math.max(0, (r.op.to ?? '').lastIndexOf('/')));
      if (fromDir !== toDir) s.moved++;
      const fromName = r.op.from.slice(r.op.from.lastIndexOf('/') + 1);
      const toName = (r.op.to ?? '').slice((r.op.to ?? '').lastIndexOf('/') + 1);
      if (fromName !== toName) s.renamed++;
    } else if (r.op.type === 'quarantine') {
      s.quarantined++;
      s.bytes += sizes.get(r.op.from) ?? 0;
    } else if (r.op.type === 'trash' || r.op.type === 'discard') {
      s.trashed++;
      s.bytes += sizes.get(r.op.from) ?? 0;
    }
  }
  return s;
}
