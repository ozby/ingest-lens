/**
 * Inline t-digest implementation — Dunning "Computing Extremely Accurate
 * Quantiles Using t-Digests" (2019), simplified single-buffer variant.
 *
 * Pure ES2022. No Node APIs. Safe on Workers, Bun, Node, browsers.
 *
 * This is the reference impl Lane A Task 1.7 ships. Probed here first (p05)
 * so we know it works before the scenario blueprints consume it.
 */

interface Centroid {
  mean: number;
  count: number;
}

export class TDigest {
  readonly compression: number;
  private centroids: Centroid[] = [];
  private totalCount = 0;

  constructor(compression = 100) {
    if (compression < 20) throw new RangeError("compression must be ≥ 20");
    this.compression = compression;
  }

  record(value: number): void {
    if (!Number.isFinite(value)) return;
    const insertAt = this.findInsertPosition(value);
    this.centroids.splice(insertAt, 0, { mean: value, count: 1 });
    this.totalCount += 1;
    if (this.centroids.length > 10 * this.compression) this.compress();
  }

  recordAll(values: number[]): void {
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v !== undefined) this.record(v);
    }
  }

  percentile(p: number): number | null {
    if (p < 0 || p > 1) throw new RangeError("p must be ∈ [0, 1]");
    if (this.totalCount === 0) return null;
    this.compress();
    const target = p * this.totalCount;
    let cumulative = 0;
    for (let i = 0; i < this.centroids.length; i++) {
      const c = this.centroids[i]!;
      const half = c.count / 2;
      if (cumulative + half >= target) {
        if (i === 0) return c.mean;
        const prev = this.centroids[i - 1]!;
        const delta = c.mean - prev.mean;
        const mix = ((target - cumulative + half) / (c.count + prev.count)) * 0.5;
        return prev.mean + delta * mix + (c.mean - prev.mean) * 0.5;
      }
      cumulative += c.count;
    }
    return this.centroids[this.centroids.length - 1]!.mean;
  }

  count(): number {
    return this.totalCount;
  }

  merge(other: TDigest): void {
    for (let i = 0; i < other.centroids.length; i++) {
      const c = other.centroids[i]!;
      const insertAt = this.findInsertPosition(c.mean);
      this.centroids.splice(insertAt, 0, { mean: c.mean, count: c.count });
      this.totalCount += c.count;
    }
    this.compress();
  }

  private findInsertPosition(value: number): number {
    let lo = 0;
    let hi = this.centroids.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.centroids[mid]!.mean < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private compress(): void {
    if (this.centroids.length <= this.compression) return;
    const out: Centroid[] = [];
    let cumulative = 0;
    let current: Centroid | null = null;

    for (let i = 0; i < this.centroids.length; i++) {
      const c = this.centroids[i]!;
      if (current === null) {
        current = { mean: c.mean, count: c.count };
        continue;
      }
      const q = (cumulative + current.count + c.count / 2) / this.totalCount;
      const k = (4 * this.totalCount * q * (1 - q)) / this.compression;
      if (current.count + c.count <= Math.max(k, 1)) {
        const totalCount = current.count + c.count;
        current.mean = (current.mean * current.count + c.mean * c.count) / totalCount;
        current.count = totalCount;
      } else {
        cumulative += current.count;
        out.push(current);
        current = { mean: c.mean, count: c.count };
      }
    }
    if (current !== null) out.push(current);
    this.centroids = out;
  }
}
