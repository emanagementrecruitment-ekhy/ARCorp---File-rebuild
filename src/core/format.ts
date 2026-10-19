export function formatBytes(n: number, locale = 'id-ID'): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i === 0 || v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v)} ${units[i]}`;
}

export function formatDate(ms: number, locale = 'id-ID'): string {
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}
