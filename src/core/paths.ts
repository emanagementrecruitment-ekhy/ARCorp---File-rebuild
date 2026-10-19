export const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1);
export const dirName = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
export const joinPath = (...parts: string[]): string => parts.filter(Boolean).join('/');

export function splitExt(name: string): { stem: string; ext: string } {
  const i = name.lastIndexOf('.');
  if (i <= 0 || i === name.length - 1) return { stem: name, ext: '' };
  return { stem: name.slice(0, i), ext: name.slice(i + 1).toLowerCase() };
}

const RESERVED_WIN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Membersihkan satu segmen nama agar aman di Windows, macOS, Linux, dan Android. */
export function sanitizeSegment(raw: string, maxLen = 120): string {
  let s = raw
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  if (s === '' || s === '.' || s === '..') s = '_';
  if (RESERVED_WIN.test(s)) s = `_${s}`;
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/[. ]+$/g, '');
  return s;
}

/** Membersihkan jalur folder relatif; membuang segmen kosong dan ".." */
export function sanitizeFolder(template: string): string {
  return template
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s !== '' && s !== '.' && s !== '..')
    .map((s) => sanitizeSegment(s))
    .join('/');
}

/** Kunci pembanding tanpa pengaruh huruf besar/kecil (Windows & macOS tidak membedakan). */
export const pathKey = (p: string): string => p.normalize('NFC').toLowerCase();

export function isUnder(path: string, folder: string): boolean {
  const k = pathKey(path);
  const f = pathKey(folder).replace(/\/+$/, '');
  return k === f || k.startsWith(f + '/');
}
