import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from './api';
import type { AppRole } from '@/contexts/AuthContext';

export type ModulePermissions = Record<string, AppRole[]>;
export type ModuleMeta = Record<string, { label: string }>;

// super_admin and admin always have access — matches the backend's
// require_module_role() behaviour exactly, so frontend and backend never disagree.
const ALWAYS_ALLOWED: AppRole[] = ['super_admin', 'admin'];

/**
 * Fetches the DB-backed module permission map (super admin configures this
 * under CPanel → Permissions) and exposes canAccess() for gating nav items
 * and routes dynamically, without any code changes when roles are adjusted.
 */
export function usePermissions() {
  const [permissions, setPermissions] = useState<ModulePermissions>({});
  const [modules, setModules] = useState<ModuleMeta>({});
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ permissions: ModulePermissions; modules: ModuleMeta; roles: AppRole[] }>('/api/permissions');
      setPermissions(res.permissions ?? {});
      setModules(res.modules ?? {});
      setRoles(res.roles ?? []);
      setLoaded(true);
    } catch {
      // Not logged in yet, or request failed — canAccess() falls back to
      // the caller-supplied default list until this succeeds.
      setLoaded(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * True if `role` should see `moduleKey`. `fallback` is used only if the
   * permission map hasn't loaded yet (e.g. brief moment on page load) —
   * pass the module's previous hardcoded roles array as a safe default.
   */
  const canAccess = useCallback(
    (moduleKey: string, role: AppRole | null, fallback: AppRole[] = []): boolean => {
      if (!role) return false;
      if (ALWAYS_ALLOWED.includes(role)) return true;
      if (!loaded) return fallback.includes(role);
      const configured = permissions[moduleKey];
      const list = configured ?? fallback;
      return list.includes(role);
    },
    [permissions, loaded],
  );

  return { permissions, modules, roles, loading, canAccess, refresh: load };
}