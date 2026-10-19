import type { FileEntry, OpResult, Operation, RootHandle } from '../core/index.ts';
import { isUnder, pathKey } from '../core/index.ts';
import type { PlatformAdapter } from './adapter.ts';

/**
 * Adapter demo: sistem berkas virtual di memori. Dipakai saat dibuka di browser biasa (pengembangan/uji UI);
 * tidak menyentuh berkas asli. Semantik sama dengan adapter nyata: tidak menimpa, tidak keluar dari root.
 */
export function memoryAdapter(): PlatformAdapter {
  const day = 86_400_000;
  const now = Date.now();
  const files = new Map<string, { size: number; mtime: number; content: string }>();
  const add = (p: string, content: string, ageDays: number, size = content.length) => files.set(p, { size, mtime: now - ageDays * day, content });
  add('Download/Laporan Keuangan Q1.pdf', 'laporan-q1', 200, 2_400_000);
  add('Download/Laporan Keuangan Q1 (1).pdf', 'laporan-q1', 199, 2_400_000);
  add('Download/IMG_2041.jpg', 'foto-pantai', 120, 3_100_000);
  add('Download/IMG_2041 - Copy.jpg', 'foto-pantai', 119, 3_100_000);
  add('Download/liburan-bali-01.jpg', 'bali-1', 90, 4_000_000);
  add('Download/liburan-bali-02.jpg', 'bali-2', 90, 3_800_000);
  add('Download/rekaman-rapat.mp4', 'rapat', 30, 120_000_000);
  add('Download/installer.zip', 'zip', 10, 55_000_000);
  add('Dokumen/kontrak kerja.docx', 'kontrak', 400, 80_000);
  add('Dokumen/catatan.txt', 'catatan', 5, 1_200);
  add('Musik/lagu favorit.mp3', 'lagu', 700, 5_500_000);
  add('Proyek A/desain final.png', 'desain', 60, 900_000);
  add('misc/tanpa-jenis.xyz', 'misc', 3, 300);

  const root: RootHandle = { id: 'demo', name: 'Folder Demo' };
  const inRoot = (p: string) => p.length > 0 && !p.split('/').some((s) => s === '..' || s === '' || s === '.');
  const keyExists = (p: string) => [...files.keys()].some((k) => pathKey(k) === pathKey(p));

  return {
    platform: 'web',
    canTrash: false,
    needsPermissionExplainer: false,
    async pickFolder() {
      return root;
    },
    async openRoot() {
      return true;
    },
    async scan(_r, opts, onProgress): Promise<FileEntry[]> {
      const out: FileEntry[] = [];
      for (const [p, f] of files) {
        const inQ = isUnder(p, opts.quarantineFolder);
        if (opts.onlyUnder ? !isUnder(p, opts.onlyUnder) : inQ) continue;
        out.push({ path: p, name: p.slice(p.lastIndexOf('/') + 1), size: f.size, mtime: f.mtime });
      }
      onProgress?.(out.length);
      return out;
    },
    async hash(_r, paths) {
      const out: Record<string, string | null> = {};
      for (const p of paths) out[p] = files.get(p)?.content ?? null;
      return out;
    },
    async apply(_r, ops: Operation[], ctx): Promise<OpResult[]> {
      return ops.map((op): OpResult => {
        if (!inRoot(op.from) || (op.to && !inRoot(op.to))) return { op, status: 'failed', reason: 'outside-root' };
        const src = files.get(op.from);
        if (!src) return { op, status: 'skipped', reason: 'missing' };
        if (op.type === 'move' || op.type === 'quarantine') {
          if (!op.to) return { op, status: 'failed', reason: 'missing-target' };
          if (keyExists(op.to)) return { op, status: 'skipped', reason: 'exists' };
          files.delete(op.from);
          files.set(op.to, src);
          return { op, status: 'ok' };
        }
        if (op.type === 'discard') {
          if (!isUnder(op.from, ctx.quarantineFolder)) return { op, status: 'failed', reason: 'discard-only-in-quarantine' };
          files.delete(op.from);
          return { op, status: 'ok' };
        }
        return { op, status: 'failed', reason: 'unsupported' };
      });
    },
  };
}
