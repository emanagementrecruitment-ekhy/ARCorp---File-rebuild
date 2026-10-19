import { defaultSettings, type DuplicateGroup, type FileEntry, type HistoryEntry, type KeeperStrategy, type Plan, type RootHandle, type Settings } from '../core/index.ts';
import type { PlatformAdapter } from '../platform/index.ts';

export type Route = 'home' | 'organize' | 'dupes' | 'files' | 'rules' | 'history' | 'settings';

const K = { settings: 'br.settings.v1', history: 'br.history.v1', roots: 'br.roots.v1' };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* penyimpanan penuh/diblokir: aplikasi tetap jalan */
  }
}

export interface Busy {
  label: string;
  done?: number;
  total?: number;
  cancel?: () => void;
}

export interface DupSelection {
  keeper: Map<string, string>; // hash -> path yang dipertahankan
  marked: Set<string>; // path yang ditandai
}

class AppState {
  adapter!: PlatformAdapter;
  settings: Settings = { ...defaultSettings(), ...load<Partial<Settings>>(K.settings, {}) };
  history: HistoryEntry[] = load<HistoryEntry[]>(K.history, []);
  recentRoots: RootHandle[] = load<RootHandle[]>(K.roots, []);
  root: RootHandle | null = null;
  entries: FileEntry[] = [];
  scannedAt = 0;
  plan: Plan | null = null;
  planSelected = new Set<string>();
  groups: DuplicateGroup[] | null = null;
  dup: DupSelection = { keeper: new Map(), marked: new Set() };
  dupStrategy: KeeperStrategy | 'manual' = 'best';
  dupMode: 'quarantine' | 'trash' = 'quarantine';
  route: Route = 'home';
  busy: Busy | null = null;
  lastReport: { kind: 'organize' | 'dedupe' | 'undo' | 'purge'; entryId: string } | null = null;
  private listeners: Array<() => void> = [];

  subscribe(fn: () => void): void {
    this.listeners.push(fn);
  }
  emit(): void {
    this.listeners.forEach((l) => l());
  }

  saveSettings(): void {
    save(K.settings, this.settings);
    this.plan = null; // rencana lama tidak berlaku lagi
  }
  saveHistory(): void {
    save(K.history, this.history);
  }
  rememberRoot(r: RootHandle): void {
    this.recentRoots = [r, ...this.recentRoots.filter((x) => x.id !== r.id)].slice(0, 6);
    save(K.roots, this.recentRoots);
  }
  forgetRoot(id: string): void {
    this.recentRoots = this.recentRoots.filter((x) => x.id !== id);
    save(K.roots, this.recentRoots);
  }
}

export const app = new AppState();
