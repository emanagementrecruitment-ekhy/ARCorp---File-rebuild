package id.berkasrapi.app;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.provider.DocumentsContract.Document;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.security.MessageDigest;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Akses berkas lewat Storage Access Framework (SAF).
 *
 * - Tidak memakai izin penyimpanan luas (READ/WRITE_EXTERNAL_STORAGE, MANAGE_EXTERNAL_STORAGE).
 * - Hanya folder yang dipilih pengguna lewat pemilih sistem (ACTION_OPEN_DOCUMENT_TREE) yang bisa diakses.
 * - Semua jalur dari UI relatif terhadap folder itu; segmen ".." dan kosong ditolak.
 * - Tidak pernah menimpa berkas yang ada. Penghapusan permanen hanya untuk isi folder karantina.
 */
@CapacitorPlugin(name = "SafFiles")
public class SafFilesPlugin extends Plugin {

    private static final long QUICK = 64 * 1024;
    private static final Set<String> SKIP_DIRS = new HashSet<>(Arrays.asList(
            ".git", ".svn", ".hg", "node_modules", "__pycache__", ".venv", "venv", ".idea", ".gradle"));
    private static final Set<String> SKIP_FILES = new HashSet<>(Arrays.asList(".ds_store", "thumbs.db", "desktop.ini"));
    private static final String[] PACKAGE_SUFFIX = {".app", ".photoslibrary", ".lrlibrary", ".fcpbundle", ".xcodeproj", ".framework"};

    /** Satu utas: operasi berkas berjalan berurutan dan tidak memblokir UI. */
    private final ExecutorService pool = Executors.newSingleThreadExecutor();

    @Override
    protected void handleOnDestroy() {
        pool.shutdownNow();
    }

    // ---------------------------------------------------------------- pemilih folder

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "pickFolderResult");
    }

    @ActivityCallback
    private void pickFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != android.app.Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject r = new JSObject();
            r.put("cancelled", true);
            call.resolve(r);
            return;
        }
        Uri tree = data.getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(tree,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (SecurityException e) {
            call.reject("permission-denied");
            return;
        }
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), tree);
        JSObject r = new JSObject();
        r.put("id", tree.toString());
        r.put("name", root != null && root.getName() != null ? root.getName() : "Folder");
        call.resolve(r);
    }

    @PluginMethod
    public void openRoot(PluginCall call) {
        String id = call.getString("id");
        JSObject r = new JSObject();
        boolean ok = false;
        if (id != null) {
            Uri tree = Uri.parse(id);
            for (android.content.UriPermission p : getContext().getContentResolver().getPersistedUriPermissions()) {
                if (p.getUri().equals(tree) && p.isReadPermission() && p.isWritePermission()) {
                    DocumentFile f = DocumentFile.fromTreeUri(getContext(), tree);
                    ok = f != null && f.exists();
                    break;
                }
            }
        }
        r.put("ok", ok);
        call.resolve(r);
    }

    // ---------------------------------------------------------------- model internal

    private static final class Node {
        final String docId;
        final String name;
        final String mime;
        final long size;
        final long mtime;
        final int flags;

        Node(String docId, String name, String mime, long size, long mtime, int flags) {
            this.docId = docId;
            this.name = name;
            this.mime = mime;
            this.size = size;
            this.mtime = mtime;
            this.flags = flags;
        }

        boolean isDir() {
            return Document.MIME_TYPE_DIR.equals(mime);
        }
    }

    /** Konteks satu folder pilihan dengan cache anak-anak per folder. */
    private final class Tree {
        final Uri tree;
        final ContentResolver cr;
        final String rootDocId;
        final Map<String, Map<String, Node>> cache = new HashMap<>();

        Tree(String id) {
            tree = Uri.parse(id);
            cr = getContext().getContentResolver();
            rootDocId = DocumentsContract.getTreeDocumentId(tree);
        }

        Uri docUri(String docId) {
            return DocumentsContract.buildDocumentUriUsingTree(tree, docId);
        }

        Map<String, Node> children(String parentDocId) {
            Map<String, Node> hit = cache.get(parentDocId);
            if (hit != null) return hit;
            Map<String, Node> out = new HashMap<>();
            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentDocId);
            String[] cols = {Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE,
                    Document.COLUMN_SIZE, Document.COLUMN_LAST_MODIFIED, Document.COLUMN_FLAGS};
            try (Cursor c = cr.query(childrenUri, cols, null, null, null)) {
                if (c != null) {
                    while (c.moveToNext()) {
                        String name = c.getString(1);
                        if (name == null) continue;
                        out.put(name, new Node(c.getString(0), name, c.getString(2),
                                c.isNull(3) ? -1 : c.getLong(3), c.isNull(4) ? 0 : c.getLong(4), c.isNull(5) ? 0 : c.getInt(5)));
                    }
                }
            } catch (RuntimeException e) {
                // folder tidak bisa dibaca: dianggap kosong
            }
            cache.put(parentDocId, out);
            return out;
        }

        /** Mencari anak menurut nama; cocok persis dulu, lalu tanpa beda huruf besar/kecil. */
        Node child(String parentDocId, String name) {
            Map<String, Node> m = children(parentDocId);
            Node n = m.get(name);
            if (n != null) return n;
            for (Node x : m.values()) if (x.name.equalsIgnoreCase(name)) return x;
            return null;
        }

        void invalidate(String parentDocId) {
            cache.remove(parentDocId);
        }
    }

    private static String[] segments(String rel) {
        if (rel == null || rel.isEmpty() || rel.indexOf('\0') >= 0) throw new IllegalArgumentException("bad-path");
        String[] parts = rel.split("/", -1);
        for (String p : parts) if (p.isEmpty() || p.equals(".") || p.equals("..")) throw new IllegalArgumentException("bad-path");
        return parts;
    }

    private static boolean isHidden(String name) {
        return name.startsWith(".");
    }

    private static boolean skipPackage(String name) {
        String l = name.toLowerCase(Locale.ROOT);
        for (String s : PACKAGE_SUFFIX) if (l.endsWith(s)) return true;
        return false;
    }

    // ---------------------------------------------------------------- pindai

    @PluginMethod
    public void scan(PluginCall call) {
        final String root = call.getString("root");
        final boolean ignoreHidden = Boolean.TRUE.equals(call.getBoolean("ignoreHidden", true));
        final boolean ignoreProject = Boolean.TRUE.equals(call.getBoolean("ignoreProjectFolders", true));
        final String quarantine = call.getString("quarantineFolder", "_Karantina");
        final String onlyUnder = call.getString("onlyUnder");
        pool.execute(() -> {
            try {
                Tree t = new Tree(root);
                JSArray out = new JSArray();
                String startDoc = t.rootDocId;
                String startRel = "";
                if (onlyUnder != null && !onlyUnder.isEmpty()) {
                    for (String seg : segments(onlyUnder)) {
                        Node n = t.child(startDoc, seg);
                        if (n == null || !n.isDir()) {
                            JSObject r = new JSObject();
                            r.put("entries", out);
                            call.resolve(r);
                            return;
                        }
                        startDoc = n.docId;
                        startRel = startRel.isEmpty() ? n.name : startRel + "/" + n.name;
                    }
                }
                ArrayDeque<String[]> stack = new ArrayDeque<>();
                stack.push(new String[]{startDoc, startRel});
                int count = 0;
                int lastTick = 0;
                while (!stack.isEmpty()) {
                    String[] cur = stack.pop();
                    for (Node n : t.children(cur[0]).values()) {
                        String rel = cur[1].isEmpty() ? n.name : cur[1] + "/" + n.name;
                        if ((n.flags & Document.FLAG_VIRTUAL_DOCUMENT) != 0) continue; // dokumen virtual (mis. Google Docs)
                        if (n.isDir()) {
                            if (onlyUnder == null && rel.equalsIgnoreCase(quarantine)) continue;
                            if (ignoreHidden && isHidden(n.name)) continue;
                            if (ignoreProject && SKIP_DIRS.contains(n.name)) continue;
                            if (skipPackage(n.name)) continue;
                            stack.push(new String[]{n.docId, rel});
                        } else {
                            if (SKIP_FILES.contains(n.name.toLowerCase(Locale.ROOT))) continue;
                            if (ignoreHidden && isHidden(n.name)) continue;
                            JSObject e = new JSObject();
                            e.put("path", rel);
                            e.put("name", n.name);
                            e.put("size", Math.max(0, n.size));
                            e.put("mtime", n.mtime);
                            out.put(e);
                            count++;
                            if (count - lastTick >= 200) {
                                lastTick = count;
                                JSObject p = new JSObject();
                                p.put("count", count);
                                notifyListeners("progress", p);
                            }
                        }
                    }
                    t.cache.remove(cur[0]); // hemat memori pada pohon besar
                }
                JSObject p = new JSObject();
                p.put("count", count);
                notifyListeners("progress", p);
                JSObject r = new JSObject();
                r.put("entries", out);
                call.resolve(r);
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()), e);
            }
        });
    }

    // ---------------------------------------------------------------- hash isi berkas

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format(Locale.ROOT, "%02x", x));
        return sb.toString();
    }

    private String hashOne(Tree t, String rel, boolean quick) throws Exception {
        String[] seg = segments(rel);
        String doc = t.rootDocId;
        Node n = null;
        for (String s : seg) {
            n = t.child(doc, s);
            if (n == null) return null;
            doc = n.docId;
        }
        if (n == null || n.isDir()) return null;
        Uri uri = t.docUri(n.docId);
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        long size = n.size;
        if (quick && size > QUICK * 2) {
            byte[] buf = new byte[(int) QUICK];
            boolean seeked = false;
            try (ParcelFileDescriptor pfd = t.cr.openFileDescriptor(uri, "r")) {
                if (pfd != null) {
                    try (FileInputStream in = new FileInputStream(pfd.getFileDescriptor())) {
                        FileChannel ch = in.getChannel();
                        ByteBuffer bb = ByteBuffer.wrap(buf);
                        int r1 = ch.read(bb, 0);
                        md.update(buf, 0, Math.max(r1, 0));
                        bb.clear();
                        int r2 = ch.read(bb, size - QUICK);
                        md.update(buf, 0, Math.max(r2, 0));
                        seeked = true;
                    }
                }
            } catch (IOException | RuntimeException e) {
                md.reset();
            }
            if (!seeked) {
                try (InputStream in = t.cr.openInputStream(uri)) {
                    if (in == null) return null;
                    int r1 = readFully(in, buf);
                    md.update(buf, 0, r1);
                    long toSkip = size - QUICK * 2;
                    while (toSkip > 0) {
                        long s = in.skip(toSkip);
                        if (s <= 0) break;
                        toSkip -= s;
                    }
                    int r2 = readFully(in, buf);
                    md.update(buf, 0, r2);
                }
            }
            md.update(String.valueOf(size).getBytes("UTF-8"));
            return hex(md.digest());
        }
        try (InputStream in = t.cr.openInputStream(uri)) {
            if (in == null) return null;
            byte[] buf = new byte[256 * 1024];
            int r;
            while ((r = in.read(buf)) > 0) md.update(buf, 0, r);
        }
        return hex(md.digest());
    }

    private static int readFully(InputStream in, byte[] buf) throws IOException {
        int off = 0;
        while (off < buf.length) {
            int r = in.read(buf, off, buf.length - off);
            if (r <= 0) break;
            off += r;
        }
        return off;
    }

    @PluginMethod
    public void hash(PluginCall call) {
        final String root = call.getString("root");
        final String mode = call.getString("mode", "full");
        final JSArray paths = call.getArray("paths");
        pool.execute(() -> {
            try {
                Tree t = new Tree(root);
                JSObject hashes = new JSObject();
                for (int i = 0; i < paths.length(); i++) {
                    String rel = paths.getString(i);
                    try {
                        String h = hashOne(t, rel, "quick".equals(mode));
                        hashes.put(rel, h == null ? JSONObject.NULL : h);
                    } catch (Exception e) {
                        hashes.put(rel, JSONObject.NULL);
                    }
                }
                JSObject r = new JSObject();
                r.put("hashes", hashes);
                call.resolve(r);
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()), e);
            }
        });
    }

    // ---------------------------------------------------------------- terapkan operasi

    private static final class Outcome {
        final String status;
        final String reason;

        Outcome(String status, String reason) {
            this.status = status;
            this.reason = reason;
        }

        static Outcome ok() {
            return new Outcome("ok", null);
        }

        static Outcome skipped(String r) {
            return new Outcome("skipped", r);
        }

        static Outcome failed(String r) {
            return new Outcome("failed", r);
        }
    }

    /** Menelusuri jalur folder tanpa membuat apa pun. Mengembalikan docId folder atau null. */
    private String findDir(Tree t, String[] segs, int count) {
        String doc = t.rootDocId;
        for (int i = 0; i < count; i++) {
            Node n = t.child(doc, segs[i]);
            if (n == null || !n.isDir()) return null;
            doc = n.docId;
        }
        return doc;
    }

    private String mkdirs(Tree t, String[] segs, int count) {
        String doc = t.rootDocId;
        for (int i = 0; i < count; i++) {
            Node n = t.child(doc, segs[i]);
            if (n == null) {
                Uri created;
                try {
                    created = DocumentsContract.createDocument(t.cr, t.docUri(doc), Document.MIME_TYPE_DIR, segs[i]);
                } catch (Exception e) {
                    return null;
                }
                if (created == null) return null;
                t.invalidate(doc);
                doc = DocumentsContract.getDocumentId(created);
            } else if (!n.isDir()) {
                return null;
            } else {
                doc = n.docId;
            }
        }
        return doc;
    }

    private Outcome moveFile(Tree t, String fromRel, String toRel) throws Exception {
        String[] from = segments(fromRel);
        String[] to = segments(toRel);
        String srcParent = findDir(t, from, from.length - 1);
        if (srcParent == null) return Outcome.skipped("missing");
        Node src = t.child(srcParent, from[from.length - 1]);
        if (src == null) return Outcome.skipped("missing");
        if (src.isDir()) return Outcome.skipped("not-a-file");
        String dstName = to[to.length - 1];

        String dstParentExisting = findDir(t, to, to.length - 1);
        if (dstParentExisting != null) {
            Node clash = t.child(dstParentExisting, dstName);
            // Hanya ganti huruf besar/kecil pada berkas yang sama yang boleh "bentrok".
            if (clash != null && !clash.docId.equals(src.docId)) return Outcome.skipped("exists");
        }
        String dstParent = dstParentExisting != null ? dstParentExisting : mkdirs(t, to, to.length - 1);
        if (dstParent == null) return Outcome.failed("mkdir-failed");

        Uri srcUri = t.docUri(src.docId);
        if (srcParent.equals(dstParent)) {
            if (src.name.equals(dstName)) return Outcome.ok();
            Uri r = DocumentsContract.renameDocument(t.cr, srcUri, dstName);
            t.invalidate(srcParent);
            return r != null ? Outcome.ok() : Outcome.failed("rename-failed");
        }

        boolean sameNameFree = t.child(dstParent, src.name) == null;
        if ((src.flags & Document.FLAG_SUPPORTS_MOVE) != 0 && sameNameFree) {
            try {
                Uri moved = DocumentsContract.moveDocument(t.cr, srcUri, t.docUri(srcParent), t.docUri(dstParent));
                if (moved != null) {
                    t.invalidate(srcParent);
                    t.invalidate(dstParent);
                    if (!src.name.equals(dstName)) {
                        Uri renamed = DocumentsContract.renameDocument(t.cr, moved, dstName);
                        t.invalidate(dstParent);
                        if (renamed == null) return Outcome.failed("rename-failed-after-move");
                    }
                    return Outcome.ok();
                }
            } catch (UnsupportedOperationException | IllegalStateException | SecurityException e) {
                // jatuh ke salin+verifikasi+hapus
            }
        }
        return copyThenDelete(t, src, srcParent, srcUri, dstParent, dstName);
    }

    /** Cadangan bila penyedia tidak mendukung move: salin, verifikasi ukuran, baru hapus sumber. */
    private Outcome copyThenDelete(Tree t, Node src, String srcParent, Uri srcUri, String dstParent, String dstName) throws Exception {
        String mime = src.mime == null ? "application/octet-stream" : src.mime;
        Uri dst = DocumentsContract.createDocument(t.cr, t.docUri(dstParent), mime, dstName);
        if (dst == null) return Outcome.failed("create-failed");
        t.invalidate(dstParent);
        long copied = 0;
        try (InputStream in = t.cr.openInputStream(srcUri); OutputStream out = t.cr.openOutputStream(dst, "w")) {
            if (in == null || out == null) throw new IOException("stream-null");
            byte[] buf = new byte[256 * 1024];
            int r;
            while ((r = in.read(buf)) > 0) {
                out.write(buf, 0, r);
                copied += r;
            }
        } catch (IOException | RuntimeException e) {
            try { DocumentsContract.deleteDocument(t.cr, dst); } catch (Exception ignored) { }
            return Outcome.failed("copy-failed");
        }
        if (src.size >= 0 && copied != src.size) {
            try { DocumentsContract.deleteDocument(t.cr, dst); } catch (Exception ignored) { }
            return Outcome.failed("copy-size-mismatch");
        }
        boolean deleted;
        try {
            deleted = DocumentsContract.deleteDocument(t.cr, srcUri);
        } catch (Exception e) {
            deleted = false;
        }
        t.invalidate(srcParent);
        if (!deleted) {
            // Jangan sampai ada dua salinan: batalkan hasil salinan.
            try { DocumentsContract.deleteDocument(t.cr, dst); } catch (Exception ignored) { }
            return Outcome.failed("delete-source-failed");
        }
        return Outcome.ok();
    }

    private Outcome discardFile(Tree t, String rel, String quarantine) {
        String[] segs = segments(rel);
        if (!segs[0].equalsIgnoreCase(quarantine)) return Outcome.failed("discard-only-in-quarantine");
        String parent = findDir(t, segs, segs.length - 1);
        if (parent == null) return Outcome.skipped("missing");
        Node n = t.child(parent, segs[segs.length - 1]);
        if (n == null) return Outcome.skipped("missing");
        if (n.isDir()) return Outcome.skipped("not-a-file");
        try {
            boolean ok = DocumentsContract.deleteDocument(t.cr, t.docUri(n.docId));
            t.invalidate(parent);
            return ok ? Outcome.ok() : Outcome.failed("delete-failed");
        } catch (Exception e) {
            return Outcome.failed("delete-failed");
        }
    }

    /** Menghapus folder yang sudah kosong (tidak pernah folder pilihan itu sendiri). */
    private void pruneEmpty(Tree t, Set<String> relDirs) {
        Set<String> done = new HashSet<>();
        for (String start : relDirs) {
            String cur = start;
            while (cur != null && !cur.isEmpty() && done.add(cur)) {
                String[] segs = cur.split("/");
                String doc = findDir(t, segs, segs.length);
                if (doc == null) break;
                t.invalidate(doc);
                if (!t.children(doc).isEmpty()) break;
                String parent = findDir(t, segs, segs.length - 1);
                try {
                    if (!DocumentsContract.deleteDocument(t.cr, t.docUri(doc))) break;
                } catch (Exception e) {
                    break;
                }
                if (parent != null) t.invalidate(parent);
                int i = cur.lastIndexOf('/');
                cur = i > 0 ? cur.substring(0, i) : null;
            }
        }
    }

    @PluginMethod
    public void apply(PluginCall call) {
        final String root = call.getString("root");
        final String quarantine = call.getString("quarantineFolder", "_Karantina");
        final JSArray ops = call.getArray("ops");
        pool.execute(() -> {
            try {
                Tree t = new Tree(root);
                JSArray results = new JSArray();
                Set<String> touched = new HashSet<>();
                List<JSONObject> list = new ArrayList<>();
                for (int i = 0; i < ops.length(); i++) list.add(ops.getJSONObject(i));
                for (JSONObject op : list) {
                    String type = op.optString("type");
                    String from = op.optString("from");
                    String to = op.isNull("to") ? null : op.optString("to", null);
                    Outcome o;
                    try {
                        switch (type) {
                            case "move":
                            case "quarantine":
                                if (to == null) o = Outcome.failed("missing-target");
                                else o = moveFile(t, from, to);
                                break;
                            case "discard":
                                o = discardFile(t, from, quarantine);
                                break;
                            case "trash":
                                o = Outcome.failed("trash-unavailable"); // SAF tidak punya Recycle Bin
                                break;
                            default:
                                o = Outcome.failed("unknown-op");
                        }
                    } catch (IllegalArgumentException e) {
                        o = Outcome.failed("bad-path");
                    } catch (Exception e) {
                        o = Outcome.failed(e.getClass().getSimpleName());
                    }
                    JSObject res = new JSObject();
                    res.put("op", op);
                    res.put("status", o.status);
                    if (o.reason != null) res.put("reason", o.reason);
                    results.put(res);
                    if ("ok".equals(o.status) && from.contains("/")) touched.add(from.substring(0, from.lastIndexOf('/')));
                }
                pruneEmpty(t, touched);
                JSObject r = new JSObject();
                r.put("results", results);
                call.resolve(r);
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()), e);
            }
        });
    }
}
