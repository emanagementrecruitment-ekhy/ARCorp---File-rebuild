import { registerPlugin } from '@capacitor/core';
import type { FileEntry, OpResult, Operation, RootHandle } from '../core/index.ts';
import type { ApplyContext, PickResult, PlatformAdapter, ScanOptions } from './adapter.ts';

/** Plugin Kotlin: android/app/src/main/java/id/berkasrapi/app/SafFilesPlugin.kt */
interface SafFilesPlugin {
  pickFolder(): Promise<{ id?: string; name?: string; cancelled?: boolean }>;
  openRoot(o: { id: string }): Promise<{ ok: boolean }>;
  scan(o: { root: string } & ScanOptions): Promise<{ entries: FileEntry[] }>;
  hash(o: { root: string; paths: string[]; mode: string }): Promise<{ hashes: Record<string, string | null> }>;
  apply(o: { root: string; ops: Operation[]; quarantineFolder: string }): Promise<{ results: OpResult[] }>;
  addListener(event: 'progress', cb: (p: { count: number }) => void): Promise<{ remove: () => Promise<void> }>;
}

const Saf = registerPlugin<SafFilesPlugin>('SafFiles');

export function androidAdapter(): PlatformAdapter {
  return {
    platform: 'android',
    canTrash: false, // SAF tidak punya Recycle Bin; aplikasi memakai folder karantina di dalam folder pilihan
    needsPermissionExplainer: true,
    async pickFolder(): Promise<PickResult> {
      const r = await Saf.pickFolder();
      if (r.cancelled || !r.id) return null;
      return { id: r.id, name: r.name ?? 'Folder' };
    },
    async openRoot(root: RootHandle) {
      return (await Saf.openRoot({ id: root.id })).ok;
    },
    async scan(root, opts, onProgress) {
      const sub = onProgress ? await Saf.addListener('progress', (p) => onProgress(p.count)) : null;
      try {
        return (await Saf.scan({ root: root.id, ...opts })).entries;
      } finally {
        await sub?.remove();
      }
    },
    async hash(root, paths, mode) {
      return (await Saf.hash({ root: root.id, paths, mode })).hashes;
    },
    async apply(root, ops, ctx: ApplyContext) {
      return (await Saf.apply({ root: root.id, ops, quarantineFolder: ctx.quarantineFolder })).results;
    },
  };
}
