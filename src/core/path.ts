import type { Op, PrintSettings, Vec3 } from './types';

const EPS = 1e-5;

/** Accumulates ordered print moves in printer coordinates (mm). */
export class PathBuilder {
  readonly ops: Op[] = [];
  start: Vec3 | null = null;
  private last: Vec3 | null = null;

  constructor(
    private readonly print: PrintSettings,
    private readonly offsetX = print.bedX / 2,
    private readonly offsetY = print.bedY / 2,
  ) {}

  private layerFor(z: number): number {
    const lh = this.print.layerHeight;
    return Math.max(0, Math.floor((z - lh * 0.5) / lh + 1e-6));
  }

  private toWorld(x: number, y: number): [number, number] {
    return [x + this.offsetX, y + this.offsetY];
  }

  moveTo(x: number, y: number, z: number): void {
    const [wx, wy] = this.toWorld(x, y);
    if (!this.last) {
      this.start = { x: wx, y: wy, z };
      this.last = { x: wx, y: wy, z };
      return;
    }
    const dx = wx - this.last.x;
    const dy = wy - this.last.y;
    const dz = z - this.last.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < EPS) {
      this.last = { x: wx, y: wy, z };
      return;
    }
    this.ops.push({
      type: 'travel',
      x0: this.last.x,
      y0: this.last.y,
      z0: this.last.z,
      x1: wx,
      y1: wy,
      z1: z,
      width: 0,
      layer: this.layerFor(z),
    });
    if (!this.start) this.start = { x: this.last.x, y: this.last.y, z: this.last.z };
    this.last = { x: wx, y: wy, z };
  }

  extrudeTo(x: number, y: number, z: number, width = this.print.lineWidth): void {
    const [wx, wy] = this.toWorld(x, y);
    if (!this.last) {
      this.start = { x: wx, y: wy, z };
      this.last = { x: wx, y: wy, z };
      return;
    }
    const dx = wx - this.last.x;
    const dy = wy - this.last.y;
    const dz = z - this.last.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < EPS) return;
    this.ops.push({
      type: 'extrude',
      x0: this.last.x,
      y0: this.last.y,
      z0: this.last.z,
      x1: wx,
      y1: wy,
      z1: z,
      width: Math.max(0.05, width),
      layer: this.layerFor(z),
    });
    this.last = { x: wx, y: wy, z };
  }

  /** Extrudes a closed circle centered at (cx, cy) with radius r. */
  circle(cx: number, cy: number, r: number, z: number, segments = 180, width = this.print.lineWidth): void {
    const segs = Math.max(12, Math.round(segments));
    this.moveTo(cx + r, cy, z);
    for (let i = 1; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      this.extrudeTo(cx + r * Math.cos(a), cy + r * Math.sin(a), z, width);
    }
  }
}
