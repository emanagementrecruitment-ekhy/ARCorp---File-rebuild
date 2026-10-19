import type { FileEntry, OpResult, Operation, RootHandle } from '../core/index.ts';
import type { HashMode } from '../core/index.ts';

export type PlatformName = 'windows' | 'macos' | 'linux' | 'android' | 'web';

export interface ScanOptions {
  ignoreHidden: boolean;
  ignoreProjectFolders: boolean;
  quarantineFolder: string;
  /** Memindai hanya satu subfolder (dipakai untuk karantina) */
  onlyUnder?: string;
}

export interface ApplyContext {
  quarantineFolder: string;
}

export type PickResult = RootHandle | { error: string } | null;

/**
 * Satu-satunya pintu UI ke sistem berkas. Semua jalur relatif terhadap folder yang dipilih pengguna.
 * Implementasi: Electron (Windows/macOS), Capacitor+SAF (Android), memori (demo di browser).
 */
export interface PlatformAdapter {
  readonly platform: PlatformName;
  /** Recycle Bin / Trash sistem tersedia (hanya desktop) */
  readonly canTrash: boolean;
  /** Perlu penjelasan izin sebelum membuka pemilih folder sistem */
  readonly needsPermissionExplainer: boolean;
  pickFolder(): Promise<PickResult>;
  /** Memastikan folder tersimpan masih bisa diakses */
  openRoot(root: RootHandle): Promise<boolean>;
  scan(root: RootHandle, opts: ScanOptions, onProgress?: (count: number) => void): Promise<FileEntry[]>;
  hash(root: RootHandle, paths: string[], mode: HashMode): Promise<Record<string, string | null>>;
  apply(root: RootHandle, ops: Operation[], ctx: ApplyContext): Promise<OpResult[]>;
  reveal?(root: RootHandle, path?: string): Promise<void>;
}
