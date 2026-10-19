import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, symlinkSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPlan, defaultSettings, findDuplicates, itemsToOperations, runOperations, undoOperations, summarize, newId, type HistoryEntry, type OpResult, type Operation } from '../src/core/index.ts';

const require = createRequire(import.meta.url);
const svc = require('../electron/fs-service.cjs') as {
  scan: (root: string, opts?: object) => Promise<{ path: string; name: string; size: number; mtime: number }[]>;
  hash: (root: string, rels: string[], mode?: string) => Promise<Record<string, string | null>>;
  apply: (root: string, ops: Operation[], ctx?: object) => Promise<OpResult[]>;
  protectedReason: (p: string) => string | null;
};

let root: string;
const put = (rel: string, content: string, when?: Date) => {
  const abs = join(root, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
  if (when) utimesSync(abs, when, when);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'berkas-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('layanan berkas desktop (folder sungguhan)', () => {
  it('memindai, mengabaikan tersembunyi/.git/node_modules/karantina/symlink', async () => {
    put('a.txt', 'a'); put('sub/b.txt', 'b'); put('.rahasia', 'x'); put('.git/config', 'x'); put('node_modules/p/i.js', 'x');
    put('_Karantina/old.txt', 'x'); put('Thumbs.db', 'x');
    symlinkSync(root, join(root, 'loop'));
    const e = await svc.scan(root);
    expect(e.map((x) => x.path).sort()).toEqual(['a.txt', 'sub/b.txt']);
  });

  it('menolak folder sistem dan root drive', () => {
    expect(svc.protectedReason('/')).toBeTruthy();
    expect(svc.protectedReason('/usr/bin')).toBeTruthy();
    expect(svc.protectedReason('/etc')).toBeTruthy();
    expect(svc.protectedReason('/var')).toBeTruthy();
    expect(svc.protectedReason('/var/folders/xx/T/proyek')).toBeNull();
    expect(svc.protectedReason(join(root, 'proyek'))).toBeNull();
    return expect(svc.scan('/etc')).rejects.toThrow('protected-root');
  });

  it('hash penuh membedakan isi yang hanya berbeda 1 byte di tengah', async () => {
    const big = 'A'.repeat(300_000);
    put('x.bin', big); put('y.bin', big); put('z.bin', big.slice(0, 150_000) + 'B' + big.slice(150_001));
    const q = await svc.hash(root, ['x.bin', 'y.bin', 'z.bin'], 'quick');
    expect(q['x.bin']).toBe(q['y.bin']);
    expect(q['x.bin']).toBe(q['z.bin']); // hash cepat tidak melihat tengah berkas...
    const f = await svc.hash(root, ['x.bin', 'y.bin', 'z.bin'], 'full');
    expect(f['x.bin']).toBe(f['y.bin']);
    expect(f['x.bin']).not.toBe(f['z.bin']); // ...tapi hash penuh menangkapnya
  });

  it('alur lengkap: pindai → rencana → terapkan → idempoten → batalkan', async () => {
    const d = new Date(2026, 4, 2, 9, 0, 0);
    put('Download/Laporan Q1.PDF', 'laporan', d); put('Download/liburan-bali.jpg', 'foto', d); put('Download/klip.mp4', 'video', d);
    const settings = defaultSettings();
    const entries = await svc.scan(root);
    const plan = buildPlan(entries, settings);
    expect(plan.items).toHaveLength(3);
    const res = await runOperations((ops) => svc.apply(root, ops), itemsToOperations(plan.items));
    expect(res.every((r) => r.status === 'ok')).toBe(true);
    expect(existsSync(join(root, 'Dokumen/2026/2026-05-02_laporan-q1.pdf'))).toBe(true);
    expect(existsSync(join(root, 'Foto/2026/Perjalanan/2026-05-02_liburan-bali.jpg'))).toBe(true);
    expect(existsSync(join(root, 'Video/2026-05-02_klip.mp4'))).toBe(true);
    expect(existsSync(join(root, 'Download'))).toBe(false); // folder kosong dirapikan

    const again = buildPlan(await svc.scan(root), settings);
    expect(again.items).toHaveLength(0); // idempoten

    const entry: HistoryEntry = { id: newId(), ts: Date.now(), kind: 'organize', rootId: root, rootName: 'x', results: res, summary: summarize(res, new Map()) };
    const { ops } = undoOperations(entry);
    const undone = await svc.apply(root, ops);
    expect(undone.every((r) => r.status === 'ok')).toBe(true);
    expect(readFileSync(join(root, 'Download/Laporan Q1.PDF'), 'utf8')).toBe('laporan');
    expect(existsSync(join(root, 'Video'))).toBe(false);
  });

  it('tidak pernah menimpa berkas yang sudah ada di tujuan', async () => {
    put('a.txt', 'A'); put('b.txt', 'B');
    const r = await svc.apply(root, [{ type: 'move', from: 'a.txt', to: 'b.txt' }]);
    expect(r[0]).toMatchObject({ status: 'skipped', reason: 'exists' });
    expect(readFileSync(join(root, 'b.txt'), 'utf8')).toBe('B');
    expect(existsSync(join(root, 'a.txt'))).toBe(true);
  });

  it('menolak jalur keluar dari root dan symlink pelarian', async () => {
    put('a.txt', 'A');
    const outside = mkdtempSync(join(tmpdir(), 'luar-'));
    symlinkSync(outside, join(root, 'pintas'));
    const r = await svc.apply(root, [
      { type: 'move', from: 'a.txt', to: '../bocor.txt' },
      { type: 'move', from: '../../etc/passwd', to: 'x.txt' },
      { type: 'move', from: 'a.txt', to: 'pintas/a.txt' },
    ]);
    expect(r.map((x) => x.status)).toEqual(['failed', 'failed', 'failed']);
    expect(existsSync(join(outside, 'a.txt'))).toBe(false);
    expect(existsSync(join(root, 'a.txt'))).toBe(true);
    rmSync(outside, { recursive: true, force: true });
  });

  it('karantina duplikat: pilihan pengguna → pindah ke _Karantina, bisa dipulihkan, tidak ada yang terhapus', async () => {
    put('a/foto.jpg', 'ISI-FOTO'); put('b/foto (1).jpg', 'ISI-FOTO'); put('c/lain.jpg', 'LAIN');
    const entries = await svc.scan(root);
    const groups = await findDuplicates(entries, (p, m) => svc.hash(root, p, m));
    expect(groups).toHaveLength(1);
    const victim = groups[0]!.files.find((f) => f.path.includes('(1)'))!;
    const ops: Operation[] = [{ type: 'quarantine', from: victim.path, to: `_Karantina/batch1/${victim.path}` }];
    const res = await svc.apply(root, ops);
    expect(res[0]!.status).toBe('ok');
    expect(existsSync(join(root, '_Karantina/batch1/b/foto (1).jpg'))).toBe(true);
    expect(existsSync(join(root, 'a/foto.jpg'))).toBe(true);
    const entry: HistoryEntry = { id: '1', ts: 0, kind: 'dedupe', rootId: root, rootName: 'x', results: res, summary: summarize(res, new Map()) };
    const back = await svc.apply(root, undoOperations(entry).ops);
    expect(back[0]!.status).toBe('ok');
    expect(readFileSync(join(root, 'b/foto (1).jpg'), 'utf8')).toBe('ISI-FOTO');
  });

  it('discard hanya boleh di dalam karantina', async () => {
    put('penting.docx', 'jangan hapus'); put('_Karantina/b/x.txt', 'x');
    const r = await svc.apply(root, [{ type: 'discard', from: 'penting.docx' }, { type: 'discard', from: '_Karantina/b/x.txt' }]);
    expect(r[0]!.status).toBe('failed');
    expect(r[1]!.status).toBe('ok');
    expect(existsSync(join(root, 'penting.docx'))).toBe(true);
    expect(existsSync(join(root, '_Karantina/b/x.txt'))).toBe(false);
  });

  it('trash memakai Recycle Bin/Trash sistem lewat fungsi yang disuntikkan', async () => {
    put('a.txt', 'A');
    const trashed: string[] = [];
    const r = await svc.apply(root, [{ type: 'trash', from: 'a.txt' }], { trashItem: async (p: string) => { trashed.push(p); } });
    expect(r[0]!.status).toBe('ok');
    expect(trashed).toHaveLength(1);
  });

  it('tukar nama berantai ditangani lewat percobaan ulang', async () => {
    put('a.txt', 'A'); put('b.txt', 'B');
    const res = await runOperations((ops) => svc.apply(root, ops), [
      { type: 'move', from: 'b.txt', to: 'a.txt' }, { type: 'move', from: 'a.txt', to: 'c.txt' },
    ]);
    expect(res.map((r) => r.status)).toEqual(['ok', 'ok']);
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('B');
    expect(readFileSync(join(root, 'c.txt'), 'utf8')).toBe('A');
  });
});
