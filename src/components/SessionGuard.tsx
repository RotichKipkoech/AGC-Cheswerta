/**
 * SessionGuard — Monitors JWT expiry and user inactivity.
 *
 * - Auto-logout after 10 minutes of inactivity
 * - Shows countdown warning 2 minutes before auto-logout
 * - Warns 5 minutes before JWT expiry
 * - Checks every 10 seconds for fast inactivity response
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/api';
import {
  isTokenExpired, tokenSecondsRemaining,
  startActivityTracking, stopActivityTracking, secondsSinceActivity,
} from '@/lib/session';
import { Button } from '@/components/ui/button';
import { ShieldAlert, Clock, LogOut, RefreshCw, TimerReset } from 'lucide-react';

const INACTIVITY_LOGOUT_SEC  = 10 * 60;   // 10 min → auto-logout
const INACTIVITY_WARN_SEC    =  8 * 60;   // 8 min  → start showing warning (2-min countdown)
const TOKEN_WARN_SEC         =  5 * 60;   // warn 5 min before JWT expiry
const CHECK_INTERVAL_MS      = 10_000;    // check every 10 s

type WarningReason = 'inactivity' | 'token' | null;

export function SessionGuard() {
  const { signOut, isAuthenticated } = useAuth();
  const [reason, setReason]         = useState<WarningReason>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const checkRef    = useRef<ReturnType<typeof setInterval>>();
  const tickRef     = useRef<ReturnType<typeof setInterval>>();
  // Mirrors `reason` for use inside the outer interval without needing
  // `reason` in that effect's dependency array — see note below.
  const reasonRef   = useRef<WarningReason>(null);

  useEffect(() => { reasonRef.current = reason; }, [reason]);

  const stopTick = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  const startTick = useCallback((initial: number) => {
    stopTick();
    setSecondsLeft(initial);
    tickRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { stopTick(); return 0; }
        return s - 1;
      });
    }, 1_000);
  }, [stopTick]);

  const dismiss = useCallback(() => {
    setReason(null);
    stopTick();
    // Reset inactivity clock by simulating activity
    window.dispatchEvent(new MouseEvent('mousemove'));
  }, [stopTick]);

  const handleSignOut = useCallback(async () => {
    setReason(null);
    stopTick();
    await signOut();
  }, [signOut, stopTick]);

  useEffect(() => {
    if (!isAuthenticated) {
      stopActivityTracking();
      stopTick();
      if (checkRef.current) clearInterval(checkRef.current);
      setReason(null);
      return;
    }

    startActivityTracking();

    checkRef.current = setInterval(() => {
      const token = getToken();

      // ── Expired token → immediate logout ─────────────────────────────────
      if (!token || isTokenExpired(token)) {
        signOut();
        return;
      }

      const inactive = secondsSinceActivity();
      const currentReason = reasonRef.current;

      // ── Inactivity: hard logout ───────────────────────────────────────────
      if (inactive >= INACTIVITY_LOGOUT_SEC) {
        signOut();
        return;
      }

      // ── Inactivity: countdown warning ─────────────────────────────────────
      if (inactive >= INACTIVITY_WARN_SEC) {
        const left = Math.round(INACTIVITY_LOGOUT_SEC - inactive);
        if (currentReason !== 'inactivity') {
          setReason('inactivity');
          startTick(left);
        }
        return;
      }

      // ── Token expiry: warning ─────────────────────────────────────────────
      const tokenSecs = tokenSecondsRemaining(token);
      if (tokenSecs <= TOKEN_WARN_SEC && tokenSecs > 0) {
        if (currentReason !== 'token') {
          setReason('token');
          startTick(Math.round(tokenSecs));
        }
        return;
      }

      // ── All clear: dismiss any warning if user became active again ────────
      if (currentReason === 'inactivity' && inactive < INACTIVITY_WARN_SEC) {
        setReason(null);
        stopTick();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      if (checkRef.current) clearInterval(checkRef.current);
      stopActivityTracking();
    };
    // Deliberately NOT depending on `reason` — this effect owns the 10s
    // check interval (and, indirectly, the 1s tick interval it starts via
    // startTick). Re-running it every time `reason` changes would tear down
    // and rebuild those intervals mid-countdown, freezing the displayed
    // number. `reasonRef` gives the interval callback a way to read the
    // latest reason without needing it as a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (!reason || !isAuthenticated) return null;

  const isInactivity = reason === 'inactivity';
  const totalSecs  = isInactivity ? (INACTIVITY_LOGOUT_SEC - INACTIVITY_WARN_SEC) : TOKEN_WARN_SEC;
  const progress   = Math.max(0, Math.min(1, secondsLeft / totalSecs));
  const mins       = Math.floor(secondsLeft / 60);
  const secs       = secondsLeft % 60;
  const timeStr    = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  const urgent     = secondsLeft <= 30;

  const accent = isInactivity
    ? { ring: 'hsl(38,92%,50%)', text: 'text-amber-500', bg: 'bg-amber-500', soft: 'bg-amber-500/10', border: 'border-amber-500/30' }
    : { ring: 'hsl(0,84%,60%)',  text: 'text-destructive', bg: 'bg-destructive', soft: 'bg-destructive/10', border: 'border-destructive/30' };

  // SVG ring
  const R  = 42;
  const C  = 2 * Math.PI * R;
  const strokeDash = C * progress;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
      <div className={`relative bg-background border ${accent.border} rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-300`}>
        {/* Ambient glow behind the card, tinted by urgency */}
        <div className={`absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full ${accent.soft} blur-3xl pointer-events-none`} />

        {/* Coloured top bar */}
        <div className={`relative h-1.5 w-full ${accent.bg}`} />

        <div className="relative p-7 text-center space-y-6">
          {/* Ring countdown */}
          <div className="relative inline-flex items-center justify-center">
            {urgent && (
              <span className={`absolute inset-0 rounded-full ${accent.soft} animate-ping`} />
            )}
            <svg width="112" height="112" className="-rotate-90 relative drop-shadow-sm">
              <circle cx="56" cy="56" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth="7" />
              <circle
                cx="56" cy="56" r={R}
                fill="none"
                stroke={accent.ring}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${strokeDash} ${C}`}
                style={{ transition: 'stroke-dasharray 0.9s linear' }}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className={`text-2xl font-bold tabular-nums leading-none ${urgent ? accent.text : 'text-foreground'}`}>
                {timeStr}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">
                <Clock className="h-2.5 w-2.5" /> remaining
              </span>
            </div>
          </div>

          {/* Icon + text */}
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <div className={`w-8 h-8 rounded-full ${accent.soft} flex items-center justify-center`}>
                <ShieldAlert className={`h-4 w-4 ${accent.text}`} />
              </div>
              <h2 className="text-lg font-bold tracking-tight">
                {isInactivity ? 'Session Expiring' : 'Token Expiring'}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[26rem] mx-auto">
              {isInactivity
                ? "You've been inactive for a while. You'll be signed out automatically."
                : "Your session token is about to expire. Save your work and stay signed in."}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2.5">
            <Button
              variant="outline"
              className="flex-1 gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" /> Sign Out
            </Button>
            <Button className="flex-1 gap-2" onClick={dismiss}>
              <TimerReset className="h-4 w-4" /> Stay Signed In
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground/80">
            {isInactivity
              ? 'Move your mouse or press any key to dismiss.'
              : 'Clicking "Stay Signed In" resets the timer.'}
          </p>
        </div>
      </div>
    </div>
  );
}