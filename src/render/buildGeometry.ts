import * as THREE from 'three';
import type { GenResult } from '../core/types';

const LOW = new THREE.Color('#2ee6c5');
const HIGH = new THREE.Color('#8f8bf8');
const tmp = new THREE.Color();

/**
 * Builds a continuous vertical ribbon per extrusion segment. Every segment
 * becomes a quad spanning [z - layerHeight, z], so stacked rings and the
 * continuous spiral both read as a solid vase wall.
 */
export function buildExtrusionGeometry(
  result: GenResult,
  layerHeight: number,
): THREE.BufferGeometry {
  const count = result.segCount;
  const positions = new Float32Array(count * 4 * 3);
  const normals = new Float32Array(count * 4 * 3);
  const colors = new Float32Array(count * 4 * 3);
  const indices = new Uint32Array(count * 6);
  const p = result.positions;
  const w = result.widths;
  const l = result.layers;

  const minZ = result.bounds.minZ;
  const maxZ = Math.max(result.bounds.maxZ, minZ + 1);

  // Segment normals first, then smoothed per-vertex normals so the curved
  // wall reads as a surface instead of a series of flat facets.
  const segNx = new Float32Array(count);
  const segNy = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * 6;
    const dx = p[o + 3] - p[o];
    const dy = p[o + 4] - p[o + 1];
    const len = Math.hypot(dx, dy) || 1;
    segNx[i] = -dy / len;
    segNy[i] = dx / len;
  }

  for (let i = 0; i < count; i++) {
    const o = i * 6;
    const x0 = p[o];
    const y0 = p[o + 1];
    const z0 = p[o + 2];
    const x1 = p[o + 3];
    const y1 = p[o + 4];
    const z1 = p[o + 5];

    const prev = Math.max(0, i - 1);
    const next = Math.min(count - 1, i + 1);
    let nx0 = segNx[prev] + segNx[i];
    let ny0 = segNy[prev] + segNy[i];
    let nl0 = Math.hypot(nx0, ny0) || 1;
    nx0 /= nl0;
    ny0 /= nl0;
    let nx1 = segNx[i] + segNx[next];
    let ny1 = segNy[i] + segNy[next];
    let nl1 = Math.hypot(nx1, ny1) || 1;
    nx1 /= nl1;
    ny1 /= nl1;

    const nx = segNx[i];
    const ny = segNy[i];
    const hw = w[i] * 0.5;

    const vo = i * 12;
    // 0: start top, 1: end top, 2: end bottom, 3: start bottom
    positions[vo] = x0 + nx * hw;
    positions[vo + 1] = z0;
    positions[vo + 2] = y0 + ny * hw;

    positions[vo + 3] = x1 + nx * hw;
    positions[vo + 4] = z1;
    positions[vo + 5] = y1 + ny * hw;

    positions[vo + 6] = x1 + nx * hw;
    positions[vo + 7] = z1 - layerHeight;
    positions[vo + 8] = y1 + ny * hw;

    positions[vo + 9] = x0 + nx * hw;
    positions[vo + 10] = z0 - layerHeight;
    positions[vo + 11] = y0 + ny * hw;

    const normalPairs: [number, number][] = [
      [nx0, ny0],
      [nx1, ny1],
      [nx1, ny1],
      [nx0, ny0],
    ];
    for (let v = 0; v < 4; v++) {
      const n = vo + v * 3;
      normals[n] = normalPairs[v][0];
      normals[n + 1] = 0;
      normals[n + 2] = normalPairs[v][1];
    }

    const t = THREE.MathUtils.clamp((z0 - minZ) / (maxZ - minZ), 0, 1);
    tmp.copy(LOW).lerp(HIGH, Math.pow(t, 0.85));
    // subtle layer banding so stacked paths stay readable
    const shade = l[i] % 2 === 0 ? 1.0 : 0.945;
    for (let v = 0; v < 4; v++) {
      const n = vo + v * 3;
      colors[n] = tmp.r * shade;
      colors[n + 1] = tmp.g * shade;
      colors[n + 2] = tmp.b * shade;
    }

    const io = i * 6;
    const b = i * 4;
    indices[io] = b;
    indices[io + 1] = b + 1;
    indices[io + 2] = b + 2;
    indices[io + 3] = b;
    indices[io + 4] = b + 2;
    indices[io + 5] = b + 3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildTravelGeometry(result: GenResult): THREE.BufferGeometry | null {
  if (result.travels.length === 0) return null;
  const positions = new Float32Array(result.travels.length);
  // G-code (x, y, z) -> three (x, z, y)
  for (let i = 0; i < result.travels.length; i += 3) {
    positions[i] = result.travels[i];
    positions[i + 1] = result.travels[i + 2];
    positions[i + 2] = result.travels[i + 1];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}
