import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle, Info, CheckCircle2, ShieldAlert, X, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';

type Announcement = {
  id: string; title: string; message: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  audience: 'all' | 'admins' | 'staff';
  is_active: boolean; starts_at: string; ends_at: string | null;
};

const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, critical: ShieldAlert } as const;
const STYLES: Record<Announcement['severity'], string> = {
  info: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30',
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  warning: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30',
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
};

export function SystemBanner() {
  const { role, user } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('dismissedAnnouncements') ?? '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const nowIso = new Date().toISOString();
        const res = await apiFetch<{ data: any[] }>('/api/db', {
          method: 'POST',
          body: JSON.stringify({
            table: 'announcements', op: 'select',
            filters: [
              { col: 'is_active', op: 'eq', value: true },
              { col: 'starts_at', op: 'lte', value: nowIso },
            ],
            order: [{ col: 'created_at', ascending: false }],
          }),
        });
        setItems((res.data ?? []).filter((a: any) => !a.ends_at || new Date(a.ends_at) > new Date()) as Announcement[]);
      } catch { /* best-effort */ }
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [user]);

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem('dismissedAnnouncements', JSON.stringify(next));
  };

  const visible = items.filter(a => {
    if (dismissed.includes(a.id)) return false;
    if (a.audience === 'admins') return role === 'admin' || role === 'super_admin';
    if (a.audience === 'staff') return role !== null;
    return true;
  });

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 px-4 pt-3">
      {visible.map(a => {
        const Icon = ICONS[a.severity];
        return (
          <div key={a.id} className={`flex items-start gap-3 rounded-md border px-4 py-3 ${STYLES[a.severity]}`}>
            <Icon className="h-5 w-5 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{a.title}</p>
              <p className="text-sm opacity-90 whitespace-pre-line">{a.message}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => dismiss(a.id)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { role, user, loading } = useAuth();
  const [maintenance, setMaintenance] = useState<{ enabled: boolean; message: string } | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user) { setChecked(true); return; }
    const load = async () => {
      try {
        const res = await apiFetch<{ data: { value: any } | null }>('/api/db', {
          method: 'POST',
          body: JSON.stringify({
            table: 'system_settings', op: 'select',
            filters: [{ col: 'key', op: 'eq', value: 'maintenance_mode' }],
            maybeSingle: true,
          }),
        });
        setMaintenance((res.data?.value as any) ?? { enabled: false, message: '' });
      } catch {
        setMaintenance({ enabled: false, message: '' });
      } finally {
        setChecked(true);
      }
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [user]);

  if (loading || !checked) return <>{children}</>;

  if (maintenance?.enabled && role !== 'super_admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Wrench className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Maintenance in progress</h1>
          <p className="text-muted-foreground whitespace-pre-line">
            {maintenance.message || "We'll be back shortly."}
          </p>
          <p className="text-xs text-muted-foreground">Only system administrators can access during this time.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
