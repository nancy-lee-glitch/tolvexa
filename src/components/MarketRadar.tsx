import React, { useState, useEffect } from 'react';

export function MarketRadar() {
  const [utcTime, setUtcTime] = useState('');
  const [status, setStatus] = useState<{
    color: string;
    dotColor: string;
    text: string;
    borderColor: string;
    textColor: string;
  }>({
    color: 'bg-emerald-950/80',
    dotColor: 'bg-emerald-400',
    text: 'OPTIMAL SESSION: Safe to Trade (Peak Volume)',
    borderColor: 'border-emerald-500/40',
    textColor: 'text-emerald-300',
  });

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const h = now.getUTCHours();
      const m = String(now.getUTCMinutes()).padStart(2, '0');
      const s = String(now.getUTCSeconds()).padStart(2, '0');
      setUtcTime(`${String(h).padStart(2, '0')}:${m}:${s} UTC`);

      if (h >= 12 && h < 16) {
        setStatus({
          color: 'bg-slate-900/90',
          dotColor: 'bg-emerald-400 animate-pulse',
          text: 'OPTIMAL SESSION: Safe to Trade (Peak Volume)',
          borderColor: 'border-emerald-500/40',
          textColor: 'text-emerald-300',
        });
      } else if ((h >= 21 && h <= 23) || (h >= 0 && h < 1)) {
        setStatus({
          color: 'bg-slate-900/90',
          dotColor: 'bg-rose-400 animate-pulse',
          text: 'HIGH RISK: Low Liquidity Session (Caution)',
          borderColor: 'border-rose-500/40',
          textColor: 'text-rose-300',
        });
      } else {
        setStatus({
          color: 'bg-slate-900/90',
          dotColor: 'bg-amber-400',
          text: 'NORMAL: Trade with Caution',
          borderColor: 'border-amber-500/40',
          textColor: 'text-amber-300',
        });
      }
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <aside id="floating-market-radar" className="sticky top-2 z-40 flex justify-center px-3 pointer-events-none mb-1">
      <div
        className={`pointer-events-auto shadow-2xl backdrop-blur-md px-3.5 py-1.5 rounded-full border ${status.borderColor} ${status.color} text-xs font-mono font-medium flex items-center gap-2 transition-all duration-300`}
      >
        <span className={`w-2 h-2 rounded-full ${status.dotColor}`} />
        <span className={`${status.textColor} font-semibold text-[11px] sm:text-xs`}>{status.text}</span>
        <span className="text-[10px] text-slate-400 bg-slate-800/90 px-1.5 py-0.5 rounded font-bold border border-slate-700/60">
          {utcTime || '00:00:00 UTC'}
        </span>
      </div>
    </aside>
  );
}
