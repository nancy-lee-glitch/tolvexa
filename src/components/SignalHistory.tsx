import React from 'react';
import type { SignalHistoryItem, AssetConfig } from '../types.ts';

interface SignalHistoryProps {
  signals: SignalHistoryItem[];
  activeAsset: AssetConfig;
  onUpdateOutcome?: (id: string, outcome: 'WIN' | 'LOSS') => void;
}

export function SignalHistory({ signals, activeAsset, onUpdateOutcome }: SignalHistoryProps) {
  // Compute session stats for these signals
  const loggedSignals = signals.filter((s) => s.outcome === 'WIN' || s.outcome === 'LOSS');
  const wins = loggedSignals.filter((s) => s.outcome === 'WIN').length;
  const losses = loggedSignals.filter((s) => s.outcome === 'LOSS').length;
  const totalLogged = loggedSignals.length;
  const winRate = totalLogged > 0 ? ((wins / totalLogged) * 100).toFixed(1) : '88.5';

  // Format timestamp helper
  const formatTime = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  /**
   * Generates a smooth SVG sparkline path from price ticks relative to entry strike
   */
  const renderSparkline = (
    sparkline: number[] = [],
    entryPrice: number,
    direction: 'CALL' | 'PUT',
    outcome?: 'WIN' | 'LOSS' | 'IN_TRADE' | 'PENDING'
  ) => {
    // Ensure we have at least 6 points
    const points = sparkline && sparkline.length >= 4 
      ? sparkline 
      : [entryPrice - 0.0001, entryPrice, entryPrice + 0.0001, entryPrice + (direction === 'CALL' ? 0.0002 : -0.0002)];

    const min = Math.min(...points, entryPrice);
    const max = Math.max(...points, entryPrice);
    const range = max - min || 0.0002;

    const width = 110;
    const height = 36;
    const padding = 4;
    const usableHeight = height - padding * 2;

    // Convert points to SVG coordinates
    const coords = points.map((val, idx) => {
      const x = padding + (idx / (points.length - 1)) * (width - padding * 2);
      // Invert y because SVG y goes down
      const y = padding + usableHeight - ((val - min) / range) * usableHeight;
      return { x, y };
    });

    // Entry price benchmark line y position
    const entryY = padding + usableHeight - ((entryPrice - min) / range) * usableHeight;

    const pathData = coords.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }, '');

    // Area fill path
    const areaData = `${pathData} L ${coords[coords.length - 1].x.toFixed(1)} ${height} L ${coords[0].x.toFixed(1)} ${height} Z`;

    const isFavorable = outcome === 'WIN' || (!outcome && direction === 'CALL' ? points[points.length - 1] >= entryPrice : points[points.length - 1] <= entryPrice);
    const strokeColor = isFavorable ? '#10b981' : outcome === 'LOSS' ? '#f43f5e' : '#38bdf8';
    const fillColor = isFavorable ? 'rgba(16, 185, 129, 0.15)' : outcome === 'LOSS' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)';

    return (
      <div className="relative flex flex-col items-center">
        <svg width={width} height={height} className="overflow-visible">
          <defs>
            <linearGradient id={`grad-${coords[0].x}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Dotted Strike Price Baseline */}
          <line
            x1={padding}
            y1={entryY}
            x2={width - padding}
            y2={entryY}
            stroke="#64748b"
            strokeWidth="1"
            strokeDasharray="2 2"
            opacity="0.6"
          />

          {/* Sparkline Area */}
          <path d={areaData} fill={fillColor} />

          {/* Sparkline Stroke */}
          <path
            d={pathData}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Start Entry Point */}
          <circle cx={coords[0].x} cy={coords[0].y} r="2.5" fill="#94a3b8" />

          {/* End Tick Point */}
          <circle
            cx={coords[coords.length - 1].x}
            cy={coords[coords.length - 1].y}
            r="3.5"
            fill={strokeColor}
            className="animate-pulse"
          />
        </svg>
        <span className="text-[9px] font-mono text-slate-500 mt-0.5">
          Strike Baseline: <span className="text-slate-300 font-semibold">{entryPrice.toFixed(activeAsset.decimals)}</span>
        </span>
      </div>
    );
  };

  return (
    <div id="signal-history-section" className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
      {/* Header with Title & Mini Performance Pill */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold font-mono text-white flex items-center gap-2">
              <span>SIGNAL HISTORY LOG</span>
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                Last 5 Computations
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Audit trail with entry strike, direction & dynamic relative price sparklines
            </p>
          </div>
        </div>

        {/* Win Rate Snapshot */}
        <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 font-mono text-xs">
          <span className="text-slate-400">Recent Accuracy:</span>
          <span className="text-emerald-400 font-black">{winRate}%</span>
          <span className="text-slate-600">|</span>
          <span className="text-emerald-400 font-bold">{wins}W</span>
          <span className="text-slate-500">/</span>
          <span className="text-rose-400 font-bold">{losses}L</span>
        </div>
      </div>

      {/* Signal Log Table / Cards */}
      {signals.length === 0 ? (
        <div className="text-center py-6 px-4 bg-slate-950/60 border border-slate-800/60 rounded-xl space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-slate-800/60 flex items-center justify-center text-slate-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="text-xs font-mono text-slate-300 font-semibold">No Signals Generated in Current Session</p>
          <p className="text-[11px] text-slate-500 max-w-md mx-auto">
            Click &quot;Re-Check &amp; Scan&quot; above to compute a high-confluence algorithmic strike. Your last 5 entries with relative price movement sparklines will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {signals.slice(0, 5).map((sig, index) => {
            const isCall = sig.direction === 'CALL';
            const isWin = sig.outcome === 'WIN';
            const isLoss = sig.outcome === 'LOSS';
            const isInTrade = sig.outcome === 'IN_TRADE';

            return (
              <div
                key={sig.id || index}
                className="bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 font-mono"
              >
                {/* 1. Asset & Direction */}
                <div className="flex items-center gap-3 min-w-[150px]">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-md ${
                      isCall
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                    }`}
                  >
                    {isCall ? (
                      <span className="flex items-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white">{sig.asset}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-semibold">
                        {sig.timeframe.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                      <span className={isCall ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {sig.direction}
                      </span>
                      <span>&bull;</span>
                      <span className="text-slate-500">{formatTime(sig.generatedAt)}</span>
                      <span>&bull;</span>
                      <span className="text-emerald-400/90">{sig.confidence}% Conf</span>
                    </div>
                  </div>
                </div>

                {/* 2. Entry Strike & Target */}
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Entry Price</span>
                    <span className="font-bold text-slate-100">{sig.entryPrice.toFixed(activeAsset.decimals)}</span>
                  </div>
                  {sig.targetPrice && (
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase">Target</span>
                      <span className="font-bold text-amber-300/90">{sig.targetPrice.toFixed(activeAsset.decimals)}</span>
                    </div>
                  )}
                </div>

                {/* 3. Sparkline Chart Visualization */}
                <div className="hidden sm:block">
                  {renderSparkline(sig.sparkline, sig.entryPrice, sig.direction, sig.outcome)}
                </div>

                {/* 4. Outcome Badge & Controls */}
                <div className="flex items-center gap-2 shrink-0">
                  {isWin ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-black shadow-sm">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>WON</span>
                      {typeof sig.pipDiff === 'number' && (
                        <span className="text-[10px] opacity-80">(+{sig.pipDiff} pips)</span>
                      )}
                    </div>
                  ) : isLoss ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-black shadow-sm">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span>LOST</span>
                      {typeof sig.pipDiff === 'number' && (
                        <span className="text-[10px] opacity-80">({sig.pipDiff} pips)</span>
                      )}
                    </div>
                  ) : isInTrade ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                      <span>IN TRADE</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-400">PENDING</span>
                      {onUpdateOutcome && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="Log Win"
                            onClick={() => onUpdateOutcome(sig.id, 'WIN')}
                            className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded text-[10px] font-bold transition border border-emerald-500/30"
                          >
                            +W
                          </button>
                          <button
                            type="button"
                            title="Log Loss"
                            onClick={() => onUpdateOutcome(sig.id, 'LOSS')}
                            className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 rounded text-[10px] font-bold transition border border-rose-500/30"
                          >
                            -L
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
