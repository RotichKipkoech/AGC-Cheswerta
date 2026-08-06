import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemSettings } from '@/contexts/SystemSettingsContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LogIn, Eye, EyeOff, ShieldAlert, KeyRound, Phone, ArrowLeft, CheckCircle2, Loader2, AtSign, Lock } from 'lucide-react';
import { toast } from 'sonner';
import agcLogo from '@/assets/agc-logo.png';
import { apiFetch } from '@/lib/api';

const LOCKOUT_WINDOW_MINUTES = 5;

// ─── Forgot-password step type ───────────────────────────────
type ForgotStep = 'request' | 'verify' | 'reset' | 'done';

export default function Login() {
  const { isAuthenticated, loading } = useAuth();
  const { branding, security } = useSystemSettings();
  const { signIn } = useAuth();

  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lockout, setLockout] = useState<{ until: number; message: string } | null>(null);

  // Forgot-password state
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [forgotStep, setForgotStep] = useState<ForgotStep>('request');
  const [fpUsername, setFpUsername] = useState('');
  const [fpOtp, setFpOtp] = useState('');
  const [fpNewPassword, setFpNewPassword] = useState('');
  const [fpConfirmPassword, setFpConfirmPassword] = useState('');
  const [showFpPassword, setShowFpPassword] = useState(false);
  const [fpResetToken, setFpResetToken] = useState('');
  const [fpMaskedPhone, setFpMaskedPhone] = useState('');
  const [fpSubmitting, setFpSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0); // seconds left before "Resend OTP" is clickable again

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="animate-pulse text-primary text-xl font-bold">Loading…</div>
      </div>
    );
  }

  if (isAuthenticated) return <Navigate to="/" replace />;

  const maxAttempts = security?.max_login_attempts ?? 5;

  // ─── Login helpers ──────────────────────────────────────────
  const formatRemaining = (ms: number) => {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const recordAttempt = async (identifier: string, success: boolean) => {
    try {
      await apiFetch('/api/db', {
        method: 'POST',
        body: JSON.stringify({
          table: 'login_attempts', op: 'insert',
          values: { identifier: identifier.toLowerCase(), success, user_agent: navigator.userAgent.slice(0, 200) },
        }),
      });
    } catch { /* non-fatal */ }
  };

  const checkLockout = async (identifier: string) => {
    try {
      const res = await apiFetch<{
        data: { locked: boolean; retry_after_seconds: number; fail_count: number; reason: string | null }[];
        error: null;
      }>('/api/rpc/is_account_locked', {
        method: 'POST',
        body: JSON.stringify({ _identifier: identifier.toLowerCase(), _max_attempts: maxAttempts, _window_minutes: LOCKOUT_WINDOW_MINUTES }),
      });
      if (!res.data || !Array.isArray(res.data) || res.data.length === 0) return null;
      const row = res.data[0];
      if (!row.locked) return null;
      const manualRes = await apiFetch<{ data: { reason: string | null; locked_until: string | null } | null }>('/api/db', {
        method: 'POST',
        body: JSON.stringify({ table: 'account_locks', op: 'select', filters: [{ col: 'identifier', op: 'ilike', value: identifier }], maybeSingle: true }),
      });
      const manual = manualRes.data;
      const isManual = !!manual && (!manual.locked_until || new Date(manual.locked_until).getTime() > Date.now());
      return { retrySeconds: Number(row.retry_after_seconds || LOCKOUT_WINDOW_MINUTES * 60), failCount: Number(row.fail_count || 0), manual: isManual, reason: manual?.reason ?? null, indefinite: isManual && !manual?.locked_until };
    } catch { return null; }
  };

  const buildLockMessage = (l: { retrySeconds: number; manual: boolean; reason: string | null; indefinite: boolean }) => {
    if (l.manual) {
      const base = `Account blocked by Administrator${l.reason ? `: ${l.reason}` : ''}.`;
      return l.indefinite ? `${base} Please contact your administrator to regain access.` : `${base} Please wait ${formatRemaining(l.retrySeconds * 1000)} or contact your administrator.`;
    }
    return `Account blocked. Too many failed attempts. Please wait ${formatRemaining(l.retrySeconds * 1000)} and retry, or contact your administrator.`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    if (lockout && lockout.until > Date.now()) { toast.error(lockout.message); return; }
    setSubmitting(true);
    const cleanedUser = username.trim().toLowerCase();
    const locked = await checkLockout(cleanedUser);
    if (locked) {
      const until = Date.now() + locked.retrySeconds * 1000;
      const msg = buildLockMessage(locked);
      setLockout({ until, message: msg });
      toast.error(msg);
      setSubmitting(false);
      return;
    }
    const { error } = await signIn(cleanedUser, password);
    if (error) {
      await recordAttempt(cleanedUser, false);
      const nowLocked = await checkLockout(cleanedUser);
      if (nowLocked) {
        const until = Date.now() + nowLocked.retrySeconds * 1000;
        const msg = buildLockMessage(nowLocked);
        setLockout({ until, message: msg });
        toast.error(msg);
      } else {
        toast.error(error.message || 'Invalid credentials');
      }
    } else {
      await recordAttempt(cleanedUser, true);
      setLockout(null);
    }
    setSubmitting(false);
  };

  // ─── Forgot-password handlers ───────────────────────────────
  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fpUsername.trim()) { toast.error('Please enter your username'); return; }
    setFpSubmitting(true);
    try {
      const res = await apiFetch<{ ok: boolean; masked_phone: string | null; message: string }>(
        '/api/auth/forgot-password',
        { method: 'POST', body: JSON.stringify({ username: fpUsername.trim().toLowerCase() }) },
      );
      if (res.masked_phone) {
        setFpMaskedPhone(res.masked_phone);
        setForgotStep('verify');
        setResendCooldown(300);
        toast.success(`OTP sent to ${res.masked_phone}`);
      } else {
        // Account exists but no phone — show generic message, don't advance
        toast.info(res.message || 'If this account exists and has a phone number, an OTP has been sent.');
      }
    } catch (err) {
      toast.error((err as Error).message || 'Could not send OTP');
    } finally {
      setFpSubmitting(false);
    }
  };

  const handleForgotVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fpOtp.trim().length !== 6) { toast.error('Enter the 6-digit OTP'); return; }
    setFpSubmitting(true);
    try {
      const res = await apiFetch<{ ok: boolean; reset_token: string }>(
        '/api/auth/verify-otp',
        { method: 'POST', body: JSON.stringify({ username: fpUsername.trim().toLowerCase(), otp: fpOtp.trim() }) },
      );
      setFpResetToken(res.reset_token);
      setForgotStep('reset');
    } catch (err) {
      toast.error((err as Error).message || 'Invalid or expired OTP');
    } finally {
      setFpSubmitting(false);
    }
  };

  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fpNewPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (fpNewPassword !== fpConfirmPassword) { toast.error('Passwords do not match'); return; }
    setFpSubmitting(true);
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ reset_token: fpResetToken, password: fpNewPassword }),
      });
      setForgotStep('done');
    } catch (err) {
      toast.error((err as Error).message || 'Could not reset password');
    } finally {
      setFpSubmitting(false);
    }
  };

  const resetForgotFlow = () => {
    setMode('login');
    setForgotStep('request');
    setFpUsername('');
    setFpOtp('');
    setFpNewPassword('');
    setFpConfirmPassword('');
    setFpResetToken('');
    setFpMaskedPhone('');
    setResendCooldown(0);
  };

  const logoSrc = branding.login_logo_url || branding.logo_url || agcLogo;
  const isLocked = lockout && lockout.until > Date.now();

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-accent/95 to-primary p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md relative z-10 border-0 shadow-2xl bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4">
            <img src={logoSrc} alt={branding.name} className="h-20 w-auto mx-auto object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">{branding.name}</CardTitle>
          <CardDescription className="text-muted-foreground">
            {mode === 'login' ? branding.login_tagline : 'Password Reset'}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4">

          {/* ══ LOGIN FORM ══ */}
          {mode === 'login' && (
            <>
              {isLocked && (
                <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 flex gap-2 text-sm text-destructive">
                  <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Account blocked</p>
                    <p>{lockout!.message}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-sm font-medium">Username</Label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="username" type="text" placeholder="Enter your username" value={username}
                      onChange={e => setUsername(e.target.value)} required autoComplete="username"
                      autoCapitalize="none" className="h-11 pl-10 rounded-xl" disabled={!!isLocked} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password"
                      value={password} onChange={e => setPassword(e.target.value)} required
                      autoComplete="current-password" className="h-11 pl-10 pr-10 rounded-xl" disabled={!!isLocked} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <button type="button" onClick={() => { setFpUsername(username); setMode('forgot'); }}
                      className="text-xs text-primary hover:underline underline-offset-2 transition-colors">
                      Forgot password?
                    </button>
                  </div>
                </div>

                <Button type="submit" variant="accent" className="w-full h-11 text-base font-semibold" disabled={submitting || !!isLocked}>
                  {submitting
                    ? <span className="flex items-center gap-2"><span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Signing in…</span>
                    : <span className="flex items-center gap-2"><LogIn className="h-4 w-4" />Sign In</span>}
                </Button>
              </form>

              <div className="mt-6 pt-4 border-t text-center">
                <p className="text-xs text-muted-foreground">Accounts are created by the church administrator</p>
              </div>
            </>
          )}

          {/* ══ FORGOT — STEP 1: Enter username ══ */}
          {mode === 'forgot' && forgotStep === 'request' && (
            <>
              <div className="flex items-center gap-2 mb-5">
                <button type="button" onClick={resetForgotFlow} className="text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <p className="font-semibold text-sm">Forgot your password?</p>
                  <p className="text-xs text-muted-foreground">Enter your username and we'll send an OTP to your registered phone.</p>
                </div>
              </div>

              <form onSubmit={handleForgotRequest} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Username</Label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="text" placeholder="Enter your username" value={fpUsername} autoCapitalize="none"
                      onChange={e => setFpUsername(e.target.value)} required className="h-11 pl-10 rounded-xl" />
                  </div>
                </div>
                <Button type="submit" variant="accent" className="w-full h-11 font-semibold" disabled={fpSubmitting}>
                  {fpSubmitting
                    ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Sending OTP…</span>
                    : <span className="flex items-center gap-2"><Phone className="h-4 w-4" />Send OTP</span>}
                </Button>
              </form>
            </>
          )}

          {/* ══ FORGOT — STEP 2: Enter OTP ══ */}
          {mode === 'forgot' && forgotStep === 'verify' && (
            <>
              <div className="flex items-center gap-2 mb-5">
                <button type="button" onClick={() => setForgotStep('request')} className="text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <p className="font-semibold text-sm">Enter your OTP</p>
                  <p className="text-xs text-muted-foreground">A 6-digit code was sent to <span className="font-medium">{fpMaskedPhone}</span>. It expires in 5 minutes.</p>
                </div>
              </div>

              <form onSubmit={handleForgotVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">6-digit OTP</Label>
                  <Input type="text" inputMode="numeric" placeholder="123456" maxLength={6}
                    value={fpOtp} onChange={e => setFpOtp(e.target.value.replace(/\D/g, ''))}
                    required className="h-11 text-center text-lg tracking-[0.4em] font-mono rounded-xl" />
                </div>
                <Button type="submit" variant="accent" className="w-full h-11 font-semibold" disabled={fpSubmitting || fpOtp.length !== 6}>
                  {fpSubmitting
                    ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Verifying…</span>
                    : <span className="flex items-center gap-2"><KeyRound className="h-4 w-4" />Verify OTP</span>}
                </Button>
                {resendCooldown > 0 ? (
                  <p className="w-full text-xs text-center text-muted-foreground">
                    Didn't receive it? Resend OTP in {formatRemaining(resendCooldown * 1000)}
                  </p>
                ) : (
                  <button type="button" onClick={() => { setFpOtp(''); handleForgotRequest({ preventDefault: () => {} } as any); }}
                    disabled={fpSubmitting}
                    className="w-full text-xs text-center text-primary hover:underline underline-offset-2 disabled:opacity-50 disabled:no-underline">
                    Didn't receive it? Resend OTP
                  </button>
                )}
              </form>
            </>
          )}

          {/* ══ FORGOT — STEP 3: New password ══ */}
          {mode === 'forgot' && forgotStep === 'reset' && (
            <>
              <div className="flex items-center gap-2 mb-5">
                <div>
                  <p className="font-semibold text-sm">Set a new password</p>
                  <p className="text-xs text-muted-foreground">Choose a strong password with at least 8 characters.</p>
                </div>
              </div>

              <form onSubmit={handleForgotReset} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type={showFpPassword ? 'text' : 'password'} placeholder="At least 8 characters"
                      value={fpNewPassword} onChange={e => setFpNewPassword(e.target.value)}
                      required minLength={8} className="h-11 pl-10 pr-10 rounded-xl" />
                    <button type="button" onClick={() => setShowFpPassword(!showFpPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showFpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type={showFpPassword ? 'text' : 'password'} placeholder="Repeat your password"
                      value={fpConfirmPassword} onChange={e => setFpConfirmPassword(e.target.value)}
                      required className="h-11 pl-10 rounded-xl" />
                  </div>
                  {fpConfirmPassword && fpNewPassword !== fpConfirmPassword && (
                    <p className="text-xs text-destructive">Passwords do not match</p>
                  )}
                </div>
                <Button type="submit" variant="accent" className="w-full h-11 font-semibold"
                  disabled={fpSubmitting || fpNewPassword !== fpConfirmPassword || fpNewPassword.length < 8}>
                  {fpSubmitting
                    ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Saving…</span>
                    : <span className="flex items-center gap-2"><KeyRound className="h-4 w-4" />Reset Password</span>}
                </Button>
              </form>
            </>
          )}

          {/* ══ FORGOT — STEP 4: Done ══ */}
          {mode === 'forgot' && forgotStep === 'done' && (
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <div>
                <p className="font-semibold text-base">Password reset!</p>
                <p className="text-sm text-muted-foreground mt-1">Your password has been updated successfully. You can now sign in.</p>
              </div>
              <Button variant="accent" className="w-full h-11 font-semibold mt-2" onClick={resetForgotFlow}>
                <LogIn className="h-4 w-4 mr-2" /> Back to Sign In
              </Button>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}