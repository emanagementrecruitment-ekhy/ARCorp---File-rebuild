import type { FileEntry, OpResult, Operation, RootHandle } from '../core/index.ts';
import type { ApplyContext, PickResult, PlatformAdapter, PlatformName, ScanOptions } from './adapter.ts';

interface BerkasBridge {
  platform: 'windows' | 'macos' | 'linux';
  pickFolder(): Promise<PickResult>;
  openRoot(root: string): Promise<boolean>;
  scan(root: string, opts: ScanOptions): Promise<FileEntry[]>;
  hash(root: string, rels: string[], mode: string): Promise<Record<string, string | null>>;
  apply(root: string, ops: Operation[], ctx: ApplyContext): Promise<OpResult[]>;
  reveal(root: string, rel?: string): Promise<void>;
  onProgress(cb: (p: { phase: string; count: number }) => void): () => void;
}

declare global {
  interface Window {
    berkas?: BerkasBridge;
  }
}

export function electronAdapter(b: BerkasBridge): PlatformAdapter {
  return {
    platform: b.platform as PlatformName,
    canTrash: true,
    needsPermissionExplainer: false,
    pickFolder: () => b.pickFolder(),
    openRoot: (r) => b.openRoot(r.id),
    async scan(root, opts, onProgress) {
      const off = onProgress ? b.onProgress((p) => p.phase === 'scan' && onProgress(p.count)) : () => {};
      try {
        return await b.scan(root.id, opts);
      } finally {
        off();
      }
    },
    hash: (r, paths, mode) => b.hash(r.id, paths, mode),
    apply: (r, ops, ctx) => b.apply(r.id, ops, ctx),
    reveal: (r, p) => b.reveal(r.id, p),
  };
}
