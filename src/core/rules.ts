import type { Rule, Settings, MatchSpec } from './types.ts';
import { baseName, dirName, splitExt, sanitizeFolder } from './paths.ts';
import { dateParts } from './naming.ts';

const IMG = 'jpg,jpeg,png,heic,heif,webp,gif,bmp,tif,tiff,raw,dng,cr2,nef,arw,svg'.split(',');
const DOC = 'pdf,doc,docx,odt,txt,rtf,md,xls,xlsx,csv,ods,ppt,pptx,odp,epub'.split(',');
const VID = 'mp4,mov,mkv,avi,webm,3gp,m4v,wmv'.split(',');
const AUD = 'mp3,wav,flac,m4a,aac,ogg,opus,wma'.split(',');
const ARC = 'zip,rar,7z,tar,gz,tgz,bz2,xz,iso,dmg,apk,exe,msi,pkg,deb'.split(',');

export function defaultRules(): Rule[] {
  return [
    { id: 'foto-perjalanan', name: 'Foto perjalanan', enabled: true, match: { exts: IMG, nameContains: ['perjalanan', 'liburan', 'trip', 'travel', 'wisata'] }, folderTemplate: 'Foto/{yyyy}/Perjalanan' },
    { id: 'foto', name: 'Foto', enabled: true, match: { exts: IMG }, folderTemplate: 'Foto/{yyyy}' },
    { id: 'dokumen', name: 'Dokumen', enabled: true, match: { exts: DOC }, folderTemplate: 'Dokumen/{yyyy}' },
    { id: 'video', name: 'Video', enabled: true, match: { exts: VID }, folderTemplate: 'Video' },
    { id: 'audio', name: 'Audio', enabled: true, match: { exts: AUD }, folderTemplate: 'Audio' },
    { id: 'arsip', name: 'Arsip', enabled: true, match: { exts: ARC }, folderTemplate: 'Arsip' },
  ];
}

export function defaultSettings(): Settings {
  return {
    rules: defaultRules(),
    fallbackFolder: 'Lainnya',
    naming: { enabled: true, template: '{yyyy}-{mm}-{dd}_{nama}', slugify: true },
    organizeFolders: true,
    ignoreHidden: true,
    ignoreProjectFolders: true,
    quarantineFolder: '_Karantina',
    language: 'id',
  };
}

function safeRegex(src: string): RegExp | null {
  try {
    return new RegExp(src, 'i');
  } catch {
    return null;
  }
}

export function matches(m: MatchSpec, f: { path: string; name: string; size: number }): boolean {
  const { ext } = splitExt(f.name);
  const lname = f.name.toLowerCase();
  const lpath = f.path.toLowerCase();
  if (m.exts?.length && !m.exts.map((e) => e.toLowerCase().replace(/^\./, '')).includes(ext)) return false;
  if (m.nameContains?.length && !m.nameContains.some((s) => s && lname.includes(s.toLowerCase()))) return false;
  if (m.pathContains?.length && !m.pathContains.some((s) => s && lpath.includes(s.toLowerCase()))) return false;
  if (m.nameRegex) {
    const re = safeRegex(m.nameRegex);
    if (!re || !re.test(f.name)) return false;
  }
  if (m.minSize !== undefined && f.size < m.minSize) return false;
  if (m.maxSize !== undefined && f.size > m.maxSize) return false;
  // Aturan kosong total tidak boleh menangkap semua berkas secara tidak sengaja.
  const hasCriteria = Boolean(m.exts?.length || m.nameContains?.length || m.pathContains?.length || m.nameRegex || m.minSize !== undefined || m.maxSize !== undefined);
  return hasCriteria;
}

export function findRule(rules: Rule[], f: { path: string; name: string; size: number }): Rule | undefined {
  return rules.find((r) => r.enabled && matches(r.match, f));
}

export function renderFolder(
  template: string,
  f: { path: string; name: string; mtime: number },
  kategori: string,
): string {
  const { ext } = splitExt(f.name);
  const { yyyy, mm, dd } = dateParts(f.mtime);
  const dir = dirName(f.path);
  const proyek = dir.split('/')[0] || 'Tanpa Proyek';
  const induk = dir ? baseName(dir) : 'Tanpa Induk';
  const tokens: Record<string, string> = { kategori, yyyy, mm, dd, ext: ext || 'tanpa-ekstensi', proyek, induk };
  return sanitizeFolder(template.replace(/\{(\w+)\}/g, (_, k: string) => tokens[k] ?? ''));
}
