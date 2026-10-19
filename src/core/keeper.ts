import type { DuplicateGroup, FileEntry, KeeperStrategy, Settings } from './types.ts';
import { baseName, isUnder, pathKey, splitExt } from './paths.ts';
import { findRule, renderFolder } from './rules.ts';

const COPY_MARKERS = [/\(\d+\)$/, /[ _-]copy( \d+)?$/i, /[ _-]salinan( \d+)?$/i, /^copy of /i, /^salinan dari /i, /[ _-]duplicate$/i, /[ _-]final[ _-]?\d*$/i];

/** Skor "kualitas jalur": makin tinggi makin layak dipertahankan. */
export function qualityScore(f: FileEntry, settings: Settings): number {
  let score = 0;
  const { stem } = splitExt(f.name);
  if (COPY_MARKERS.some((re) => re.test(stem))) score -= 50;
  // Sudah berada di folder tujuan sesuai aturan = sudah rapi.
  const rule = findRule(settings.rules, f);
  if (rule) {
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
    if (pathKey(dir) === pathKey(renderFolder(rule.folderTemplate, f, rule.name))) score += 30;
  }
  if (isUnder(f.path, 'Download') || isUnder(f.path, 'Downloads') || isUnder(f.path, 'Unduhan')) score -= 10;
  score -= (f.path.split('/').length - 1) * 2; // jalur dangkal sedikit lebih baik
  score -= Math.min(baseName(f.path).length, 80) / 20; // nama ringkas sedikit lebih baik
  return score;
}

/**
 * Memilih satu berkas untuk dipertahankan. Pada duplikat persis, ukuran dan isi sama, jadi
 * "kualitas" dinilai dari jalur/nama (bukan piksel). Hasil seri diputuskan oleh tanggal tertua lalu jalur.
 */
export function pickKeeper(group: DuplicateGroup, strategy: KeeperStrategy, settings: Settings): FileEntry {
  const files = group.files;
  const tie = (a: FileEntry, b: FileEntry): number => a.mtime - b.mtime || a.path.localeCompare(b.path);
  const sorted = [...files].sort((a, b) => {
    switch (strategy) {
      case 'oldest':
        return tie(a, b);
      case 'newest':
        return b.mtime - a.mtime || a.path.localeCompare(b.path);
      case 'shortest-path':
        return a.path.length - b.path.length || tie(a, b);
      default:
        return qualityScore(b, settings) - qualityScore(a, settings) || tie(a, b);
    }
  });
  return sorted[0] as FileEntry;
}

export function reclaimableBytes(groups: DuplicateGroup[], keepers: Map<string, string>): number {
  let total = 0;
  for (const g of groups) {
    const keep = keepers.get(g.hash);
    total += g.files.filter((f) => f.path !== keep).length * g.size;
  }
  return total;
}
