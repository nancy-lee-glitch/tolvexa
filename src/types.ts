/**
 * PulseTrade Pro - Shared TypeScript Definitions
 */

export interface AssetConfig {
  symbol: string;
  name: string;
  type: 'FOREX' | 'COMMODITY' | 'SYNTH' | 'CRYPTO' | 'STOCK' | 'INDEX';
  decimals: number;
  pipSize: number;
  basePrice?: number;
  marketHours?: string;
  category?: string;
}

export interface SafeCloseAnalysis {
  volatilityLevel: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  recommendedSeconds: number;
  peakMomentumWindow: string;
  safeProfitPips: number;
  advisoryText: string;
  earlyCloseRecommended: boolean;
  reversalRisk: 'LOW' | 'MODERATE' | 'ELEVATED';
}

export interface SignalHistoryItem {
  id: string;
  asset: string;
  timeframe: string;
  direction: 'CALL' | 'PUT';
  entryPrice: number;
  targetPrice?: number;
  generatedAt: number;
  confidence: number;
  outcome?: 'WIN' | 'LOSS' | 'IN_TRADE' | 'PENDING';
  sparkline: number[];
  pipDiff?: number;
  safeCloseSuggestion?: string;
}

export interface VipScreenerAsset {
  symbol: string;
  name: string;
  type: 'FOREX' | 'COMMODITY' | 'SYNTH' | 'CRYPTO' | 'STOCK' | 'INDEX';
  price: number;
  decimals: number;
  change24h: number;
  volatility: 'LOW' | 'NORMAL' | 'HIGH';
  safetyRating: 'SAFE TO TRADE' | 'MODERATE RISK' | 'WAIT / VOLATILE';
  recommendedAction: 'CALL' | 'PUT' | 'WAIT';
  bestTimeframe: '30s' | '1m' | '5m' | '15m' | '1h';
  confluenceScore: number;
  safeCloseTiming: string;
  reason: string;
  sparkline: number[];
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

export interface MT5TradeParameters {
  symbol: string;
  orderType: 'BUY' | 'SELL';
  entryPrice: number;
  stopLossPrice: number;
  stopLossPips: number;
  takeProfit1Price: number;
  takeProfit1Pips: number;
  takeProfit2Price: number;
  takeProfit2Pips: number;
  riskRewardRatio: string;
  recommendedLot: number;
  accountRiskAmount: number;
  formattedText: string;
}

export interface SignalData {
  asset: string;
  timeframe: string;
  direction: 'CALL' | 'PUT';
  confidence: number;
  trend: 'Bullish' | 'Bearish';
  velocity: string;
  generatedAt: number;
  targetPrice?: number;
  entryPrice?: number;
  technicalAudit?: TechnicalAudit;
  expirySeconds?: number;
  mt5?: MT5TradeParameters;
}

export interface SessionStats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface PricingTier {
  id: number;
  credits: number;
  bonus: number;
  price: number;
  label: string;
  badge?: string;
}

export interface CryptoWallet {
  id: number;
  coinName: string;
  symbol: string;
  network: string;
  address: string;
  active: boolean;
}

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  role: 'USER' | 'ADMIN';
  credits: number;
  is_vip: boolean;
  vip_expires_at?: string | null;
  vip_days_left: number;
  vip_hours_left: number;
  vip_seconds_left: number;
}

export interface BlogArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string[];
  author: string;
  authorRole: string;
  readTime: string;
  date: string;
  category: string;
  imageUrl: string;
  tags: string[];
  keyTakeaways: string[];
}

export interface SiteSettings {
  siteName: string;
  siteTagline: string;
  logoUrl?: string;
  logoIcon: 'zap' | 'activity' | 'shield' | 'flame' | 'trending';
  badgeText: string;
  bannerText: string;
  bannerEnabled: boolean;
  supportTelegram: string;
  supportWhatsapp: string;
  supportEmail: string;
  vipPriceUsd: number;
  starterPriceUsd: number;
  themeAccent: 'emerald' | 'amber' | 'blue' | 'purple';
}

export interface NowPaymentsConfig {
  apiKey: string;
  ipnSecret: string;
  isSandbox: boolean;
  enabled: boolean;
  payoutAddress?: string;
}

export interface NowPaymentsPayment {
  paymentId: string;
  payAddress: string;
  payAmount: number;
  payCurrency: string;
  priceAmount: number;
  priceCurrency: string;
  orderId: string;
  orderDescription: string;
  paymentStatus: 'waiting' | 'confirming' | 'confirmed' | 'sending' | 'finished' | 'failed' | 'refunded' | 'expired';
  createdAt: string;
  updatedAt?: string;
  actuallyPaid?: number;
}

export type PageView = 'landing' | 'cockpit' | 'blog' | 'about' | 'pricing' | 'admin' | 'files' | 'supabase';

export type AuthModalMode = 'login' | 'register' | 'profile' | 'redeem-vip' | null;
