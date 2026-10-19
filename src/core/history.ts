import type { HistoryEntry, OpResult, Operation } from './types.ts';

export const MAX_HISTORY = 200;

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function pushHistory(list: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...list].slice(0, MAX_HISTORY);
}

/** Operasi pembatalan untuk satu entri riwayat: urutan dibalik, hanya yang berhasil, hanya yang bisa dibalik. */
export function undoOperations(entry: HistoryEntry): { ops: Operation[]; irreversible: OpResult[] } {
  const ops: Operation[] = [];
  const irreversible: OpResult[] = [];
  for (const r of [...entry.results].reverse()) {
    if (r.status !== 'ok') continue;
    if ((r.op.type === 'move' || r.op.type === 'quarantine') && r.op.to) {
      ops.push({ type: 'move', from: r.op.to, to: r.op.from });
    } else {
      irreversible.push(r); // trash ke Recycle Bin/Trash OS atau discard permanen: tidak bisa dibalik aplikasi
    }
  }
  return { ops, irreversible };
}
