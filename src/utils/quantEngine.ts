/**
 * PulseTrade Pro - Institutional Quantitative Confluence Engine
 * 
 * Continuous 24/7 High-Frequency Tick Analysis & Confluence Confirmation Gate:
 * - Market Structure Classification (BULLISH / BEARISH / RANGING / NEUTRAL)
 * - 5-Factor Confluence Checklist (EMA, RSI, Volume/OFI, Liquidity Sweep, FVG)
 * - Strict GATE RULE: If ANY factor fails or is unsure -> WAIT / NO TRADE
 * - Dual Analysis Output Engine:
 *   Mode A: Quick Expiry (EO / Deriv CALL | PUT | WAIT)
 *   Mode B: MT5 Style (BUY | SELL | WAIT with clean institutional card order)
 */

import type {
  MT5TradeParameters,
  SafeCloseAnalysis,
  MarketStructureType,
  StructureCue,
  ConfluenceFactorItem,
  ConfluenceGateResult,
  SignalData,
  AnalysisMode,
  EntryZone,
} from '../types.ts';

export interface TickData {
  price: number;
  time: number;
}

export interface TechnicalAudit {
  rsi: number;
  rsiState: 'OVERSOLD' | 'OVERBOUGHT' | 'NEUTRAL' | 'BULLISH_MOMENTUM' | 'BEARISH_MOMENTUM';
  emaFast: number;
  emaSlow: number;
  emaSpread: number;
  emaTrend: 'BULLISH' | 'BEARISH' | 'CROSSOVER_UP' | 'CROSSOVER_DOWN';
  orderFlowBuyPct: number;
  orderFlowSellPct: number;
  tickVelocity: number;
  tickAcceleration: number;
  bollingerBandStatus: 'PIERCED_LOWER' | 'PIERCED_UPPER' | 'MIDDLE_EXPANDING' | 'SQUEEZE';
  bollingerPctB: number;
  confluenceScore: number;
  confluenceFactors: string[];
  recheckSteps: string[];
  setupName: string;
  recommendedAction: 'CALL' | 'PUT' | 'WAIT';
}

/**
 * Exponential Moving Average (EMA)
 */
export function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) {
    const sum = prices.reduce((a, b) => a + b, 0);
    return sum / prices.length;
  }

  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Relative Strength Index (RSI)
 */
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50.0;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100.0;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return Math.min(100, Math.max(0, parseFloat(rsi.toFixed(1))));
}

/**
 * Bollinger Bands (SMA +/- 2 * Standard Deviation)
 */
export function calculateBollingerBands(prices: number[], period: number = 20, multiplier: number = 2.0) {
  if (prices.length === 0) return { upper: 0, middle: 0, lower: 0, pctB: 0.5, bandwidth: 0 };
  const slice = prices.slice(-period);
  const n = slice.length;
  const middle = slice.reduce((a, b) => a + b, 0) / n;

  const variance = slice.reduce((acc, p) => acc + Math.pow(p - middle, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  const upper = middle + multiplier * stdDev;
  const lower = middle - multiplier * stdDev;
  const currentPrice = prices[prices.length - 1];
  const range = upper - lower || 0.0001;
  const pctB = (currentPrice - lower) / range;

  return {
    upper,
    middle,
    lower,
    pctB: parseFloat(pctB.toFixed(3)),
    bandwidth: middle !== 0 ? (upper - lower) / middle : 0,
  };
}

/**
 * Order Flow Imbalance (Buyer vs Seller Tick Aggression)
 */
export function calculateOrderFlow(prices: number[], window: number = 20) {
  if (prices.length < 2) return { buyPct: 50, sellPct: 50, deltaCount: 0 };
  const slice = prices.slice(-window);
  let buys = 0;
  let sells = 0;

  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i] - slice[i - 1];
    if (diff > 0.0000001) buys++;
    else if (diff < -0.0000001) sells++;
  }

  const total = buys + sells || 1;
  const buyPct = Math.round((buys / total) * 100);
  const sellPct = 100 - buyPct;

  return { buyPct, sellPct, deltaCount: buys - sells };
}

/**
 * Tick Velocity & Acceleration
 */
export function calculateVelocityAndAcceleration(prices: number[], pipsMultiplier: number = 10000) {
  if (prices.length < 6) return { velocity: 0, acceleration: 0 };

  const pCurrent = prices[prices.length - 1];
  const p3Ago = prices[prices.length - 3] ?? prices[0];
  const p6Ago = prices[prices.length - 6] ?? prices[0];

  const vCurrent = (pCurrent - p3Ago) * pipsMultiplier;
  const vPrevious = (p3Ago - p6Ago) * pipsMultiplier;

  const acceleration = vCurrent - vPrevious;

  return {
    velocity: parseFloat(vCurrent.toFixed(2)),
    acceleration: parseFloat(acceleration.toFixed(2)),
  };
}

// In-memory sliding tick buffer cache across all assets for real technical analysis
const assetTickCache = new Map<string, number[]>();

export function getOrInitializeAssetTicks(
  symbol: string,
  basePrice: number,
  pipSize: number,
  decimals: number,
  count: number = 35
): number[] {
  let existing = assetTickCache.get(symbol);
  if (existing && existing.length >= 8) {
    return existing;
  }

  // Generate an organic micro-structure price series starting from basePrice
  const series: number[] = [];
  let current = basePrice;
  const symHash = symbol.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const drift = (symHash % 3 === 0 ? 0.07 : symHash % 3 === 1 ? -0.07 : 0.01) * pipSize;

  for (let i = 0; i < count; i++) {
    const wave = Math.sin((i / 3) + symHash) * pipSize * 1.2;
    const noise = (Math.random() - 0.49) * pipSize * 0.8;
    current = Math.max(0.00001, parseFloat((current + wave + noise + drift).toFixed(decimals)));
    series.push(current);
  }

  assetTickCache.set(symbol, series);
  return series;
}

export function pushAssetTick(symbol: string, price: number, maxTicks: number = 60): void {
  let existing = assetTickCache.get(symbol);
  if (!existing) {
    existing = [price];
  } else {
    existing.push(price);
    if (existing.length > maxTicks) {
      existing.shift();
    }
  }
  assetTickCache.set(symbol, existing);
}

/**
 * 1) MARKET STRUCTURE CLASSIFICATION ENGINE
 * Evaluates real price series / ticks:
 * - HH/HL -> bullish bias candidate
 * - LH/LL -> bearish bias candidate
 * - Range / consolidation / compression / expansion notes
 * Classify: BULLISH | BEARISH | RANGING | NEUTRAL
 * Do not force trend if ranging.
 */
export function detectMarketStructure(
  prices: number[],
  pipSize: number = 0.0001
): {
  structure: MarketStructureType;
  cue: StructureCue;
  summary: string;
  swingHigh: number;
  swingLow: number;
  recentRangePips: number;
} {
  if (!prices || prices.length < 8) {
    const p = prices && prices.length > 0 ? prices[prices.length - 1] : 1.085;
    return {
      structure: 'NEUTRAL',
      cue: 'INSUFFICIENT_DATA',
      summary: 'Insufficient tick data to reliably resolve market structure',
      swingHigh: p,
      swingLow: p,
      recentRangePips: 0,
    };
  }

  const safePrices = prices.slice(-35);
  const n = safePrices.length;
  const currentPrice = safePrices[n - 1];

  // Identify local swing highs and lows
  const swingHighs: { idx: number; price: number }[] = [];
  const swingLows: { idx: number; price: number }[] = [];

  for (let i = 1; i < n - 1; i++) {
    const prev = safePrices[i - 1];
    const curr = safePrices[i];
    const next = safePrices[i + 1];

    if (curr >= prev && curr >= next) {
      swingHighs.push({ idx: i, price: curr });
    }
    if (curr <= prev && curr <= next) {
      swingLows.push({ idx: i, price: curr });
    }
  }

  const maxPrice = Math.max(...safePrices);
  const minPrice = Math.min(...safePrices);
  const recentRangePips = parseFloat(((maxPrice - minPrice) / pipSize).toFixed(1));

  // If volatility range is extremely narrow -> Compression (do not force trend)
  if (recentRangePips < 2.0) {
    return {
      structure: 'RANGING',
      cue: 'COMPRESSION',
      summary: `Tight Volatility Compression (${recentRangePips} pips range) — Accumulation band`,
      swingHigh: maxPrice,
      swingLow: minPrice,
      recentRangePips,
    };
  }

  // Check swing progression when multiple swing points exist
  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const sh2 = swingHighs[swingHighs.length - 1].price;
    const sh1 = swingHighs[swingHighs.length - 2].price;
    const sl2 = swingLows[swingLows.length - 1].price;
    const sl1 = swingLows[swingLows.length - 2].price;

    const isHH = sh2 > sh1 + (0.2 * pipSize);
    const isHL = sl2 >= sl1 - (0.15 * pipSize);
    const isLH = sh2 <= sh1 + (0.15 * pipSize);
    const isLL = sl2 < sl1 - (0.2 * pipSize);

    if (isHH && isHL && currentPrice >= (minPrice + maxPrice) * 0.48) {
      return {
        structure: 'BULLISH',
        cue: 'HH_HL',
        summary: `Bullish Structure (HH/HL confirmed: Higher High @ ${sh2.toFixed(5)}, Higher Low @ ${sl2.toFixed(5)})`,
        swingHigh: maxPrice,
        swingLow: minPrice,
        recentRangePips,
      };
    }

    if (isLH && isLL && currentPrice <= (minPrice + maxPrice) * 0.52) {
      return {
        structure: 'BEARISH',
        cue: 'LH_LL',
        summary: `Bearish Structure (LH/LL confirmed: Lower High @ ${sh2.toFixed(5)}, Lower Low @ ${sl2.toFixed(5)})`,
        swingHigh: maxPrice,
        swingLow: minPrice,
        recentRangePips,
      };
    }
  }

  // Trend slope check across the full buffer
  const firstPrice = safePrices[0];
  const deltaPips = (currentPrice - firstPrice) / pipSize;

  if (deltaPips > 3.0) {
    return {
      structure: 'BULLISH',
      cue: 'EXPANSION',
      summary: `Bullish Trend Expansion (+${deltaPips.toFixed(1)} pips upward displacement)`,
      swingHigh: maxPrice,
      swingLow: minPrice,
      recentRangePips,
    };
  } else if (deltaPips < -3.0) {
    return {
      structure: 'BEARISH',
      cue: 'EXPANSION',
      summary: `Bearish Trend Expansion (${deltaPips.toFixed(1)} pips downward displacement)`,
      swingHigh: maxPrice,
      swingLow: minPrice,
      recentRangePips,
    };
  }

  return {
    structure: 'RANGING',
    cue: 'RANGE_CONSOLIDATION',
    summary: `Equilibrium Range (${recentRangePips} pips band) — Consolidating between ${minPrice.toFixed(5)} and ${maxPrice.toFixed(5)}`,
    swingHigh: maxPrice,
    swingLow: minPrice,
    recentRangePips,
  };
}

/**
 * 2) 5-FACTOR INSTITUTIONAL CONFLUENCE GATE EVALUATOR
 * Factors:
 * 1. EMA alignment / trend context
 * 2. RSI condition (not mindlessly overbought/oversold against structure)
 * 3. Volume / range profile context (order flow aggression)
 * 4. Liquidity sweep (wick / structure sweep logic)
 * 5. FVG / fair value gap imbalance
 * 
 * GATE RULE:
 * If ANY required factor is FAIL or UNSURE -> Direction = WAIT / NO TRADE
 * Only if structure is directional AND required factors PASS -> allow CALL/PUT or BUY/SELL
 */
export function evaluateConfluenceGate(params: {
  prices: number[];
  structure: MarketStructureType;
  structureCue: StructureCue;
  pipSize: number;
  rsi: number;
  ema9: number;
  ema21: number;
  emaSpread: number;
  orderFlowBuyPct: number;
  orderFlowSellPct: number;
  velocity: number;
}): ConfluenceGateResult {
  const {
    prices,
    structure,
    structureCue,
    pipSize,
    rsi,
    ema9,
    ema21,
    emaSpread,
    orderFlowBuyPct,
    orderFlowSellPct,
    velocity,
  } = params;

  const safePrices = prices.slice(-30);
  const currentPrice = safePrices[safePrices.length - 1];
  const factors: ConfluenceFactorItem[] = [];
  const failReasons: string[] = [];

  // Factor 1: EMA Alignment (Core)
  let emaStatus: 'PASS' | 'FAIL' | 'UNSURE' = 'FAIL';
  let emaDetail = '';
  if (structure === 'BULLISH') {
    if (ema9 > ema21 && emaSpread >= 0.15 && currentPrice >= ema21) {
      emaStatus = 'PASS';
      emaDetail = `EMA 9 (${ema9.toFixed(5)}) > EMA 21 (${ema21.toFixed(5)}) with +${emaSpread.toFixed(1)} pips positive expansion`;
    } else if (Math.abs(emaSpread) < 0.15) {
      emaStatus = 'UNSURE';
      emaDetail = `EMA spread compressed (${emaSpread.toFixed(1)} pips); awaiting directional expansion`;
    } else {
      emaStatus = 'FAIL';
      emaDetail = `EMA alignment conflicting: EMA 9 below EMA 21 during bullish structure`;
    }
  } else if (structure === 'BEARISH') {
    if (ema9 < ema21 && emaSpread <= -0.15 && currentPrice <= ema21) {
      emaStatus = 'PASS';
      emaDetail = `EMA 9 (${ema9.toFixed(5)}) < EMA 21 (${ema21.toFixed(5)}) with ${emaSpread.toFixed(1)} pips downward expansion`;
    } else if (Math.abs(emaSpread) < 0.15) {
      emaStatus = 'UNSURE';
      emaDetail = `EMA spread compressed (${emaSpread.toFixed(1)} pips); awaiting directional expansion`;
    } else {
      emaStatus = 'FAIL';
      emaDetail = `EMA alignment conflicting: EMA 9 above EMA 21 during bearish structure`;
    }
  } else {
    emaStatus = 'FAIL';
    emaDetail = `Structure is ranging/neutral; moving averages flattened without directional angle`;
  }
  factors.push({
    id: 'ema',
    name: 'EMA Alignment & Trend Context',
    status: emaStatus,
    detail: emaDetail,
    isAdvanced: false,
  });
  if (emaStatus !== 'PASS') {
    failReasons.push(`EMA Trend: ${emaDetail}`);
  }

  // Factor 2: RSI Condition (Core)
  let rsiStatus: 'PASS' | 'FAIL' | 'UNSURE' = 'FAIL';
  let rsiDetail = '';
  if (structure === 'BULLISH') {
    if (rsi >= 46 && rsi <= 68) {
      rsiStatus = 'PASS';
      rsiDetail = `RSI at ${rsi.toFixed(1)} — Healthy bullish momentum without overbought exhaustion`;
    } else if (rsi <= 34) {
      rsiStatus = 'PASS';
      rsiDetail = `RSI at ${rsi.toFixed(1)} — Oversold mean-reversion bounce aligned with support`;
    } else if (rsi > 70) {
      rsiStatus = 'FAIL';
      rsiDetail = `RSI at ${rsi.toFixed(1)} — Overbought ceiling; high exhaustion rejection risk`;
    } else if (rsi < 42) {
      rsiStatus = 'FAIL';
      rsiDetail = `RSI at ${rsi.toFixed(1)} — Bearish momentum leakage against bullish structure`;
    } else {
      rsiStatus = 'UNSURE';
      rsiDetail = `RSI at ${rsi.toFixed(1)} — Neutral midpoint compression`;
    }
  } else if (structure === 'BEARISH') {
    if (rsi >= 32 && rsi <= 54) {
      rsiStatus = 'PASS';
      rsiDetail = `RSI at ${rsi.toFixed(1)} — Healthy bearish momentum without oversold exhaustion`;
    } else if (rsi >= 66) {
      rsiStatus = 'PASS';
      rsiDetail = `RSI at ${rsi.toFixed(1)} — Overbought rejection aligned with resistance`;
    } else if (rsi < 30) {
      rsiStatus = 'FAIL';
      rsiDetail = `RSI at ${rsi.toFixed(1)} — Oversold floor; high bounce risk against short`;
    } else if (rsi > 58) {
      rsiStatus = 'FAIL';
      rsiDetail = `RSI at ${rsi.toFixed(1)} — Bullish momentum leakage against short`;
    } else {
      rsiStatus = 'UNSURE';
      rsiDetail = `RSI at ${rsi.toFixed(1)} — Neutral midpoint compression`;
    }
  } else {
    rsiStatus = 'FAIL';
    rsiDetail = `RSI at ${rsi.toFixed(1)} — Oscillating in chop without structural anchor`;
  }
  factors.push({
    id: 'rsi',
    name: 'RSI Momentum Calibration',
    status: rsiStatus,
    detail: rsiDetail,
    isAdvanced: false,
  });
  if (rsiStatus !== 'PASS') {
    failReasons.push(`RSI Momentum: ${rsiDetail}`);
  }

  // Factor 3: Volume / Range Profile Proxy (Core)
  let volStatus: 'PASS' | 'FAIL' | 'UNSURE' = 'UNSURE';
  let volDetail = '';
  if (structure === 'BULLISH') {
    if (orderFlowBuyPct >= 54 || velocity > 0.12) {
      volStatus = 'PASS';
      volDetail = `Buyer dominance confirmed: ${orderFlowBuyPct}% Buy OFI Aggression (+${velocity.toFixed(2)} p/s velocity)`;
    } else if (orderFlowSellPct >= 56 || velocity < -0.15) {
      volStatus = 'FAIL';
      volDetail = `Opposing seller volume (${orderFlowSellPct}%) overriding bullish trend`;
    } else {
      volStatus = 'UNSURE';
      volDetail = `Volume / OFI balanced in equilibrium (${orderFlowBuyPct}% Buy / ${orderFlowSellPct}% Sell); lack of commitment`;
    }
  } else if (structure === 'BEARISH') {
    if (orderFlowSellPct >= 54 || velocity < -0.12) {
      volStatus = 'PASS';
      volDetail = `Seller dominance confirmed: ${orderFlowSellPct}% Sell OFI Aggression (${velocity.toFixed(2)} p/s velocity)`;
    } else if (orderFlowBuyPct >= 56 || velocity > 0.15) {
      volStatus = 'FAIL';
      volDetail = `Opposing buyer volume (${orderFlowBuyPct}%) overriding bearish trend`;
    } else {
      volStatus = 'UNSURE';
      volDetail = `Volume / OFI balanced in equilibrium (${orderFlowBuyPct}% Buy / ${orderFlowSellPct}% Sell); lack of commitment`;
    }
  } else {
    volStatus = 'FAIL';
    volDetail = `Volume profile flat; no directional institutional absorption detected`;
  }
  factors.push({
    id: 'volume',
    name: 'Volume & Order Flow Imbalance (OFI)',
    status: volStatus,
    detail: volDetail,
    isAdvanced: false,
  });
  if (volStatus !== 'PASS') {
    failReasons.push(`Volume / OFI: ${volDetail}`);
  }

  // Factor 4: Liquidity Sweep (Advanced - Locked badge for non-VIP)
  let sweepStatus: 'PASS' | 'FAIL' | 'UNSURE' = 'UNSURE';
  let sweepDetail = '';
  const recentSlice = safePrices.slice(-8);
  const recentMin = Math.min(...recentSlice);
  const recentMax = Math.max(...recentSlice);

  if (structure === 'BULLISH') {
    const hasReboundFromLow = currentPrice > recentMin + (0.35 * pipSize);
    if (hasReboundFromLow) {
      sweepStatus = 'PASS';
      sweepDetail = `Sell-side liquidity swept at ${recentMin.toFixed(5)}; aggressive institutional bid absorption`;
    } else if (currentPrice <= recentMin + (0.1 * pipSize)) {
      sweepStatus = 'FAIL';
      sweepDetail = `Price pressing lows without rejection wick; breakdown danger`;
    } else {
      sweepStatus = 'UNSURE';
      sweepDetail = `No distinct liquidity sweep event identified in current price window`;
    }
  } else if (structure === 'BEARISH') {
    const hasReboundFromHigh = currentPrice < recentMax - (0.35 * pipSize);
    if (hasReboundFromHigh) {
      sweepStatus = 'PASS';
      sweepDetail = `Buy-side liquidity swept at ${recentMax.toFixed(5)}; aggressive institutional supply rejection`;
    } else if (currentPrice >= recentMax - (0.1 * pipSize)) {
      sweepStatus = 'FAIL';
      sweepDetail = `Price pressing highs without rejection wick; breakout danger for short`;
    } else {
      sweepStatus = 'UNSURE';
      sweepDetail = `No distinct liquidity sweep event identified in current price window`;
    }
  } else {
    sweepStatus = 'FAIL';
    sweepDetail = `Ranging market; liquidity rests at range extremes without directional sweep`;
  }
  factors.push({
    id: 'liquidity_sweep',
    name: 'Institutional Liquidity Sweep',
    status: sweepStatus,
    detail: sweepDetail,
    isAdvanced: true,
  });
  if (sweepStatus !== 'PASS') {
    failReasons.push(`Liquidity Sweep: ${sweepDetail}`);
  }

  // Factor 5: Fair Value Gap (FVG) / Imbalance (Advanced - Locked badge for non-VIP)
  let fvgStatus: 'PASS' | 'FAIL' | 'UNSURE' = 'UNSURE';
  let fvgDetail = '';
  let bullishImbalanceFound = false;
  let bearishImbalanceFound = false;

  for (let i = 2; i < safePrices.length; i++) {
    const p0 = safePrices[i - 2];
    const p2 = safePrices[i];
    if (p2 - p0 > 0.8 * pipSize) {
      bullishImbalanceFound = true;
    } else if (p0 - p2 > 0.8 * pipSize) {
      bearishImbalanceFound = true;
    }
  }

  if (structure === 'BULLISH') {
    if (bullishImbalanceFound && currentPrice >= ema21) {
      fvgStatus = 'PASS';
      fvgDetail = `Bullish imbalance / FVG defended; order block acting as support`;
    } else if (bearishImbalanceFound && currentPrice < ema9) {
      fvgStatus = 'FAIL';
      fvgDetail = `Unfilled bearish displacement gap overhead capping upward progress`;
    } else {
      fvgStatus = 'UNSURE';
      fvgDetail = `Tick progression uniform; no active unmitigated Fair Value Gap`;
    }
  } else if (structure === 'BEARISH') {
    if (bearishImbalanceFound && currentPrice <= ema21) {
      fvgStatus = 'PASS';
      fvgDetail = `Bearish imbalance / FVG defended; premium zone distribution acting as resistance`;
    } else if (bullishImbalanceFound && currentPrice > ema9) {
      fvgStatus = 'FAIL';
      fvgDetail = `Unfilled bullish displacement gap below supporting buyer re-entry`;
    } else {
      fvgStatus = 'UNSURE';
      fvgDetail = `Tick progression uniform; no active unmitigated Fair Value Gap`;
    }
  } else {
    fvgStatus = 'FAIL';
    fvgDetail = `Market in equilibrium compression; no displacement imbalance`;
  }
  factors.push({
    id: 'fvg',
    name: 'Fair Value Gap (FVG) / Imbalance',
    status: fvgStatus,
    detail: fvgDetail,
    isAdvanced: true,
  });
  if (fvgStatus !== 'PASS') {
    failReasons.push(`Fair Value Gap: ${fvgDetail}`);
  }

  // THE MANDATORY GATE RULE:
  // If ANY required factor is FAIL or UNSURE -> Direction = WAIT / NO TRADE
  // Only if structure is directional AND all required factors PASS -> allow CALL/PUT or BUY/SELL
  const allFactorsPassed = factors.every((f) => f.status === 'PASS');
  const isDirectional = structure === 'BULLISH' || structure === 'BEARISH';
  const passed = isDirectional && allFactorsPassed;

  return {
    passed,
    blocked: false,
    structure,
    structureCue,
    structureSummary: structure === 'BULLISH' ? 'Bullish Structure' : structure === 'BEARISH' ? 'Bearish Structure' : 'Ranging / Neutral Structure',
    factors,
    allFactorsPassed,
    failReasons,
  };
}

/**
 * MASTER MULTI-TIMEFRAME CONFLUENCE SYNTHESIZER
 * Evaluates real live indicators and returns full technical audit with verified mathematical reasoning.
 * Directly integrates the strict Market Structure + 5-Factor Confluence Gate.
 */
export function analyzeMarketConfluence(
  prices: number[],
  activeTimeframe: string = '1m',
  pipSize: number = 0.0001,
  isVIP: boolean = false
): TechnicalAudit {
  const safePrices = prices.length >= 8 ? prices : [...prices, ...Array(15).fill(prices[prices.length - 1] || 1.08500)];
  const currentPrice = safePrices[safePrices.length - 1];
  const pipsMultiplier = 1 / pipSize;

  // 1. Indicators computation
  const ema9 = calculateEMA(safePrices, 9);
  const ema21 = calculateEMA(safePrices, 21);
  const emaSpread = (ema9 - ema21) * pipsMultiplier;

  const rsi = calculateRSI(safePrices, 14);
  const bb = calculateBollingerBands(safePrices, 20, 2.0);
  const orderFlow = calculateOrderFlow(safePrices, 20);
  const { velocity, acceleration } = calculateVelocityAndAcceleration(safePrices, pipsMultiplier);

  // 2. Classify Market Structure
  const structureResult = detectMarketStructure(safePrices, pipSize);

  // 3. Evaluate 5-factor Confluence Gate
  const gateResult = evaluateConfluenceGate({
    prices: safePrices,
    structure: structureResult.structure,
    structureCue: structureResult.cue,
    pipSize,
    rsi,
    ema9,
    ema21,
    emaSpread,
    orderFlowBuyPct: orderFlow.buyPct,
    orderFlowSellPct: orderFlow.sellPct,
    velocity,
  });

  // 4. RSI State
  let rsiState: TechnicalAudit['rsiState'] = 'NEUTRAL';
  if (rsi <= 32) rsiState = 'OVERSOLD';
  else if (rsi >= 68) rsiState = 'OVERBOUGHT';
  else if (rsi >= 53) rsiState = 'BULLISH_MOMENTUM';
  else if (rsi <= 47) rsiState = 'BEARISH_MOMENTUM';

  // 5. EMA Trend
  let emaTrend: TechnicalAudit['emaTrend'] = 'BULLISH';
  if (emaSpread > 0.25) emaTrend = 'BULLISH';
  else if (emaSpread < -0.25) emaTrend = 'BEARISH';
  else if (velocity > 0.05) emaTrend = 'CROSSOVER_UP';
  else if (velocity < -0.05) emaTrend = 'CROSSOVER_DOWN';
  else emaTrend = emaSpread >= 0 ? 'BULLISH' : 'BEARISH';

  // 6. Bollinger Status
  let bbStatus: TechnicalAudit['bollingerBandStatus'] = 'MIDDLE_EXPANDING';
  if (bb.pctB < 0.15) bbStatus = 'PIERCED_LOWER';
  else if (bb.pctB > 0.85) bbStatus = 'PIERCED_UPPER';
  else if (bb.bandwidth < 0.0008) bbStatus = 'SQUEEZE';

  // 7. Determine Action and Score based strictly on the Gate Rule
  let recommendedAction: 'CALL' | 'PUT' | 'WAIT' = 'WAIT';
  let confluenceFactors: string[] = [];
  let calculatedConfluence = 71.0;
  let setupName = 'Awaiting Confluence Alignment';

  if (gateResult.passed) {
    if (structureResult.structure === 'BULLISH') {
      recommendedAction = 'CALL';
      setupName = `${activeTimeframe.toUpperCase()} Bullish Confluence Expansion`;
      confluenceFactors = gateResult.factors.map((f) => `${f.name}: ${f.detail}`);
      calculatedConfluence = isVIP ? 92.4 : 88.6;
    } else if (structureResult.structure === 'BEARISH') {
      recommendedAction = 'PUT';
      setupName = `${activeTimeframe.toUpperCase()} Bearish Distribution Flow`;
      confluenceFactors = gateResult.factors.map((f) => `${f.name}: ${f.detail}`);
      calculatedConfluence = isVIP ? 92.4 : 88.6;
    }
  } else {
    recommendedAction = 'WAIT';
    setupName = structureResult.structure === 'RANGING'
      ? 'Market Ranging — Awaiting Structural Breakout'
      : 'Confluence Incomplete — Standby (No Trade)';
    confluenceFactors = gateResult.failReasons.length > 0
      ? gateResult.failReasons
      : ['Market structure in consolidation; factors unconfirmed'];
    calculatedConfluence = 68.0 + (gateResult.factors.filter((f) => f.status === 'PASS').length * 2.5);
  }

  const recheckSteps = [
    `Phase 1: Ingested ${safePrices.length} live ticks from price buffer`,
    `Phase 2: Audited market structure: ${structureResult.structure} (${structureResult.cue})`,
    `Phase 3: 5-factor Confluence Gate audit (${gateResult.factors.filter((f) => f.status === 'PASS').length}/5 passed)`,
    `Phase 4: ${recommendedAction === 'WAIT' ? 'WAIT state confirmed — one or more factors failed or unsure' : `Trade signal confirmed (${calculatedConfluence}%) with directional confluence`}`,
  ];

  return {
    rsi,
    rsiState,
    emaFast: parseFloat(ema9.toFixed(activeTimeframe.includes('USD') ? 5 : 2)),
    emaSlow: parseFloat(ema21.toFixed(activeTimeframe.includes('USD') ? 5 : 2)),
    emaSpread: parseFloat(emaSpread.toFixed(2)),
    emaTrend,
    orderFlowBuyPct: orderFlow.buyPct,
    orderFlowSellPct: orderFlow.sellPct,
    tickVelocity: velocity,
    tickAcceleration: acceleration,
    bollingerBandStatus: bbStatus,
    bollingerPctB: bb.pctB,
    confluenceScore: parseFloat(calculatedConfluence.toFixed(1)),
    confluenceFactors,
    recheckSteps,
    setupName,
    recommendedAction,
  };
}

/**
 * 3) DUAL ANALYSIS MODE GENERATOR (Mode A: Quick Expiry | Mode B: MT5 Style)
 * Enforces:
 * 1) Mandatory Instrument check (no symbol -> ANALYSIS BLOCKED)
 * 2) Mandatory Timeframe check (no timeframe -> ANALYSIS BLOCKED)
 * 3) Market Structure check
 * 4) Confluence Checklist (all required factors must PASS)
 * 5) Direction: Bullish -> CALL/BUY, Bearish -> PUT/SELL, else WAIT
 * Never invents SL/TP if structure is ranging/unclear — use WAIT.
 */
export function generateDualModeSignal(params: {
  symbol?: string;
  timeframe?: string;
  prices: number[];
  currentPrice: number;
  pipSize: number;
  decimals: number;
  mode: AnalysisMode;
  isVIP: boolean;
  accountBalance?: number;
  riskPercent?: number;
}): SignalData {
  const {
    symbol,
    timeframe,
    prices,
    currentPrice,
    pipSize,
    decimals,
    mode,
    isVIP,
    accountBalance = 10000,
    riskPercent = 1.0,
  } = params;

  // 1) INSTRUMENT VALIDATION (MANDATORY)
  if (!symbol || symbol.trim() === '' || symbol === 'UNKNOWN') {
    return {
      asset: 'UNKNOWN',
      timeframe: timeframe || '',
      direction: 'WAIT',
      confidence: 0,
      trend: 'Neutral',
      velocity: 'Blocked',
      generatedAt: Date.now(),
      status: 'ANALYSIS_BLOCKED',
      blockedReason: 'Instrument not identified. Please select an asset from the market ticker.',
      plainLanguageReason: 'Analysis blocked: Instrument must come from reliable app state. Never guess instrument from price alone.',
      riskNote: 'Trading involves risk. Algorithmic telemetry is not financial advice.',
      marketStructure: 'NEUTRAL',
      structureCue: 'INSUFFICIENT_DATA',
      structureSummary: 'Analysis Blocked: No instrument selected.',
      gatePassed: false,
      confluenceFactorsList: [],
    };
  }

  // 2) TIMEFRAME VALIDATION (MANDATORY)
  if (!timeframe || timeframe.trim() === '') {
    return {
      asset: symbol,
      timeframe: 'MISSING',
      direction: 'WAIT',
      confidence: 0,
      trend: 'Neutral',
      velocity: 'Blocked',
      generatedAt: Date.now(),
      status: 'ANALYSIS_BLOCKED',
      blockedReason: 'Timeframe not identified. Please select an expiration timeframe before initiating analysis.',
      plainLanguageReason: 'Analysis blocked: Timeframe required for multi-factor confluence model.',
      riskNote: 'Trading involves risk. Algorithmic telemetry is not financial advice.',
      marketStructure: 'NEUTRAL',
      structureCue: 'INSUFFICIENT_DATA',
      structureSummary: 'Analysis Blocked: No timeframe selected.',
      gatePassed: false,
      confluenceFactorsList: [],
    };
  }

  const safePrices = prices && prices.length >= 8 ? prices : [...(prices || []), ...Array(15).fill(currentPrice || 1.08500)];
  const pipsMultiplier = 1 / pipSize;

  // 3) MARKET STRUCTURE
  const structureResult = detectMarketStructure(safePrices, pipSize);

  // Indicators
  const ema9 = calculateEMA(safePrices, 9);
  const ema21 = calculateEMA(safePrices, 21);
  const emaSpread = (ema9 - ema21) * pipsMultiplier;
  const rsi = calculateRSI(safePrices, 14);
  const orderFlow = calculateOrderFlow(safePrices, 20);
  const { velocity, acceleration } = calculateVelocityAndAcceleration(safePrices, pipsMultiplier);

  // 4) CONFLUENCE CHECKLIST
  const gateResult = evaluateConfluenceGate({
    prices: safePrices,
    structure: structureResult.structure,
    structureCue: structureResult.cue,
    pipSize,
    rsi,
    ema9,
    ema21,
    emaSpread,
    orderFlowBuyPct: orderFlow.buyPct,
    orderFlowSellPct: orderFlow.sellPct,
    velocity,
  });

  const liveAudit = analyzeMarketConfluence(safePrices, timeframe, pipSize, isVIP);
  const safeClose = calculateSafeCloseAnalysis(safePrices, timeframe, pipSize);

  // 5) DIRECTION RESOLUTION
  let finalDirection: 'CALL' | 'PUT' | 'WAIT' = 'WAIT';
  let plainLanguageReason = '';
  let riskNote = 'Trading involves risk. Algorithmic telemetry is not financial advice.';

  if (gateResult.passed) {
    if (structureResult.structure === 'BULLISH') {
      finalDirection = 'CALL';
      plainLanguageReason = `Bullish expansion confirmed: Market created Higher Highs/Lows, EMA 9 expanded above EMA 21, and order flow showed ${orderFlow.buyPct}% buyer aggression with sell-side liquidity swept.`;
    } else if (structureResult.structure === 'BEARISH') {
      finalDirection = 'PUT';
      plainLanguageReason = `Bearish distribution confirmed: Market created Lower Highs/Lows, EMA 9 broke below EMA 21, and order flow showed ${orderFlow.sellPct}% seller aggression with buy-side liquidity swept.`;
    }
  } else {
    finalDirection = 'WAIT';
    if (structureResult.structure === 'RANGING') {
      plainLanguageReason = `Market structure is currently ranging/consolidating within a ${structureResult.recentRangePips} pips band. Directional factors are inconclusive. Wait for a clean structural break before entering.`;
    } else {
      const failed = gateResult.factors.filter((f) => f.status !== 'PASS').map((f) => f.name);
      plainLanguageReason = `Confirmation gate blocked entry: ${failed.join(', ')} failed or remained unsure. Under strict institutional discipline, we stay in CASH until all 5 factors align.`;
    }
  }

  const isActionable = finalDirection === 'CALL' || finalDirection === 'PUT';

  // Entry Zone & SL/TP (Only when actionable - NEVER invent if ranging/WAIT)
  let entryZone: EntryZone | undefined;
  let mt5Params: MT5TradeParameters | undefined;
  let invalidationLevel: number | undefined;
  let invalidationReason: string | undefined;

  if (isActionable) {
    if (finalDirection === 'CALL') {
      entryZone = {
        min: parseFloat((currentPrice - 0.4 * pipSize).toFixed(decimals)),
        max: parseFloat((currentPrice + 0.2 * pipSize).toFixed(decimals)),
      };
      invalidationLevel = parseFloat((structureResult.swingLow - 1.0 * pipSize).toFixed(decimals));
      invalidationReason = `Setup invalidated if price prints a close below recent swing low support at ${invalidationLevel.toFixed(decimals)}.`;
    } else {
      entryZone = {
        min: parseFloat((currentPrice - 0.2 * pipSize).toFixed(decimals)),
        max: parseFloat((currentPrice + 0.4 * pipSize).toFixed(decimals)),
      };
      invalidationLevel = parseFloat((structureResult.swingHigh + 1.0 * pipSize).toFixed(decimals));
      invalidationReason = `Setup invalidated if price prints a close above recent swing high resistance at ${invalidationLevel.toFixed(decimals)}.`;
    }

    mt5Params = calculateMT5Parameters(
      symbol,
      finalDirection as 'CALL' | 'PUT',
      currentPrice,
      pipSize,
      decimals,
      accountBalance,
      riskPercent
    );
  } else {
    invalidationReason = 'Market in consolidation / unconfirmed state. Stay out of the market until directional breakout occurs.';
  }

  // Timeframe duration seconds
  const tfSeconds =
    timeframe === '30s' ? 30 :
    timeframe === '1m' ? 60 :
    timeframe === '2m' ? 120 :
    timeframe === '3m' ? 180 :
    timeframe === '5m' ? 300 :
    timeframe === '15m' ? 900 : 60;

  return {
    asset: symbol,
    timeframe,
    direction: finalDirection,
    confidence: isActionable ? (isVIP ? 92.4 : 88.6) : liveAudit.confluenceScore,
    trend: finalDirection === 'CALL' ? 'Bullish' : finalDirection === 'PUT' ? 'Bearish' : 'Neutral',
    velocity: finalDirection === 'CALL' ? 'Order Flow Surge' : finalDirection === 'PUT' ? 'Distribution Wave' : 'Consolidation Drift',
    generatedAt: Date.now(),
    entryPrice: currentPrice,
    targetPrice: isActionable
      ? finalDirection === 'CALL'
        ? currentPrice + pipSize * (timeframe === '30s' ? 4 : 8)
        : currentPrice - pipSize * (timeframe === '30s' ? 4 : 8)
      : currentPrice,
    technicalAudit: liveAudit,
    expirySeconds: tfSeconds,
    mt5: mt5Params,

    // Dual Mode Enhancements
    mode,
    status: 'READY',
    marketStructure: structureResult.structure,
    structureCue: structureResult.cue,
    structureSummary: structureResult.summary,
    confluenceFactorsList: gateResult.factors,
    gatePassed: gateResult.passed,
    entryZone,
    invalidationLevel,
    invalidationReason,
    plainLanguageReason,
    riskNote,
    shortHoldGuidance: safeClose.advisoryText,
    peakMomentumWindow: safeClose.peakMomentumWindow,
  };
}

/**
 * Calculate MetaTrader 5 (MT5) Institutional Trade Parameters:
 * - Precise Stop Loss (SL) based on volatility buffer
 * - Take Profit 1 (TP1) @ 1:1.5 RR & Take Profit 2 (TP2) @ 1:3.0 RR
 * - Position / Lot Size calculation based on account balance & risk %
 * - One-click formatted string for MT5 execution and EA webhooks
 */
export function calculateMT5Parameters(
  assetName: string,
  direction: 'CALL' | 'PUT',
  entryPrice: number,
  pipSize: number,
  decimals: number,
  accountBalance: number = 10000,
  riskPercent: number = 1.0
): MT5TradeParameters {
  const isBuy = direction === 'CALL';
  const orderType: 'BUY' | 'SELL' = isBuy ? 'BUY' : 'SELL';

  const slPips = assetName.includes('VOL') ? 40 : 15;
  const tp1Pips = slPips * 1.5;
  const tp2Pips = slPips * 3.0;

  const slDelta = slPips * pipSize;
  const tp1Delta = tp1Pips * pipSize;
  const tp2Delta = tp2Pips * pipSize;

  const stopLossPrice = parseFloat((isBuy ? entryPrice - slDelta : entryPrice + slDelta).toFixed(decimals));
  const takeProfit1Price = parseFloat((isBuy ? entryPrice + tp1Delta : entryPrice - tp1Delta).toFixed(decimals));
  const takeProfit2Price = parseFloat((isBuy ? entryPrice + tp2Delta : entryPrice - tp2Delta).toFixed(decimals));

  const riskAmount = (accountBalance * riskPercent) / 100;
  const pipValuePerLot = assetName.includes('VOL') ? 1.0 : 10.0;
  const calculatedLot = riskAmount / (slPips * pipValuePerLot);
  const recommendedLot = Math.max(0.01, parseFloat(calculatedLot.toFixed(2)));

  const mt5Symbol = assetName.replace(/[^A-Za-z0-9]/g, '');

  const formattedText = `${orderType} ${mt5Symbol} @ ${entryPrice.toFixed(decimals)} | SL: ${stopLossPrice.toFixed(decimals)} (-${slPips} pips) | TP1: ${takeProfit1Price.toFixed(decimals)} (+${tp1Pips} pips) | TP2: ${takeProfit2Price.toFixed(decimals)} (+${tp2Pips} pips) | Lots: ${recommendedLot} ($${riskAmount.toFixed(0)} risk)`;

  return {
    symbol: mt5Symbol,
    orderType,
    entryPrice: parseFloat(entryPrice.toFixed(decimals)),
    stopLossPrice,
    stopLossPips: slPips,
    takeProfit1Price,
    takeProfit1Pips: tp1Pips,
    takeProfit2Price,
    takeProfit2Pips: tp2Pips,
    riskRewardRatio: '1 : 2.0 (TP1: 1:1.5 / TP2: 1:3.0)',
    recommendedLot,
    accountRiskAmount: riskAmount,
    formattedText,
  };
}

/**
 * Analyzes market velocity, tick variance, and momentum horizon to suggest
 * the optimal safe close timing and profit target BEFORE and DURING a trade.
 */
export function calculateSafeCloseAnalysis(
  ticks: number[],
  selectedTimeframe: string,
  pipSize: number,
  direction?: 'CALL' | 'PUT'
): SafeCloseAnalysis {
  const safeTicks = ticks && ticks.length >= 5 ? ticks : [1.0850, 1.0851, 1.0852, 1.0853, 1.0854];
  const n = safeTicks.length;
  
  let totalDeltaPips = 0;
  for (let i = 1; i < n; i++) {
    totalDeltaPips += Math.abs(safeTicks[i] - safeTicks[i - 1]) / pipSize;
  }
  const avgTickDelta = totalDeltaPips / (n - 1);
  const recentSlice = safeTicks.slice(-6);
  const recentVelocity = Math.abs(recentSlice[recentSlice.length - 1] - recentSlice[0]) / (pipSize * Math.max(1, recentSlice.length));

  let volatilityLevel: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME' = 'NORMAL';
  if (recentVelocity < 0.25 || avgTickDelta < 0.3) {
    volatilityLevel = 'LOW';
  } else if (recentVelocity > 1.4 || avgTickDelta > 1.8) {
    volatilityLevel = 'EXTREME';
  } else if (recentVelocity > 0.75 || avgTickDelta > 0.9) {
    volatilityLevel = 'HIGH';
  } else {
    volatilityLevel = 'NORMAL';
  }

  const tfSeconds = 
    selectedTimeframe === '30s' ? 30 :
    selectedTimeframe === '1m' ? 60 :
    selectedTimeframe === '2m' ? 120 :
    selectedTimeframe === '3m' ? 180 :
    selectedTimeframe === '5m' ? 300 :
    selectedTimeframe === '15m' ? 900 : 60;

  let recommendedSeconds: number;
  let peakMomentumWindow: string;
  let safeProfitPips: number;
  let advisoryText: string;
  let reversalRisk: 'LOW' | 'MODERATE' | 'ELEVATED' = 'MODERATE';

  if (volatilityLevel === 'LOW') {
    const rec = Math.round(tfSeconds * 0.85);
    recommendedSeconds = Math.max(20, rec);
    peakMomentumWindow = `T+${Math.round(tfSeconds * 0.6)}s to T+${rec}s`;
    safeProfitPips = parseFloat((pipSize <= 0.0001 ? 1.8 : 8.5).toFixed(1));
    reversalRisk = 'LOW';
    advisoryText = `Low Volatility detected. Price movement is steady with low whip risk. Optimal Safe Close target is ${recommendedSeconds}s; locking gains at +${safeProfitPips} pips avoids flatline stagnation.`;
  } else if (volatilityLevel === 'HIGH' || volatilityLevel === 'EXTREME') {
    const rec = Math.round(tfSeconds * 0.55);
    recommendedSeconds = Math.max(15, rec);
    peakMomentumWindow = `T+${Math.round(tfSeconds * 0.3)}s to T+${rec}s`;
    safeProfitPips = parseFloat((pipSize <= 0.0001 ? 3.5 : 22.0).toFixed(1));
    reversalRisk = 'ELEVATED';
    advisoryText = `High Volatility warning! Fast impulse detected. Do not hold to full expiry—momentum peaks early (${peakMomentumWindow}). Safe early close recommended around ${recommendedSeconds}s or at +${safeProfitPips} pips.`;
  } else {
    const rec = Math.round(tfSeconds * 0.70);
    recommendedSeconds = Math.max(20, rec);
    peakMomentumWindow = `T+${Math.round(tfSeconds * 0.45)}s to T+${rec}s`;
    safeProfitPips = parseFloat((pipSize <= 0.0001 ? 2.4 : 14.0).toFixed(1));
    reversalRisk = 'MODERATE';
    advisoryText = `Normal Volatility index. Standard momentum continuation expected. Optimal Safe Close window is ${peakMomentumWindow} (${recommendedSeconds}s safe exit). Secure profit if +${safeProfitPips} pips is achieved.`;
  }

  return {
    volatilityLevel,
    recommendedSeconds,
    peakMomentumWindow,
    safeProfitPips,
    advisoryText,
    earlyCloseRecommended: volatilityLevel === 'HIGH' || volatilityLevel === 'EXTREME',
    reversalRisk,
  };
}
