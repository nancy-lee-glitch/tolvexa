import type { SiteSettings, NowPaymentsConfig, NowPaymentsPayment } from '../types.ts';
import { getSupabaseClient } from './supabaseClient.ts';

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  siteName: 'PulseTrade Pro',
  siteTagline: 'Institutional-Grade Quantitative Micro-Volatility Terminal',
  logoUrl: '',
  logoIcon: 'zap',
  badgeText: 'v8.2 QUANT',
  bannerText: '⚡ 30-Day VIP Pass: Institutional-grade 89.4% confluence signals with instant automated verification',
  bannerEnabled: true,
  supportTelegram: 'https://t.me/pulsetrade_quant',
  supportWhatsapp: '',
  supportEmail: 'support@pulsetrade.pro',
  vipPriceUsd: 49,
  starterPriceUsd: 5,
  themeAccent: 'emerald',
};

export const DEFAULT_NOWPAYMENTS_CONFIG: NowPaymentsConfig = {
  apiKey: '',
  ipnSecret: '',
  isSandbox: false,
  enabled: false,
  payoutAddress: '',
};

const STORAGE_KEY_SETTINGS = 'pulsetrade_site_settings';
const STORAGE_KEY_NOWPAYMENTS = 'pulsetrade_nowpayments_config';

/**
 * Get current site settings (synchronous fallback)
 */
export function getSiteSettings(): SiteSettings {
  if (typeof window === 'undefined') return DEFAULT_SITE_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (raw) {
      return { ...DEFAULT_SITE_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('[SiteSettings Parse Error]', e);
  }
  return DEFAULT_SITE_SETTINGS;
}

/**
 * Fetch remote site settings from Supabase (preferred) or Backend API
 */
export async function fetchRemoteSiteSettings(): Promise<SiteSettings> {
  let settings = getSiteSettings();

  // 1. Try Supabase app_settings table
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'site_branding')
        .single();

      if (!error && data?.value) {
        settings = { ...DEFAULT_SITE_SETTINGS, ...data.value };
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
        return settings;
      }
    } catch (err) {
      console.warn('[Supabase Settings Fetch]', err);
    }
  }

  // 2. Try Node/PHP Backend API
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      if (data && data.settings) {
        settings = { ...DEFAULT_SITE_SETTINGS, ...data.settings };
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
        return settings;
      }
    }
  } catch (err) {
    // Graceful offline fallback
  }

  return settings;
}

/**
 * Save site settings and broadcast changes across tabs and backend
 */
export async function saveSiteSettings(newSettings: SiteSettings): Promise<boolean> {
  const merged = { ...DEFAULT_SITE_SETTINGS, ...newSettings };
  
  // 1. Save locally
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('pulsetrade_settings_changed', { detail: merged }));
  }

  // 2. Save to Supabase real-time database if connected
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('app_settings').upsert({
        key: 'site_branding',
        value: merged,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[Supabase Settings Save Error]', err);
    }
  }

  // 3. Save to server backend
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: merged }),
    });
  } catch (err) {
    // Network fallback
  }

  return true;
}

/**
 * Get NOWPayments configuration
 */
export function getNowPaymentsConfig(): NowPaymentsConfig {
  if (typeof window === 'undefined') return DEFAULT_NOWPAYMENTS_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NOWPAYMENTS);
    if (raw) {
      return { ...DEFAULT_NOWPAYMENTS_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('[NOWPayments Config Parse Error]', e);
  }
  return DEFAULT_NOWPAYMENTS_CONFIG;
}

/**
 * Fetch remote NOWPayments config from Supabase or server
 */
export async function fetchRemoteNowPaymentsConfig(): Promise<NowPaymentsConfig> {
  let config = getNowPaymentsConfig();

  // Try Supabase
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'nowpayments_config')
        .single();

      if (!error && data?.value) {
        config = { ...DEFAULT_NOWPAYMENTS_CONFIG, ...data.value };
        localStorage.setItem(STORAGE_KEY_NOWPAYMENTS, JSON.stringify(config));
        return config;
      }
    } catch (err) {
      // Handled
    }
  }

  // Try backend API
  try {
    const res = await fetch('/api/nowpayments/config');
    if (res.ok) {
      const data = await res.json();
      if (data && data.config) {
        config = { ...DEFAULT_NOWPAYMENTS_CONFIG, ...data.config };
        localStorage.setItem(STORAGE_KEY_NOWPAYMENTS, JSON.stringify(config));
        return config;
      }
    }
  } catch (err) {
    // Handled
  }

  return config;
}

/**
 * Save NOWPayments configuration
 */
export async function saveNowPaymentsConfig(newConfig: NowPaymentsConfig): Promise<boolean> {
  const merged = { ...DEFAULT_NOWPAYMENTS_CONFIG, ...newConfig };

  // 1. Local
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_NOWPAYMENTS, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('pulsetrade_nowpayments_changed', { detail: merged }));
  }

  // 2. Supabase
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('app_settings').upsert({
        key: 'nowpayments_config',
        value: merged,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[Supabase NOWPayments Save Error]', err);
    }
  }

  // 3. Server
  try {
    await fetch('/api/nowpayments/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: merged }),
    });
  } catch (err) {
    // Handled
  }

  return true;
}

/**
 * Test NOWPayments API connectivity
 */
export async function testNowPaymentsConnection(
  apiKey: string,
  isSandbox: boolean = false
): Promise<{ success: boolean; message: string }> {
  if (!apiKey || apiKey.trim().length < 10) {
    return { success: false, message: 'Please provide a valid NOWPayments API Key.' };
  }

  try {
    const res = await fetch('/api/nowpayments/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, isSandbox }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        success: Boolean(data.success),
        message: data.message || (data.success ? 'NOWPayments API connection verified!' : 'Connection test failed.'),
      };
    }
    return { success: false, message: `Server returned HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error during connection test.' };
  }
}

/**
 * Create a live NOWPayments invoice for instant payment verification
 */
export async function createNowPaymentsPayment(params: {
  priceAmount: number;
  priceCurrency?: string;
  payCurrency: string;
  orderId: string;
  orderDescription: string;
}): Promise<{ success: boolean; data?: NowPaymentsPayment; message?: string }> {
  try {
    const res = await fetch('/api/nowpayments/create-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const json = await res.json();
    if (res.ok && json.success && json.payment) {
      return { success: true, data: json.payment };
    }
    return { success: false, message: json.message || 'Failed to create payment invoice with NOWPayments.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error initiating NOWPayments invoice.' };
  }
}

/**
 * Poll payment status from NOWPayments
 */
export async function checkNowPaymentsStatus(paymentId: string): Promise<{
  success: boolean;
  data?: NowPaymentsPayment;
  message?: string;
}> {
  try {
    const res = await fetch(`/api/nowpayments/check-payment/${encodeURIComponent(paymentId)}`);
    const json = await res.json();
    if (res.ok && json.success && json.payment) {
      return { success: true, data: json.payment };
    }
    return { success: false, message: json.message || 'Unable to fetch status.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Status check request failed.' };
  }
}
