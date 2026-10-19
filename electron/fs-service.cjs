'use strict';
/**
 * Layanan berkas lokal untuk desktop. Dipakai oleh proses utama Electron dan oleh tes Node.
 * Semua jalur dari UI bersifat RELATIF terhadap folder yang dipilih pengguna (root) dan
 * diverifikasi tetap berada di dalam root (termasuk terhadap symlink).
 */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const SKIP_DIRS = new Set(['.git', '.svn', '.hg', 'node_modules', '__pycache__', '.venv', 'venv', '.idea', '.gradle']);
const SKIP_FILES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);
const PACKAGE_SUFFIX = ['.app', '.photoslibrary', '.lrlibrary', '.fcpbundle', '.xcodeproj', '.framework'];
const QUICK = 64 * 1024;

/** [awalan-terlarang, persis-terlarang]. Folder di bawah "persis" (mis. /var/folders di macOS) tetap boleh. */
function protectedLists() {
  if (process.platform === 'win32') {
    const prefix = [];
    for (const k of ['SystemRoot', 'windir', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramData']) if (process.env[k]) prefix.push(process.env[k]);
    prefix.push('C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData');
    return { prefix, exact: [] };
  }
  return {
    prefix: ['/bin', '/sbin', '/usr', '/etc', '/lib', '/lib64', '/boot', '/dev', '/proc', '/sys', '/System', '/Library', '/Applications', '/cores'],
    exact: ['/', '/var', '/opt', '/private', '/Volumes', '/root', '/home', '/Users'],
  };
}

const norm = (p) => (process.platform === 'win32' || process.platform === 'darwin' ? p.toLowerCase() : p);

/** Menolak folder sistem, root drive, dan folder rumah itu sendiri. Mengembalikan alasan atau null. */
function protectedReason(absRoot) {
  const r = path.resolve(absRoot);
  if (path.parse(r).root === r) return 'drive-root';
  if (norm(r) === norm(path.resolve(os.homedir()))) return 'home';
  const { prefix, exact } = protectedLists();
  for (const p of exact) if (norm(r) === norm(path.resolve(p))) return 'system';
  for (const p of prefix) {
    const pr = path.resolve(p);
    if (norm(r) === norm(pr) || norm(r).startsWith(norm(pr) + path.sep)) return 'system';
  }
  return null;
}

async function realRoot(root) {
  const real = await fsp.realpath(root);
  const st = await fsp.stat(real);
  if (!st.isDirectory()) throw new Error('not-a-directory');
  const why = protectedReason(real);
  if (why) {
    const e = new Error('protected-root');
    e.reason = why;
    throw e;
  }
  return real;
}

function rel2abs(rootReal, rel) {
  if (typeof rel !== 'string' || rel === '' || rel.includes('\0')) throw new Error('bad-path');
  const parts = rel.split('/');
  if (parts.some((p) => p === '..' || p === '' || p === '.')) throw new Error('bad-path');
  const abs = path.join(rootReal, ...parts);
  if (!abs.startsWith(rootReal + path.sep)) throw new Error('outside-root');
  return abs;
}

/** Pastikan induk terdekat yang ada (setelah symlink diselesaikan) masih di dalam root. */
async function assertInsideReal(rootReal, abs) {
  let cur = path.dirname(abs);
  while (!fs.existsSync(cur)) cur = path.dirname(cur);
  const real = await fsp.realpath(cur);
  if (real !== rootReal && !real.startsWith(rootReal + path.sep)) throw new Error('outside-root');
}

function isHiddenName(n) {
  return n.startsWith('.');
}

async function scan(root, opts = {}, onProgress) {
  const rootReal = await realRoot(root);
  const { ignoreHidden = true, ignoreProjectFolders = true, quarantineFolder = '_Karantina', onlyUnder } = opts;
  const out = [];
  const startRel = onlyUnder ? onlyUnder : '';
  const startAbs = startRel ? rel2abs(rootReal, startRel) : rootReal;
  if (startRel && !fs.existsSync(startAbs)) return out;
  const stack = [startRel];
  let lastTick = 0;
  while (stack.length) {
    const relDir = stack.pop();
    const absDir = relDir ? path.join(rootReal, ...relDir.split('/')) : rootReal;
    let dir;
    try {
      dir = await fsp.opendir(absDir);
    } catch {
      continue; // folder tidak bisa dibaca: lewati, jangan gagal total
    }
    for await (const d of dir) {
      const name = d.name;
      const rel = relDir ? `${relDir}/${name}` : name;
      if (d.isSymbolicLink()) continue; // tidak mengikuti symlink
      if (d.isDirectory()) {
        if (!onlyUnder && rel.toLowerCase() === quarantineFolder.toLowerCase()) continue;
        if (ignoreHidden && isHiddenName(name)) continue;
        if (ignoreProjectFolders && SKIP_DIRS.has(name)) continue;
        if (PACKAGE_SUFFIX.some((s) => name.toLowerCase().endsWith(s))) continue;
        stack.push(rel);
      } else if (d.isFile()) {
        if (SKIP_FILES.has(name.toLowerCase())) continue;
        if (ignoreHidden && isHiddenName(name)) continue;
        try {
          const st = await fsp.stat(path.join(absDir, name));
          out.push({ path: rel, name, size: st.size, mtime: Math.round(st.mtimeMs) });
        } catch {
          /* hilang saat dipindai */
        }
        if (onProgress && out.length - lastTick >= 200) {
          lastTick = out.length;
          onProgress({ phase: 'scan', count: out.length });
        }
      }
    }
  }
  onProgress?.({ phase: 'scan', count: out.length });
  return out;
}

async function hashOne(abs, mode) {
  const st = await fsp.stat(abs);
  const h = crypto.createHash('sha256');
  if (mode === 'quick' && st.size > QUICK * 2) {
    const fh = await fsp.open(abs, 'r');
    try {
      const buf = Buffer.alloc(QUICK);
      let r = await fh.read(buf, 0, QUICK, 0);
      h.update(buf.subarray(0, r.bytesRead));
      r = await fh.read(buf, 0, QUICK, st.size - QUICK);
      h.update(buf.subarray(0, r.bytesRead));
      h.update(String(st.size));
    } finally {
      await fh.close();
    }
    return h.digest('hex');
  }
  await new Promise((resolve, reject) => {
    const s = fs.createReadStream(abs);
    s.on('data', (c) => h.update(c));
    s.on('error', reject);
    s.on('end', resolve);
  });
  return h.digest('hex');
}

async function hash(root, rels, mode = 'full') {
  const rootReal = await realRoot(root);
  const out = {};
  for (const rel of rels) {
    try {
      out[rel] = await hashOne(rel2abs(rootReal, rel), mode);
    } catch {
      out[rel] = null;
    }
  }
  return out;
}

async function pruneEmptyDirs(rootReal, relDirs) {
  const done = new Set();
  for (const start of relDirs) {
    let cur = start;
    while (cur && !done.has(cur)) {
      done.add(cur);
      try {
        await fsp.rmdir(path.join(rootReal, ...cur.split('/'))); // hanya berhasil jika kosong
      } catch {
        break;
      }
      cur = cur.includes('/') ? cur.slice(0, cur.lastIndexOf('/')) : '';
    }
  }
}

async function sameFile(a, b) {
  try {
    const [sa, sb] = await Promise.all([fsp.stat(a), fsp.stat(b)]);
    return sa.ino === sb.ino && sa.dev === sb.dev;
  } catch {
    return false;
  }
}

async function moveFile(rootReal, fromRel, toRel) {
  const src = rel2abs(rootReal, fromRel);
  const dst = rel2abs(rootReal, toRel);
  await assertInsideReal(rootReal, dst);
  const sst = await fsp.lstat(src).catch(() => null);
  if (!sst) return { status: 'skipped', reason: 'missing' };
  if (!sst.isFile()) return { status: 'skipped', reason: 'not-a-file' };
  const dstExists = await fsp.lstat(dst).then(() => true).catch(() => false);
  if (dstExists) {
    // Ganti huruf besar/kecil pada sistem berkas yang tidak membedakan = berkas yang sama.
    if (src.toLowerCase() === dst.toLowerCase() && (await sameFile(src, dst))) {
      const tmp = `${dst}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      await fsp.rename(src, tmp);
      await fsp.rename(tmp, dst);
      return { status: 'ok' };
    }
    return { status: 'skipped', reason: 'exists' }; // tidak pernah menimpa
  }
  await fsp.mkdir(path.dirname(dst), { recursive: true });
  try {
    await fsp.rename(src, dst);
  } catch (e) {
    if (e && e.code === 'EXDEV') {
      await fsp.copyFile(src, dst, fs.constants.COPYFILE_EXCL);
      const dstat = await fsp.stat(dst);
      if (dstat.size !== sst.size) {
        await fsp.rm(dst, { force: true });
        throw new Error('copy-size-mismatch');
      }
      await fsp.unlink(src);
    } else throw e;
  }
  return { status: 'ok' };
}

/**
 * Menjalankan operasi satu per satu. Tidak ada penghapusan permanen kecuali op "discard",
 * yang HANYA diizinkan untuk berkas di dalam folder karantina.
 */
async function apply(root, ops, ctx = {}) {
  const rootReal = await realRoot(root);
  const quarantine = (ctx.quarantineFolder || '_Karantina').toLowerCase();
  const results = [];
  const touchedDirs = new Set();
  for (const op of ops) {
    try {
      let r;
      if (op.type === 'move' || op.type === 'quarantine') {
        if (!op.to) throw new Error('missing-target');
        r = await moveFile(rootReal, op.from, op.to);
      } else if (op.type === 'trash') {
        if (!ctx.trashItem) throw new Error('trash-unavailable');
        const abs = rel2abs(rootReal, op.from);
        if (!(await fsp.lstat(abs).catch(() => null))) r = { status: 'skipped', reason: 'missing' };
        else {
          await ctx.trashItem(abs);
          r = { status: 'ok' };
        }
      } else if (op.type === 'discard') {
        if (op.from.split('/')[0].toLowerCase() !== quarantine) throw new Error('discard-only-in-quarantine');
        const abs = rel2abs(rootReal, op.from);
        const st = await fsp.lstat(abs).catch(() => null);
        if (!st) r = { status: 'skipped', reason: 'missing' };
        else if (!st.isFile()) r = { status: 'skipped', reason: 'not-a-file' };
        else {
          await fsp.unlink(abs);
          r = { status: 'ok' };
        }
      } else throw new Error('unknown-op');
      results.push({ op, ...r });
      if (r.status === 'ok' && op.from.includes('/')) touchedDirs.add(op.from.slice(0, op.from.lastIndexOf('/')));
    } catch (e) {
      results.push({ op, status: 'failed', reason: String((e && e.code) || (e && e.message) || e) });
    }
  }
  await pruneEmptyDirs(rootReal, [...touchedDirs]);
  return results;
}

module.exports = { scan, hash, apply, protectedReason, realRoot, rel2abs };
