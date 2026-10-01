import React, { useState, useEffect } from 'react';
import type { AssetConfig, SignalData, SessionStats, UserProfile, BlogArticle, PageView, AuthModalMode, SiteSettings } from './types.ts';
import { MarketRadar } from './components/MarketRadar.tsx';
import { LiveTicker, ASSETS } from './components/LiveTicker.tsx';
import { SignalEngine } from './components/SignalEngine.tsx';
import { RiskAdvisor } from './components/RiskAdvisor.tsx';
import { CryptoCheckout } from './components/CryptoCheckout.tsx';
import { AdminCenter } from './components/AdminCenter.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { BlogSection } from './components/BlogSection.tsx';
import { AboutPage } from './components/AboutPage.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { VipSafeRadarModal } from './components/VipSafeRadarModal.tsx';
import { getSiteSettings, fetchRemoteSiteSettings } from './utils/siteConfigManager.ts';
import { sendSupabasePresence, getCurrentSupabaseUser } from './utils/supabaseClient.ts';

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageView>('landing');
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<BlogArticle | null>(null);
  const [isVipRadarOpen, setIsVipRadarOpen] = useState<boolean>(false);

  // Dynamic Branding & Platform Settings
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(getSiteSettings());
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(false);

  // Trading engine states
  const [activeAsset, setActiveAsset] = useState<AssetConfig>(ASSETS[0]);
  const [currentPrice, setCurrentPrice] = useState<number>(1.08542);
  const [liveTicks, setLiveTicks] = useState<number[]>([]);
  const [credits, setCredits] = useState<number>(10);
  const [isVIP, setIsVIP] = useState<boolean>(false);
  const [onlineUsers, setOnlineUsers] = useState<number>(1);

  const [stats, setStats] = useState<SessionStats>({
    total: 0,
    wins: 0,
    losses: 0,
    winRate: 85.7,
  });

  // Check initial user authentication & VIP 30-day status
  useEffect(() => {
    const checkAuthStatus = async () => {
      // 1. Check active Supabase Auth session first (essential for Vercel)
      try {
        const supaUser = await getCurrentSupabaseUser();
        if (supaUser) {
          setUser(supaUser);
          setCredits(supaUser.credits);
          setIsVIP(Boolean(supaUser.is_vip));
          return;
        }
      } catch {
        // Fallback
      }

      // 2. Fallback to API status for custom environments
      try {
        const res = await fetch('/api.php?action=status');
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            setUser(data.user);
            setCredits(data.user.credits);
            setIsVIP(Boolean(data.user.is_vip));
          }
        }
      } catch (err) {
        // Fallback gracefully
      }
    };

    checkAuthStatus();
  }, []);

  // Live dynamic presence tracking: connects to backend and Supabase
  useEffect(() => {
    let sessionId = '';
    try {
      sessionId = localStorage.getItem('pulsetrade_session_id') || '';
      if (!sessionId) {
        sessionId = 'sess_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
        localStorage.setItem('pulsetrade_session_id', sessionId);
      }
    } catch {
      sessionId = 'sess_' + Date.now();
    }

    const fetchHeartbeat = async () => {
      let currentCount = 1;
      try {
        const res = await fetch(`/heartbeat.php?session_id=${encodeURIComponent(sessionId)}`, {
          headers: {
            'x-session-id': sessionId,
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.online_count === 'number' && data.online_count > 0) {
            currentCount = data.online_count;
          }
        }
      } catch (err) {
        // Handled silently
      }

      // Also register presence in Supabase if configured
      try {
        const presenceCount = await sendSupabasePresence(sessionId, user?.id || null, activeAsset.symbol);
        if (typeof presenceCount === 'number' && presenceCount > 0) {
          currentCount = Math.max(currentCount, presenceCount);
        }
      } catch (err) {
        // Handled silently
      }

      setOnlineUsers(Math.max(1, currentCount));
    };

    fetchHeartbeat();
    const interval = setInterval(fetchHeartbeat, 10000);
    return () => clearInterval(interval);
  }, [user?.id, activeAsset.symbol]);

  // Synchronize dynamic site settings & branding
  useEffect(() => {
    fetchRemoteSiteSettings().then((s) => {
      setSiteSettings(s);
      document.title = `${s.siteName} - ${s.siteTagline}`;
    });

    const handleSettingsChange = (e: any) => {
      if (e.detail) {
        setSiteSettings(e.detail);
        document.title = `${e.detail.siteName} - ${e.detail.siteTagline}`;
      }
    };

    window.addEventListener('pulsetrade_settings_changed', handleSettingsChange as EventListener);
    return () => window.removeEventListener('pulsetrade_settings_changed', handleSettingsChange as EventListener);
  }, []);

  // Handle credit deduction per signal
  const handleDeductCredit = async (): Promise<boolean> => {
    if (isVIP || (user && user.is_vip)) return true;
    if (credits <= 0) {
      setCurrentPage('pricing');
      return false;
    }
    setCredits((c) => Math.max(0, c - 1));
    return true;
  };

  const handleLogOutcome = (outcome: 'WIN' | 'LOSS', _signal: SignalData) => {
    setStats((prev) => {
      const wins = outcome === 'WIN' ? prev.wins + 1 : prev.wins;
      const losses = outcome === 'LOSS' ? prev.losses + 1 : prev.losses;
      const total = wins + losses;
      const winRate = total > 0 ? parseFloat(((wins / total) * 100).toFixed(1)) : 85.7;
      return { total, wins, losses, winRate };
    });
  };

  const handleCreditsPurchased = (added: number) => {
    setCredits((prev) => prev + added);
    if (user) {
      setUser({ ...user, credits: user.credits + added });
    }
    setCurrentPage('cockpit');
  };

  const handleVipPurchased = () => {
    setIsVIP(true);
    if (user) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 30);
      setUser({
        ...user,
        is_vip: true,
        vip_days_left: 30,
        vip_hours_left: 0,
        vip_seconds_left: 30 * 86400,
        vip_expires_at: expiry.toISOString(),
      });
    }
    setCurrentPage('cockpit');
  };

  const handleUserUpdated = (updatedUser: UserProfile | null) => {
    setUser(updatedUser);
    if (updatedUser) {
      setCredits(updatedUser.credits);
      setIsVIP(Boolean(updatedUser.is_vip));
    } else {
      setCredits(10);
      setIsVIP(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-emerald-500 selection:text-slate-950 flex flex-col justify-between">
      {/* Top Announcement Banner (Configurable in Admin) */}
      {siteSettings.bannerEnabled && siteSettings.bannerText && !bannerDismissed && (
        <div className="bg-gradient-to-r from-amber-500/20 via-emerald-500/20 to-amber-500/20 border-b border-amber-500/30 px-3 py-1.5 text-xs font-mono flex items-center justify-between text-amber-200">
          <div className="max-w-6xl mx-auto flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="font-bold truncate">{siteSettings.bannerText}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            className="text-amber-400 hover:text-white shrink-0 px-2 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Floating Market Radar */}
      <MarketRadar />

      {/* Global Navigation Header */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-3.5 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          {/* Logo & Brand Identity */}
          <div
            onClick={() => setCurrentPage('landing')}
            className="flex items-center gap-2.5 cursor-pointer select-none group"
          >
            {siteSettings.logoUrl ? (
              <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center overflow-hidden p-1 shadow-lg shadow-emerald-500/10 group-hover:scale-105 transition">
                <img
                  src={siteSettings.logoUrl}
                  alt={siteSettings.siteName}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition">
                {siteSettings.logoIcon === 'activity' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                ) : siteSettings.logoIcon === 'shield' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                ) : siteSettings.logoIcon === 'trending' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm sm:text-base font-mono tracking-wider text-white">
                  {siteSettings.siteName}
                </span>
                {siteSettings.badgeText && (
                  <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-bold hidden sm:inline">
                    {siteSettings.badgeText}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>{onlineUsers} Active Trader{onlineUsers === 1 ? '' : 's'} Online</span>
              </div>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1 font-mono text-xs">
            <button
              type="button"
              onClick={() => setCurrentPage('landing')}
              className={`px-3 py-1.5 rounded-lg transition ${
                currentPage === 'landing' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage('cockpit')}
              className={`px-3 py-1.5 rounded-lg transition ${
                currentPage === 'cockpit' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Trading Cockpit
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedArticle(null);
                setCurrentPage('blog');
              }}
              className={`px-3 py-1.5 rounded-lg transition ${
                currentPage === 'blog' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Blog &amp; SEO
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage('about')}
              className={`px-3 py-1.5 rounded-lg transition ${
                currentPage === 'about' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              About &amp; Science
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage('pricing')}
              className={`px-3 py-1.5 rounded-lg transition ${
                currentPage === 'pricing' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              VIP &amp; Pricing
            </button>
          </nav>

          {/* User Auth & Actions Controls */}
          <div className="flex items-center gap-2 font-mono">
            {user ? (
              <div className="flex items-center gap-2">
                {/* Admin Portal Button - Strictly visible ONLY to Master Admin */}
                {user.role === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => setCurrentPage('admin')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-bold text-xs transition shadow-sm ${
                      currentPage === 'admin'
                        ? 'bg-amber-400 text-slate-950 shadow-amber-500/20'
                        : 'bg-amber-500/20 border border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                    }`}
                    title="Master Admin Dashboard"
                  >
                    <span>👑</span>
                    <span>Admin Portal</span>
                  </button>
                )}

                {/* VIP 30-Day Protected Status Pill */}
                {user.is_vip ? (
                  <button
                    type="button"
                    onClick={() => setAuthModalMode('profile')}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[11px] font-bold shadow-md shadow-amber-950/40 hover:bg-amber-500/30 transition"
                    title={`Strict 30-Day Window: ${user.vip_days_left}d ${user.vip_hours_left}h remaining`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span>★ VIP ({user.vip_days_left}d)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCurrentPage('pricing')}
                    className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-900 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-slate-800 transition"
                  >
                    <span>{credits} CR</span>
                    <span className="text-[10px] text-emerald-500 font-black">+</span>
                  </button>
                )}

                {/* Profile Avatar & Username */}
                <button
                  type="button"
                  onClick={() => setAuthModalMode('profile')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-slate-600 transition text-xs font-bold text-white"
                >
                  <div className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[10px] font-black">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="max-w-[90px] truncate">{user.username}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAuthModalMode('login')}
                  className="px-3 py-1.5 text-xs text-slate-300 hover:text-white font-bold transition rounded-xl hover:bg-slate-900"
                >
                  Log In
                </button>

                {/* PRIMARY 'GET STARTED' BUTTON */}
                <button
                  type="button"
                  id="btn-nav-get-started"
                  onClick={() => setAuthModalMode('register')}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 text-xs font-black rounded-xl transition shadow-lg shadow-emerald-500/20 flex items-center gap-1.5"
                >
                  <span>Get Started</span>
                  <span className="text-[10px] bg-slate-950/20 px-1.5 py-0.2 rounded font-bold">10 CR</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Responsive View Container */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-4 py-4">
        {/* VIEW 1: LANDING PAGE */}
        {currentPage === 'landing' && (
          <LandingPage
            user={user}
            onGetStarted={() => setAuthModalMode('register')}
            onOpenLogin={() => setAuthModalMode('login')}
            onLaunchCockpit={() => setCurrentPage('cockpit')}
            onSelectArticle={(article) => {
              setSelectedArticle(article);
              setCurrentPage('blog');
            }}
            onNavigateToPricing={() => setCurrentPage('pricing')}
            onNavigateToAbout={() => setCurrentPage('about')}
          />
        )}

        {/* VIEW 2: TRADING COCKPIT (The Mobile-First Cockpit) */}
        {currentPage === 'cockpit' && (
          <div className="max-w-xl mx-auto space-y-3.5 animate-in fade-in duration-200">
            {/* Quick Context Bar */}
            <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5 font-mono text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold text-white">Live Execution Cockpit</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Balance:</span>
                <span className="font-black text-emerald-400 font-mono">
                  {isVIP || user?.is_vip ? 'UNLIMITED' : `${credits} CR`}
                </span>
                {!isVIP && !user?.is_vip && (
                  <button
                    type="button"
                    onClick={() => setCurrentPage('pricing')}
                    className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold hover:bg-emerald-500/30"
                  >
                    + Top-Up
                  </button>
                )}
              </div>
            </div>

            {/* Deriv WebSocket Ticker & Asset Switcher */}
            <LiveTicker
              activeAsset={activeAsset}
              onAssetChange={setActiveAsset}
              onPriceUpdate={setCurrentPrice}
              onTicksUpdate={setLiveTicks}
              isVIP={isVIP || Boolean(user?.is_vip)}
              onOpenVipRadar={() => setIsVipRadarOpen(true)}
            />

            {/* Multi-Timeframe Algorithmic Signal Engine & Lockout Loop */}
            <SignalEngine
              activeAsset={activeAsset}
              currentPrice={currentPrice}
              credits={credits}
              isVIP={isVIP || Boolean(user?.is_vip)}
              onDeductCredit={handleDeductCredit}
              onLogOutcome={handleLogOutcome}
              stats={stats}
              ticks={liveTicks}
              user={user}
              onOpenAuth={(mode) => setAuthModalMode(mode)}
              onOpenVipRadar={() => setIsVipRadarOpen(true)}
            />

            {/* Risk Advisor & 2% Stake Protection */}
            <RiskAdvisor />
          </div>
        )}

        {/* VIEW 3: EDUCATIONAL BLOG & SEO ACADEMY */}
        {currentPage === 'blog' && (
          <BlogSection
            selectedArticle={selectedArticle}
            onSelectArticle={setSelectedArticle}
            onGetStarted={() => setAuthModalMode('register')}
            onLaunchCockpit={() => setCurrentPage('cockpit')}
          />
        )}

        {/* VIEW 4: ABOUT & METHODOLOGY */}
        {currentPage === 'about' && (
          <AboutPage
            onGetStarted={() => setAuthModalMode('register')}
            onLaunchCockpit={() => setCurrentPage('cockpit')}
          />
        )}

        {/* VIEW 5: VIP & PRICING (Crypto Checkout & 30-Day VIP Pass) */}
        {currentPage === 'pricing' && (
          <div className="max-w-xl mx-auto space-y-4 animate-in fade-in duration-200">
            <CryptoCheckout
              onCreditsPurchased={handleCreditsPurchased}
              onVipPurchased={handleVipPurchased}
              onClose={() => setCurrentPage('cockpit')}
            />
          </div>
        )}

        {/* VIEW 6: MASTER ADMIN COMMAND CENTER (RESTRICTED GATEWAY) */}
        {currentPage === 'admin' && (
          <div className="max-w-5xl mx-auto animate-in fade-in duration-200">
            <AdminCenter
              user={user}
              onUserUpdated={handleUserUpdated}
              onExitAdmin={() => setCurrentPage('cockpit')}
              onlineUsers={onlineUsers}
            />
          </div>
        )}

        {/* Redirect for deprecated legacy views */}
        {(currentPage === 'files' || currentPage === 'supabase') && (
          <div className="max-w-5xl mx-auto animate-in fade-in duration-200">
            <AdminCenter
              user={user}
              onUserUpdated={handleUserUpdated}
              onExitAdmin={() => setCurrentPage('cockpit')}
              onlineUsers={onlineUsers}
            />
          </div>
        )}
      </main>

      {/* Global Auth Modal (Register / Login / 30-Day VIP Profile) */}
      <AuthModal
        mode={authModalMode}
        user={user}
        onClose={() => setAuthModalMode(null)}
        onUserUpdated={handleUserUpdated}
        onNavigateToCheckout={() => setCurrentPage('pricing')}
      />

      {/* Real-time VIP Safe Market Screener / Radar Modal */}
      <VipSafeRadarModal
        isOpen={isVipRadarOpen}
        onClose={() => setIsVipRadarOpen(false)}
        isVIP={isVIP || Boolean(user?.is_vip)}
        onSelectAsset={(asset) => {
          setActiveAsset(asset);
          setIsVipRadarOpen(false);
          setCurrentPage('cockpit');
        }}
        onUpgradeVip={() => {
          setIsVipRadarOpen(false);
          setCurrentPage('pricing');
        }}
      />

      {/* Global Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 px-4 py-6 font-mono text-xs text-slate-400">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <span className="font-bold text-white">{siteSettings.siteName} Citadel</span>
              <span>•</span>
              <span className="text-emerald-400">{siteSettings.badgeText || 'Deriv WebSocket Sync'}</span>
            </div>
            <p className="text-[11px] text-slate-500">
              {siteSettings.siteTagline}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 text-[11px]">
            <button
              type="button"
              onClick={() => setCurrentPage('landing')}
              className="hover:text-white transition"
            >
              Overview
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => {
                setSelectedArticle(null);
                setCurrentPage('blog');
              }}
              className="hover:text-white transition"
            >
              Research Blog
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => setCurrentPage('about')}
              className="hover:text-white transition"
            >
              About &amp; Methodology
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => setCurrentPage('pricing')}
              className="hover:text-white transition"
            >
              VIP Access
            </button>
            {user?.role === 'ADMIN' ? (
              <>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage('admin')}
                  className="text-amber-400 hover:text-amber-300 font-bold transition flex items-center gap-1"
                >
                  <span>👑 Admin Center</span>
                </button>
              </>
            ) : (
              <>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage('admin')}
                  className="text-slate-600 hover:text-slate-400 transition text-[11px] flex items-center gap-1"
                  title="Master Admin Gateway"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Staff Gate</span>
                </button>
              </>
            )}
            {siteSettings.supportTelegram && (
              <>
                <span>•</span>
                <a
                  href={siteSettings.supportTelegram}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 hover:underline"
                >
                  Telegram
                </a>
              </>
            )}
            {siteSettings.supportWhatsapp && (
              <>
                <span>•</span>
                <a
                  href={siteSettings.supportWhatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:underline"
                >
                  WhatsApp
                </a>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
