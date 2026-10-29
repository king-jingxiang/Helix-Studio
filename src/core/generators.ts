import type { ParamValues, PrintSettings } from './types';
import type { PathBuilder } from './path';

const TAU = Math.PI * 2;

const num = (p: ParamValues, key: string): number => {
  const v = Number(p[key]);
  return Number.isFinite(v) ? v : 0;
};
const str = (p: ParamValues, key: string): string => String(p[key] ?? '');

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function profileRadius(p: ParamValues, t: number): number {
  const base = lerp(num(p, 'bottomRadius'), num(p, 'topRadius'), t);
  const belly = num(p, 'belly');
  if (belly <= 0 || str(p, 'shape') === 'straight') return base;
  const at = num(p, 'bellyAt');
  const bump = Math.exp(-Math.pow((t - at) / 0.32, 2));
  if (str(p, 'shape') === 'hourglass') return Math.max(4, base - belly * bump);
  return base + belly * bump;
}

function spiralSamples(print: PrintSettings, detail: number, meanR: number): number {
  const spacing = 2.4 / clamp(detail, 1, 3);
  return clamp(Math.round((TAU * Math.max(meanR, 12)) / spacing), 48, 1200);
}

/** 连续螺旋花瓶：一整条螺旋路径，每转上升一个层高。 */
export function spiralVase(p: ParamValues, print: PrintSettings, b: PathBuilder): void {
  const h = Math.max(10, num(p, 'height'));
  const lh = print.layerHeight;
  const turns = Math.max(1, Math.round(h / lh));
  const meanR =
    Math.max(num(p, 'bottomRadius'), num(p, 'topRadius')) + Math.max(0, num(p, 'belly')) * 0.6;
  const perTurn = spiralSamples(print, num(p, 'detail'), meanR);
  const total = turns * perTurn;

  const lobes = Math.round(num(p, 'lobes'));
  const lobeDepth = num(p, 'lobeDepth');
  const twist = num(p, 'twist');
  const waves = Math.round(num(p, 'waves'));
  const waveAmp = num(p, 'waveAmp');

  for (let i = 0; i <= total; i++) {
    const t = i / total;
    const theta = t * TAU * turns;
    const z = lh + t * (h - lh);
    let r = profileRadius(p, t);
    if (lobes > 0 && lobeDepth > 0) {
      r *= 1 + lobeDepth * Math.cos(lobes * theta + twist * TAU * t);
    }
    if (waves > 0 && waveAmp > 0) {
      r += waveAmp * Math.sin(waves * TAU * t);
    }
    r = Math.max(2, r);
    b.extrudeTo(r * Math.cos(theta), r * Math.sin(theta), z, print.lineWidth);
  }
}

/** 正多边形截面，随高度扭转。 */
export function polygonVase(p: ParamValues, print: PrintSettings, b: PathBuilder): void {
  const h = Math.max(10, num(p, 'height'));
  const lh = print.layerHeight;
  const turns = Math.max(1, Math.round(h / lh));
  const sides = clamp(Math.round(num(p, 'sides')), 3, 24);
  const roundness = clamp(num(p, 'roundness'), 0, 1);
  const twist = num(p, 'twist');
  const sec = TAU / sides;
  const meanR = Math.max(num(p, 'bottomRadius'), num(p, 'topRadius'));
  const perTurn = spiralSamples(print, num(p, 'detail'), meanR);
  const total = turns * perTurn;

  for (let i = 0; i <= total; i++) {
    const t = i / total;
    const theta = t * TAU * turns;
    const z = lh + t * (h - lh);
    const base = lerp(num(p, 'bottomRadius'), num(p, 'topRadius'), t);
    const phi = theta + twist * TAU * t;
    const local = (((phi % sec) + sec) % sec) - sec / 2;
    const poly = (base * Math.cos(Math.PI / sides)) / Math.max(0.35, Math.cos(local));
    const r = Math.max(2, lerp(base, poly, roundness));
    b.extrudeTo(r * Math.cos(theta), r * Math.sin(theta), z, print.lineWidth);
  }
}

/** 波浪与细纹叠加的有机曲面。 */
export function rippleVase(p: ParamValues, print: PrintSettings, b: PathBuilder): void {
  const h = Math.max(10, num(p, 'height'));
  const lh = print.layerHeight;
  const turns = Math.max(1, Math.round(h / lh));
  const radius = Math.max(5, num(p, 'radius'));
  const taper = clamp(num(p, 'taper'), 0, 0.9);
  const waves = Math.max(1, Math.round(num(p, 'waves')));
  const waveAmp = num(p, 'waveAmp');
  const ripples = Math.max(1, Math.round(num(p, 'ripples')));
  const rippleDepth = clamp(num(p, 'rippleDepth'), 0, 0.5);
  const perTurn = spiralSamples(print, num(p, 'detail'), radius + waveAmp);
  const total = turns * perTurn;

  for (let i = 0; i <= total; i++) {
    const t = i / total;
    const theta = t * TAU * turns;
    const z = lh + t * (h - lh);
    const base = radius * (1 - taper * t);
    const ripple = rippleDepth * Math.sin(ripples * theta + 2.4 * t * TAU);
    const wave = waveAmp * Math.sin(waves * TAU * t + 0.8 * Math.sin(theta * 3 + t * TAU));
    const r = Math.max(2, base * (1 + ripple) + wave * Math.sin(t * Math.PI));
    b.extrudeTo(r * Math.cos(theta), r * Math.sin(theta), z, print.lineWidth);
  }
}

/** 逐层闭合的环形路径，层间旋转形成花瓣纹理。 */
export function stackedVase(p: ParamValues, print: PrintSettings, b: PathBuilder): void {
  const h = Math.max(10, num(p, 'height'));
  const lh = print.layerHeight;
  const layers = Math.max(2, Math.round(h / lh));
  const lobes = clamp(Math.round(num(p, 'lobes')), 2, 24);
  const lobeDepth = clamp(num(p, 'lobeDepth'), 0, 0.5);
  const rotation = (num(p, 'rotation') * Math.PI) / 180;
  const meanR = Math.max(num(p, 'bottomRadius'), num(p, 'topRadius'));
  const perTurn = spiralSamples(print, num(p, 'detail'), meanR);
  const segs = clamp(Math.round(perTurn * 1.15), 48, 1400);

  for (let j = 0; j < layers; j++) {
    const t = j / Math.max(1, layers - 1);
    const z = (j + 1) * lh;
    const base = lerp(num(p, 'bottomRadius'), num(p, 'topRadius'), t);
    const phase = j * rotation;
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * TAU;
      const r = base * (1 + lobeDepth * Math.cos(lobes * a + phase));
      if (k === 0) b.moveTo(r * Math.cos(a), r * Math.sin(a), z);
      else b.extrudeTo(r * Math.cos(a), r * Math.sin(a), z, print.lineWidth);
    }
  }
}

type GenFn = (p: ParamValues, print: PrintSettings, b: PathBuilder) => void;

export const GENERATOR_FNS: Record<string, GenFn> = {
  spiral: spiralVase,
  polygon: polygonVase,
  ripple: rippleVase,
  stacked: stackedVase,
};

export function runCustomScript(code: string, print: PrintSettings, b: PathBuilder): void {
  const api = {
    print,
    bedCenter: { x: print.bedX / 2, y: print.bedY / 2 },
    moveTo: (x: number, y: number, z: number) => b.moveTo(x, y, z),
    extrudeTo: (x: number, y: number, z: number, width?: number) =>
      b.extrudeTo(x, y, z, width ?? print.lineWidth),
    circle: (cx: number, cy: number, r: number, z: number, segments?: number, width?: number) =>
      b.circle(cx, cy, r, z, segments ?? 180, width ?? print.lineWidth),
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function('fc', `"use strict";\n${code}`);
  fn(api);
}

export function generatePaths(
  generatorId: string,
  params: ParamValues,
  print: PrintSettings,
  code: string,
  b: PathBuilder,
): void {
  if (generatorId === 'custom') {
    runCustomScript(code, print, b);
    return;
  }
  const fn = GENERATOR_FNS[generatorId];
  if (!fn) throw new Error(`未知的生成器: ${generatorId}`);
  fn(params, print, b);
}
