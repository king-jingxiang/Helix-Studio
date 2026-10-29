import type { GenBounds, GenResult, GenStats, Op, Vec3 } from './types';

/** Packs the ordered op list into typed arrays for the 3D renderer. */
export function packResult(
  ops: Op[],
  start: Vec3 | null,
  printBedCenter: { x: number; y: number },
  name: string,
  gcode: string,
  stats: GenStats,
): GenResult {
  let segCount = 0;
  let travelCount = 0;
  let maxLayer = 0;
  const histogram = new Map<number, number>();

  for (const op of ops) {
    if (op.type === 'extrude') {
      segCount++;
      maxLayer = Math.max(maxLayer, op.layer);
      histogram.set(op.layer, (histogram.get(op.layer) ?? 0) + 1);
    } else {
      travelCount++;
    }
  }

  if (segCount === 0) {
    throw new Error('没有生成任何挤出路径，请调整参数或检查脚本。');
  }

  const positions = new Float32Array(segCount * 6);
  const widths = new Float32Array(segCount);
  const layers = new Uint32Array(segCount);
  const travels = new Float32Array(travelCount * 6);

  const bounds: GenBounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };

  let si = 0;
  let ti = 0;
  for (const op of ops) {
    if (op.type === 'travel') {
      const o = ti * 6;
      travels[o] = op.x0;
      travels[o + 1] = op.y0;
      travels[o + 2] = op.z0;
      travels[o + 3] = op.x1;
      travels[o + 4] = op.y1;
      travels[o + 5] = op.z1;
      ti++;
      continue;
    }
    const o = si * 6;
    positions[o] = op.x0;
    positions[o + 1] = op.y0;
    positions[o + 2] = op.z0;
    positions[o + 3] = op.x1;
    positions[o + 4] = op.y1;
    positions[o + 5] = op.z1;
    widths[si] = op.width;
    layers[si] = op.layer;
    si++;

    bounds.minX = Math.min(bounds.minX, op.x0, op.x1);
    bounds.maxX = Math.max(bounds.maxX, op.x0, op.x1);
    bounds.minY = Math.min(bounds.minY, op.y0, op.y1);
    bounds.maxY = Math.max(bounds.maxY, op.y0, op.y1);
    bounds.minZ = Math.min(bounds.minZ, op.z0, op.z1);
    bounds.maxZ = Math.max(bounds.maxZ, op.z0, op.z1);
  }

  if (start) {
    bounds.minX = Math.min(bounds.minX, start.x);
    bounds.maxX = Math.max(bounds.maxX, start.x);
    bounds.minY = Math.min(bounds.minY, start.y);
    bounds.maxY = Math.max(bounds.maxY, start.y);
  }
  bounds.minZ = Math.max(0, bounds.minZ);

  const layerEnds = new Uint32Array(maxLayer + 1);
  let acc = 0;
  for (let l = 0; l <= maxLayer; l++) {
    acc += histogram.get(l) ?? 0;
    layerEnds[l] = acc;
  }

  return {
    name,
    positions,
    widths,
    layers,
    travels,
    layerEnds,
    segCount,
    maxLayer,
    bounds,
    stats,
    gcode,
  };
}
