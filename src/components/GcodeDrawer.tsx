import { useEffect, useMemo, useState } from 'react';
import type { GenResult } from '../core/types';

interface GcodeDrawerProps {
  open: boolean;
  result: GenResult | null;
  onClose: () => void;
  onDownload: () => void;
}

const PREVIEW_LINES = 260;

export default function GcodeDrawer({ open, result, onClose, onDownload }: GcodeDrawerProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const lines = useMemo(() => {
    if (!result) return [];
    return result.gcode.split('\n').slice(0, PREVIEW_LINES);
  }, [result]);

  if (!open) return null;

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.gcode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const sizeKb = result ? (result.gcode.length / 1024).toFixed(1) : '0';

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <div>
            <h2>G-code 输出</h2>
            <p>
              {result
                ? `${result.stats.lineCount} 行 · ${sizeKb} KB · 前 ${PREVIEW_LINES} 行预览`
                : '尚未生成路径'}
            </p>
          </div>
          <div className="drawer-actions">
            <button type="button" className="btn ghost" onClick={copy} disabled={!result}>
              {copied ? '已复制' : '复制全文'}
            </button>
            <button type="button" className="btn primary" onClick={onDownload} disabled={!result}>
              下载 .gcode
            </button>
            <button type="button" className="icon-btn" onClick={onClose} title="关闭">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="drawer-body">
          {lines.map((line, i) => (
            <div className="code-line" key={i}>
              <span className="code-no">{i + 1}</span>
              <code className={line.startsWith(';') ? 'is-comment' : ''}>{line}</code>
            </div>
          ))}
          {result && result.stats.lineCount > PREVIEW_LINES && (
            <div className="code-more">
              … 其余 {result.stats.lineCount - PREVIEW_LINES} 行请下载完整文件查看
            </div>
          )}
        </div>
        <div className="drawer-foot">
          <span>标准 Marlin 语法 · M83 相对挤出 · 已包含温度与归零指令</span>
        </div>
      </div>
    </>
  );
}
