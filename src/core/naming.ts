import { splitExt, sanitizeSegment } from './paths.ts';
import type { NamingSettings } from './types.ts';

const ISO_PREFIX = /^\d{4}-\d{2}-\d{2}[_-]+/;
const pad = (n: number): string => String(n).padStart(2, '0');

export function dateParts(mtime: number): { yyyy: string; mm: string; dd: string } {
  // Memakai waktu lokal perangkat agar konsisten dengan yang dilihat pengguna.
  const d = new Date(mtime);
  return { yyyy: String(d.getFullYear()), mm: pad(d.getMonth() + 1), dd: pad(d.getDate()) };
}

export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Hapus awalan tanggal ISO supaya penamaan ulang tidak menumpuk (idempoten). */
export function stripDatePrefix(stem: string): string {
  const out = stem.replace(ISO_PREFIX, '');
  return out === '' ? stem : out;
}

export interface NameContext {
  name: string;
  mtime: number;
}

export function renderFileName(ctx: NameContext, naming: NamingSettings, templateOverride?: string): string {
  const { stem, ext } = splitExt(ctx.name);
  const template = templateOverride ?? (naming.enabled ? naming.template : '{nama_asli}');
  const clean = stripDatePrefix(stem);
  const nama = naming.slugify ? slugify(clean) || 'berkas' : clean;
  const { yyyy, mm, dd } = dateParts(ctx.mtime);
  const tokens: Record<string, string> = { nama, nama_asli: stem, yyyy, mm, dd, ext };
  let out = template.replace(/\{(\w+)\}/g, (_, k: string) => tokens[k] ?? '');
  // Template "{nama_asli}" tanpa perubahan harus mempertahankan nama persis.
  out = sanitizeSegment(out);
  return ext ? `${out}.${ext}` : out;
}
