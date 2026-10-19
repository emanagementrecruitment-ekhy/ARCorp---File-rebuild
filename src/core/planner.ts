import type { FileEntry, Plan, PlanItem, Settings } from './types.ts';
import { baseName, dirName, joinPath, pathKey, splitExt, isUnder } from './paths.ts';
import { findRule, renderFolder } from './rules.ts';
import { renderFileName } from './naming.ts';

/** Nama berkas dengan akhiran " (n)" sebelum ekstensi. */
function withSuffix(name: string, n: number): string {
  const { stem, ext } = splitExt(name);
  return ext ? `${stem} (${n}).${ext}` : `${stem} (${n})`;
}

/**
 * Membuat rencana perubahan. Tidak menyentuh disk.
 * Tidak pernah menghasilkan dua berkas dengan jalur akhir yang sama, dan tidak pernah menimpa berkas lain.
 */
export function buildPlan(entries: FileEntry[], settings: Settings): Plan {
  const quarantine = settings.quarantineFolder;
  const files = entries.filter((e) => !isUnder(e.path, quarantine));
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

  // Jalur yang sudah ada akan tetap ada kecuali berkas itu sendiri dipindahkan.
  const taken = new Map<string, string>(); // pathKey -> path asal pemilik
  for (const e of sorted) taken.set(pathKey(e.path), e.path);

  const items: PlanItem[] = [];
  let unchanged = 0;

  for (const e of sorted) {
    const rule = findRule(settings.rules, e);
    const folder = settings.organizeFolders
      ? rule
        ? renderFolder(rule.folderTemplate, e, rule.name)
        : renderFolder(settings.fallbackFolder, e, 'Lainnya')
      : dirName(e.path);
    const fileName = renderFileName(e, settings.naming, rule?.nameTemplate);
    let target = joinPath(folder, fileName);

    if (pathKey(target) === pathKey(e.path)) {
      // Boleh berubah hanya huruf besar/kecil; selain itu tidak ada perubahan.
      if (target === e.path) {
        unchanged++;
        continue;
      }
    }

    let conflict = false;
    let n = 2;
    let candidate = target;
    while (true) {
      const owner = taken.get(pathKey(candidate));
      if (owner === undefined || owner === e.path) break;
      conflict = true;
      candidate = joinPath(folder, withSuffix(fileName, n++));
    }
    target = candidate;

    if (target === e.path) {
      unchanged++;
      continue;
    }

    taken.delete(pathKey(e.path));
    taken.set(pathKey(target), e.path);

    const movedDir = dirName(target) !== dirName(e.path);
    const renamed = baseName(target) !== baseName(e.path);
    items.push({
      id: e.path,
      from: e.path,
      to: target,
      size: e.size,
      mtime: e.mtime,
      ruleId: rule?.id ?? 'fallback',
      ruleName: rule?.name ?? 'Lainnya',
      action: movedDir && renamed ? 'move+rename' : movedDir ? 'move' : 'rename',
      conflictResolved: conflict,
    });
  }

  const existingDirs = new Set<string>();
  for (const e of sorted) {
    let d = dirName(e.path);
    while (d) {
      existingDirs.add(pathKey(d));
      d = dirName(d);
    }
  }
  const newFolders = new Set<string>();
  for (const it of items) {
    let d = dirName(it.to);
    while (d) {
      if (!existingDirs.has(pathKey(d))) newFolders.add(d);
      d = dirName(d);
    }
  }

  return { items, unchanged, totalFiles: sorted.length, newFolders: [...newFolders].sort() };
}

/** Memastikan subset item yang dipilih pengguna tetap konsisten (tanpa bentrok). */
export function itemsToOperations(items: PlanItem[]) {
  return items.map((i) => ({ type: 'move' as const, from: i.from, to: i.to }));
}
