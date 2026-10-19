import { id } from './id.ts';
import { en } from './en.ts';

export type Key = keyof typeof id;
const dicts = { id, en } as const;
let lang: 'id' | 'en' = 'id';

export function setLang(l: 'id' | 'en'): void {
  lang = l;
  document.documentElement.lang = l;
}
export const locale = (): string => (lang === 'id' ? 'id-ID' : 'en-US');

export function t(key: Key, params?: Record<string, string | number>): string {
  let s: string = dicts[lang][key] ?? dicts.id[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
