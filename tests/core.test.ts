import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  buildPlan, defaultSettings, findDuplicates, pickKeeper, renderFileName, sanitizeSegment, slugify,
  undoOperations, runOperations, formatBytes, beforeReport, summarize,
  type FileEntry, type HistoryEntry, type OpResult, type Operation,
} from '../src/core/index.ts';

const T = new Date(2026, 2, 14, 10, 0, 0).getTime(); // 14 Mar 2026 lokal
const f = (path: string, size = 100, mtime = T): FileEntry => ({ path, name: path.split('/').pop()!, size, mtime });

describe('penamaan', () => {
  const s = defaultSettings();
  it('memberi awalan tanggal dan slug', () => {
    expect(renderFileName({ name: 'Laporan Keuangan Q1.PDF', mtime: T }, s.naming)).toBe('2026-03-14_laporan-keuangan-q1.pdf');
  });
  it('idempoten: tidak menumpuk awalan tanggal', () => {
    const once = renderFileName({ name: 'Foto Bali.JPG', mtime: T }, s.naming);
    const twice = renderFileName({ name: once, mtime: T }, s.naming);
    expect(twice).toBe(once);
  });
  it('slugify membuang aksen dan simbol', () => {
    expect(slugify('Kuitansi Çafé #3 (final)')).toBe('kuitansi-cafe-3-final');
  });
  it('membersihkan karakter terlarang & nama cadangan Windows', () => {
    expect(sanitizeSegment('a:b*c?.txt')).toBe('a-b-c-.txt');
    expect(sanitizeSegment('CON')).toBe('_CON');
    expect(sanitizeSegment('..')).toBe('_');
  });
  it('bisa dimatikan: nama asli dipertahankan', () => {
    const naming = { ...s.naming, enabled: false };
    expect(renderFileName({ name: 'Foto Bali.JPG', mtime: T }, naming)).toBe('Foto Bali.jpg');
  });
});

describe('perencana', () => {
  const s = defaultSettings();
  it('mengelompokkan menurut jenis, tahun, dan aturan kustom', () => {
    const plan = buildPlan([f('a/kontrak.pdf'), f('b/pantai-liburan.jpg'), f('c/klip.mp4'), f('d/data.zip'), f('e/aneh.xyz')], s);
    const to = Object.fromEntries(plan.items.map((i) => [i.from, i.to]));
    expect(to['a/kontrak.pdf']).toBe('Dokumen/2026/2026-03-14_kontrak.pdf');
    expect(to['b/pantai-liburan.jpg']).toBe('Foto/2026/Perjalanan/2026-03-14_pantai-liburan.jpg');
    expect(to['c/klip.mp4']).toBe('Video/2026-03-14_klip.mp4');
    expect(to['d/data.zip']).toBe('Arsip/2026-03-14_data.zip');
    expect(to['e/aneh.xyz']).toBe('Lainnya/2026-03-14_aneh.xyz');
  });
  it('berkas yang sudah rapi tidak diubah (idempoten)', () => {
    const first = buildPlan([f('x/laporan.pdf')], s);
    const afterMove = first.items.map((i) => f(i.to, i.size, i.mtime));
    const second = buildPlan(afterMove, s);
    expect(second.items).toHaveLength(0);
    expect(second.unchanged).toBe(1);
  });
  it('bentrok nama diberi akhiran, tidak pernah menimpa', () => {
    const plan = buildPlan([f('a/laporan.pdf', 1), f('b/laporan.pdf', 2)], s);
    const tos = plan.items.map((i) => i.to).sort();
    expect(new Set(tos).size).toBe(2);
    expect(tos.some((t) => /\(2\)\.pdf$/.test(t))).toBe(true);
    expect(plan.items.some((i) => i.conflictResolved)).toBe(true);
  });
  it('tidak menimpa berkas lain yang sudah ada di tujuan', () => {
    const existing = f('Dokumen/2026/2026-03-14_laporan.pdf', 5);
    const plan = buildPlan([existing, f('inbox/laporan.pdf', 6)], s);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]!.to).toBe('Dokumen/2026/2026-03-14_laporan (2).pdf');
  });
  it('mengabaikan folder karantina', () => {
    const plan = buildPlan([f('_Karantina/b1/x.pdf')], s);
    expect(plan.totalFiles).toBe(0);
  });
  it('mode hanya ganti nama menjaga folder', () => {
    const plan = buildPlan([f('proyek/a.pdf')], { ...s, organizeFolders: false });
    expect(plan.items[0]!.to).toBe('proyek/2026-03-14_a.pdf');
    expect(plan.items[0]!.action).toBe('rename');
  });
  it('aturan kosong tidak menangkap semua berkas', () => {
    const bad = { ...s, rules: [{ id: 'x', name: 'Kosong', enabled: true, match: {}, folderTemplate: 'Salah' }] };
    expect(buildPlan([f('a.pdf')], bad).items[0]!.to.startsWith('Lainnya/')).toBe(true);
  });
  it('template folder tidak bisa keluar dari root', () => {
    const evil = { ...s, rules: [{ id: 'x', name: 'Jahat', enabled: true, match: { exts: ['pdf'] }, folderTemplate: '../../etc/{yyyy}' }] };
    const plan = buildPlan([f('a.pdf')], evil);
    expect(plan.items[0]!.to).toBe('etc/2026/2026-03-14_a.pdf');
    expect(plan.items[0]!.to.includes('..')).toBe(false);
  });
  it('daftar folder baru dihitung', () => {
    const plan = buildPlan([f('a.pdf')], s);
    expect(plan.newFolders).toEqual(['Dokumen', 'Dokumen/2026']);
  });
});

describe('duplikat berbasis isi', () => {
  const contents: Record<string, string> = {
    'a/foto.jpg': 'ISI-SAMA-1234', 'b/foto (1).jpg': 'ISI-SAMA-1234', 'c/beda.jpg': 'ISI-LAIN-1234',
    'd/nama-sama.txt': 'AAAA', 'e/nama-sama.txt': 'BBBB', 'f/kosong1': '', 'g/kosong2': '',
    'h/hanya-ukuran-sama-1': 'XXXXXXXX', 'i/hanya-ukuran-sama-2': 'XXXXXXXY',
  };
  const entries = Object.entries(contents).map(([p, c]) => f(p, c.length));
  const calls = { quick: 0, full: 0 };
  const hasher = async (paths: string[], mode: 'quick' | 'full') => {
    calls[mode] += paths.length;
    const out: Record<string, string> = {};
    for (const p of paths) {
      const c = contents[p]!;
      // hash cepat sengaja hanya melihat 4 karakter pertama (seperti sampling awal/akhir)
      out[p] = createHash('sha256').update(mode === 'quick' ? c.slice(0, 4) : c).digest('hex');
    }
    return out;
  };
  it('menemukan duplikat berdasarkan isi, bukan nama; abaikan berkas kosong', async () => {
    const groups = await findDuplicates(entries, hasher);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.files.map((x) => x.path)).toEqual(['a/foto.jpg', 'b/foto (1).jpg']);
  });
  it('hash cepat yang sama tidak cukup: hash penuh memutuskan', async () => {
    const groups = await findDuplicates(entries, hasher);
    expect(groups.flatMap((g) => g.files.map((x) => x.path))).not.toContain('h/hanya-ukuran-sama-1');
    expect(calls.full).toBeGreaterThan(0);
  });
  it('strategi pemilihan salinan terbaik menghindari "(1)" dan memilih yang sudah rapi', async () => {
    const s = defaultSettings();
    const g = { hash: 'x', size: 10, files: [f('Download/laporan (1).pdf', 10), f('Dokumen/2026/laporan.pdf', 10, T + 1000)] };
    expect(pickKeeper(g, 'best', s).path).toBe('Dokumen/2026/laporan.pdf');
    expect(pickKeeper(g, 'oldest', s).path).toBe('Download/laporan (1).pdf');
    expect(pickKeeper(g, 'newest', s).path).toBe('Dokumen/2026/laporan.pdf');
  });
  it('pembatalan dapat dihentikan', async () => {
    await expect(findDuplicates(entries, hasher, undefined, () => true)).rejects.toThrow('cancelled');
  });
});

describe('riwayat, pembatalan, laporan', () => {
  const results: OpResult[] = [
    { op: { type: 'move', from: 'a.pdf', to: 'Dokumen/a.pdf' }, status: 'ok' },
    { op: { type: 'quarantine', from: 'b.pdf', to: '_Karantina/x/b.pdf' }, status: 'ok' },
    { op: { type: 'move', from: 'c.pdf', to: 'Dokumen/c.pdf' }, status: 'failed', reason: 'io' },
    { op: { type: 'trash', from: 'd.pdf' }, status: 'ok' },
  ];
  const entry: HistoryEntry = { id: '1', ts: 0, kind: 'organize', rootId: 'r', rootName: 'r', results, summary: summarize(results, new Map()) };
  it('pembatalan membalik urutan dan hanya yang berhasil & bisa dibalik', () => {
    const { ops, irreversible } = undoOperations(entry);
    expect(ops).toEqual([
      { type: 'move', from: '_Karantina/x/b.pdf', to: 'b.pdf' },
      { type: 'move', from: 'Dokumen/a.pdf', to: 'a.pdf' },
    ]);
    expect(irreversible).toHaveLength(1);
  });
  it('rangkuman menghitung dengan benar', () => {
    const s = summarize(results, new Map([['b.pdf', 50], ['d.pdf', 25]]));
    expect(s).toMatchObject({ moved: 1, quarantined: 1, trashed: 1, failed: 1, bytes: 75 });
  });
  it('percobaan ulang untuk operasi yang terlewat karena "exists"', async () => {
    const state = new Set(['a', 'b']);
    // b->a gagal dulu (a ada), setelah a->c berhasil b->a bisa jalan pada percobaan kedua
    const apply = async (ops: Operation[]): Promise<OpResult[]> =>
      ops.map((op) => {
        if (state.has(op.to!)) return { op, status: 'skipped', reason: 'exists' };
        state.delete(op.from); state.add(op.to!);
        return { op, status: 'ok' };
      });
    const out = await runOperations(apply, [{ type: 'move', from: 'b', to: 'a' }, { type: 'move', from: 'a', to: 'c' }]);
    expect(out.map((r) => r.status)).toEqual(['ok', 'ok']);
    expect([...state].sort()).toEqual(['a', 'c']);
  });
  it('laporan sebelum', () => {
    const entries = [f('a.pdf', 10), f('b.pdf', 20)];
    const plan = buildPlan(entries, defaultSettings());
    const r = beforeReport(entries, plan, [{ hash: 'h', size: 20, files: [entries[0]!, entries[1]!] }]);
    expect(r).toMatchObject({ files: 2, bytes: 30, toMove: 2, duplicateGroups: 1, duplicateFiles: 1, reclaimableBytes: 20 });
  });
  it('format ukuran', () => {
    expect(formatBytes(1536, 'en-US')).toBe('1.5 KB');
  });
});
