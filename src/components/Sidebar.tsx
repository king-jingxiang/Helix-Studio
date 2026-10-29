import { GENERATORS } from '../core/catalog';
import type { ParamDef, ParamValue, ParamValues, PrintSettings } from '../core/types';

interface SidebarProps {
  genId: string;
  onSelectGenerator: (id: string) => void;
  params: ParamValues;
  onChangeParam: (key: string, value: ParamValue) => void;
  onResetParams: () => void;
  print: PrintSettings;
  onChangePrint: (patch: Partial<PrintSettings>) => void;
  onResetPrint: () => void;
  code: string;
  onChangeCode: (value: string) => void;
  error: string;
}

function GenIcon({ id }: { id: string }) {
  const common = {
    viewBox: '0 0 40 40',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (id) {
    case 'spiral':
      return (
        <svg {...common}>
          <path d="M13.5 5c0 7-6 10-6 20 0 6 5 9 12.5 9S32.5 31 32.5 25c0-10-6-13-6-20" />
          <path d="M8 22c6 3 18 3 24 0M9.5 29c5.5 3 15.5 3 21 0" opacity=".65" />
        </svg>
      );
    case 'polygon':
      return (
        <svg {...common}>
          <path d="M20 4l12 7v16l-12 8-12-8V11z" />
          <path d="M20 11l7 4v9l-7 5-7-5v-9z" opacity=".55" />
        </svg>
      );
    case 'ripple':
      return (
        <svg {...common}>
          <path d="M14 4c-2 6 4 9 0 15s4 8 0 15M26 4c2 6-4 9 0 15s-4 8 0 15" />
          <path d="M14 11h12M13 24h14" opacity=".55" />
        </svg>
      );
    case 'stacked':
      return (
        <svg {...common}>
          <ellipse cx="20" cy="9" rx="11" ry="4" />
          <ellipse cx="20" cy="16" rx="11" ry="4" opacity=".8" />
          <ellipse cx="20" cy="23" rx="11" ry="4" opacity=".6" />
          <ellipse cx="20" cy="30" rx="11" ry="4" opacity=".4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M15 12l-7 8 7 8M25 12l7 8-7 8M22 9l-4 22" />
        </svg>
      );
  }
}

function decimalsFor(step: number): number {
  if (step >= 1) return 0;
  if (step >= 0.1) return 1;
  return 2;
}

function ParamRow({
  def,
  value,
  onChange,
}: {
  def: ParamDef;
  value: ParamValue;
  onChange: (value: ParamValue) => void;
}) {
  if (def.type === 'select') {
    return (
      <div className="param">
        <div className="param-head">
          <span>{def.label}</span>
        </div>
        <select value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const step = def.step ?? 1;
  const decimals = decimalsFor(step);
  const v = Number(value);

  return (
    <div className="param">
      <div className="param-head">
        <span>{def.label}</span>
        <span className="param-val">
          {v.toFixed(decimals)}
          {def.unit ? <em>{def.unit}</em> : null}
        </span>
      </div>
      <input
        type="range"
        min={def.min}
        max={def.max}
        step={step}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function PrintRow({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="param">
      <div className="param-head">
        <span>{label}</span>
        <span className="param-val">
          {value.toFixed(decimalsFor(step))}
          <em>{unit}</em>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export default function Sidebar({
  genId,
  onSelectGenerator,
  params,
  onChangeParam,
  onResetParams,
  print,
  onChangePrint,
  onResetPrint,
  code,
  onChangeCode,
  error,
}: SidebarProps) {
  const generator = GENERATORS.find((g) => g.id === genId) ?? GENERATORS[0];
  const basic = generator.params.filter((p) => !p.advanced);
  const advanced = generator.params.filter((p) => p.advanced);
  const isCustom = genId === 'custom';

  return (
    <aside className="sidebar">
      <section className="section">
        <div className="section-head">
          <h3>模型库</h3>
          <span className="section-meta">{GENERATORS.length} 个生成器</span>
        </div>
        <div className="gen-grid">
          {GENERATORS.map((g) => (
            <button
              type="button"
              key={g.id}
              className={`gen-card ${g.id === genId ? 'active' : ''} ${g.id === 'custom' ? 'wide' : ''}`}
              onClick={() => onSelectGenerator(g.id)}
            >
              <span className="icon">
                <GenIcon id={g.id} />
              </span>
              <span className="gen-text">
                <b>{g.name}</b>
                <em>{g.en}</em>
              </span>
            </button>
          ))}
        </div>
        <p className="gen-desc">{generator.description}</p>
      </section>

      {!isCustom && (
        <section className="section">
          <div className="section-head">
            <h3>造型参数</h3>
            <button type="button" className="text-btn" onClick={onResetParams}>
              重置
            </button>
          </div>
          {basic.map((def) => (
            <ParamRow
              key={def.key}
              def={def}
              value={params[def.key] ?? def.default}
              onChange={(v) => onChangeParam(def.key, v)}
            />
          ))}
          {advanced.length > 0 && (
            <details className="adv">
              <summary>高级参数 · {advanced.length}</summary>
              {advanced.map((def) => (
                <ParamRow
                  key={def.key}
                  def={def}
                  value={params[def.key] ?? def.default}
                  onChange={(v) => onChangeParam(def.key, v)}
                />
              ))}
            </details>
          )}
        </section>
      )}

      {isCustom && (
        <section className="section">
          <div className="section-head">
            <h3>路径脚本</h3>
            <span className="section-meta">JavaScript</span>
          </div>
          <textarea
            className="code-editor"
            spellCheck={false}
            value={code}
            onChange={(e) => onChangeCode(e.target.value)}
          />
          <details className="adv api-doc">
            <summary>可用 API</summary>
            <div className="api-line">
              <code>fc.extrudeTo(x, y, z, width?)</code>
              <span>挤出到目标点（首次调用自动定为起点）</span>
            </div>
            <div className="api-line">
              <code>fc.moveTo(x, y, z)</code>
              <span>空走移动</span>
            </div>
            <div className="api-line">
              <code>fc.circle(cx, cy, r, z, segs?)</code>
              <span>挤出一个整圆</span>
            </div>
            <div className="api-line">
              <code>fc.print / fc.bedCenter</code>
              <span>打印参数与床中心坐标</span>
            </div>
          </details>
        </section>
      )}

      <section className="section">
        <details className="adv print-settings" open>
          <summary>打印机与材料</summary>
          <PrintRow
            label="层高"
            unit="mm"
            value={print.layerHeight}
            min={0.08}
            max={0.4}
            step={0.02}
            onChange={(v) => onChangePrint({ layerHeight: v })}
          />
          <PrintRow
            label="线宽"
            unit="mm"
            value={print.lineWidth}
            min={0.3}
            max={1.4}
            step={0.05}
            onChange={(v) => onChangePrint({ lineWidth: v })}
          />
          <PrintRow
            label="打印速度"
            unit="mm/s"
            value={print.printSpeed}
            min={10}
            max={120}
            step={5}
            onChange={(v) => onChangePrint({ printSpeed: v })}
          />
          <PrintRow
            label="喷头温度"
            unit="°C"
            value={print.nozzleTemp}
            min={0}
            max={260}
            step={5}
            onChange={(v) => onChangePrint({ nozzleTemp: v })}
          />
          <PrintRow
            label="热床温度"
            unit="°C"
            value={print.bedTemp}
            min={0}
            max={110}
            step={5}
            onChange={(v) => onChangePrint({ bedTemp: v })}
          />
          <PrintRow
            label="空走速度"
            unit="mm/s"
            value={print.travelSpeed}
            min={60}
            max={300}
            step={10}
            onChange={(v) => onChangePrint({ travelSpeed: v })}
          />

          <div className="field-row">
            <label>
              打印床 X
              <input
                type="number"
                min={120}
                max={400}
                step={10}
                value={print.bedX}
                onChange={(e) => onChangePrint({ bedX: Math.max(120, Number(e.target.value) || 220) })}
              />
            </label>
            <label>
              打印床 Y
              <input
                type="number"
                min={120}
                max={400}
                step={10}
                value={print.bedY}
                onChange={(e) => onChangePrint({ bedY: Math.max(120, Number(e.target.value) || 220) })}
              />
            </label>
          </div>

          <div className="field-row">
            <label>
              耗材直径
              <select
                value={String(print.filamentDiameter)}
                onChange={(e) => onChangePrint({ filamentDiameter: Number(e.target.value) })}
              >
                <option value="1.75">1.75 mm</option>
                <option value="2.85">2.85 mm</option>
              </select>
            </label>
            <button type="button" className="text-btn reset-print" onClick={onResetPrint}>
              恢复默认
            </button>
          </div>
        </details>
      </section>

      {error ? <div className="error-box">{error}</div> : null}

      <p className="sidebar-foot">
        路径在 Web Worker 中生成 · Three.js 实时渲染 · 无需后端
      </p>
    </aside>
  );
}
