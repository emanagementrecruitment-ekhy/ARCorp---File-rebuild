import type { OpResult, Operation } from './types.ts';

export type Applier = (ops: Operation[]) => Promise<OpResult[]>;

/**
 * Menjalankan operasi; operasi yang dilewati karena tujuan sementara terisi
 * (mis. rantai pertukaran nama) dicoba sekali lagi setelah yang lain selesai.
 */
export async function runOperations(apply: Applier, ops: Operation[]): Promise<OpResult[]> {
  const first = await apply(ops);
  const retryIdx = first.map((r, i) => (r.status === 'skipped' && r.reason === 'exists' ? i : -1)).filter((i) => i >= 0);
  if (retryIdx.length === 0 || retryIdx.length === first.length) return first;
  const second = await apply(retryIdx.map((i) => (first[i] as OpResult).op));
  const merged = [...first];
  retryIdx.forEach((idx, k) => {
    merged[idx] = second[k] as OpResult;
  });
  return merged;
}
