import type { GeneratorDef, ParamDef, ParamValues, PrintSettings } from './types';

export const DEFAULT_PRINT: PrintSettings = {
  bedX: 220,
  bedY: 220,
  lineWidth: 0.6,
  layerHeight: 0.24,
  printSpeed: 30,
  travelSpeed: 160,
  nozzleTemp: 210,
  bedTemp: 60,
  filamentDiameter: 1.75,
};

const range = (
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
  def: number,
  unit = '',
  advanced = false,
): ParamDef => ({ key, label, type: 'range', min, max, step, default: def, unit, advanced });

const select = (
  key: string,
  label: string,
  def: string,
  options: { label: string; value: string }[],
  advanced = false,
): ParamDef => ({ key, label, type: 'select', default: def, options, advanced });

export const SCRIPT_EXAMPLE = `// FullControl 风格：直接用数学函数描述打印路径
// API: fc.moveTo(x,y,z) · fc.extrudeTo(x,y,z,width) · fc.circle(cx,cy,r,z,segments)
// 坐标以打印床中心为原点（mm），fc.print 为当前打印参数
const { sin, cos, PI } = Math;
const H = 96;                       // 高度 mm
const lh = fc.print.layerHeight;
const TURNS = Math.round(H / lh);   // 一圈一层，保证墙体连续
const STEPS = TURNS * 90;           // 每圈 90 个采样点

for (let i = 0; i <= STEPS; i++) {
  const t = i / STEPS;
  const a = t * TURNS * 2 * PI;
  const z = lh + t * (H - lh);
  const r =
    26 +
    8 * sin(t * PI * 1.6) +
    2.6 * sin(a * 5) * sin(t * PI);
  fc.extrudeTo(r * cos(a), r * sin(a), z);
}
`;

export const GENERATORS: GeneratorDef[] = [
  {
    id: 'spiral',
    name: '螺旋花瓶',
    en: 'Spiral Vase',
    description: '连续螺旋上升的单壁花瓶模式，可通过轮廓、花瓣、扭转塑造形体。',
    params: [
      range('height', '高度', 20, 260, 2, 100, 'mm'),
      range('bottomRadius', '底部半径', 8, 80, 1, 28, 'mm'),
      range('topRadius', '顶部半径', 8, 80, 1, 34, 'mm'),
      select('shape', '轮廓', 'vase', [
        { label: '花瓶肚', value: 'vase' },
        { label: '沙漏腰', value: 'hourglass' },
        { label: '直筒', value: 'straight' },
      ]),
      range('belly', '腰身幅度', 0, 40, 1, 10, 'mm'),
      range('bellyAt', '腰身位置', 0.1, 0.9, 0.01, 0.4),
      range('lobes', '花瓣数', 0, 24, 1, 8, '', true),
      range('lobeDepth', '花瓣深度', 0, 0.4, 0.01, 0.06, '', true),
      range('twist', '扭转', 0, 4, 0.1, 0.8, '圈', true),
      range('waves', '竖向波纹', 0, 10, 1, 0, '', true),
      range('waveAmp', '波纹幅度', 0, 12, 0.5, 0, 'mm', true),
      range('detail', '路径精度', 1, 3, 1, 2, 'x'),
    ],
  },
  {
    id: 'polygon',
    name: '多边花瓶',
    en: 'Polygon Twist',
    description: '正多边形截面随高度扭转，可调节边数、棱角强度与收腰。',
    params: [
      range('height', '高度', 20, 260, 2, 110, 'mm'),
      range('bottomRadius', '底部半径', 8, 80, 1, 32, 'mm'),
      range('topRadius', '顶部半径', 8, 80, 1, 26, 'mm'),
      range('sides', '边数', 3, 12, 1, 6, '边'),
      range('roundness', '棱角强度', 0, 1, 0.05, 0.45),
      range('twist', '扭转', 0, 4, 0.1, 0.7, '圈'),
      range('detail', '路径精度', 1, 3, 1, 2, 'x', true),
    ],
  },
  {
    id: 'ripple',
    name: '波纹珊瑚',
    en: 'Ripple Coral',
    description: '竖向波浪叠加径向细纹，生成具有有机手感的起伏曲面。',
    params: [
      range('height', '高度', 30, 260, 2, 120, 'mm'),
      range('radius', '基准半径', 10, 80, 1, 32, 'mm'),
      range('taper', '收口', 0, 0.7, 0.01, 0.18),
      range('waves', '竖向波浪', 1, 10, 1, 4),
      range('waveAmp', '波浪幅度', 0, 28, 1, 11, 'mm'),
      range('ripples', '径向细纹', 1, 16, 1, 7),
      range('rippleDepth', '细纹深度', 0, 0.4, 0.01, 0.1, '', true),
      range('detail', '路径精度', 1, 3, 1, 2, 'x', true),
    ],
  },
  {
    id: 'stacked',
    name: '层叠花瓣',
    en: 'Stacked Petals',
    description: '逐层堆叠的闭合路径，层间旋转形成花瓣纹理，适合观察层厚效果。',
    params: [
      range('height', '高度', 20, 240, 2, 100, 'mm'),
      range('bottomRadius', '底部半径', 8, 80, 1, 28, 'mm'),
      range('topRadius', '顶部半径', 8, 80, 1, 30, 'mm'),
      range('lobes', '花瓣数', 3, 14, 1, 6, '瓣'),
      range('lobeDepth', '花瓣深度', 0.02, 0.4, 0.01, 0.12),
      range('rotation', '层间旋转', 0, 20, 0.5, 2.5, '°'),
      range('detail', '路径精度', 1, 3, 1, 2, 'x', true),
    ],
  },
  {
    id: 'custom',
    name: '自定义脚本',
    en: 'Script Playground',
    description: '在浏览器中执行 FullControl 风格的 JavaScript 代码，直接控制每一条路径。',
    params: [],
  },
];

export function getGenerator(id: string): GeneratorDef {
  return GENERATORS.find((g) => g.id === id) ?? GENERATORS[0];
}

export function defaultParams(id: string): ParamValues {
  const out: ParamValues = {};
  for (const p of getGenerator(id).params) out[p.key] = p.default;
  return out;
}
