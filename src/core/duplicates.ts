import type { DuplicateGroup, FileEntry } from './types.ts';

export type HashMode = 'quick' | 'full';
export type Hasher = (paths: string[], mode: HashMode) => Promise<Record<string, string | null>>;

export interface DupProgress {
  phase: 'size' | 'quick' | 'full';
  done: number;
  total: number;
}

function groupBy<T>(items: T[], key: (t: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    if (k === null) continue;
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/**
 * Deteksi duplikat berdasarkan ISI berkas (bukan nama):
 * 1) kelompokkan menurut ukuran, 2) hash cepat (awal+akhir berkas), 3) hash penuh SHA-256.
 * Hanya berkas dengan hash penuh yang sama dianggap duplikat, jadi tidak ada salah deteksi dari hash cepat.
 * Berkas kosong (0 byte) diabaikan.
 */
export async function findDuplicates(
  entries: FileEntry[],
  hasher: Hasher,
  onProgress?: (p: DupProgress) => void,
  isCancelled: () => boolean = () => false,
): Promise<DuplicateGroup[]> {
  const nonEmpty = entries.filter((e) => e.size > 0);
  const bySize = [...groupBy(nonEmpty, (e) => String(e.size)).values()].filter((g) => g.length > 1);
  onProgress?.({ phase: 'size', done: 1, total: 1 });

  const quickCandidates = bySize.flat();
  const quickHashes = new Map<string, string | null>();
  await hashInBatches(quickCandidates, 'quick', hasher, quickHashes, (done, total) => onProgress?.({ phase: 'quick', done, total }), isCancelled);

  const fullCandidates: FileEntry[] = [];
  for (const group of bySize) {
    const byQuick = groupBy(group, (e) => {
      const h = quickHashes.get(e.path);
      return h ? h : null;
    });
    for (const g of byQuick.values()) if (g.length > 1) fullCandidates.push(...g);
  }

  const fullHashes = new Map<string, string | null>();
  await hashInBatches(fullCandidates, 'full', hasher, fullHashes, (done, total) => onProgress?.({ phase: 'full', done, total }), isCancelled);

  const groups: DuplicateGroup[] = [];
  const byHash = groupBy(fullCandidates, (e) => {
    const h = fullHashes.get(e.path);
    return h ? `${e.size}:${h}` : null;
  });
  for (const [k, files] of byHash) {
    if (files.length < 2) continue;
    const [size, hash] = k.split(':') as [string, string];
    groups.push({ hash, size: Number(size), files: [...files].sort((a, b) => a.path.localeCompare(b.path)) });
  }
  // Yang paling banyak menghemat ruang tampil lebih dulu.
  groups.sort((a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1));
  return groups;
}

async function hashInBatches(
  files: FileEntry[],
  mode: HashMode,
  hasher: Hasher,
  out: Map<string, string | null>,
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const BATCH = 32;
  onProgress(0, files.length);
  for (let i = 0; i < files.length; i += BATCH) {
    if (isCancelled()) throw new Error('cancelled');
    const slice = files.slice(i, i + BATCH);
    const res = await hasher(slice.map((f) => f.path), mode);
    for (const f of slice) out.set(f.path, res[f.path] ?? null);
    onProgress(Math.min(i + BATCH, files.length), files.length);
  }
}
