import type { SiteSettings, NowPaymentsConfig, NowPaymentsPayment, PricingPackage, AdminUserItem, VipCodeItem } from '../types.ts';
import { getSupabaseClient } from './supabaseClient.ts';

export const DEFAULT_PRICING_PACKAGES: PricingPackage[] = [
  {
    id: 1,
    name: 'Starter Pack',
    type: 'CREDITS',
    credits_amount: 10,
    bonus_credits: 0,
    price_usd: 5.0,
    badge_label: '',
    description: 'Instant algorithmic micro-scalping credits (10 executions)',
    is_active: true,
    sort_order: 1,
  },
  {
    id: 2,
    name: 'Popular Pack',
    type: 'CREDITS',
    credits_amount: 25,
    bonus_credits: 5,
    price_usd: 10.0,
    badge_label: 'MOST POPULAR',
    description: '25 + 5 Free bonus algorithmic signals with confluence audit',
    is_active: true,
    sort_order: 2,
  },
  {
    id: 3,
    name: 'Pro Trader',
    type: 'CREDITS',
    credits_amount: 60,
    bonus_credits: 20,
    price_usd: 20.0,
    badge_label: 'HIGH VOLUME',
    description: '60 + 20 Bonus credits with full MT5 lot & pip calculations',
    is_active: true,
    sort_order: 3,
  },
  {
    id: 4,
    name: 'Whale Alpha',
    type: 'CREDITS',
    credits_amount: 150,
    bonus_credits: 60,
    price_usd: 45.0,
    badge_label: 'BEST VALUE',
    description: '150 + 60 Institutional bonus credits for high-frequency desks',
    is_active: true,
    sort_order: 4,
  },
  {
    id: 5,
    name: '★ 30-Day VIP Pass',
    type: 'VIP_30_DAY',
    credits_amount: 9999,
    bonus_credits: 0,
    price_usd: 49.0,
    badge_label: 'UNLIMITED VIP',
    description: 'Strict 30-day unlimited signal computation & unlocked Safe Radar',
    is_active: true,
    sort_order: 5,
  },
];

const STORAGE_KEY_PACKAGES = 'pulsetrade_pricing_packages';

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
    let res = await fetch('/api/settings');
    if (!res.ok) {
      res = await fetch('/api.php?action=get_settings');
    }
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
    let res = await fetch('/api/nowpayments/config');
    if (!res.ok) {
      res = await fetch('/api.php?action=nowpayments_config');
    }
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
    let res = await fetch('/api/nowpayments/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: merged }),
    });
    if (!res.ok) {
      await fetch('/api.php?action=nowpayments_save_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: merged }),
      });
    }
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
    let res = await fetch('/api/nowpayments/create-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      res = await fetch('/api.php?action=nowpayments_create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
    }

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
    let res = await fetch(`/api/nowpayments/check-payment/${encodeURIComponent(paymentId)}`);
    if (!res.ok) {
      res = await fetch(`/api.php?action=nowpayments_check&id=${encodeURIComponent(paymentId)}`);
    }
    const json = await res.json();
    if (res.ok && json.success && json.payment) {
      return { success: true, data: json.payment };
    }
    return { success: false, message: json.message || 'Unable to fetch status.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Status check request failed.' };
  }
}

/**
  * Synchronous read of saved pricing packages
  */
export function getPricingPackages(): PricingPackage[] {
  if (typeof window === 'undefined') return DEFAULT_PRICING_PACKAGES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PACKAGES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('[Pricing Packages Parse Error]', e);
  }
  return DEFAULT_PRICING_PACKAGES;
}

/**
  * Fetch dynamic pricing packages from API/DB
  */
export async function fetchPricingPackages(): Promise<PricingPackage[]> {
  let list = getPricingPackages();
  try {
    let res = await fetch('/api/pricing_packages');
    if (!res.ok) {
      res = await fetch('/api/packages');
    }
    if (!res.ok) {
      res = await fetch('/api.php?action=pricing_packages');
    }
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.packages) && data.packages.length > 0) {
        list = data.packages;
        localStorage.setItem(STORAGE_KEY_PACKAGES, JSON.stringify(list));
        return list;
      }
    }
  } catch (err) {
    // Return cached/default
  }
  return list;
}

/**
  * Save pricing packages (admin)
  */
export async function savePricingPackages(packages: PricingPackage[], adminPin: string = '7789'): Promise<boolean> {
  localStorage.setItem(STORAGE_KEY_PACKAGES, JSON.stringify(packages));
  try {
    let res = await fetch('/api/admin/pricing_packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packages, adminPin }),
    });
    if (!res.ok) {
      res = await fetch('/api.php?action=admin_save_pricing_packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages, adminPin }),
      });
    }
    return res.ok;
  } catch (err) {
    return true; // Saved locally
  }
}

/**
  * Fetch all registered users for Admin Dashboard
  */
export async function fetchAdminUsers(adminPin: string = '7789'): Promise<AdminUserItem[]> {
  try {
    let res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminPin }),
    });
    if (!res.ok) {
      res = await fetch('/api.php?action=admin_users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPin }),
      });
    }
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.users)) {
        return data.users;
      }
    }
  } catch (err) {
    console.warn('[Admin Users Fetch Error]', err);
  }
  return [];
}

/**
  * Grant 30-Day VIP to a user
  * Rule: If currently active VIP, extends current vip_expires_at + 30 days. If not VIP, now + 30 days.
  */
export async function grantUserVip(
  userId: string | number,
  days: number = 30,
  adminPin: string = '7789'
): Promise<{ success: boolean; user?: any; message: string }> {
  try {
    let res = await fetch('/api/admin/grant-vip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, days, adminPin }),
    });
    if (!res.ok) {
      res = await fetch('/api.php?action=admin_grant_vip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, days, adminPin }),
      });
    }
    const data = await res.json();
    return {
      success: Boolean(data.success),
      user: data.user,
      message: data.message || (data.success ? '30-Day VIP granted successfully!' : 'Failed to grant VIP.'),
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error granting VIP.' };
  }
}

/**
  * Revoke VIP from user
  */
export async function revokeUserVip(
  userId: string | number,
  adminPin: string = '7789'
): Promise<{ success: boolean; user?: any; message: string }> {
  try {
    let res = await fetch('/api/admin/revoke-vip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, adminPin }),
    });
    if (!res.ok) {
      res = await fetch('/api.php?action=admin_revoke_vip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, adminPin }),
      });
    }
    const data = await res.json();
    return {
      success: Boolean(data.success),
      user: data.user,
      message: data.message || (data.success ? 'VIP revoked.' : 'Failed to revoke VIP.'),
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error revoking VIP.' };
  }
}

/**
  * Adjust user credits balance
  */
export async function adjustUserCredits(
  userId: string | number,
  credits: number,
  adminPin: string = '7789'
): Promise<{ success: boolean; user?: any; message: string }> {
  try {
    let res = await fetch('/api/admin/adjust-credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, credits, adminPin }),
    });
    if (!res.ok) {
      res = await fetch('/api.php?action=admin_adjust_credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, credits, adminPin }),
      });
    }
    const data = await res.json();
    return {
      success: Boolean(data.success),
      user: data.user,
      message: data.message || (data.success ? 'Credits adjusted successfully.' : 'Failed to adjust credits.'),
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error adjusting credits.' };
  }
}

/**
  * Fetch all VIP codes for Admin
  */
export async function fetchAdminVipKeys(adminPin: string = '7789'): Promise<VipCodeItem[]> {
  try {
    let res = await fetch('/api/admin/vip-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminPin }),
    });
    if (!res.ok) {
      res = await fetch('/api.php?action=admin_vip_keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPin }),
      });
    }
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.keys)) {
        return data.keys;
      }
    }
  } catch (err) {
    console.warn('[Admin VIP Keys Fetch Error]', err);
  }
  return [];
}

/**
  * Generate single or bulk secure VIP codes (PT-VIP-XXXXXXXX)
  */
export async function generateVipKeys(
  count: number = 1,
  durationDays: number = 30,
  adminPin: string = '7789'
): Promise<{ success: boolean; keys?: VipCodeItem[]; message: string }> {
  try {
    let res = await fetch('/api/admin/generate-vip-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count, durationDays, adminPin }),
    });
    if (!res.ok) {
      res = await fetch('/api.php?action=admin_vip_keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subAction: 'create_bulk', count, duration_days: durationDays, adminPin }),
      });
    }
    const data = await res.json();
    return {
      success: Boolean(data.success),
      keys: data.keys,
      message: data.message || (data.success ? `Generated ${count} VIP codes.` : 'Failed to generate VIP codes.'),
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error generating VIP codes.' };
  }
}

/**
  * Toggle disable / enable VIP code
  */
export async function toggleVipKey(id: string | number, adminPin: string = '7789'): Promise<{ success: boolean; message: string }> {
  try {
    let res = await fetch('/api/admin/toggle-vip-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, adminPin }),
    });
    if (!res.ok) {
      res = await fetch('/api.php?action=admin_vip_keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subAction: 'toggle', id, adminPin }),
      });
    }
    const data = await res.json();
    return { success: Boolean(data.success), message: data.message || 'VIP key updated.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error updating VIP key.' };
  }
}

/**
  * Delete VIP code
  */
export async function deleteVipKey(id: string | number, adminPin: string = '7789'): Promise<{ success: boolean; message: string }> {
  try {
    let res = await fetch('/api/admin/delete-vip-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, adminPin }),
    });
    if (!res.ok) {
      res = await fetch('/api.php?action=admin_vip_keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subAction: 'delete', id, adminPin }),
      });
    }
    const data = await res.json();
    return { success: Boolean(data.success), message: data.message || 'VIP key deleted.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error deleting VIP key.' };
  }
}
