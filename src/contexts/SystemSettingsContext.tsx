import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';

export type Branding = {
  name: string;
  short_name: string;
  sidebar_tagline: string;
  login_tagline: string;
  logo_url: string | null;
  login_logo_url: string | null;
  favicon_url: string | null;
};

export type SecurityPolicy = {
  session_timeout_minutes: number;
  min_password_length: number;
  strong_password_required: boolean;
  two_factor_required: boolean;
  max_login_attempts: number;
  global_revocation: number;
};

export type Localization = {
  currency: string;
  currency_symbol: string;
  timezone: string;
  date_format: string;
  language: string;
  week_start: string;
};

export type ModuleRow = {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  sort_order: number;
};

type Ctx = {
  branding: Branding;
  security: SecurityPolicy;
  localization: Localization;
  modules: ModuleRow[];
  loading: boolean;
  refresh: () => Promise<void>;
  isModuleEnabled: (key: string) => boolean;
  formatCurrency: (n: number) => string;
};

const DEFAULT_BRANDING: Branding = {
  name: 'AGC Cheswerta',
  short_name: 'AGC',
  sidebar_tagline: 'Church Management',
  login_tagline: 'Church Management System',
  logo_url: null,
  login_logo_url: null,
  favicon_url: null,
};

const DEFAULT_SECURITY: SecurityPolicy = {
  session_timeout_minutes: 10, min_password_length: 8,
  strong_password_required: true, two_factor_required: false,
  max_login_attempts: 3, global_revocation: 0,
};

const DEFAULT_LOCALIZATION: Localization = {
  currency: 'KES', currency_symbol: 'KSh', timezone: 'Africa/Nairobi',
  date_format: 'DD/MM/YYYY', language: 'en', week_start: 'sunday',
};

const SystemSettingsContext = createContext<Ctx | undefined>(undefined);

function applyFavicon(url: string | null) {
  if (!url) return;
  let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url;
}

export function SystemSettingsProvider({ children }: { children: React.ReactNode }) {
  const { user, signOut, role } = useAuth();
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [security, setSecurity] = useState<SecurityPolicy>(DEFAULT_SECURITY);
  const [localization, setLocalization] = useState<Localization>(DEFAULT_LOCALIZATION);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const lastRevocationRef = useRef<number>(0);
  const lastActivityRef = useRef<number>(Date.now());

  const load = async () => {
    try {
      const [settingsRes, modsRes] = await Promise.all([
        apiFetch<{ data: { key: string; value: any }[] }>('/api/db', {
          method: 'POST',
          body: JSON.stringify({ table: 'system_settings', op: 'select', columns: 'key,value' }),
        }),
        apiFetch<{ data: ModuleRow[] }>('/api/db', {
          method: 'POST',
          body: JSON.stringify({ table: 'modules', op: 'select', order: [{ col: 'sort_order', ascending: true }] }),
        }),
      ]);

      (settingsRes.data ?? []).forEach((s) => {
        if (s.key === 'app_branding') setBranding({ ...DEFAULT_BRANDING, ...s.value });
        if (s.key === 'security_policy') {
          const sp = { ...DEFAULT_SECURITY, ...s.value };
          setSecurity(sp);
          if (lastRevocationRef.current === 0) {
            lastRevocationRef.current = sp.global_revocation;
          } else if (sp.global_revocation > lastRevocationRef.current && role !== 'super_admin') {
            lastRevocationRef.current = sp.global_revocation;
            signOut();
          } else {
            lastRevocationRef.current = sp.global_revocation;
          }
        }
        if (s.key === 'localization') setLocalization({ ...DEFAULT_LOCALIZATION, ...s.value });
        if (s.key === 'app_branding' && s.value?.favicon_url) applyFavicon(s.value.favicon_url);
      });

      setModules((modsRes.data ?? []) as ModuleRow[]);
    } catch {
      // Non-fatal; keep defaults
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Poll every 30 s for settings changes (replaces Supabase realtime channel)
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, role]);

  // Apply branding to document title
  useEffect(() => {
    if (branding.name) document.title = branding.name;
  }, [branding.name]);

  // Idle session timeout (skip super admins)
  useEffect(() => {
    if (!user || role === 'super_admin') return;
    const timeoutMs = (security.session_timeout_minutes || 10) * 60 * 1000;
    const reset = () => { lastActivityRef.current = Date.now(); };
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    const id = setInterval(() => {
      if (Date.now() - lastActivityRef.current > timeoutMs) {
        signOut();
      }
    }, 30_000);
    return () => {
      events.forEach(e => window.removeEventListener(e, reset));
      clearInterval(id);
    };
  }, [security.session_timeout_minutes, user, role, signOut]);

  const value = useMemo<Ctx>(() => ({
    branding, security, localization, modules, loading,
    refresh: load,
    isModuleEnabled: (key: string) => {
      const m = modules.find(x => x.key === key);
      return m ? m.enabled : true;
    },
    formatCurrency: (n: number) =>
      `${localization.currency_symbol} ${Number(n || 0).toLocaleString()}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [branding, security, localization, modules, loading]);

  return (
    <SystemSettingsContext.Provider value={value}>{children}</SystemSettingsContext.Provider>
  );
}

export function useSystemSettings() {
  const ctx = useContext(SystemSettingsContext);
  if (!ctx) throw new Error('useSystemSettings must be used inside SystemSettingsProvider');
  return ctx;
}