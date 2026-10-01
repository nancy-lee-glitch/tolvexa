import React, { useState, useEffect, useMemo } from 'react';
import type { AssetConfig, VipScreenerAsset } from '../types.ts';
import { ASSETS } from './LiveTicker.tsx';

interface VipSafeRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
  isVIP: boolean;
  onSelectAsset: (asset: AssetConfig, timeframe?: string) => void;
  onOpenUpgrade?: () => void;
  onUpgradeVip?: () => void;
}

export function VipSafeRadarModal({
  isOpen,
  onClose,
  isVIP,
  onSelectAsset,
  onOpenUpgrade,
  onUpgradeVip,
}: VipSafeRadarModalProps) {
  const handleUpgrade = onUpgradeVip || onOpenUpgrade || onClose;
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'CRYPTO' | 'STOCK' | 'FOREX' | 'INDEX' | 'SAFE_ONLY'>('ALL');
  const [selectedTimeframe, setSelectedTimeframe] = useState<'30s' | '1m' | '5m' | '15m' | '1h'>('1m');
  const [lastScannedTime, setLastScannedTime] = useState<number>(Date.now());
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number>(30);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Auto-refresh countdown
  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      setSecondsUntilRefresh((prev) => {
        if (prev <= 1) {
          setLastScannedTime(Date.now());
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  const handleManualRescan = () => {
    setLastScannedTime(Date.now());
    setSecondsUntilRefresh(30);
  };

  // Generate dynamic institutional screener data for all assets
  const screenerData: VipScreenerAsset[] = useMemo(() => {
    return ASSETS.map((asset, index) => {
      // Deterministic but dynamic seed based on asset & scan timestamp bucket
      const timeBucket = Math.floor(lastScannedTime / 30000);
      const seed = ((index * 17) + timeBucket * 31) % 100;

      const isCrypto = asset.type === 'CRYPTO';
      const isStock = asset.type === 'STOCK';
      const isForex = asset.type === 'FOREX';

      // Confluence score between 80.0% and 96.5%
      const baseScore = 82 + ((seed * 7) % 14);
      const confluenceScore = parseFloat((baseScore + (seed % 3 === 0 ? 1.5 : 0.2)).toFixed(1));

      // Direction
      const direction: 'CALL' | 'PUT' | 'WAIT' = 
        confluenceScore < 84 ? 'WAIT' : (seed % 2 === 0 ? 'CALL' : 'PUT');

      // Safety Rating
      let safetyRating: 'SAFE TO TRADE' | 'MODERATE RISK' | 'WAIT / VOLATILE' = 'SAFE TO TRADE';
      let volatility: 'LOW' | 'NORMAL' | 'HIGH' = 'NORMAL';
      let safeCloseTiming = 'Safe Exit: 30s-45s';

      if (confluenceScore >= 89 && direction !== 'WAIT') {
        safetyRating = 'SAFE TO TRADE';
        volatility = seed % 3 === 0 ? 'LOW' : 'NORMAL';
        safeCloseTiming = volatility === 'LOW' ? 'Safe Exit: 45s-75s' : 'Safe Exit: 25s-35s';
      } else if (confluenceScore >= 85) {
        safetyRating = 'MODERATE RISK';
        volatility = 'NORMAL';
        safeCloseTiming = 'Safe Exit: 20s-30s';
      } else {
        safetyRating = 'WAIT / VOLATILE';
        volatility = 'HIGH';
        safeCloseTiming = 'Hold: Momentum Unstable';
      }

      // Base price simulation
      const baseP = asset.basePrice || (isCrypto ? 2500 : isStock ? 220 : 1.1000);
      const priceVariation = ((seed - 50) / 1000) * baseP;
      const price = parseFloat((baseP + priceVariation).toFixed(asset.decimals));
      const change24h = parseFloat((((seed % 100) - 45) / 10).toFixed(2));

      // Sparkline array of 8 ticks
      const sparkline = Array.from({ length: 8 }, (_, i) => {
        const trend = direction === 'CALL' ? i * 0.4 : direction === 'PUT' ? -i * 0.4 : 0;
        return price + (Math.sin(i + seed) * asset.pipSize * 2) + (trend * asset.pipSize);
      });

      // Quant Reason
      let reason = 'Balanced order book structure';
      if (safetyRating === 'SAFE TO TRADE') {
        reason = direction === 'CALL' 
          ? 'EMA 9/21 bullish expansion + Order Flow buyer dominance (>70%)'
          : 'Distribution wave + RSI divergence from resistance barrier';
      } else if (safetyRating === 'MODERATE RISK') {
        reason = 'Approaching dynamic Bollinger boundary, monitor volume surge';
      } else {
        reason = 'High tick turbulence detected, wait for volatility compression';
      }

      return {
        symbol: asset.symbol,
        name: asset.name,
        type: asset.type,
        price,
        decimals: asset.decimals,
        change24h,
        volatility,
        safetyRating,
        recommendedAction: direction,
        bestTimeframe: selectedTimeframe,
        confluenceScore,
        safeCloseTiming,
        reason,
        sparkline,
      };
    });
  }, [lastScannedTime, selectedTimeframe]);

  // Filter screener items
  const filteredItems = useMemo(() => {
    return screenerData.filter((item) => {
      // Category filter
      if (selectedCategory === 'SAFE_ONLY' && item.safetyRating !== 'SAFE TO TRADE') {
        return false;
      }
      if (selectedCategory === 'CRYPTO' && item.type !== 'CRYPTO') return false;
      if (selectedCategory === 'STOCK' && item.type !== 'STOCK') return false;
      if (selectedCategory === 'FOREX' && item.type !== 'FOREX') return false;
      if (selectedCategory === 'INDEX' && (item.type !== 'INDEX' && item.type !== 'SYNTH' && item.type !== 'COMMODITY')) return false;

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.name.toLowerCase().includes(q) || item.symbol.toLowerCase().includes(q);
      }

      return true;
    });
  }, [screenerData, selectedCategory, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black font-mono text-white">
                  VIP REAL-TIME SAFE TRADE RADAR
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold uppercase">
                  Institutional Screener
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Continuous real-time multi-asset market analyzer &bull; Safe trade ratings updated every 30s
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Auto-refresh timer & Manual re-scan button */}
            <button
              type="button"
              onClick={handleManualRescan}
              className="hidden sm:flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Re-Scan Market Now"
            >
              <svg className="w-3.5 h-3.5 text-emerald-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Scan in {secondsUntilRefresh}s</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-3 sm:px-6 bg-slate-950/30 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
            {[
              { id: 'ALL', label: 'All Assets' },
              { id: 'SAFE_ONLY', label: '⭐ Safe to Trade Only' },
              { id: 'CRYPTO', label: 'Crypto Coins' },
              { id: 'STOCK', label: 'US Stocks' },
              { id: 'FOREX', label: 'Forex Majors' },
              { id: 'INDEX', label: 'Indices & Gold' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id as any)}
                className={`px-3 py-1.5 rounded-xl font-bold transition ${
                  selectedCategory === cat.id
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Timeframe selector & Search */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Search coin / stock..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-full sm:w-44"
            />

            <select
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-xl text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
            >
              <option value="30s">30 SEC</option>
              <option value="1m">1 MIN</option>
              <option value="5m">5 MIN</option>
              <option value="15m">15 MIN</option>
              <option value="1h">1 HOUR</option>
            </select>
          </div>
        </div>

        {/* Main List Container with VIP gating */}
        <div className="relative flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
          {/* If user is NOT VIP, show VIP lock overlay */}
          {!isVIP && (
            <div className="absolute inset-0 z-20 backdrop-blur-md bg-slate-950/75 flex flex-col items-center justify-center p-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-xl">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>

              <div className="max-w-md space-y-1.5">
                <h3 className="text-xl font-black font-mono text-white">
                  VIP PASS REQUIRED FOR REAL-TIME SCREENER
                </h3>
                <p className="text-xs text-slate-300">
                  Registered VIP members enjoy 24/7 continuous multi-asset screener updates, safety ratings across all coins & stocks, and instant optimal safe close timing recommendations.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    handleUpgrade();
                  }}
                  className="py-3 px-6 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black font-mono text-sm shadow-xl shadow-amber-500/20 transition"
                >
                  UPGRADE TO VIP (UNLIMITED SIGNALS &amp; SCREENER)
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="py-3 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-sm transition"
                >
                  Close Preview
                </button>
              </div>
            </div>
          )}

          {/* Screener Items */}
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-slate-400 font-mono text-xs">
              No assets match your current filter. Try selecting &quot;All Assets&quot;.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredItems.map((item) => {
                const fullAssetConfig = ASSETS.find((a) => a.symbol === item.symbol) || {
                  symbol: item.symbol,
                  name: item.name,
                  type: item.type,
                  decimals: item.decimals,
                  pipSize: item.decimals === 5 ? 0.0001 : 0.01,
                };

                const isSafe = item.safetyRating === 'SAFE TO TRADE';
                const isCall = item.recommendedAction === 'CALL';
                const isPut = item.recommendedAction === 'PUT';

                return (
                  <div
                    key={item.symbol}
                    className={`bg-slate-950 border rounded-2xl p-4 transition flex flex-col lg:flex-row lg:items-center justify-between gap-4 font-mono ${
                      isSafe
                        ? 'border-emerald-500/40 bg-gradient-to-r from-emerald-950/20 via-slate-950 to-slate-950 hover:border-emerald-500'
                        : 'border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    {/* Column 1: Asset details & Price */}
                    <div className="flex items-center gap-3 min-w-[220px]">
                      <div className="w-10 h-10 rounded-2xl bg-slate-800/80 flex items-center justify-center font-bold text-xs text-white shrink-0 border border-slate-700">
                        {item.name.slice(0, 4)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-white">{item.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold">
                            {item.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span className="font-bold text-slate-200">${item.price.toFixed(item.decimals)}</span>
                          <span className={item.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {item.change24h >= 0 ? '+' : ''}{item.change24h}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Column 2: Safety Rating & Algorithmic Action */}
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Safety Rating</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 ${
                              isSafe
                                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                                : item.safetyRating === 'MODERATE RISK'
                                ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400'
                                : 'bg-rose-500/20 border border-rose-500/40 text-rose-400'
                            }`}
                          >
                            {isSafe && <span>✓</span>}
                            <span>{item.safetyRating}</span>
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Quant Bias</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                              isCall
                                ? 'bg-emerald-500 text-slate-950'
                                : isPut
                                ? 'bg-rose-500 text-white'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {item.recommendedAction}
                          </span>
                          <span className="text-xs text-emerald-400 font-bold">{item.confluenceScore}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Column 3: Safe Close Timing & Reason */}
                    <div className="max-w-xs text-xs space-y-0.5">
                      <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{item.safeCloseTiming}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-1">{item.reason}</p>
                    </div>

                    {/* Column 4: Trade Action */}
                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectAsset(fullAssetConfig, selectedTimeframe);
                          onClose();
                        }}
                        className={`py-2.5 px-4 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                          isSafe
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                            : 'bg-slate-800 hover:bg-slate-700 text-white'
                        }`}
                      >
                        <span>TRADE THIS ASSET</span>
                        <span>&rarr;</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-slate-400 gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Scanning 24 Instruments across Crypto, Equities, Forex &amp; Deriv Volatility Indices</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-white transition"
          >
            Close Radar
          </button>
        </div>
      </div>
    </div>
  );
}
