import { PathBuilder } from '../core/path';
import { generatePaths } from '../core/generators';
import { writeGcode } from '../core/gcode';
import { packResult } from '../core/pack';
import { getGenerator } from '../core/catalog';
import type { GenRequest, GenResponse } from '../core/types';

self.onmessage = (event: MessageEvent<GenRequest>) => {
  const req = event.data;
  try {
    const builder = new PathBuilder(req.print);
    generatePaths(req.generatorId, req.params, req.print, req.code, builder);
    const generator = getGenerator(req.generatorId);
    const { gcode, stats } = writeGcode(builder.ops, req.print, generator.name, builder.start);
    const result = packResult(
      builder.ops,
      builder.start,
      { x: req.print.bedX / 2, y: req.print.bedY / 2 },
      generator.name,
      gcode,
      stats,
    );
    const response: GenResponse = { id: req.id, ok: true, result };
    self.postMessage(response, {
      transfer: [
        result.positions.buffer,
        result.widths.buffer,
        result.layers.buffer,
        result.travels.buffer,
        result.layerEnds.buffer,
      ],
    } as StructuredSerializeOptions);
  } catch (err) {
    const response: GenResponse = {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
