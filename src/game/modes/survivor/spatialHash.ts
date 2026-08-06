/** Uniform grid spatial hash for O(1) neighborhood queries. */
export class SpatialHash {
  private readonly cellSize: number;
  private readonly inv: number;
  private readonly buckets = new Map<number, number[]>();

  constructor(cellSize = 2.5) {
    this.cellSize = cellSize;
    this.inv = 1 / cellSize;
  }

  clear(): void {
    this.buckets.clear();
  }

  private key(cx: number, cz: number): number {
    // Perfect hash for reasonable arena coords
    return ((cx + 512) << 12) | (cz + 512);
  }

  insert(id: number, x: number, z: number): void {
    const cx = Math.floor(x * this.inv);
    const cz = Math.floor(z * this.inv);
    const k = this.key(cx, cz);
    let bucket = this.buckets.get(k);
    if (!bucket) {
      bucket = [];
      this.buckets.set(k, bucket);
    }
    bucket.push(id);
  }

  /** Collect ids in cells overlapping circle (x,z,r). */
  query(x: number, z: number, r: number, out: number[]): void {
    out.length = 0;
    const minX = Math.floor((x - r) * this.inv);
    const maxX = Math.floor((x + r) * this.inv);
    const minZ = Math.floor((z - r) * this.inv);
    const maxZ = Math.floor((z + r) * this.inv);
    for (let cx = minX; cx <= maxX; cx += 1) {
      for (let cz = minZ; cz <= maxZ; cz += 1) {
        const bucket = this.buckets.get(this.key(cx, cz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i += 1) out.push(bucket[i]!);
      }
    }
  }
}
