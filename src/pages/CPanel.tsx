import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { useAuth, AppRole } from '@/contexts/AuthContext';
import { useSystemSettings } from '@/contexts/SystemSettingsContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { apiFetch, apiUpload, type BulkImportResource } from '@/lib/api';
import { usePermissions } from '@/lib/usePermissions';
import { BulkImportDialog } from '@/components/BulkImportDialog';
import {
  Shield, Activity, Users, Loader2, Search, KeyRound,
  Lock, Unlock, Trash2, Plus, RefreshCw,
  Clock, ShieldAlert, Wrench, Download, Trash, Send,
  ImageIcon, Palette, Globe, HardDrive, LogOut, TestTube2, Pencil, Type,
  ToggleLeft, Plug, Megaphone, Database, UploadCloud, ChevronRight,
} from 'lucide-react';

const ROLES: AppRole[] = ['super_admin','admin','pastor','secretary','treasurer','ministry_leader','lay_leader'];
// admin can see users tab too
const ADMIN_ALLOWED_TABS = new Set(['overview','branding','modules','security','announcements','maintenance','audit','users']);
const SUPER_ONLY_TABS = new Set(['localization','integrations','health','data','permissions']);
const TAB_META: Record<string, { title: string; description: string; group: string }> = {
  overview:      { title: 'Overview',         description: 'System-wide stats at a glance',                     group: 'Dashboard' },
  branding:      { title: 'Branding',          description: 'Logo, names and taglines',                          group: 'Appearance' },
  modules:       { title: 'Modules',           description: 'Enable or disable feature modules',                 group: 'Appearance' },
  security:      { title: 'Security',          description: 'Sessions, password policy and locked accounts',     group: 'System' },
  localization:  { title: 'Localization',      description: 'Language, timezone and formats',                    group: 'System' },
  integrations:  { title: 'Integrations',      description: 'External services and providers',                  group: 'System' },
  health:        { title: 'System Health',     description: 'Database and service status',                       group: 'System' },
  users:         { title: 'Users',             description: 'Manage user accounts and roles',                    group: 'People & Access' },
  permissions:   { title: 'Permissions',       description: 'Control which roles can access each module',        group: 'People & Access' },
  announcements: { title: 'Announcements',     description: 'Broadcast messages to users',                       group: 'Communication' },
  maintenance:   { title: 'Maintenance',       description: 'System maintenance and downtime',                   group: 'Operations' },
  audit:         { title: 'Activity Log',      description: 'Every create, edit and delete',                     group: 'Operations' },
  data:          { title: 'Data Tools',        description: 'Export and backup utilities',                       group: 'Operations' },
};

async function dbOp<T = any>(body: Record<string, unknown>): Promise<{ data: T }> {
  return apiFetch<{ data: T }>('/api/db', { method: 'POST', body: JSON.stringify(body) });
}
async function settingUpdate(key: string, value: unknown) {
  return apiFetch('/api/settings/' + key, { method: 'PUT', body: JSON.stringify({ value }) });
}

export default function CPanel() {
  const { role, loading } = useAuth();
  const [searchParams] = useSearchParams();
  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (role !== 'super_admin' && role !== 'admin') return <Navigate to="/" replace />;
  const isSuper = role === 'super_admin';
  const requestedTab = searchParams.get('tab') ?? 'overview';
  const allowed = isSuper || ADMIN_ALLOWED_TABS.has(requestedTab);
  const activeTab = allowed ? requestedTab : 'overview';
  const meta = TAB_META[activeTab] ?? TAB_META.overview;

  const renderTab = () => {
    if (!isSuper && SUPER_ONLY_TABS.has(activeTab))
      return <div className="text-muted-foreground">Super admin access required for this section.</div>;
    switch (activeTab) {
      case 'overview':      return <OverviewTab />;
      case 'branding':      return <BrandingTab />;
      case 'modules':       return <ModulesTab />;
      case 'security':      return <SecurityTab />;
      case 'localization':  return <LocalizationTab />;
      case 'integrations':  return <IntegrationsTab />;
      case 'health':        return <HealthTab />;
      case 'users':         return <UsersTab />;
      case 'announcements': return <AnnouncementsTab />;
      case 'maintenance':   return <MaintenanceTab />;
      case 'audit':         return <AuditTab />;
      case 'data':          return <DataToolsTab />;
      case 'permissions':   return <PermissionsTab />;
      default:              return <OverviewTab />;
    }
  };

  const tabIcons: Record<string, any> = {
    overview: ShieldAlert, branding: Palette, modules: ToggleLeft,
    security: Shield, localization: Globe, integrations: Plug,
    health: HardDrive, users: Users, announcements: Megaphone,
    maintenance: Wrench, audit: Activity, data: Database, permissions: KeyRound,
  };

  const ActiveIcon = tabIcons[activeTab] ?? ShieldAlert;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Page header — icon, section eyebrow, title and description all
          reflect the active tab; navigation itself lives only in the sidebar. */}
      <div className="flex items-center gap-3.5 pb-5 border-b">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <ActiveIcon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-0.5">
            {meta.group}
          </p>
          <h1 className="text-2xl font-bold tracking-tight leading-tight">{meta.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{meta.description}</p>
        </div>
      </div>

      <div>{renderTab()}</div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, accent }: { icon: any; label: string; value: string | number; hint?: string; accent?: string }) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className="text-xl font-bold mt-1 tabular-nums truncate">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className={`rounded-xl p-2 shrink-0 ${accent ?? 'bg-primary/10 text-primary'}`}><Icon className="h-5 w-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewTab() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try { setStats(await apiFetch<any>('/api/cpanel/overview')); }
    catch (err) { toast.error((err as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  if (loading || !stats) return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…</div>;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Total users" value={stats.totalUsers} hint={`${stats.activeUsers} active · ${stats.lockedUsers} locked`} />
        <StatCard icon={Activity} label="Members" value={stats.totalMembers} accent="bg-accent/15 text-accent" />
        <StatCard icon={Activity} label="Total givings" value={`KES ${Number(stats.totalGivings||0).toLocaleString()}`} accent="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={Clock} label="Activity (24h)" value={stats.recentEvents} hint="audit events" accent="bg-orange-500/10 text-orange-600" />
      </div>
      <Card><CardHeader><CardTitle>Users by role</CardTitle></CardHeader>
        <CardContent><div className="flex flex-wrap gap-2">
          {ROLES.map(r => <Badge key={r} variant="secondary" className="capitalize text-sm py-1.5 px-3">{r.replace('_',' ')} · {(stats.rolesCount||{})[r]??0}</Badge>)}
        </div></CardContent>
      </Card>
      <div className="flex justify-end"><Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button></div>
    </div>
  );
}

const BRANDING_IMAGE_FIELDS: { key: 'logo_url'|'login_logo_url'|'favicon_url'|'report_stamp_url'; label: string; hint?: string }[] = [
  { key: 'logo_url',         label: 'App logo' },
  { key: 'login_logo_url',   label: 'Login screen logo' },
  { key: 'favicon_url',      label: 'Browser favicon' },
  { key: 'report_stamp_url', label: 'Report stamp', hint: 'Appears on the Monthly District Report, next to the signatures.' },
];

type HSL = { h: number; s: number; l: number };
const hslStr = (c: HSL) => `hsl(${c.h}, ${c.s}%, ${c.l}%)`;
// shadcn-style CSS variables expect the raw "H S% L%" triplet (consumed as hsl(var(--primary))),
// not a full hsl(...) string — wrapping it would nest hsl() inside hsl() and break the color.
const hslTriplet = (c: HSL) => `${c.h} ${c.s}% ${c.l}%`;
const DEFAULT_PRIMARY: HSL = { h: 0, s: 84, l: 50 };
const DEFAULT_ACCENT: HSL = { h: 270, s: 50, l: 50 };

const THEME_PRESETS: { name: string; h: number; s: number; l: number }[] = [
  { name: 'AGC Crimson', h: 0,   s: 84, l: 50 },
  { name: 'Ocean',       h: 200, s: 80, l: 50 },
  { name: 'Forest',      h: 140, s: 55, l: 35 },
  { name: 'Royal',       h: 262, s: 55, l: 50 },
  { name: 'Sunset',      h: 25,  s: 85, l: 55 },
];

function ThemeColorCard() {
  const { theme, refresh } = useSystemSettings() as any;
  const [primary, setPrimary] = useState<HSL>(theme?.primary ?? DEFAULT_PRIMARY);
  const [accent, setAccent] = useState<HSL>(theme?.accent ?? DEFAULT_ACCENT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (theme) {
      setPrimary(theme.primary ?? DEFAULT_PRIMARY);
      setAccent(theme.accent ?? DEFAULT_ACCENT);
    }
  }, [theme]);

  // Live preview — push straight to CSS variables as the user drags, before saving.
  useEffect(() => { document.documentElement.style.setProperty('--primary', hslTriplet(primary)); }, [primary]);
  useEffect(() => { document.documentElement.style.setProperty('--accent', hslTriplet(accent)); }, [accent]);

  const applyPreset = (p: typeof THEME_PRESETS[number]) => setPrimary({ h: p.h, s: p.s, l: p.l });

  const resetPreview = () => {
    setPrimary(theme?.primary ?? DEFAULT_PRIMARY);
    setAccent(theme?.accent ?? DEFAULT_ACCENT);
  };

  const saveTheme = async () => {
    setSaving(true);
    try {
      await settingUpdate('theme_colors', { primary, accent });
      toast.success('Theme saved');
      refresh();
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const ColorSection = ({ label, value, onChange }: { label: string; value: HSL; onChange: (c: HSL) => void }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{label}</p>
        <div className="w-6 h-6 rounded-full border shadow-sm shrink-0" style={{ background: hslStr(value) }} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Hue ({value.h}°)</Label>
        <input
          type="range" min={0} max={360} value={value.h}
          onChange={e => onChange({ ...value, h: Number(e.target.value) })}
          className="w-full h-2 cursor-pointer"
          style={{ accentColor: hslStr(value) }}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Saturation ({value.s}%)</Label>
        <input
          type="range" min={0} max={100} value={value.s}
          onChange={e => onChange({ ...value, s: Number(e.target.value) })}
          className="w-full h-2 cursor-pointer"
          style={{ accentColor: hslStr(value) }}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Lightness ({value.l}%)</Label>
        <input
          type="range" min={0} max={100} value={value.l}
          onChange={e => onChange({ ...value, l: Number(e.target.value) })}
          className="w-full h-2 cursor-pointer"
          style={{ accentColor: hslStr(value) }}
        />
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" />Theme &amp; colour</CardTitle>
        <CardDescription>Live preview — adjust hue, then save to apply for everyone.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Quick presets</p>
          <div className="flex flex-wrap gap-2">
            {THEME_PRESETS.map(p => (
              <button
                key={p.name}
                type="button"
                onClick={() => applyPreset(p)}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: `hsl(${p.h}, ${p.s}%, ${p.l}%)` }} />
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        <div className="grid gap-6 md:grid-cols-2">
          <ColorSection label="Primary Colour" value={primary} onChange={setPrimary} />
          <ColorSection label="Accent Colour" value={accent} onChange={setAccent} />
        </div>

        <div className="flex gap-2">
          <Button onClick={saveTheme} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save theme</Button>
          <Button variant="outline" onClick={resetPreview}>Reset preview</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BrandingTab() {
  const { branding, refresh } = useSystemSettings();
  const [b, setB] = useState(branding);
  const [uploading, setUploading] = useState<string|null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setB(branding); }, [branding]);

  const upload = async (field: 'logo_url'|'login_logo_url'|'favicon_url'|'report_stamp_url', file: File) => {
    setUploading(field);
    try {
      const res = await apiUpload('branding', file, `${field}-${Date.now()}.${file.name.split('.').pop()||'png'}`);
      setB(prev => ({ ...prev, [field]: res.url }));
      toast.success('Image uploaded — save branding to apply');
    } catch (err) { toast.error((err as Error).message); }
    finally { setUploading(null); }
  };

  const saveBranding = async () => {
    setSaving(true);
    try { await settingUpdate('app_branding', b); toast.success('Branding saved'); refresh(); }
    catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5" />Images</CardTitle>
            <CardDescription>Logo, favicon and report stamp.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {BRANDING_IMAGE_FIELDS.map(field => (
                <div key={field.key} className="space-y-1.5">
                  <Label className="text-sm">{field.label}</Label>
                  <label
                    htmlFor={`upload-${field.key}`}
                    className={`group relative flex h-28 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/30 transition-colors ${uploading===field.key ? 'cursor-wait' : 'cursor-pointer hover:border-primary/50 hover:bg-muted/50'}`}
                  >
                    {b[field.key] ? (
                      <img src={b[field.key]!} alt="" className="h-full w-full object-contain p-3" />
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                        <ImageIcon className="h-5 w-5" />
                        <span className="text-xs">Click to upload</span>
                      </div>
                    )}
                    {uploading === field.key && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    )}
                    <input
                      id={`upload-${field.key}`} type="file" accept="image/*" className="sr-only"
                      disabled={uploading===field.key}
                      onChange={e => { const f = e.target.files?.[0]; if (f) upload(field.key, f); }}
                    />
                  </label>
                  <div className="flex items-start justify-between gap-2 min-h-[1rem]">
                    {field.hint && <p className="text-xs text-muted-foreground leading-snug">{field.hint}</p>}
                    {b[field.key] && (
                      <button type="button" className="text-xs text-destructive hover:underline shrink-0 ml-auto" onClick={() => setB(p => ({ ...p, [field.key]: null }))}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Type className="h-5 w-5" />Identity</CardTitle>
            <CardDescription>Names and taglines shown around the app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Sidebar preview</p>
              <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {b.logo_url ? <img src={b.logo_url} alt="" className="h-full w-full object-contain" /> : <Type className="h-4 w-4 text-primary" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{b.short_name || 'Short name'}</p>
                  <p className="text-xs text-muted-foreground truncate">{b.sidebar_tagline || 'Sidebar tagline'}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>App name</Label>
                <Input value={b.name} maxLength={80} onChange={e=>setB({...b,name:e.target.value})} />
                <p className="text-xs text-muted-foreground">Used as the browser tab title.</p>
              </div>
              <div className="space-y-2">
                <Label>Short name</Label>
                <Input value={b.short_name} maxLength={20} onChange={e=>setB({...b,short_name:e.target.value})} />
                <p className="text-xs text-muted-foreground">Used where space is tight.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Sidebar tagline</Label>
              <Input value={b.sidebar_tagline} onChange={e=>setB({...b,sidebar_tagline:e.target.value})} />
              <p className="text-xs text-muted-foreground">Shown in the sidebar.</p>
            </div>
            <div className="space-y-2">
              <Label>Login tagline</Label>
              <Input value={b.login_tagline} onChange={e=>setB({...b,login_tagline:e.target.value})} />
              <p className="text-xs text-muted-foreground">Shown on the sign-in screen.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={saveBranding} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save branding</Button>
      </div>

      <ThemeColorCard />
    </div>
  );
}

function ModulesTab() {
  const [mods, setMods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { refresh } = useSystemSettings();
  const load = async () => {
    setLoading(true);
    try { const res=await apiFetch<{data:any[]}>('/api/modules'); setMods(res.data??[]); }
    catch (err) { toast.error((err as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(()=>{ load(); },[]);
  const toggle = async (m:any) => {
    const next=!m.enabled;
    setMods(rows=>rows.map(x=>x.key===m.key?{...x,enabled:next}:x));
    try { await apiFetch(`/api/modules/${m.key}`,{method:'PUT',body:JSON.stringify({enabled:next})}); toast.success(`${m.label} ${next?'enabled':'disabled'}`); refresh(); }
    catch (err) { toast.error((err as Error).message); load(); }
  };
  return (
    <Card>
      <CardHeader><CardTitle>Modules</CardTitle><CardDescription>Toggle to show/hide from the sidebar.</CardDescription></CardHeader>
      <CardContent>
        {loading?<div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin"/></div>:(
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {mods.map(m=>(
              <div key={m.key} className={`rounded-lg border p-4 flex items-start justify-between gap-3 ${m.enabled?'':'opacity-60 bg-muted/30'}`}>
                <div className="flex-1 min-w-0"><p className="font-semibold">{m.label}</p><p className="text-xs text-muted-foreground">{m.description}</p><Badge variant="outline" className="mt-2 text-[10px]">{m.key}</Badge></div>
                <Switch checked={m.enabled} onCheckedChange={()=>toggle(m)} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PermissionsTab() {
  const { permissions, modules, roles, loading, refresh } = usePermissions();
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!loading) { setDraft(permissions); setDirty(false); }
  }, [loading, permissions]);

  const toggle = (moduleKey: string, role: string) => {
    setDraft(prev => {
      const current = prev[moduleKey] ?? [];
      const next = current.includes(role) ? current.filter(r => r !== role) : [...current, role];
      return { ...prev, [moduleKey]: next };
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/permissions', { method: 'PUT', body: JSON.stringify({ permissions: draft }) });
      toast.success('Permissions saved');
      setDirty(false);
      refresh();
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle>Permissions</CardTitle>
            <CardDescription>Control which roles can access each page — no code changes needed.</CardDescription>
          </div>
          <Button onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    {roles.map(r => (
                      <TableHead key={r} className="text-center capitalize whitespace-nowrap">{r.replace(/_/g, ' ')}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(modules).map(([key, meta]) => (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{meta.label}</TableCell>
                      {roles.map(r => (
                        <TableCell key={r} className="text-center">
                          <Switch
                            checked={(draft[key] ?? []).includes(r)}
                            onCheckedChange={() => toggle(key, r)}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Super Admin and Admin always have full access to every module and aren't shown here —
              this keeps you from accidentally locking yourself out.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SecurityTab() {
  const { security, refresh } = useSystemSettings();
  const [s, setS] = useState(security);
  const [saving, setSaving] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  useEffect(()=>{ setS(security); },[security]);
  const save = async () => {
    setSaving(true);
    try { await settingUpdate('security_policy',s); toast.success('Security policy saved'); refresh(); }
    catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };
  const forceLogout = async () => {
    const next={...s,global_revocation:(s.global_revocation||0)+1};
    try { await settingUpdate('security_policy',next); setS(next); setConfirmRevoke(false); toast.success('All sessions revoked'); refresh(); }
    catch (err) { toast.error((err as Error).message); }
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5"/>Sessions</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Session timeout (minutes)</Label><Input type="number" min={5} max={1440} value={s.session_timeout_minutes} onChange={e=>setS({...s,session_timeout_minutes:Number(e.target.value)})}/></div>
            <div className="space-y-2"><Label>Max failed logins before lockout</Label><Input type="number" min={1} max={20} value={s.max_login_attempts} onChange={e=>setS({...s,max_login_attempts:Number(e.target.value)})}/><p className="text-xs text-muted-foreground">Account blocked for 5 minutes after this many failures.</p></div>
            <Separator />
            <Dialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
              <DialogTrigger asChild><Button variant="destructive" className="w-full"><LogOut className="h-4 w-4 mr-2"/>Force-logout all users</Button></DialogTrigger>
              <DialogContent><DialogHeader><DialogTitle>Force-logout everyone?</DialogTitle><DialogDescription>Every signed-in user except super admins will be logged out.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={()=>setConfirmRevoke(false)}>Cancel</Button><Button variant="destructive" onClick={forceLogout}>Force logout</Button></DialogFooter></DialogContent>
            </Dialog>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5"/>Password policy</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Minimum password length</Label><Input type="number" min={6} max={64} value={s.min_password_length} onChange={e=>setS({...s,min_password_length:Number(e.target.value)})}/></div>
            <div className="flex items-center justify-between rounded-md border p-3"><div><p className="font-medium">Strong password rule</p><p className="text-xs text-muted-foreground">Require upper + lower + number + symbol</p></div><Switch checked={s.strong_password_required} onCheckedChange={v=>setS({...s,strong_password_required:v})}/></div>
            <div className="flex items-center justify-between rounded-md border p-3"><div><p className="font-medium">Two-factor auth</p><p className="text-xs text-muted-foreground">Require 2FA for all sign-ins</p></div><Switch checked={s.two_factor_required} onCheckedChange={v=>setS({...s,two_factor_required:v})}/></div>
            <Button onClick={save} disabled={saving}>{saving&&<Loader2 className="h-4 w-4 mr-2 animate-spin"/>}Save policy</Button>
          </CardContent>
        </Card>
      </div>
      <LockedAccountsCard maxAttempts={s.max_login_attempts||3}/>
    </div>
  );
}

type LockedRow = { identifier:string; source:'attempts'|'manual'; fail_count:number; retry_after_seconds:number; reason:string|null };

function LockedAccountsCard({ maxAttempts }:{ maxAttempts:number }) {
  const [rows, setRows] = useState<LockedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string|null>(null);
  const [lockOpen, setLockOpen] = useState(false);
  const [lockForm, setLockForm] = useState({identifier:'',reason:'',minutes:0});
  const [users, setUsers] = useState<{username:string;full_name:string}[]>([]);

  useEffect(()=>{
    dbOp({table:'profiles',op:'select',columns:'username,full_name',order:[{col:'full_name',ascending:true}]})
      .then(res=>setUsers((res.data??[]).filter((p:any)=>p.username))).catch(()=>{});
  },[]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{data:LockedRow[]}>(`/api/login-attempts/locked?max_attempts=${maxAttempts}&window_minutes=5`);
      setRows(res.data??[]);
    } catch (err) { toast.error((err as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(()=>{ load(); const t=setInterval(load,15000); return ()=>clearInterval(t); },[maxAttempts]);

  const unlock = async (row:LockedRow) => {
    setWorking(row.identifier);
    try { await apiFetch(`/api/login-attempts/${encodeURIComponent(row.identifier)}`,{method:'DELETE'}); toast.success(`Unlocked ${row.identifier}`); load(); }
    catch (err) { toast.error((err as Error).message); }
    finally { setWorking(null); }
  };

  const lockAccount = async () => {
    const id=lockForm.identifier.trim(); if(!id) return toast.error('Select a user');
    const locked_until=lockForm.minutes>0?new Date(Date.now()+lockForm.minutes*60000).toISOString():null;
    try {
      await dbOp({table:'account_locks',op:'upsert',values:{identifier:id.toLowerCase(),reason:lockForm.reason||null,locked_until},onConflict:'identifier'});
      toast.success(`Locked ${id}`); setLockOpen(false); setLockForm({identifier:'',reason:'',minutes:0}); load();
    } catch (err) { toast.error((err as Error).message); }
  };

  const fmtTime=(s:number)=>s===0?'Indefinite':`${Math.floor(s/60)}m ${s%60}s`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div><CardTitle className="flex items-center gap-2"><LogOut className="h-5 w-5"/>Locked accounts</CardTitle><CardDescription>Accounts blocked due to failed sign-ins or manually locked.</CardDescription></div>
        <Dialog open={lockOpen} onOpenChange={setLockOpen}>
          <DialogTrigger asChild><Button size="sm" variant="destructive"><Lock className="h-4 w-4 mr-1"/>Lock account</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Lock an account</DialogTitle><DialogDescription>The user will be blocked until you unlock them.</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2"><Label>User</Label>
                <Select value={lockForm.identifier} onValueChange={v=>setLockForm({...lockForm,identifier:v})}>
                  <SelectTrigger><SelectValue placeholder="Select a user…"/></SelectTrigger>
                  <SelectContent>{users.map(u=><SelectItem key={u.username} value={u.username}>{u.full_name} (@{u.username})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Reason (optional)</Label><Input value={lockForm.reason} onChange={e=>setLockForm({...lockForm,reason:e.target.value})} placeholder="e.g. Suspicious activity"/></div>
              <div className="space-y-2"><Label>Duration minutes (0 = indefinite)</Label><Input type="number" min={0} value={lockForm.minutes} onChange={e=>setLockForm({...lockForm,minutes:Number(e.target.value)})}/></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={()=>setLockOpen(false)}>Cancel</Button><Button variant="destructive" onClick={lockAccount}>Lock</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading?<div className="flex items-center justify-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2"/>Loading…</div>
          :rows.length===0?<p className="text-sm text-muted-foreground py-6 text-center">No accounts are currently locked. ✓</p>
          :(
            <Table>
              <TableHeader><TableRow><TableHead>Identifier</TableHead><TableHead>Source</TableHead><TableHead>Details</TableHead><TableHead>Expires</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map(r=>(
                  <TableRow key={`${r.source}:${r.identifier}`}>
                    <TableCell className="font-medium">{r.identifier}</TableCell>
                    <TableCell><Badge variant={r.source==='manual'?'destructive':'secondary'}>{r.source==='manual'?'Manual':`${r.fail_count} failed`}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.reason||(r.source==='attempts'?`${r.fail_count} failed attempts`:'—')}</TableCell>
                    <TableCell className="font-mono text-sm">{fmtTime(r.retry_after_seconds)}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" onClick={()=>unlock(r)} disabled={working===r.identifier}>{working===r.identifier?<Loader2 className="h-3 w-3 mr-1 animate-spin"/>:<Unlock className="h-3 w-3 mr-1"/>}Unlock</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </CardContent>
    </Card>
  );
}

function LocalizationTab() {
  const { localization, refresh } = useSystemSettings();
  const [l, setL] = useState(localization);
  const [saving, setSaving] = useState(false);
  useEffect(()=>{ setL(localization); },[localization]);
  const save = async () => {
    setSaving(true);
    try { await settingUpdate('localization',l); toast.success('Localization saved'); refresh(); }
    catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5"/>Localization</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Currency code</Label><Input value={l.currency} maxLength={5} onChange={e=>setL({...l,currency:e.target.value.toUpperCase()})}/></div>
          <div className="space-y-2"><Label>Currency symbol</Label><Input value={l.currency_symbol} maxLength={5} onChange={e=>setL({...l,currency_symbol:e.target.value})}/></div>
          <div className="space-y-2"><Label>Timezone</Label>
            <Select value={l.timezone} onValueChange={v=>setL({...l,timezone:v})}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{['Africa/Nairobi','Africa/Lagos','Africa/Cairo','Africa/Johannesburg','UTC','Europe/London','America/New_York','Asia/Dubai'].map(z=><SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Date format</Label>
            <Select value={l.date_format} onValueChange={v=>setL({...l,date_format:v})}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem><SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem><SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Language</Label>
            <Select value={l.language} onValueChange={v=>setL({...l,language:v})}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="sw">Kiswahili</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Week starts on</Label>
            <Select value={l.week_start} onValueChange={v=>setL({...l,week_start:v})}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="sunday">Sunday</SelectItem><SelectItem value="monday">Monday</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={save} disabled={saving}>{saving&&<Loader2 className="h-4 w-4 mr-2 animate-spin"/>}Save localization</Button>
      </CardContent>
    </Card>
  );
}

function IntegrationsTab() {
  const [integrations, setIntegrations] = useState<any>(null);
  const [saving, setSaving] = useState<string|null>(null);
  const [testingPhone, setTestingPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [draftKeys, setDraftKeys] = useState<Record<string,string>>({});

  const load = async () => {
    try {
      const res = await dbOp({table:'system_settings',op:'select',columns:'value',filters:[{col:'key',op:'eq',value:'integrations'}],maybeSingle:true});
      setIntegrations((res.data as any)?.value??{});
    } catch { setIntegrations({}); }
  };
  useEffect(()=>{ load(); },[]);

  const saveSection = async (section:string, patch:any={}) => {
    setSaving(section);
    const next={...integrations,[section]:{...integrations[section],...patch}};
    try { await settingUpdate('integrations',next); toast.success(`${section.toUpperCase()} saved`); setIntegrations(next); setDraftKeys({}); }
    catch (err) { toast.error((err as Error).message); }
    finally { setSaving(null); }
  };
  const upd=(section:string,field:string,value:any)=>setIntegrations({...integrations,[section]:{...integrations[section],[field]:value}});

  const testSms = async () => {
    const phone=testingPhone.trim(); if(!phone) return toast.error('Enter a phone number');
    setTesting(true);
    try {
      const res=await apiFetch<{ok?:boolean;message?:string;error?:string}>('/api/rpc/test_sms',{method:'POST',body:JSON.stringify({phone})});
      if(res.ok) toast.success(res.message||'Test SMS sent!'); else toast.error(res.error||'SMS test failed');
    } catch (err) { toast.error((err as Error).message); }
    finally { setTesting(false); }
  };

  if (!integrations) return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin"/></div>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>SMS provider</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2"><Label>Provider</Label>
            <Select value={integrations.sms?.provider??'none'} onValueChange={v=>upd('sms','provider',v)}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="talksasa">TalkSasa</SelectItem><SelectItem value="textsms">TextSMS</SelectItem><SelectItem value="africastalking">Africa's Talking</SelectItem><SelectItem value="twilio">Twilio</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Sender ID</Label><Input value={integrations.sms?.sender_id??''} placeholder="AGC-CHURCH" onChange={e=>upd('sms','sender_id',e.target.value)}/></div>
            <div className="space-y-2"><Label>Username / SID</Label><Input value={integrations.sms?.username??''} onChange={e=>upd('sms','username',e.target.value)}/></div>
          </div>
          {integrations.sms?.provider === 'textsms' && (
            <div className="space-y-2">
              <Label>Partner ID <span className="text-xs text-muted-foreground">(TextSMS)</span></Label>
              <Input value={integrations.sms?.partner_id??''} placeholder="e.g. 1234" onChange={e=>upd('sms','partner_id',e.target.value)}/>
            </div>
          )}
          <div className="space-y-2"><Label>API URL <span className="text-xs text-muted-foreground">(optional override)</span></Label><Input value={integrations.sms?.url??''} placeholder="https://sms.textsms.co.ke/api/services/sendbulk/" onChange={e=>upd('sms','url',e.target.value)}/></div>
          <div className="space-y-2"><Label>API key / Auth token</Label><Input type="password" placeholder={integrations.sms?.api_key_masked?`Stored: ${integrations.sms.api_key_masked}`:'Enter API key'} value={draftKeys.sms??''} onChange={e=>setDraftKeys({...draftKeys,sms:e.target.value})}/></div>
          <Button onClick={()=>saveSection('sms',draftKeys.sms?{api_key:draftKeys.sms,api_key_masked:`••••${draftKeys.sms.slice(-4)}`}:{})} disabled={saving==='sms'}>{saving==='sms'&&<Loader2 className="h-4 w-4 mr-2 animate-spin"/>}Save SMS</Button>
          <Separator/>
          <div className="space-y-2"><Label>Test SMS</Label>
            <div className="flex gap-2">
              <Input value={testingPhone} onChange={e=>setTestingPhone(e.target.value)} placeholder="+254700000000" className="flex-1"/>
              <Button variant="secondary" onClick={testSms} disabled={testing||!integrations.sms?.provider||integrations.sms?.provider==='none'}>
                {testing?<Loader2 className="h-4 w-4 animate-spin"/>:<TestTube2 className="h-4 w-4 mr-1"/>}{testing?'Sending…':'Send test'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Sends a live test using your saved credentials.</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Email provider</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Provider</Label>
              <Select value={integrations.email?.provider??'none'} onValueChange={v=>upd('email','provider',v)}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="smtp">SMTP</SelectItem><SelectItem value="sendgrid">SendGrid</SelectItem><SelectItem value="resend">Resend</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>From name</Label><Input value={integrations.email?.from_name??''} placeholder="AGC Cheswerta" onChange={e=>upd('email','from_name',e.target.value)}/></div>
          </div>
          <div className="space-y-2"><Label>From email</Label><Input type="email" value={integrations.email?.from_email??''} placeholder="no-reply@church.org" onChange={e=>upd('email','from_email',e.target.value)}/></div>
          <div className="space-y-2"><Label>API key</Label><Input type="password" placeholder={integrations.email?.api_key_masked?`Stored: ${integrations.email.api_key_masked}`:'Enter API key'} value={draftKeys.email??''} onChange={e=>setDraftKeys({...draftKeys,email:e.target.value})}/></div>
          <Button onClick={()=>saveSection('email',draftKeys.email?{api_key_masked:`••••${draftKeys.email.slice(-4)}`}:{})} disabled={saving==='email'}>{saving==='email'&&<Loader2 className="h-4 w-4 mr-2 animate-spin"/>}Save email</Button>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>M-Pesa</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2"><Label>Shortcode</Label><Input value={integrations.mpesa?.shortcode??''} onChange={e=>upd('mpesa','shortcode',e.target.value)}/></div>
            <div className="space-y-2"><Label>Environment</Label>
              <Select value={integrations.mpesa?.environment??'sandbox'} onValueChange={v=>upd('mpesa','environment',v)}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent><SelectItem value="sandbox">Sandbox</SelectItem><SelectItem value="production">Production</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Passkey</Label><Input type="password" placeholder={integrations.mpesa?.passkey_masked?`Stored: ${integrations.mpesa.passkey_masked}`:'Enter passkey'} value={draftKeys.mpesa??''} onChange={e=>setDraftKeys({...draftKeys,mpesa:e.target.value})}/></div>
          </div>
          <Button onClick={()=>saveSection('mpesa',draftKeys.mpesa?{passkey_masked:`••••${draftKeys.mpesa.slice(-4)}`}:{})} disabled={saving==='mpesa'}>{saving==='mpesa'&&<Loader2 className="h-4 w-4 mr-2 animate-spin"/>}Save M-Pesa</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function HealthTab() {
  const [usage, setUsage] = useState<{key:string;bytes:number;rows:number}[]>([]);
  const [lastActivity, setLastActivity] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const { modules } = useSystemSettings();
  const load = async () => {
    setLoading(true);
    try {
      const tables=['members','givings','attendance','departments','profiles','audit_logs','announcements'];
      const results = await Promise.all(tables.map(async t => {
        const res=await dbOp({table:t,op:'select',limit:1000});
        const data=res.data??[];
        return {key:t,rows:data.length,bytes:JSON.stringify(data).length};
      }));
      setUsage(results);
      const actRes=await dbOp({table:'audit_logs',op:'select',columns:'created_at',order:[{col:'created_at',ascending:false}],limit:1});
      setLastActivity((actRes.data as any[])?.[0]?.created_at??null);
    } catch (err) { toast.error((err as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(()=>{ load(); },[]);
  if(loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin"/></div>;
  const totalBytes=usage.reduce((s,u)=>s+u.bytes,0);
  const cap=100*1024*1024;
  const fmt=(b:number)=>b>1024*1024?`${(b/1024/1024).toFixed(2)} MB`:b>1024?`${(b/1024).toFixed(1)} KB`:`${b} B`;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><HardDrive className="h-5 w-5"/>Storage usage</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1"><div className="flex justify-between text-sm"><span className="font-medium">Total: {fmt(totalBytes)}</span><span className="text-muted-foreground">{Math.min(100,(totalBytes/cap)*100).toFixed(1)}%</span></div><Progress value={Math.min(100,(totalBytes/cap)*100)}/></div>
          {usage.sort((a,b)=>b.bytes-a.bytes).map(u=>(
            <div key={u.key}><div className="flex justify-between text-sm"><span className="capitalize">{u.key} <span className="text-muted-foreground">({u.rows} rows)</span></span><span className="text-muted-foreground">{fmt(u.bytes)}</span></div><Progress value={(u.bytes/Math.max(totalBytes,1))*100} className="h-1.5 mt-1"/></div>
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle>Last activity</CardTitle></CardHeader>
          <CardContent>{lastActivity?<><p className="text-2xl font-bold">{formatDistanceToNow(new Date(lastActivity),{addSuffix:true})}</p><p className="text-sm text-muted-foreground mt-1">{new Date(lastActivity).toLocaleString()}</p></>:<p className="text-muted-foreground">No activity yet.</p>}</CardContent>
        </Card>
        <Card><CardHeader><CardTitle>Modules status</CardTitle></CardHeader>
          <CardContent><div className="grid grid-cols-2 gap-2">{modules.map(m=>(<Badge key={m.key} variant={m.enabled?'secondary':'outline'} className={`justify-between ${m.enabled?'':'text-muted-foreground'}`}><span>{m.label}</span><span className={`h-2 w-2 rounded-full ml-2 ${m.enabled?'bg-emerald-500':'bg-muted-foreground'}`}/></Badge>))}</div></CardContent>
        </Card>
      </div>
      <div className="flex justify-end"><Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-2"/>Refresh</Button></div>
    </div>
  );
}

// ─── USERS TAB — admin + super_admin, with full CRUD and EDIT ─────────────────
const EMPTY_FORM = { full_name:'', username:'', phone:'', password:'', role:'pastor' as AppRole };

function UsersTab() {
  const { user: currentUser, role: myRole } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<AppRole|'all'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any|null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState({ full_name:'', username:'', phone:'', password:'', role:'' as AppRole|'' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{users:any[]}>('/api/admin/users',{method:'POST',body:JSON.stringify({action:'list'})});
      setUsers(data.users??[]);
    } catch (err) { toast.error((err as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(()=>{ load(); },[]);

  const filtered = useMemo(()=>users.filter(u=>{
    if(roleFilter!=='all'&&u.role!==roleFilter) return false;
    if(!search) return true;
    const s=search.toLowerCase();
    return u.full_name?.toLowerCase().includes(s)||u.username?.toLowerCase().includes(s);
  }),[users,search,roleFilter]);

  const openEdit=(u:any)=>{
    setEditForm({full_name:u.full_name||'',username:u.username||'',phone:u.phone||'',password:'',role:u.role||''});
    setEditTarget(u); setError('');
  };

  const createUser = async (e:React.FormEvent) => {
    e.preventDefault(); setError(''); setSaving(true);
    if(form.password.length<8){setError('Password must be at least 8 characters');setSaving(false);return;}
    try {
      await apiFetch('/api/admin/users',{method:'POST',body:JSON.stringify({action:'create',...form,username:form.username.trim().toLowerCase()})});
      toast.success(`User @${form.username} created`);
      setCreateOpen(false); setForm(EMPTY_FORM); load();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  const updateUser = async (e:React.FormEvent) => {
    e.preventDefault(); setError(''); setSaving(true);
    if(editForm.password&&editForm.password.length<8){setError('Password must be at least 8 characters');setSaving(false);return;}
    const payload:any={action:'update',user_id:editTarget.user_id,full_name:editForm.full_name,username:editForm.username.toLowerCase(),phone:editForm.phone||null};
    if(editForm.role) payload.role=editForm.role;
    if(editForm.password) payload.password=editForm.password;
    try {
      await apiFetch('/api/admin/users',{method:'POST',body:JSON.stringify(payload)});
      toast.success('User updated'); setEditTarget(null); load();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  const toggleActive = async (u:any) => {
    try { await apiFetch('/api/admin/users',{method:'POST',body:JSON.stringify({action:'update',user_id:u.user_id,is_active:!u.is_active})}); toast.success(u.is_active?'Account locked':'Account unlocked'); load(); }
    catch (err) { toast.error((err as Error).message); }
  };
  const deleteUser = async (u:any) => {
    try { await apiFetch('/api/admin/users',{method:'POST',body:JSON.stringify({action:'delete',user_id:u.user_id})}); toast.success('User deleted'); load(); }
    catch (err) { toast.error((err as Error).message); }
  };

  const visibleRoles = myRole==='super_admin' ? ROLES : ROLES.filter(r=>r!=='super_admin');

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div><CardTitle>User management</CardTitle><CardDescription>Manage accounts, roles and access</CardDescription></div>
          <Dialog open={createOpen} onOpenChange={o=>{setCreateOpen(o);if(!o)setError('');}}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>New user</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create user</DialogTitle><DialogDescription>The account is active immediately.</DialogDescription></DialogHeader>
              <form onSubmit={createUser} className="space-y-3">
                {error&&<div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}
                <div className="space-y-2"><Label>Full name *</Label><Input required value={form.full_name} maxLength={120} onChange={e=>setForm({...form,full_name:e.target.value})}/></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Username *</Label><Input required value={form.username} maxLength={40} autoCapitalize="none" onChange={e=>setForm({...form,username:e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g,'')})}/></div>
                  <div className="space-y-2"><Label>Phone</Label><Input type="tel" value={form.phone} maxLength={20} onChange={e=>setForm({...form,phone:e.target.value})}/></div>
                </div>
                <div className="space-y-2"><Label>Role *</Label>
                  <Select value={form.role} onValueChange={v=>setForm({...form,role:v as AppRole})}>
                    <SelectTrigger className="capitalize"><SelectValue/></SelectTrigger>
                    <SelectContent>{visibleRoles.map(r=><SelectItem key={r} value={r} className="capitalize">{r.replace('_',' ')}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Temporary password *</Label><Input required type="text" value={form.password} minLength={8} maxLength={72} onChange={e=>setForm({...form,password:e.target.value})}/><p className="text-xs text-muted-foreground">Min 8 characters. Share securely.</p></div>
                <DialogFooter><Button type="submit" disabled={saving}>{saving&&<Loader2 className="h-4 w-4 mr-2 animate-spin"/>}Create user</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Edit dialog */}
        <Dialog open={!!editTarget} onOpenChange={o=>{if(!o){setEditTarget(null);setError('');}}}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit user</DialogTitle><DialogDescription>Leave password blank to keep it unchanged.</DialogDescription></DialogHeader>
            <form onSubmit={updateUser} className="space-y-3">
              {error&&<div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}
              <div className="space-y-2"><Label>Full name *</Label><Input required value={editForm.full_name} maxLength={120} onChange={e=>setEditForm({...editForm,full_name:e.target.value})}/></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Username *</Label><Input required value={editForm.username} maxLength={40} autoCapitalize="none" onChange={e=>setEditForm({...editForm,username:e.target.value.toLowerCase()})}/></div>
                <div className="space-y-2"><Label>Phone</Label><Input type="tel" value={editForm.phone} maxLength={20} onChange={e=>setEditForm({...editForm,phone:e.target.value})}/></div>
              </div>
              <div className="space-y-2"><Label>Role</Label>
                <Select value={editForm.role} onValueChange={v=>setEditForm({...editForm,role:v as AppRole})}>
                  <SelectTrigger className="capitalize"><SelectValue/></SelectTrigger>
                  <SelectContent>{visibleRoles.map(r=><SelectItem key={r} value={r} className="capitalize">{r.replace('_',' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>New password (optional)</Label><Input type="text" value={editForm.password} maxLength={72} placeholder="Leave blank to keep current" onChange={e=>setEditForm({...editForm,password:e.target.value})}/></div>
              <DialogFooter><Button variant="outline" type="button" onClick={()=>setEditTarget(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving&&<Loader2 className="h-4 w-4 mr-2 animate-spin"/>}Save changes</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/><Input className="pl-9" placeholder="Search name or username…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <Select value={roleFilter} onValueChange={v=>setRoleFilter(v as any)}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue/></SelectTrigger>
            <SelectContent><SelectItem value="all">All roles</SelectItem>{ROLES.map(r=><SelectItem key={r} value={r} className="capitalize">{r.replace('_',' ')}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={load}><RefreshCw className="h-4 w-4"/></Button>
        </div>

        {loading?<div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2"/>Loading…</div>
          :filtered.length===0?<p className="text-center text-muted-foreground py-12">No users match.</p>
          :(
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Phone</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filtered.map(u=>(
                    <TableRow key={u.user_id}>
                      <TableCell><div><p className="font-medium">{u.full_name}</p><p className="text-xs text-muted-foreground">@{u.username}</p></div></TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize">{(u.role||'—').replace('_',' ')}</Badge></TableCell>
                      <TableCell>{u.is_active?<Badge variant="secondary" className="gap-1"><Unlock className="h-3 w-3"/>Active</Badge>:<Badge variant="destructive" className="gap-1"><Lock className="h-3 w-3"/>Locked</Badge>}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.phone??'—'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Edit user" onClick={()=>openEdit(u)}><Pencil className="h-4 w-4"/></Button>
                          <Button variant="ghost" size="icon" title={u.is_active?'Lock':'Unlock'} onClick={()=>toggleActive(u)}>{u.is_active?<Lock className="h-4 w-4"/>:<Unlock className="h-4 w-4"/>}</Button>
                          <Button variant="ghost" size="icon" title="Reset password" onClick={async()=>{
                            const pw=prompt(`New password for ${u.full_name} (min 8 chars):`);
                            if(!pw) return;
                            if(pw.length<8){toast.error('Min 8 characters');return;}
                            try{await apiFetch('/api/admin/users',{method:'POST',body:JSON.stringify({action:'update',user_id:u.user_id,password:pw})});toast.success('Password reset');}
                            catch(err){toast.error((err as Error).message);}
                          }}><KeyRound className="h-4 w-4"/></Button>
                          <Button variant="ghost" size="icon" title="Delete user" disabled={u.user_id===currentUser?.id} onClick={async()=>{
                            if(!confirm(`Delete ${u.full_name}? This cannot be undone.`)) return;
                            deleteUser(u);
                          }}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
      </CardContent>
    </Card>
  );
}

function MaintenanceTab() {
  const [maintenance, setMaintenance] = useState({enabled:false,message:''});
  const [retention, setRetention] = useState(90);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const res=await apiFetch<{data:any[]}>('/api/settings');
      const settings:any[]=res.data??(res as any).settings??[];
      settings.forEach((r:any)=>{
        if(r.key==='maintenance_mode') setMaintenance(r.value??{enabled:false,message:''});
        if(r.key==='audit_retention_days') setRetention(Number(r.value)||90);
      });
    } catch {} finally { setLoading(false); }
  };
  useEffect(()=>{ load(); },[]);
  const save = async (key:string,value:any) => {
    try { await settingUpdate(key,value); toast.success('Saved'); load(); }
    catch (err) { toast.error((err as Error).message); }
  };
  if(loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin"/></div>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5"/>Maintenance mode</CardTitle><CardDescription>Block access for everyone except super admins.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between"><Label>Enable maintenance mode</Label><Switch checked={maintenance.enabled} onCheckedChange={v=>setMaintenance({...maintenance,enabled:v})}/></div>
          <div className="space-y-2"><Label>Message shown to users</Label><Textarea rows={3} value={maintenance.message} onChange={e=>setMaintenance({...maintenance,message:e.target.value})} placeholder="We'll be back shortly."/></div>
          <Button onClick={()=>save('maintenance_mode',maintenance)}>Save</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Audit log retention</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2"><Label>Retention (days)</Label><Input type="number" min={7} max={3650} value={retention} onChange={e=>setRetention(Number(e.target.value))}/></div>
          <Button onClick={()=>save('audit_retention_days',retention)}>Save</Button>
        </CardContent>
      </Card>
    </div>
  );
}

const AUDIT_TABLES=['auth_events','members','givings','attendance','departments','profiles','user_roles','modules','system_settings','announcements'];
const ACTION_COLOR:Record<string,string>={INSERT:'bg-emerald-500/15 text-emerald-700',UPDATE:'bg-blue-500/15 text-blue-700',DELETE:'bg-destructive/15 text-destructive'};
const ACTION_META:Record<string,{icon:any;verb:string}>={
  INSERT:{icon:Plus,verb:'created'},
  UPDATE:{icon:Pencil,verb:'updated'},
  DELETE:{icon:Trash2,verb:'deleted'},
};

function _renderVal(v: any): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Field-by-field before/after comparison for one audit event.
 * Rows that actually changed are highlighted; unchanged rows stay muted. */
function AuditDetail({ ev }: { ev: any }) {
  const oldD = ev.old_data ?? {};
  const newD = ev.new_data ?? {};
  const keys = Array.from(new Set([...Object.keys(oldD), ...Object.keys(newD)])).sort();

  if (keys.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No field-level detail was recorded for this event.</p>;
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/60 text-muted-foreground">
            <th className="text-left px-3 py-1.5 font-semibold">Field</th>
            <th className="text-left px-3 py-1.5 font-semibold">Before</th>
            <th className="text-left px-3 py-1.5 font-semibold">After</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {keys.map(k => {
            const ov = _renderVal(oldD[k]);
            const nv = _renderVal(newD[k]);
            const changed = ov !== nv;
            return (
              <tr key={k} className={changed ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}>
                <td className="px-3 py-1.5 font-mono text-muted-foreground align-top whitespace-nowrap">{k}</td>
                <td className={`px-3 py-1.5 align-top break-all ${changed ? 'text-destructive/80 line-through decoration-destructive/40' : 'text-muted-foreground'}`}>
                  {k in oldD ? ov : '—'}
                </td>
                <td className={`px-3 py-1.5 align-top break-all ${changed ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-muted-foreground'}`}>
                  {k in newD ? nv : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** One expandable audit-log entry. Collapsed: a one-line summary. Expanded:
 * labeled Target / User / Timestamp / Activity, plus the full field diff. */
function AuditRow({ ev }: { ev: any }) {
  const [open, setOpen] = useState(false);
  const meta = ACTION_META[ev.action] ?? { icon: Activity, verb: 'acted on' };
  const colorClass = ACTION_COLOR[ev.action] ?? 'bg-muted text-muted-foreground';
  const Icon = meta.icon;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm">
            <span className="font-medium">{ev.actor_email ?? 'System'}</span>{' '}
            <span className="text-muted-foreground">{meta.verb}</span>{' '}
            <span className="font-medium">{ev.table_name}</span>
            {ev.record_id && <span className="text-muted-foreground font-mono text-xs"> · {String(ev.record_id).slice(0, 8)}</span>}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })} · {new Date(ev.created_at).toLocaleString()}
          </p>
        </div>
        <ChevronRight className={`h-4 w-4 text-muted-foreground shrink-0 mt-1.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      </button>

      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-2 space-y-3 border-t bg-muted/10">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold mb-0.5">Target</p>
                <p className="text-xs font-mono break-all">{ev.table_name}{ev.record_id ? ` · ${ev.record_id}` : ''}</p>
              </div>
              <div>
                <p className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold mb-0.5">User</p>
                <p className="text-xs">{ev.actor_email ?? 'System'}</p>
              </div>
              <div>
                <p className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold mb-0.5">Timestamp</p>
                <p className="text-xs">{new Date(ev.created_at).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold mb-0.5">Activity</p>
                <Badge variant="outline" className={`${colorClass} border-0 text-[10px]`}>{ev.action}</Badge>
              </div>
            </div>
            <AuditDetail ev={ev} />
          </div>
        </div>
      </div>
    </div>
  );
}

function AuditTab() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const load = async () => {
    setLoading(true);
    try {
      const filters:any[]=[];
      if(tableFilter!=='all') filters.push({col:'table_name',op:'eq',value:tableFilter});
      if(actionFilter!=='all') filters.push({col:'action',op:'eq',value:actionFilter});
      const res=await dbOp({table:'audit_logs',op:'select',filters,order:[{col:'created_at',ascending:false}],limit:200});
      setEvents(res.data??[]);
    } catch (err) { toast.error((err as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(()=>{ load(); },[tableFilter,actionFilter]);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div><CardTitle>Audit log</CardTitle><CardDescription>Every create, edit, and delete</CardDescription></div>
          <div className="flex flex-wrap gap-2">
            <Select value={tableFilter} onValueChange={setTableFilter}><SelectTrigger className="w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All tables</SelectItem>{AUDIT_TABLES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
            <Select value={actionFilter} onValueChange={setActionFilter}><SelectTrigger className="w-36"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All actions</SelectItem><SelectItem value="INSERT">Create</SelectItem><SelectItem value="UPDATE">Update</SelectItem><SelectItem value="DELETE">Delete</SelectItem></SelectContent></Select>
            <Button variant="outline" size="icon" onClick={load}><RefreshCw className="h-4 w-4"/></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading?<div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2"/>Loading…</div>
          :events.length===0?<p className="text-center text-muted-foreground py-12">No activity yet.</p>
          :(
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {events.map(ev=>(
                <AuditRow key={ev.id} ev={ev} />
              ))}
            </div>
          )}
      </CardContent>
    </Card>
  );
}

function AnnouncementsTab() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({title:'',message:'',severity:'info',audience:'all',ends_at:''});
  const load = async () => {
    setLoading(true);
    try { const res=await dbOp({table:'announcements',op:'select',order:[{col:'created_at',ascending:false}]}); setItems(res.data??[]); }
    catch (err) { toast.error((err as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(()=>{ load(); },[]);
  const submit = async (e:React.FormEvent) => {
    e.preventDefault();
    try {
      await dbOp({table:'announcements',op:'insert',values:{title:form.title,message:form.message,severity:form.severity,audience:form.audience,ends_at:form.ends_at?new Date(form.ends_at).toISOString():null,created_by:user?.id}});
      toast.success('Announcement published'); setOpen(false); setForm({title:'',message:'',severity:'info',audience:'all',ends_at:''}); load();
    } catch (err) { toast.error((err as Error).message); }
  };
  const toggle = async (a:any) => {
    try { await dbOp({table:'announcements',op:'update',values:{is_active:!a.is_active},filters:[{col:'id',op:'eq',value:a.id}]}); load(); }
    catch (err) { toast.error((err as Error).message); }
  };
  const remove = async (id:string) => {
    if(!confirm('Delete this announcement?')) return;
    try { await dbOp({table:'announcements',op:'delete',filters:[{col:'id',op:'eq',value:id}]}); toast.success('Deleted'); load(); }
    catch (err) { toast.error((err as Error).message); }
  };
  const sevColor:Record<string,string>={info:'bg-blue-500/15 text-blue-700',success:'bg-emerald-500/15 text-emerald-700',warning:'bg-orange-500/15 text-orange-700',critical:'bg-destructive/15 text-destructive'};
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div><CardTitle>Announcements</CardTitle><CardDescription>Broadcast messages to users.</CardDescription></div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Send className="h-4 w-4 mr-2"/>New announcement</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Publish announcement</DialogTitle>
              <DialogDescription>
      Create and publish an announcement that will be shown to the selected audience.
    </DialogDescription>
    </DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div className="space-y-2"><Label>Title</Label><Input required maxLength={120} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></div>
                <div className="space-y-2"><Label>Message</Label><Textarea required rows={4} maxLength={1000} value={form.message} onChange={e=>setForm({...form,message:e.target.value})}/></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Severity</Label><Select value={form.severity} onValueChange={v=>setForm({...form,severity:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="info">Info</SelectItem><SelectItem value="success">Success</SelectItem><SelectItem value="warning">Warning</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Audience</Label><Select value={form.audience} onValueChange={v=>setForm({...form,audience:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Everyone</SelectItem><SelectItem value="staff">All staff</SelectItem><SelectItem value="admins">Admins only</SelectItem></SelectContent></Select></div>
                </div>
                <div className="space-y-2"><Label>Expires at (optional)</Label><Input type="datetime-local" value={form.ends_at} onChange={e=>setForm({...form,ends_at:e.target.value})}/></div>
                <DialogFooter><Button type="submit"><Send className="h-4 w-4 mr-2"/>Publish</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading?<div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2"/>Loading…</div>
          :items.length===0?<p className="text-center text-muted-foreground py-12">No announcements yet.</p>
          :(
            <div className="space-y-2">
              {items.map(a=>(
                <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl border bg-card hover:bg-muted/20 transition-colors">
                  <Badge className={`${sevColor[a.severity]} border-0 capitalize shrink-0`}>{a.severity}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><p className="font-medium truncate">{a.title}</p><Badge variant="outline" className="capitalize text-xs shrink-0">{a.audience}</Badge>{!a.is_active&&<Badge variant="secondary" className="text-xs shrink-0">Hidden</Badge>}</div>
                    <p className="text-sm text-muted-foreground">{a.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatDistanceToNow(new Date(a.created_at),{addSuffix:true})}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0"><Switch checked={a.is_active} onCheckedChange={()=>toggle(a)}/><Button variant="ghost" size="icon" onClick={()=>remove(a.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button></div>
                </div>
              ))}
            </div>
          )}
      </CardContent>
    </Card>
  );
}

function DataToolsTab() {
  const [busy, setBusy] = useState<string|null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importResource, setImportResource] = useState<BulkImportResource>('members');
  const exportJson = async (table:string) => {
    setBusy(table);
    try {
      const res=await dbOp({table,op:'select'});
      const blob=new Blob([JSON.stringify(res.data,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download=`${table}-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
      toast.success(`Exported ${table}`);
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(null); }
  };
  const purge = async () => {
    const days=prompt('Delete audit logs older than how many days?','90'); if(!days) return;
    const n=Number(days); if(!Number.isFinite(n)||n<1) return toast.error('Invalid number');
    if(!confirm(`Delete audit logs older than ${n} days?`)) return;
    setBusy('purge');
    try {
      const before=new Date(Date.now()-n*86400000).toISOString();
      await apiFetch(`/api/audit-logs/cleanup?before=${encodeURIComponent(before)}`,{method:'DELETE'});
      toast.success('Old audit logs purged');
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(null); }
  };
  const openImport = (resource: BulkImportResource) => { setImportResource(resource); setImportOpen(true); };
  const tables=['members','givings','attendance','departments','profiles','announcements'];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Data exports</CardTitle><CardDescription>Download tables as JSON for backup.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {tables.map(t=>(
            <Button key={t} variant="outline" className="w-full justify-between hover:bg-muted/50" disabled={busy===t} onClick={()=>exportJson(t)}>
              <span className="capitalize">{t}.json</span>{busy===t?<Loader2 className="h-4 w-4 animate-spin"/>:<Download className="h-4 w-4"/>}
            </Button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UploadCloud className="h-5 w-5"/>Data imports</CardTitle><CardDescription>Bulk-create records from a CSV or JSON file.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" className="w-full justify-between hover:bg-muted/50" onClick={()=>openImport('members')}>
            <span>Import members…</span><UploadCloud className="h-4 w-4"/>
          </Button>
          <Button variant="outline" className="w-full justify-between hover:bg-muted/50" onClick={()=>openImport('departments')}>
            <span>Import departments…</span><UploadCloud className="h-4 w-4"/>
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Trash className="h-5 w-5"/>Cleanup</CardTitle><CardDescription>Maintenance utilities.</CardDescription></CardHeader>
        <CardContent>
          <div className="rounded-md border p-4 space-y-3">
            <p className="font-medium">Purge old audit logs</p>
            <p className="text-sm text-muted-foreground">Permanently remove entries older than chosen window.</p>
            <Button variant="destructive" disabled={busy==='purge'} onClick={purge}>{busy==='purge'?<Loader2 className="h-4 w-4 animate-spin mr-2"/>:<Trash className="h-4 w-4 mr-2"/>}Purge logs…</Button>
          </div>
        </CardContent>
      </Card>
      <BulkImportDialog open={importOpen} onOpenChange={setImportOpen} defaultResource={importResource} />
    </div>
  );
}