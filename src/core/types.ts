export interface PrintSettings {
  bedX: number;
  bedY: number;
  lineWidth: number;
  layerHeight: number;
  printSpeed: number;
  travelSpeed: number;
  nozzleTemp: number;
  bedTemp: number;
  filamentDiameter: number;
}

export type ParamValue = number | string | boolean;
export type ParamValues = Record<string, ParamValue>;

export interface ParamOption {
  label: string;
  value: string;
}

export interface ParamDef {
  key: string;
  label: string;
  type: 'range' | 'select';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  default: ParamValue;
  options?: ParamOption[];
  advanced?: boolean;
}

export interface GeneratorDef {
  id: string;
  name: string;
  en: string;
  description: string;
  params: ParamDef[];
}

export interface Op {
  type: 'travel' | 'extrude';
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  width: number;
  layer: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface GenStats {
  extrusionLength: number;
  travelLength: number;
  volume: number;
  filamentLength: number;
  filamentMass: number;
  timeSeconds: number;
  layers: number;
  lineCount: number;
}

export interface GenBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface GenResult {
  name: string;
  positions: Float32Array;
  widths: Float32Array;
  layers: Uint32Array;
  travels: Float32Array;
  layerEnds: Uint32Array;
  segCount: number;
  maxLayer: number;
  bounds: GenBounds;
  stats: GenStats;
  gcode: string;
}

export interface GenRequest {
  id: number;
  generatorId: string;
  params: ParamValues;
  print: PrintSettings;
  code: string;
}

export type GenResponse =
  | { id: number; ok: true; result: GenResult }
  | { id: number; ok: false; error: string };
