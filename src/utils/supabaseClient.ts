import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile } from '../types.ts';

// Cache client instance
let supabaseInstance: SupabaseClient | null = null;
let currentConfigKey = '';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/**
 * Get active Supabase configuration from environment or localStorage
 */
export function getSupabaseConfig(): SupabaseConfig {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  const envUrl = meta.env?.VITE_SUPABASE_URL || '';
  const envAnonKey = meta.env?.VITE_SUPABASE_ANON_KEY || '';

  // Check if user set custom Supabase credentials in browser storage
  const storedUrl = typeof window !== 'undefined' ? localStorage.getItem('pulsetrade_supabase_url') : null;
  const storedKey = typeof window !== 'undefined' ? localStorage.getItem('pulsetrade_supabase_key') : null;

  const url = (storedUrl || envUrl || '').trim();
  const anonKey = (storedKey || envAnonKey || '').trim();

  return { url, anonKey };
}

/**
 * Check if valid Supabase credentials are configured
 */
export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && url.startsWith('http') && anonKey && anonKey.length > 20);
}

/**
 * Get or initialize Supabase client
 */
export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseConfig();

  if (!url || !anonKey || !url.startsWith('http')) {
    return null;
  }

  const keyCombination = `${url}_${anonKey}`;
  if (supabaseInstance && currentConfigKey === keyCombination) {
    return supabaseInstance;
  }

  try {
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    currentConfigKey = keyCombination;
    return supabaseInstance;
  } catch (err) {
    console.warn('[Supabase Client Error]', err);
    return null;
  }
}

/**
 * Test Supabase connectivity and table presence
 */
export async function testSupabaseConnection(url: string, anonKey: string): Promise<{ success: boolean; message: string; activeTraders?: number }> {
  try {
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      return { success: false, message: 'Invalid URL format. Project URL must start with https://' };
    }
    if (anonKey.length < 25) {
      return { success: false, message: 'Invalid Anon Public Key provided.' };
    }

    const testClient = createClient(url, anonKey);
    
    // Check connection by pinging active_sessions
    const { data, error } = await testClient
      .from('active_sessions')
      .select('session_id')
      .limit(5);

    if (error) {
      // If table doesn't exist yet, notify user to run the SQL schema script
      if (error.code === '42P01') {
        return {
          success: false,
          message: 'Connected to Supabase project, but the tables are missing. Please paste and run supabase_schema.sql in the Supabase SQL Editor.',
        };
      }
      return { success: false, message: `Supabase Error: ${error.message}` };
    }

    return {
      success: true,
      message: 'Successfully connected to live Supabase PostgreSQL database!',
      activeTraders: data?.length || 1,
    };
  } catch (err: any) {
    return { success: false, message: `Connection failed: ${err?.message || 'Unknown network error'}` };
  }
}

/**
 * Save user custom Supabase credentials
 */
export function saveCustomSupabaseConfig(url: string, anonKey: string) {
  if (typeof window !== 'undefined') {
    if (url && anonKey) {
      localStorage.setItem('pulsetrade_supabase_url', url.trim());
      localStorage.setItem('pulsetrade_supabase_key', anonKey.trim());
    } else {
      localStorage.removeItem('pulsetrade_supabase_url');
      localStorage.removeItem('pulsetrade_supabase_key');
    }
    supabaseInstance = null;
    currentConfigKey = '';
  }
}

/**
 * Real-Time Presence Heartbeat (100% Genuine Connected Traders)
 */
export async function sendSupabasePresence(sessionId: string, userId: number | null, activeAsset: string): Promise<number | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    // 1. Upsert active session
    await client.from('active_sessions').upsert(
      {
        session_id: sessionId,
        user_id: userId,
        active_asset: activeAsset,
        last_heartbeat: new Date().toISOString(),
        ip_address: 'client_connection',
      },
      { onConflict: 'session_id' }
    );

    // 2. Count active sessions within the last 45 seconds
    const cutoff = new Date(Date.now() - 45000).toISOString();
    const { count, error } = await client
      .from('active_sessions')
      .select('*', { count: 'exact', head: true })
      .gte('last_heartbeat', cutoff);

    if (error) {
      console.warn('[Supabase Presence Query Warning]', error.message);
      return null;
    }

    return count ?? 1;
  } catch (err) {
    console.warn('[Supabase Heartbeat Exception]', err);
    return null;
  }
}

/**
 * Record Quantitative Signal in Supabase
 */
export async function logSignalToSupabase(signal: any, userId?: number | null) {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client.from('signals').insert({
      user_id: userId || null,
      asset: signal.asset,
      timeframe: signal.timeframe,
      direction: signal.direction,
      entry_price: signal.entryPrice,
      target_price: signal.targetPrice,
      stop_loss: signal.mt5?.stopLossPrice || null,
      take_profit_1: signal.mt5?.takeProfit1Price || null,
      take_profit_2: signal.mt5?.takeProfit2Price || null,
      confidence: signal.confidence,
      confluence_factors: signal.technicalAudit?.confluenceFactors || [],
      setup_name: signal.technicalAudit?.setupName || 'Algorithmic Signal',
    });

    if (error) {
      console.warn('[Supabase Log Signal Error]', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase Log Signal Exception]', err);
    return false;
  }
}

/**
 * Record Verified Trade Outcome in Supabase
 */
export async function logOutcomeToSupabase(outcome: 'WIN' | 'LOSS', signal: any, userId?: number | null) {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client.from('trade_outcomes').insert({
      user_id: userId || null,
      asset: signal.asset,
      timeframe: signal.timeframe,
      direction: signal.direction,
      entry_price: signal.entryPrice,
      outcome: outcome,
    });

    if (error) {
      console.warn('[Supabase Log Outcome Error]', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase Log Outcome Exception]', err);
    return false;
  }
}

/**
 * Format a Supabase user into standard UserProfile
 */
function mapToUserProfile(userObj: any, dbUser?: any): UserProfile {
  const metadata = userObj?.user_metadata || {};
  const isVip = Boolean(dbUser?.is_vip || metadata.is_vip);
  const vipExpiresAt = dbUser?.vip_expires_at || metadata.vip_expires_at || null;
  
  let vipDaysLeft = 0;
  let vipHoursLeft = 0;
  let vipSecondsLeft = 0;
  if (isVip && vipExpiresAt) {
    const diffMs = new Date(vipExpiresAt).getTime() - Date.now();
    if (diffMs > 0) {
      vipSecondsLeft = Math.floor(diffMs / 1000);
      vipDaysLeft = Math.floor(vipSecondsLeft / 86400);
      vipHoursLeft = Math.floor((vipSecondsLeft % 86400) / 3600);
    }
  }

  const role = dbUser?.role || metadata.role || (userObj.email?.toLowerCase() === 'durodoluwa5@gmail.com' ? 'ADMIN' : 'USER');

  return {
    id: dbUser?.id || (userObj.id ? parseInt(String(userObj.id).replace(/\D/g, '').slice(0, 8)) || 1 : 1),
    username: dbUser?.username || metadata.username || userObj.email?.split('@')[0] || 'trader',
    email: userObj.email || '',
    role: role as 'USER' | 'ADMIN',
    credits: typeof dbUser?.credits === 'number' ? dbUser.credits : (isVip || role === 'ADMIN' ? 9999 : 10),
    is_vip: isVip,
    vip_expires_at: vipExpiresAt,
    vip_days_left: vipDaysLeft,
    vip_hours_left: vipHoursLeft,
    vip_seconds_left: vipSecondsLeft,
  };
}

/**
 * Supabase Auth: Register new user
 */
export async function signUpWithSupabase(
  email: string,
  password: string,
  username: string,
  vipKey?: string
): Promise<{ success: boolean; user?: UserProfile; message: string }> {
  const trimmedEmail = (email || '').trim().toLowerCase();
  const trimmedUsername = (username || '').trim();
  const cleanPassword = password || '';

  // 1. Rigorous input validation
  if (!trimmedUsername || trimmedUsername.length < 3) {
    return { success: false, message: 'Username must be at least 3 characters long.' };
  }
  if (trimmedUsername.length > 30) {
    return { success: false, message: 'Username cannot exceed 30 characters.' };
  }

  if (!trimmedEmail) {
    return { success: false, message: 'Email address is required.' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { success: false, message: 'Please enter a valid email address.' };
  }

  if (!cleanPassword || cleanPassword.length < 6) {
    return { success: false, message: 'Password must be at least 6 characters long.' };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'Supabase client is not configured. Missing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    };
  }

  try {
    const isValidVip = Boolean(
      vipKey &&
        ['VIP-ALPHA-30D', 'PULSE-VIP-2026', 'QUANT-30D', 'VIP-TRADER-1M'].includes(
          vipKey.trim().toUpperCase()
        )
    );
    const vipExpiresAt = isValidVip ? new Date(Date.now() + 30 * 86400000).toISOString() : null;

    // 2. Call Supabase Auth
    const { data: authData, error: authError } = await client.auth.signUp({
      email: trimmedEmail,
      password: cleanPassword,
      options: {
        data: {
          username: trimmedUsername,
          is_vip: isValidVip,
          vip_expires_at: vipExpiresAt,
          role: trimmedEmail === 'durodoluwa5@gmail.com' ? 'ADMIN' : 'USER',
        },
      },
    });

    if (authError) {
      return { success: false, message: authError.message };
    }

    if (!authData?.user) {
      return { success: false, message: 'Sign up failed: no user returned from Supabase Auth.' };
    }

    // 3. Detect already-registered emails:
    // Supabase Auth returns a user object with an empty identities array when the email is already registered
    // (anti-user-enumeration mechanism when email confirmation is active).
    if (Array.isArray(authData.user.identities) && authData.user.identities.length === 0) {
      return {
        success: false,
        message: 'An account with this email address already exists. Please sign in instead.',
      };
    }

    // 4. Attempt to upsert record into public.users table if permitted
    // CRITICAL: Registration MUST still succeed even if public.users upsert fails due to RLS or missing schema.
    let dbUser: any = null;
    try {
      const { data: insertedUser, error: upsertError } = await client
        .from('users')
        .upsert(
          {
            auth_user_id: authData.user.id,
            username: trimmedUsername,
            email: trimmedEmail,
            role: trimmedEmail === 'durodoluwa5@gmail.com' ? 'ADMIN' : 'USER',
            credits: isValidVip ? 9999 : 10,
            is_vip: isValidVip,
            vip_expires_at: vipExpiresAt,
            registration_ip: 'client_connection',
          },
          { onConflict: 'email' }
        )
        .select()
        .maybeSingle();

      if (upsertError) {
        // Log warning for debugging, but never fail registration because authData.user has all metadata
        console.warn('[Supabase public.users upsert RLS warning]', upsertError.message);
      } else if (insertedUser) {
        dbUser = insertedUser;
      }
    } catch (err) {
      // Table might not exist yet or RLS policy restricts anon client; proceed safely
      console.warn('[Supabase public.users upsert bypassed due to RLS/schema]', err);
    }

    const userProfile = mapToUserProfile(authData.user, dbUser);
    return {
      success: true,
      user: userProfile,
      message: isValidVip
        ? 'Account successfully created with Supabase Auth! ★ 30-Day VIP Pass activated.'
        : 'Account created with Supabase Auth with 10 free starter credits!',
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Supabase authentication failed.' };
  }
}

/**
 * Supabase Auth: Sign In existing user
 */
export async function signInWithSupabase(
  identity: string,
  password: string
): Promise<{ success: boolean; user?: UserProfile; message: string }> {
  const trimmedIdentity = (identity || '').trim();
  const cleanPassword = password || '';

  if (!trimmedIdentity) {
    return { success: false, message: 'Please enter your username or email address.' };
  }
  if (!cleanPassword) {
    return { success: false, message: 'Please enter your password.' };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'Supabase client is not configured. Missing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    };
  }

  try {
    let emailToUse = trimmedIdentity.toLowerCase();

    // If identity is username (doesn't contain @), attempt lookup in public.users
    if (!emailToUse.includes('@')) {
      try {
        const { data: match } = await client
          .from('users')
          .select('email')
          .ilike('username', trimmedIdentity)
          .limit(1)
          .maybeSingle();
        if (match?.email) {
          emailToUse = match.email;
        }
      } catch {
        // Fallback: continue with identity as is
      }
    }

    const { data: authData, error: authError } = await client.auth.signInWithPassword({
      email: emailToUse,
      password: cleanPassword,
    });

    if (authError) {
      return { success: false, message: authError.message };
    }

    if (!authData?.user) {
      return { success: false, message: 'Authentication failed: no session returned.' };
    }

    // Fetch corresponding user record from database (safe with RLS)
    let dbUser: any = null;
    try {
      const { data } = await client
        .from('users')
        .select('*')
        .eq('email', authData.user.email)
        .limit(1)
        .maybeSingle();
      dbUser = data;
    } catch {
      // Ignore if table query fails
    }

    const profile = mapToUserProfile(authData.user, dbUser);
    return {
      success: true,
      user: profile,
      message: 'Supabase authentication successful!',
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Supabase sign in failed.' };
  }
}

/**
 * Supabase Auth: Sign Out
 */
export async function signOutSupabase(): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    await client.auth.signOut();
    return true;
  } catch {
    return false;
  }
}

/**
 * Supabase Auth: Get current active session user
 */
export async function getCurrentSupabaseUser(): Promise<UserProfile | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data: sessionData } = await client.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return null;

    let dbUser: any = null;
    try {
      const { data } = await client
        .from('users')
        .select('*')
        .eq('email', user.email)
        .limit(1)
        .single();
      dbUser = data;
    } catch {
      // Table fallback
    }

    return mapToUserProfile(user, dbUser);
  } catch {
    return null;
  }
}

