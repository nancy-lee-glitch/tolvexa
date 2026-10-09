import React, { useState, useEffect, useCallback } from 'react';

export interface TourStep {
  targetKey: string;
  title: string;
  description: string;
  tip?: string;
  badge: string;
  preferredPosition?: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    targetKey: 'asset-selector',
    title: 'Market & Asset Selector',
    description:
      'Choose from 24/7 Synthetic Volatility Indices (Vol 75, Vol 100), major Forex currency pairs, and Crypto assets with constant liquidity.',
    tip: 'Synthetics trade 24/7/365 without weekend market closures.',
    badge: 'Step 1 of 8 • Markets',
    preferredPosition: 'bottom',
  },
  {
    targetKey: 'live-ticker',
    title: 'Live WebSocket Price Stream',
    description:
      'Real-time institutional tick velocity streams continuously with sub-25ms execution latency for zero slippage.',
    tip: 'Watch tick acceleration to spot micro-momentum bursts.',
    badge: 'Step 2 of 8 • Telemetry',
    preferredPosition: 'bottom',
  },
  {
    targetKey: 'generate-signal',
    title: 'Algorithmic Signal Engine',
    description:
      'Execute algorithmic scans across 5 technical indicators (RSI momentum, EMA 9/21 cross, volatility pinch) to issue high-confluence CALL/PUT entries.',
    tip: 'Enforces a strict 6-second decay window for peak mathematical expectancy.',
    badge: 'Step 3 of 8 • Execution',
    preferredPosition: 'top',
  },
  {
    targetKey: 'credits-badge',
    title: 'Credits & 30-Day VIP Status',
    description:
      'Track your available balance. Standard accounts start with 10 free starter credits. VIP Pass holders unlock unlimited computations with 0 credit deduction.',
    tip: 'Each standard signal execution consumes 1 credit.',
    badge: 'Step 4 of 8 • Balance',
    preferredPosition: 'bottom',
  },
  {
    targetKey: 'safe-radar',
    title: 'Safe Radar & Exit Optimization',
    description:
      'Predicts the exact peak momentum window (e.g. seconds 18–26 of a 60s contract) to close early before mean reversion occurs.',
    tip: 'Alerts you instantly when counter-trend micro-ticks begin forming.',
    badge: 'Step 5 of 8 • Risk Shield',
    preferredPosition: 'top',
  },
  {
    targetKey: 'pricing-btn',
    title: 'VIP Pass & Credits Top-Up',
    description:
      'Upgrade to the strict 30-Day Unlimited VIP Pass or top up computation credits with automated cryptocurrency checkout.',
    tip: 'Instant activation upon blockchain confirmation via NOWPayments.',
    badge: 'Step 6 of 8 • Upgrades',
    preferredPosition: 'bottom',
  },
  {
    targetKey: 'profile-btn',
    title: 'Trader Account & Terminal Profile',
    description:
      'View your registered profile, live VIP expiration countdown, trade performance records, and one-time VIP code redemption.',
    tip: 'Redeem promotional or partner VIP codes here with 1 click.',
    badge: 'Step 7 of 8 • Profile',
    preferredPosition: 'bottom',
  },
  {
    targetKey: 'help-btn',
    title: 'Interactive Tour Replay & Help',
    description:
      'You are all set! Click this button anytime to replay this interactive walkthrough or review terminal methodologies.',
    tip: 'Always accessible directly from the global navigation bar.',
    badge: 'Step 8 of 8 • Complete',
    preferredPosition: 'bottom',
  },
];

interface GuidedTourCoachMarkProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToPricing?: () => void;
}

export function GuidedTourCoachMark({
  isOpen,
  onClose,
  onNavigateToPricing,
}: GuidedTourCoachMarkProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const step = TOUR_STEPS[currentStepIndex];

  // Update target bounding box
  const updateTargetRect = useCallback(() => {
    if (!isOpen || !step) return;

    const el = document.querySelector(`[data-tour="${step.targetKey}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      // Smoothly scroll target element into viewport if outside
      const inView =
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth);

      if (!inView) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    } else {
      setTargetRect(null);
    }
  }, [isOpen, step]);

  useEffect(() => {
    updateTargetRect();
    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);

    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
    };
  }, [updateTargetRect]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pulsetrade_tour_completed', 'true');
    }
    onClose();
  };

  // Compute Tooltip coordinates based on targetRect
  let tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 99999,
  };

  const padding = 12;
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  if (targetRect) {
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;

    if (isMobile) {
      // On mobile, stick tooltip near bottom or top safely
      if (spaceBelow > 260) {
        tooltipStyle = {
          ...tooltipStyle,
          top: targetRect.bottom + padding,
          left: 12,
          right: 12,
        };
      } else if (spaceAbove > 260) {
        tooltipStyle = {
          ...tooltipStyle,
          bottom: window.innerHeight - targetRect.top + padding,
          left: 12,
          right: 12,
        };
      } else {
        tooltipStyle = {
          ...tooltipStyle,
          bottom: 20,
          left: 12,
          right: 12,
        };
      }
    } else {
      // Desktop positioning
      const preferred = step.preferredPosition || 'bottom';
      if (preferred === 'top' && spaceAbove > 220) {
        tooltipStyle = {
          ...tooltipStyle,
          bottom: window.innerHeight - targetRect.top + padding,
          left: Math.max(16, Math.min(window.innerWidth - 380, targetRect.left)),
          width: '360px',
        };
      } else if (spaceBelow > 220) {
        tooltipStyle = {
          ...tooltipStyle,
          top: targetRect.bottom + padding,
          left: Math.max(16, Math.min(window.innerWidth - 380, targetRect.left)),
          width: '360px',
        };
      } else {
        tooltipStyle = {
          ...tooltipStyle,
          top: Math.max(16, targetRect.top),
          left: Math.max(16, Math.min(window.innerWidth - 380, targetRect.right + padding)),
          width: '360px',
        };
      }
    }
  } else {
    // Target element missing on this viewport - center tooltip fallback
    tooltipStyle = {
      ...tooltipStyle,
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: isMobile ? 'calc(100% - 32px)' : '380px',
    };
  }

  return (
    <div className="fixed inset-0 z-[99990] select-none">
      {/* Darkened backdrop with cut-out hole */}
      <svg
        className="fixed inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 99991 }}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - 6}
                y={targetRect.top - 6}
                width={targetRect.width + 12}
                height={targetRect.height + 12}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(2, 6, 23, 0.78)"
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {/* Pulsing ring around spotlight target */}
      {targetRect && (
        <div
          className="fixed pointer-events-none rounded-2xl border-2 border-emerald-400 shadow-[0_0_25px_rgba(52,211,153,0.4)] transition-all duration-300"
          style={{
            zIndex: 99995,
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
        >
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-ping" />
        </div>
      )}

      {/* Floating Tooltip Card */}
      <div
        style={tooltipStyle}
        className="bg-slate-900 border border-emerald-500/50 rounded-2xl p-4 sm:p-5 shadow-2xl shadow-slate-950/90 text-white font-sans animate-in fade-in duration-200"
      >
        {/* Step Badge & Progress */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
              {step.badge}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSkip}
            className="text-[11px] font-mono text-slate-400 hover:text-white transition px-2 py-0.5 rounded hover:bg-slate-800"
          >
            Skip Tour ✕
          </button>
        </div>

        {/* Title & Description */}
        <h4 className="text-sm sm:text-base font-black text-white font-mono tracking-tight mb-1.5">
          {step.title}
        </h4>
        <p className="text-xs text-slate-300 leading-relaxed mb-3">
          {step.description}
        </p>

        {/* Pro Tip Box */}
        {step.tip && (
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 mb-4 text-[11px] font-mono text-slate-300 flex items-start gap-2">
            <span className="text-amber-400 text-xs">💡</span>
            <span>{step.tip}</span>
          </div>
        )}

        {/* Step Progress Dots & Buttons */}
        <div className="flex items-center justify-between pt-1">
          {/* Progress Indicator */}
          <div className="flex items-center gap-1">
            {TOUR_STEPS.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentStepIndex
                    ? 'w-5 bg-emerald-400'
                    : idx < currentStepIndex
                    ? 'w-1.5 bg-emerald-600'
                    : 'w-1.5 bg-slate-800'
                }`}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 font-mono text-xs">
            {currentStepIndex > 0 && (
              <button
                type="button"
                onClick={handleBack}
                className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition font-bold"
              >
                Back
              </button>
            )}

            {currentStepIndex === 5 && onNavigateToPricing && (
              <button
                type="button"
                onClick={() => {
                  onNavigateToPricing();
                  handleNext();
                }}
                className="py-1.5 px-3 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition font-bold"
              >
                View Plans
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="py-1.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black transition shadow-md shadow-emerald-500/20"
            >
              {currentStepIndex === TOUR_STEPS.length - 1 ? 'Finish Tour ✓' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
