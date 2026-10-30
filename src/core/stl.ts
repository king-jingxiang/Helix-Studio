import type { Op, PrintSettings } from './types';

/** 导出的最大采样点数，控制三角面数量与文件体积。 */
const MAX_POINTS = 40000;
/** 两段路径间隙小于该值（mm）时视为同一段墙体，直接连起来。 */
const MERGE_GAP = 3;
/** 首尾距离小于该值（mm）时视为闭合轮廓。 */
const CLOSE_EPS = 1e-3;
/** 每层轮廓重采样后的最大点数。 */
const RING_MAX_SAMPLES = 1024;
/** 每层轮廓重采样后的最少点数。 */
const RING_MIN_SAMPLES = 32;
/** 相邻两层轮廓中心距离小于该比例半径时，认为属于同一个实体。 */
const RUN_RADIUS_RATIO = 0.35;

const TAU = Math.PI * 2;

interface Chain {
  xs: number[];
  ys: number[];
  zs: number[];
  ws: number[];
  closed: boolean;
}

/** 一圈水平截面轮廓，按极角升序排列。 */
interface Ring {
  /** 该环的代表高度（环上各点 z 的均值）。 */
  z: number;
  cx: number;
  cy: number;
  /** 平均半径，用于判断相邻环是否属于同一实体。 */
  r: number;
  xs: number[];
  ys: number[];
  angles: number[];
}

export interface StlOutput {
  buffer: ArrayBuffer;
  triangles: number;
  points: number;
}

/** 把挤出路径按 travel 与间隙切成连续的墙体链条。 */
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

/**
 * 计算链条上每个点的外壁坐标：沿水平法向向外扩半个线宽。
 * 法向是否朝外由该点的径向方向校正，保证轮廓整体向外扩张。
 */
function outwardOffset(c: Chain): { ox: number[]; oy: number[] } {
  const n = c.xs.length;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += c.xs[i];
    cy += c.ys[i];
  }
  cx /= n;
  cy /= n;

  const ox = new Array<number>(n);
  const oy = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const a = c.closed ? (i - 1 + n) % n : Math.max(0, i - 1);
    const b = c.closed ? (i + 1) % n : Math.min(n - 1, i + 1);
    let tx = c.xs[b] - c.xs[a];
    let ty = c.ys[b] - c.ys[a];
    let len = Math.hypot(tx, ty);
    if (len < 1e-9) {
      const j = i + 1 < n ? i + 1 : i - 1;
      tx = c.xs[j] - c.xs[i];
      ty = c.ys[j] - c.ys[i];
      len = Math.hypot(tx, ty);
    }
    let nx = len < 1e-9 ? 1 : -ty / len;
    let ny = len < 1e-9 ? 0 : tx / len;
    if (nx * (c.xs[i] - cx) + ny * (c.ys[i] - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const hw = Math.max(0.05, c.ws[i]) / 2;
    ox[i] = c.xs[i] + nx * hw;
    oy[i] = c.ys[i] + ny * hw;
  }
  return { ox, oy };
}

/** 把链条切成“每转一圈一个环”，用 z 的均值作为该环的高度。 */
function collectRings(c: Chain, print: PrintSettings, out: Ring[]): void {
  const n = c.xs.length;
  if (n < 6) return;
  const { ox, oy } = outwardOffset(c);

  if (c.closed) {
    pushRing(c, ox, oy, 0, n, out);
    return;
  }

  // 以起点高度为基准按层高切分：螺旋每上升一个层高正好绕一圈，
  // 层叠路径每个闭合同样落在一个层高区间内。
  const lh = Math.max(0.05, print.layerHeight);
  const z0 = c.zs[0];
  let start = 0;
  let bucket = 0;
  for (let i = 1; i <= n; i++) {
    const b = i < n ? Math.floor((c.zs[i] - z0) / lh + 1e-6) : bucket + 1;
    if (b !== bucket) {
      pushRing(c, ox, oy, start, i, out);
      start = i;
      bucket = b;
    }
  }
}

/** 把链条的 [i0, i1) 区间做成一个闭合环，并按极角排序。 */
function pushRing(c: Chain, ox: number[], oy: number[], i0: number, i1: number, out: Ring[]): void {
  const m = i1 - i0;
  if (m < 4) return;

  let cx = 0;
  let cy = 0;
  let z = 0;
  for (let i = i0; i < i1; i++) {
    cx += ox[i];
    cy += oy[i];
    z += c.zs[i];
  }
  cx /= m;
  cy /= m;
  z /= m;

  const order: number[] = new Array(m);
  const angles: number[] = new Array(m);
  let r = 0;
  for (let i = i0; i < i1; i++) {
    const k = i - i0;
    const dx = ox[i] - cx;
    const dy = oy[i] - cy;
    let a = Math.atan2(dy, dx);
    if (a < 0) a += TAU;
    angles[k] = a;
    r += Math.hypot(dx, dy);
    order[k] = k;
  }
  r /= m;
  if (r < 1e-6) return;

  order.sort((p, q) => angles[p] - angles[q]);
  const xs = new Array<number>(m);
  const ys = new Array<number>(m);
  const ang = new Array<number>(m);
  for (let k = 0; k < m; k++) {
    const i = i0 + order[k];
    xs[k] = ox[i];
    ys[k] = oy[i];
    ang[k] = angles[order[k]];
  }
  out.push({ z, cx, cy, r, xs, ys, angles: ang });
}

/** 按极角把每个环统一重采样成 n 个点，使相邻环可以逐点连接。 */
function resampleRing(ring: Ring, n: number): void {
  const m = ring.xs.length;
  const src = ring.angles;
  const sx = ring.xs;
  const sy = ring.ys;
  const first = src[0];
  const xs = new Array<number>(n);
  const ys = new Array<number>(n);

  const angAt = (i: number) => (i < m ? src[i] : first + TAU);
  const xAt = (i: number) => (i < m ? sx[i] : sx[0]);
  const yAt = (i: number) => (i < m ? sy[i] : sy[0]);

  for (let j = 0; j < n; j++) {
    let t = (j / n) * TAU;
    if (t < first) t += TAU;
    let lo = 0;
    let hi = m;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (angAt(mid) <= t) lo = mid;
      else hi = mid - 1;
    }
    const i = Math.min(lo, m - 1);
    const a0 = angAt(i);
    const a1 = angAt(i + 1);
    const w = a1 - a0 > 1e-12 ? (t - a0) / (a1 - a0) : 0;
    xs[j] = xAt(i) + (xAt(i + 1) - xAt(i)) * w;
    ys[j] = yAt(i) + (yAt(i + 1) - yAt(i)) * w;
  }
  ring.xs = xs;
  ring.ys = ys;
  ring.angles = [];
}

/** 按高度与中心位置把环分组为若干竖直“柱”，每柱是一个独立实体。 */
function groupRuns(rings: Ring[]): Ring[][] {
  const sorted = rings.slice().sort((a, b) => a.z - b.z);
  const runs: Ring[][] = [];
  for (const ring of sorted) {
    let target: Ring[] | null = null;
    for (const run of runs) {
      const last = run[run.length - 1];
      const gap = Math.hypot(ring.cx - last.cx, ring.cy - last.cy);
      const tol = Math.max(1.5, Math.min(ring.r, last.r) * RUN_RADIUS_RATIO);
      if (gap <= tol && ring.z > last.z + 1e-6) {
        target = run;
        break;
      }
    }
    if (target) target.push(ring);
    else runs.push([ring]);
  }
  return runs;
}

/** 把一柱环挤成实心体：逐层侧壁 + 顶面 + 底面，形成封闭实体。 */
function emitRun(run: Ring[], layerHeight: number, w: StlWriter): void {
  const lh = Math.max(0.05, layerHeight);
  // 只有单圈轮廓（例如自定义脚本画了一个圆）时，向上补一个层高，做出薄片实体
  const stack = run.length < 2 ? [run[0], { ...run[0], z: run[0].z + lh }] : run;
  const n = stack[0].xs.length;

  for (let s = 0; s + 1 < stack.length; s++) {
    const lo = stack[s];
    const hi = stack[s + 1];
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      // 外侧面，两片三角形，法向朝外
      w.tri(lo.xs[j], lo.ys[j], lo.z, lo.xs[k], lo.ys[k], lo.z, hi.xs[k], hi.ys[k], hi.z);
      w.tri(lo.xs[j], lo.ys[j], lo.z, hi.xs[k], hi.ys[k], hi.z, hi.xs[j], hi.ys[j], hi.z);
    }
  }

  const base = stack[0];
  const top = stack[stack.length - 1];
  for (let j = 0; j < n; j++) {
    const k = (j + 1) % n;
    // 顶面朝上
    w.tri(top.cx, top.cy, top.z, top.xs[j], top.ys[j], top.z, top.xs[k], top.ys[k], top.z);
    // 底面朝下
    w.tri(base.cx, base.cy, base.z, base.xs[k], base.ys[k], base.z, base.xs[j], base.ys[j], base.z);
  }
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

/**
 * 由挤出路径生成可直接交给切片器的二进制 STL。坐标与 G-code 一致（打印床坐标系）。
 * 输出为实心体：把每圈路径还原成外壁轮廓，逐层连接并封顶封底，
 * 便于 BambuStudio 使用“旋转花瓶”模式打印。
 */
export function buildStl(ops: Op[], print: PrintSettings, name: string): StlOutput {
  const chains = collectChains(ops);
  if (!chains.length) throw new Error('没有可导出的几何路径');

  const total = chains.reduce((s, c) => s + c.xs.length, 0);
  const stride = Math.max(1, Math.ceil(total / MAX_POINTS));
  const rings: Ring[] = [];
  for (const c of chains) collectRings(decimate(c, stride), print, rings);
  if (!rings.length) throw new Error('没有可导出的几何路径');

  const samples = Math.min(
    RING_MAX_SAMPLES,
    Math.max(RING_MIN_SAMPLES, rings.reduce((s, r) => Math.max(s, r.xs.length), 0)),
  );
  for (const r of rings) resampleRing(r, samples);

  const runs = groupRuns(rings);
  if (!runs.length) throw new Error('没有可导出的几何路径');

  // 整体下移，让模型底面贴合打印床
  const floor = runs.reduce((m, r) => Math.min(m, r[0].z), Infinity);
  for (const run of runs) for (const ring of run) ring.z -= floor;

  const triangles = runs.reduce(
    (s, r) => s + 2 * samples * Math.max(1, r.length - 1) + 2 * samples,
    0,
  );
  const writer = new StlWriter(triangles, name);
  for (const run of runs) emitRun(run, print.layerHeight, writer);
  return {
    buffer: writer.finish(),
    triangles: writer.count,
    points: runs.reduce((s, r) => s + r.length * samples, 0),
  };
}
