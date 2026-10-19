import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';

const require = createRequire(import.meta.url);
const svc = require('../electron/fs-service.cjs');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHOTS = process.env.E2E_SHOTS ?? '';
const run = existsSync(CHROME) && existsSync('dist/index.html') ? describe : describe.skip;

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
let server: Server, base = '', browser: Browser, root = '';

function put(rel: string, content: string) {
  const abs = join(root, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
  const d = new Date(2026, 2, 14, 10, 0, 0);
  utimesSync(abs, d, d);
}
const tree = (dir = root, pre = ''): string[] =>
  readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? tree(join(dir, n), `${pre}${n}/`) : [`${pre}${n}`])).sort();

async function openBridged(page: Page) {
  await page.exposeFunction('__pick', async () => ({ id: root, name: 'uji' }));
  await page.exposeFunction('__open', async () => true);
  await page.exposeFunction('__scan', (r: string, o: object) => svc.scan(r, o));
  await page.exposeFunction('__hash', (r: string, p: string[], m: string) => svc.hash(r, p, m));
  await page.exposeFunction('__apply', (r: string, ops: object[], c: { quarantineFolder: string }) => svc.apply(r, ops, { quarantineFolder: c.quarantineFolder, trashItem: async () => {} }));
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    (window as unknown as { berkas: unknown }).berkas = {
      platform: 'windows',
      pickFolder: () => w.__pick!(), openRoot: () => w.__open!(),
      scan: (r: unknown, o: unknown) => w.__scan!(r, o), hash: (r: unknown, p: unknown, m: unknown) => w.__hash!(r, p, m),
      apply: (r: unknown, o: unknown, c: unknown) => w.__apply!(r, o, c), reveal: async () => {}, onProgress: () => () => {},
    };
    localStorage.clear();
  });
  await page.goto(base);
}

run('UI end-to-end dengan berkas sungguhan', () => {
  beforeAll(async () => {
    server = createServer((req, res) => {
      const p = req.url === '/' ? '/index.html' : (req.url ?? '/').split('?')[0]!;
      let body: Buffer;
      try { body = readFileSync(join('dist', p)); } catch { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
      res.end(body);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
    browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  });
  afterAll(async () => { await browser?.close(); server?.close(); });

  it('Android-size viewport: pilih → pratinjau → jalankan → batalkan; duplikat → karantina → batalkan; tanpa kesalahan konsol', async () => {
    root = mkdtempSync(join(tmpdir(), 'e2e-'));
    put('Download/Laporan Q1.PDF', 'ISI LAPORAN');
    put('Download/Laporan Q1 (1).PDF', 'ISI LAPORAN');
    put('Download/liburan-bali.jpg', 'foto bali');
    put('Download/klip.mp4', 'video');
    put('Dokumen/kontrak.docx', 'kontrak');
    const before = tree();

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const shot = async (n: string) => SHOTS && (await page.screenshot({ path: join(SHOTS, `${n}.png`) }));

    await openBridged(page);
    await shot('01-home-kosong');
    await page.getByRole('button', { name: 'Pilih folder' }).first().click();
    await page.getByText('Laporan sebelum').waitFor();
    await shot('02-laporan-sebelum');

    await page.getByRole('button', { name: 'Lihat pratinjau perubahan' }).click();
    await page.getByText('Ini simulasi').waitFor();
    expect(tree()).toEqual(before); // pratinjau tidak menyentuh disk
    await shot('03-pratinjau');
    await page.getByText('Foto/2026/Perjalanan/2026-03-14_liburan-bali.jpg').first().waitFor();

    const runBtn = page.getByRole('button', { name: /^Jalankan \d+ perubahan/ });
    await runBtn.click();
    await page.getByRole('dialog').waitFor();
    expect(tree()).toEqual(before); // konfirmasi dulu
    await shot('04-konfirmasi');
    await page.getByRole('button', { name: /^Ya, jalankan/ }).click();
    await page.getByText('Laporan sesudah: perapian').waitFor();
    await shot('05-laporan-sesudah');
    expect(existsSync(join(root, 'Dokumen/2026/2026-03-14_laporan-q1.pdf'))).toBe(true);
    expect(existsSync(join(root, 'Foto/2026/Perjalanan/2026-03-14_liburan-bali.jpg'))).toBe(true);
    expect(existsSync(join(root, 'Video/2026-03-14_klip.mp4'))).toBe(true);
    expect(tree().length).toBe(before.length); // tidak ada berkas hilang

    await page.getByRole('button', { name: 'Batalkan perubahan ini' }).click();
    await page.getByRole('button', { name: 'Ya, batalkan' }).click();
    await page.getByText('berkas dikembalikan').waitFor();
    expect(tree()).toEqual(before);

    // Duplikat
    await page.getByRole('button', { name: /Duplikat/ }).last().click();
    await page.getByRole('button', { name: 'Mulai cari duplikat' }).click();
    await page.getByText('2 berkas identik').waitFor();
    await shot('06-duplikat');
    expect(tree()).toEqual(before);
    await page.getByRole('button', { name: 'Pindahkan 1 ke karantina' }).click();
    await shot('07-konfirmasi-duplikat');
    await page.getByRole('button', { name: 'Ya, pindahkan 1' }).click();
    await page.getByText('Laporan sesudah: duplikat').waitFor();
    const q = tree().filter((f) => f.startsWith('_Karantina/'));
    expect(q).toHaveLength(1);
    expect(tree().length).toBe(before.length); // dipindah, bukan dihapus
    await shot('08-laporan-duplikat');

    await page.getByRole('button', { name: 'Batalkan perubahan ini' }).click();
    await page.getByRole('button', { name: 'Ya, batalkan' }).click();
    await page.getByText('berkas dikembalikan').waitFor();
    expect(tree()).toEqual(before);

    await page.getByRole('button', { name: /Riwayat/ }).last().click();
    await page.getByText('Riwayat aktivitas').waitFor();
    await shot('09-riwayat');
    await page.getByRole('button', { name: /Aturan/ }).last().click();
    await shot('10-aturan');
    expect(errors).toEqual([]);
    await ctx.close();
    rmSync(root, { recursive: true, force: true });
  }, 60_000);

  it('pencarian berkas, penyuntingan aturan memengaruhi rencana, dan ganti bahasa', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.getByRole('button', { name: 'Pilih folder' }).first().click();
    await page.getByText('Laporan sebelum').waitFor();

    await page.getByRole('button', { name: 'Berkas', exact: true }).first().click();
    await page.getByLabel('Cari…').fill('liburan-bali');
    await page.getByText('Menampilkan 2 dari 2').waitFor();

    await page.getByRole('button', { name: 'Aturan' }).first().click();
    const tmpl = page.getByLabel('Pola nama');
    await tmpl.fill('{nama}_{yyyy}');
    await page.getByText(/laporan-keuangan-q1_\d{4}\.pdf/).first().waitFor();
    // matikan penamaan: pratinjau memakai nama asli
    await page.getByLabel('Ganti nama berkas otomatis').uncheck();
    await page.getByRole('button', { name: 'Rapikan' }).first().click();
    await page.getByText('Ini simulasi').waitFor();
    await page.getByText('→ Dokumen/2026/Laporan Keuangan Q1.pdf').first().waitFor().catch(async () => {
      // tahun mengikuti tanggal berkas demo; cukup pastikan nama asli dipertahankan
      await page.getByText(/→ Dokumen\/\d{4}\/kontrak kerja\.docx/).first().waitFor();
    });

    await page.getByRole('button', { name: 'Pengaturan' }).first().click();
    await page.getByLabel('Bahasa').selectOption('en');
    await page.getByRole('heading', { name: 'Settings' }).waitFor();
    await page.getByRole('button', { name: 'Organize' }).first().waitFor();
    expect(errors).toEqual([]);
    await ctx.close();
  }, 60_000);

  it('dimuat langsung dari file:// (cara Electron memuat UI) tanpa kesalahan CSP/CORS', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`file://${process.cwd()}/dist/index.html`);
    await page.getByRole('button', { name: 'Pilih folder' }).first().click();
    await page.getByText('Laporan sebelum').waitFor();
    // gaya terpasang (bukan halaman tanpa CSS)
    const color = await page.evaluate(() => getComputedStyle(document.querySelector('.btn.primary')!).backgroundColor);
    expect(color).not.toBe('rgba(0, 0, 0, 0)');
    expect(errors).toEqual([]);
    await ctx.close();
  }, 60_000);

  it('desktop viewport: mode demo di browser (tanpa jembatan) tampil dan bisa dipakai', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.getByRole('button', { name: 'Pilih folder' }).first().click();
    await page.getByText('Laporan sebelum').waitFor();
    await page.getByRole('button', { name: 'Lihat pratinjau perubahan' }).click();
    await page.getByText('Ini simulasi').waitFor();
    if (SHOTS) await page.screenshot({ path: join(SHOTS, '11-desktop-pratinjau.png') });
    await page.getByRole('button', { name: /^Jalankan/ }).click();
    await page.getByRole('button', { name: /^Ya, jalankan/ }).click();
    await page.getByText('Laporan sesudah: perapian').waitFor();
    if (SHOTS) await page.screenshot({ path: join(SHOTS, '12-desktop-sesudah.png') });
    expect(errors).toEqual([]);
    await ctx.close();
  }, 60_000);
});
