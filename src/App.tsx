import { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import Viewport from './components/Viewport';
import GcodeDrawer from './components/GcodeDrawer';
import { DEFAULT_PRINT, defaultParams, getGenerator, SCRIPT_EXAMPLE } from './core/catalog';
import { downloadGcode, downloadStl } from './core/download';
import { formatDuration } from './core/gcode';
import { generatePaths } from './core/generators';
import { PathBuilder } from './core/path';
import { buildStl } from './core/stl';
import type { GenRequest, GenResponse, GenResult, ParamValue, ParamValues, PrintSettings } from './core/types';

type Status = 'idle' | 'generating' | 'ready' | 'error';

export default function App() {
  const [genId, setGenId] = useState('spiral');
  const [params, setParams] = useState<ParamValues>(() => defaultParams('spiral'));
  const [print, setPrint] = useState<PrintSettings>(DEFAULT_PRINT);
  const [code, setCode] = useState(SCRIPT_EXAMPLE);
  const [result, setResult] = useState<GenResult | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [visibleLayer, setVisibleLayer] = useState(0);
  const [showTravel, setShowTravel] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);
  const playStartRef = useRef(0);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const spawnWorker = useCallback(() => {
    const worker = new Worker(new URL('./worker/generate.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<GenResponse>) => {
      const data = event.data;
      if (data.id !== reqIdRef.current) return;
      clearWatchdog();
      if (data.ok) {
        setResult(data.result);
        setVisibleLayer(data.result.maxLayer);
        setStatus('ready');
        setError('');
        setPlaying(false);
      } else {
        setStatus('error');
        setError(data.error);
      }
    };
    worker.onerror = (event) => {
      clearWatchdog();
      setStatus('error');
      setError(event.message || '生成线程发生错误');
    };
    workerRef.current = worker;
    return worker;
  }, [clearWatchdog]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const worker = workerRef.current ?? spawnWorker();
      reqIdRef.current += 1;
      const id = reqIdRef.current;
      const request: GenRequest = { id, generatorId: genId, params, print, code };
      setStatus('generating');
      setError('');
      worker.postMessage(request);
      clearWatchdog();
      watchdogRef.current = window.setTimeout(() => {
        workerRef.current?.terminate();
        workerRef.current = null;
        if (id === reqIdRef.current) {
          setStatus('error');
          setError('生成超时：脚本可能存在死循环，或路径点数过多，请简化参数后重试。');
        }
      }, 9000);
    }, 170);

    return () => window.clearTimeout(timer);
  }, [genId, params, print, code, spawnWorker, clearWatchdog]);

  useEffect(() => {
    return () => {
      clearWatchdog();
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [clearWatchdog]);

  useEffect(() => {
    if (!playing || !result) return;
    const startLayer = playStartRef.current;
    const endLayer = result.maxLayer;
    const duration = 6500;
    let startTime = 0;
    let raf = 0;
    const tick = (now: number) => {
      if (!startTime) startTime = now;
      const t = Math.min(1, (now - startTime) / duration);
      setVisibleLayer(Math.round(startLayer + (endLayer - startLayer) * t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, result]);

  const selectGenerator = useCallback((id: string) => {
    setGenId(id);
    setParams(defaultParams(id));
    setPlaying(false);
  }, []);

  const changeParam = useCallback((key: string, value: ParamValue) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const changePrint = useCallback((patch: Partial<PrintSettings>) => {
    setPrint((prev) => ({ ...prev, ...patch }));
  }, []);

  const generator = getGenerator(genId);

  const handleDownload = () => {
    if (!result) return;
    downloadGcode(result.gcode, result.name, genId);
  };

  const handleExportStl = () => {
    if (!result) return;
    try {
      const builder = new PathBuilder(print);
      generatePaths(genId, params, print, code, builder);
      const { buffer } = buildStl(builder.ops, print, generator.name);
      downloadStl(buffer, generator.name, genId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const togglePlay = () => {
    if (!result) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    const atEnd = visibleLayer >= result.maxLayer;
    playStartRef.current = atEnd ? 0 : visibleLayer;
    if (atEnd) setVisibleLayer(0);
    setPlaying(true);
  };

  const layerCount = result ? result.maxLayer + 1 : 0;
  const stats = result?.stats;
  const dims = result
    ? `${Math.round(result.bounds.maxX - result.bounds.minX)} × ${Math.round(
        result.bounds.maxY - result.bounds.minY,
      )} × ${Math.round(result.bounds.maxZ)} mm`
    : '';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M17 7c0 6-8 8-8 17 0 5 4.5 8 11 8s11-3 11-8c0-9-8-11-8-17" opacity=".9" />
              <path d="M10 20c5 2.4 15 2.4 20 0M11.5 27c4.5 2 13 2 17.5 0" opacity=".5" />
            </svg>
          </span>
          <div>
            <h1>Helix Studio</h1>
            <p>参数化 G-code 生成与实时预览</p>
          </div>
        </div>

        <div className={`status-pill ${status}`}>
          <i />
          {status === 'generating' ? '生成中' : status === 'error' ? '生成失败' : status === 'ready' ? '就绪' : '初始化'}
        </div>

        <div className="topbar-spacer" />

        <div className="topbar-meta">
          <span>纯前端</span>
          <span>Three.js</span>
          <span>Web Worker</span>
        </div>

        <button type="button" className="btn ghost" onClick={() => setDrawerOpen(true)} disabled={!result}>
          G-code
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={handleExportStl}
          disabled={!result || status === 'generating'}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9" />
          </svg>
          导出 STL
        </button>
        <button type="button" className="btn primary" onClick={handleDownload} disabled={!result}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v11m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
          导出 G-code
        </button>
      </header>

      <div className="body">
        <Sidebar
          genId={genId}
          onSelectGenerator={selectGenerator}
          params={params}
          onChangeParam={changeParam}
          onResetParams={() => setParams(defaultParams(genId))}
          print={print}
          onChangePrint={changePrint}
          onResetPrint={() => setPrint(DEFAULT_PRINT)}
          code={code}
          onChangeCode={setCode}
          error={error}
        />

        <main className="stage">
          <Viewport
            result={result}
            visibleLayer={visibleLayer}
            layerHeight={print.layerHeight}
            bedX={print.bedX}
            bedY={print.bedY}
            showTravel={showTravel}
            onToggleTravel={() => setShowTravel((v) => !v)}
          />

          <div className={`stage-progress ${status === 'generating' ? 'on' : ''}`} />

          <div className="stage-topleft">
            <span className="eyebrow">MODEL · {generator.en}</span>
            <h2>{generator.name}</h2>
            <p>{dims || '等待生成路径'}</p>
          </div>

          {!result && (
            <div className="stage-empty">
              <span className="spinner" />
              <p>{error ? '生成失败，请查看左侧提示' : '正在生成第一个模型…'}</p>
            </div>
          )}

          <div className="hud">
            <div className="stats-row">
              <div className="stat">
                <span>层数</span>
                <b>{layerCount || '—'}</b>
              </div>
              <div className="stat">
                <span>路径长度</span>
                <b>{stats ? `${(stats.extrusionLength / 1000).toFixed(1)} m` : '—'}</b>
              </div>
              <div className="stat">
                <span>预计时间</span>
                <b>{stats ? formatDuration(stats.timeSeconds) : '—'}</b>
              </div>
              <div className="stat">
                <span>耗材</span>
                <b>{stats ? `${stats.filamentMass.toFixed(1)} g` : '—'}</b>
              </div>
              <div className="stat wide">
                <span>尺寸 · 线宽</span>
                <b>{result ? `${dims} · ${print.lineWidth} mm` : '—'}</b>
              </div>
            </div>

            <div className="layer-dock">
              <button
                type="button"
                className={`play-btn ${playing ? 'playing' : ''}`}
                onClick={togglePlay}
                disabled={!result}
                title={playing ? '暂停层预览' : '播放层预览'}
              >
                {playing ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M8 5.5v13l11-6.5z" />
                  </svg>
                )}
              </button>
              <div className="layer-slider">
                <input
                  type="range"
                  aria-label="层预览"
                  min={0}
                  max={Math.max(0, result?.maxLayer ?? 0)}
                  value={Math.min(visibleLayer, result?.maxLayer ?? 0)}
                  disabled={!result}
                  onChange={(e) => {
                    setPlaying(false);
                    setVisibleLayer(Number(e.target.value));
                  }}
                  onPointerDown={() => setPlaying(false)}
                />
              </div>
              <div className="layer-label">
                <b>{result ? visibleLayer + 1 : 0}</b>
                <span>/ {layerCount || 0} 层</span>
              </div>
              <button type="button" className="text-btn" onClick={() => { setPlaying(false); setVisibleLayer(result?.maxLayer ?? 0); }} disabled={!result}>
                全部
              </button>
            </div>
          </div>
        </main>
      </div>

      <GcodeDrawer
        open={drawerOpen}
        result={result}
        onClose={() => setDrawerOpen(false)}
        onDownload={handleDownload}
      />
    </div>
  );
}
