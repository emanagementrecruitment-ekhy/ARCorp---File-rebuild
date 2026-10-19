import { Capacitor } from '@capacitor/core';
import type { PlatformAdapter } from './adapter.ts';
import { electronAdapter } from './electron.ts';
import { androidAdapter } from './android.ts';
import { memoryAdapter } from './memory.ts';

export type { PlatformAdapter } from './adapter.ts';

/** Memilih adapter sesuai lingkungan. Web biasa memakai demo agar UI tetap bisa dicoba. */
export function detectAdapter(): PlatformAdapter {
  if (typeof window !== 'undefined' && window.berkas) return electronAdapter(window.berkas);
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') return androidAdapter();
  return memoryAdapter();
}
