import type { Op, PrintSettings } from './types';

/** 导出的最大采样点数，控制三角面数量与文件体积。 */
const MAX_POINTS = 40000;
/** 两段路径间隙小于该值（mm）时视为同一段墙体，直接连起来。 */
const MERGE_GAP = 3;
/** 首尾距离小于该值（mm）时视为闭合轮廓。 */
const CLOSE_EPS = 1e-3;

interface Chain {
  xs: number[];
  ys: number[];
  zs: number[];
  ws: number[];
  closed: boolean;
}

export interface StlOutput {
  buffer: ArrayBuffer;
  triangles: number;
  points: number;
}

/**
 * 把挤出路径扫掠成一条有厚度的墙带：沿路径方向计算水平法向，
 * 每点生成 外上/外下/内上/内下 四个顶点，逐段拼成封闭实体。
 */
function collectChains(ops: Op[]): Chain[] {
  const chains: Chain[] = [];
  let cur: Chain | null = null;

  for (const op of ops) {
    if (op.type === 'travel') {
      if (cur) {
        chains.push(cur);
        cur = null;
      }
      continue;
    }
    if (!cur) {
      const prev = chains[chains.length - 1];
      if (prev) {
        const n = prev.xs.length;
        const gap = Math.hypot(
          prev.xs[n - 1] - op.x0,
          prev.ys[n - 1] - op.y0,
          prev.zs[n - 1] - op.z0,
        );
        if (gap <= MERGE_GAP) cur = chains.pop() ?? null;
      }
      if (!cur) cur = { xs: [op.x0], ys: [op.y0], zs: [op.z0], ws: [op.width], closed: false };
    }
    cur.xs.push(op.x1);
    cur.ys.push(op.y1);
    cur.zs.push(op.z1);
    cur.ws.push(op.width);
  }
  if (cur) chains.push(cur);

  for (const c of chains) finalizeChain(c);
  return chains.filter((c) => c.xs.length >= 2);
}

function finalizeChain(c: Chain): void {
  const n = c.xs.length;
  if (n < 3) return;
  const d = Math.hypot(c.xs[0] - c.xs[n - 1], c.ys[0] - c.ys[n - 1], c.zs[0] - c.zs[n - 1]);
  if (d < CLOSE_EPS) {
    c.closed = true;
    c.xs.pop();
    c.ys.pop();
    c.zs.pop();
    c.ws.pop();
  }
}

function decimate(c: Chain, stride: number): Chain {
  const n = c.xs.length;
  if (stride <= 1 || n <= 3) return c;
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  const ws: number[] = [];
  const keep = (i: number) => {
    xs.push(c.xs[i]);
    ys.push(c.ys[i]);
    zs.push(c.zs[i]);
    ws.push(c.ws[i]);
  };
  for (let i = 0; i < n; i += stride) keep(i);
  if (!c.closed && (n - 1) % stride !== 0) keep(n - 1);
  return { xs, ys, zs, ws, closed: c.closed };
}

/** 每点 4 个顶点：外上、外下、内上、内下，按 12 个分量存。 */
function buildFrames(c: Chain, lh: number): Float64Array {
  const n = c.xs.length;
  const out = new Float64Array(n * 12);
  for (let i = 0; i < n; i++) {
    let a: number;
    let b: number;
    if (c.closed) {
      a = (i - 1 + n) % n;
      b = (i + 1) % n;
    } else {
      a = Math.max(0, i - 1);
      b = Math.min(n - 1, i + 1);
    }
    let tx = c.xs[b] - c.xs[a];
    let ty = c.ys[b] - c.ys[a];
    let len = Math.hypot(tx, ty);
    if (len < 1e-9) {
      const j = i + 1 < n ? i + 1 : i - 1;
      tx = c.xs[j] - c.xs[i];
      ty = c.ys[j] - c.ys[i];
      len = Math.hypot(tx, ty);
    }
    const nx = len < 1e-9 ? 1 : -ty / len;
    const ny = len < 1e-9 ? 0 : tx / len;
    const hw = Math.max(0.05, c.ws[i]) / 2;
    const ox = c.xs[i] + nx * hw;
    const oy = c.ys[i] + ny * hw;
    const ix = c.xs[i] - nx * hw;
    const iy = c.ys[i] - ny * hw;
    const zt = c.zs[i];
    const zb = zt - lh;
    const o = i * 12;
    out[o] = ox;
    out[o + 1] = oy;
    out[o + 2] = zt;
    out[o + 3] = ox;
    out[o + 4] = oy;
    out[o + 5] = zb;
    out[o + 6] = ix;
    out[o + 7] = iy;
    out[o + 8] = zt;
    out[o + 9] = ix;
    out[o + 10] = iy;
    out[o + 11] = zb;
  }
  return out;
}

function chainTriangles(c: Chain): number {
  const n = c.xs.length;
  if (n < 2) return 0;
  const segs = c.closed ? n : n - 1;
  return segs * 8 + (c.closed ? 0 : 4);
}

class StlWriter {
  private readonly buf: ArrayBuffer;
  private readonly view: DataView;
  private offset = 84;
  count = 0;

  constructor(capacity: number, name: string) {
    this.buf = new ArrayBuffer(84 + capacity * 50);
    this.view = new DataView(this.buf);
    const header = `HELIX Studio binary STL - ${name}`.slice(0, 80);
    const bytes = new Uint8Array(this.buf, 0, 80);
    for (let i = 0; i < header.length; i++) bytes[i] = header.charCodeAt(i) & 0xff;
  }

  tri(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
  ): void {
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-10) return;
    nx /= len;
    ny /= len;
    nz /= len;

    const o = this.offset;
    const v = this.view;
    v.setFloat32(o, nx, true);
    v.setFloat32(o + 4, ny, true);
    v.setFloat32(o + 8, nz, true);
    v.setFloat32(o + 12, ax, true);
    v.setFloat32(o + 16, ay, true);
    v.setFloat32(o + 20, az, true);
    v.setFloat32(o + 24, bx, true);
    v.setFloat32(o + 28, by, true);
    v.setFloat32(o + 32, bz, true);
    v.setFloat32(o + 36, cx, true);
    v.setFloat32(o + 40, cy, true);
    v.setFloat32(o + 44, cz, true);
    v.setUint16(o + 48, 0, true);
    this.offset += 50;
    this.count++;
  }

  finish(): ArrayBuffer {
    this.view.setUint32(80, this.count, true);
    return this.buf.slice(0, 84 + this.count * 50);
  }
}

function emitChain(c: Chain, print: PrintSettings, w: StlWriter): void {
  const n = c.xs.length;
  const fr = buildFrames(c, Math.max(0.05, print.layerHeight));
  const segs = c.closed ? n : n - 1;
  const px = (i: number, k: number) => fr[i * 12 + k * 3];
  const py = (i: number, k: number) => fr[i * 12 + k * 3 + 1];
  const pz = (i: number, k: number) => fr[i * 12 + k * 3 + 2];

  for (let s = 0; s < segs; s++) {
    const i = s;
    const j = (s + 1) % n;
    // 外侧墙面
    w.tri(px(i, 0), py(i, 0), pz(i, 0), px(j, 0), py(j, 0), pz(j, 0), px(j, 1), py(j, 1), pz(j, 1));
    w.tri(px(i, 0), py(i, 0), pz(i, 0), px(j, 1), py(j, 1), pz(j, 1), px(i, 1), py(i, 1), pz(i, 1));
    // 内侧墙面
    w.tri(px(i, 2), py(i, 2), pz(i, 2), px(i, 3), py(i, 3), pz(i, 3), px(j, 3), py(j, 3), pz(j, 3));
    w.tri(px(i, 2), py(i, 2), pz(i, 2), px(j, 3), py(j, 3), pz(j, 3), px(j, 2), py(j, 2), pz(j, 2));
    // 顶面
    w.tri(px(i, 0), py(i, 0), pz(i, 0), px(i, 2), py(i, 2), pz(i, 2), px(j, 2), py(j, 2), pz(j, 2));
    w.tri(px(i, 0), py(i, 0), pz(i, 0), px(j, 2), py(j, 2), pz(j, 2), px(j, 0), py(j, 0), pz(j, 0));
    // 底面
    w.tri(px(i, 1), py(i, 1), pz(i, 1), px(j, 1), py(j, 1), pz(j, 1), px(j, 3), py(j, 3), pz(j, 3));
    w.tri(px(i, 1), py(i, 1), pz(i, 1), px(j, 3), py(j, 3), pz(j, 3), px(i, 3), py(i, 3), pz(i, 3));
  }

  if (!c.closed) {
    // 起止端面，保证实体封闭
    w.tri(px(0, 0), py(0, 0), pz(0, 0), px(0, 1), py(0, 1), pz(0, 1), px(0, 3), py(0, 3), pz(0, 3));
    w.tri(px(0, 0), py(0, 0), pz(0, 0), px(0, 3), py(0, 3), pz(0, 3), px(0, 2), py(0, 2), pz(0, 2));
    const e = n - 1;
    w.tri(px(e, 0), py(e, 0), pz(e, 0), px(e, 2), py(e, 2), pz(e, 2), px(e, 3), py(e, 3), pz(e, 3));
    w.tri(px(e, 0), py(e, 0), pz(e, 0), px(e, 3), py(e, 3), pz(e, 3), px(e, 1), py(e, 1), pz(e, 1));
  }
}

/** 由挤出路径生成可直接交给切片器的二进制 STL。坐标与 G-code 一致（打印床坐标系）。 */
export function buildStl(ops: Op[], print: PrintSettings, name: string): StlOutput {
  const chains = collectChains(ops);
  if (!chains.length) throw new Error('没有可导出的几何路径');

  const total = chains.reduce((s, c) => s + c.xs.length, 0);
  const stride = Math.max(1, Math.ceil(total / MAX_POINTS));
  const finalChains = chains.map((c) => decimate(c, stride));
  const triangles = finalChains.reduce((s, c) => s + chainTriangles(c), 0);
  if (triangles === 0) throw new Error('没有可导出的几何路径');

  const writer = new StlWriter(triangles, name);
  for (const c of finalChains) emitChain(c, print, writer);
  return {
    buffer: writer.finish(),
    triangles: writer.count,
    points: finalChains.reduce((s, c) => s + c.xs.length, 0),
  };
}
