/** Tipe bersama untuk semua platform. Jalur selalu relatif terhadap folder yang dipilih pengguna, memakai "/". */

export interface FileEntry {
  /** Jalur relatif terhadap root, mis. "Download/laporan.pdf" */
  path: string;
  name: string;
  size: number;
  /** Tanggal modifikasi, epoch milidetik */
  mtime: number;
}

export interface RootHandle {
  /** Desktop: jalur absolut. Android: tree URI. Tidak pernah dikirim ke jaringan. */
  id: string;
  name: string;
}

export type MatchSpec = {
  exts?: string[];
  nameContains?: string[];
  nameRegex?: string;
  pathContains?: string[];
  minSize?: number;
  maxSize?: number;
};

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  match: MatchSpec;
  /** Mis. "Dokumen/{yyyy}". Token: {kategori} {yyyy} {mm} {dd} {ext} {proyek} {induk} */
  folderTemplate: string;
  /** Mengganti nama default; kosong = pakai pengaturan penamaan global */
  nameTemplate?: string;
}

export interface NamingSettings {
  enabled: boolean;
  /** Mis. "{yyyy}-{mm}-{dd}_{nama}". Token: {nama} {nama_asli} {yyyy} {mm} {dd} {ext} */
  template: string;
  /** Huruf kecil, spasi menjadi "-", hapus karakter tidak aman */
  slugify: boolean;
}

export interface Settings {
  rules: Rule[];
  fallbackFolder: string;
  naming: NamingSettings;
  organizeFolders: boolean;
  ignoreHidden: boolean;
  ignoreProjectFolders: boolean;
  quarantineFolder: string;
  language: 'id' | 'en';
}

export type PlanAction = 'move' | 'rename' | 'move+rename' | 'keep';

export interface PlanItem {
  id: string;
  from: string;
  to: string;
  size: number;
  mtime: number;
  ruleId: string;
  ruleName: string;
  action: PlanAction;
  /** true bila nama bentrok sehingga diberi akhiran (2), (3), ... */
  conflictResolved: boolean;
}

export interface Plan {
  items: PlanItem[];
  unchanged: number;
  totalFiles: number;
  newFolders: string[];
}

export type OpType = 'move' | 'quarantine' | 'trash' | 'discard';

export interface Operation {
  type: OpType;
  from: string;
  /** Wajib untuk move/quarantine. Kosong untuk trash/discard. */
  to?: string;
}

export type OpStatus = 'ok' | 'skipped' | 'failed';

export interface OpResult {
  op: Operation;
  status: OpStatus;
  reason?: string;
}

export interface DuplicateGroup {
  hash: string;
  size: number;
  files: FileEntry[];
}

export type KeeperStrategy = 'best' | 'oldest' | 'newest' | 'shortest-path';

export interface HistoryEntry {
  id: string;
  ts: number;
  kind: 'organize' | 'dedupe' | 'undo' | 'purge';
  rootId: string;
  rootName: string;
  results: OpResult[];
  summary: { moved: number; renamed: number; quarantined: number; trashed: number; failed: number; skipped: number; bytes: number };
  undone?: boolean;
  /** Untuk entri "undo": id entri asal */
  undoOf?: string;
}
