import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  UserIcon, Lock, Building2, Users as UsersIcon, Database,
  Loader2, Plus, Pencil, Trash2, Download, Camera, Upload, Trash,
  Mail, Phone as PhoneIcon, Shield, Calendar, CheckCircle2, Circle, Eye, EyeOff,
  FileDown, ChevronRight, Settings as SettingsIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { apiFetch, apiUpload } from '@/lib/api';

/* ── Types ────────────────────────────────────────────────────────────────────── */
type Department = { id: string; name: string; description: string | null; leader_name: string | null; };
type ChurchInfo  = { name: string; branch: string; address: string; phone: string; email: string; pastor: string; currency: string; };

const CHURCH_INFO_KEY = 'agc.churchInfo';
const DEFAULT_CHURCH: ChurchInfo = { name: 'Africa Gospel Church Kenya', branch: 'Cheswerta', address: '', phone: '', email: '', pastor: '', currency: 'KES' };

function getInitials(name?: string | null) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'U';
}

/* ── Section wrapper — two-column row on desktop ────────────────────────────── */
function Section({ title, description, children, noBorder }: {
  title: string; description?: string; children: React.ReactNode; noBorder?: boolean;
}) {
  return (
    <div className={`py-7 ${noBorder ? '' : 'border-b'} first:pt-0`}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: label column */}
        <div className="lg:col-span-1">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>}
        </div>
        {/* Right: content column */}
        <div className="lg:col-span-2">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Eye toggle ──────────────────────────────────────────────────────────────── */
function EyeBtn({ show, toggle }: { show: boolean; toggle: () => void }) {
  return (
    <button type="button" onClick={toggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

/* ── Main Settings page — sidebar nav layout ────────────────────────────────── */
type TabKey = 'profile' | 'security' | 'church' | 'departments' | 'data';

export default function Settings() {
  const { role } = useAuth();
  const isAdmin = role === 'admin' || role === 'super_admin';
  const [active, setActive] = useState<TabKey>('profile');

  const navGroups = [
    {
      label: 'Account',
      items: [
        { key: 'profile'  as TabKey, icon: UserIcon, label: 'Profile',  desc: 'Photo, name & contact' },
        { key: 'security' as TabKey, icon: Lock,     label: 'Security', desc: 'Password & access' },
      ],
    },
    ...(isAdmin ? [{
      label: 'Administration',
      items: [
        { key: 'church'      as TabKey, icon: Building2, label: 'Church Info',  desc: 'Organisation details' },
        { key: 'departments' as TabKey, icon: UsersIcon, label: 'Departments',  desc: 'Manage ministries' },
        { key: 'data'        as TabKey, icon: Database,  label: 'Data & Export',desc: 'Backup & exports' },
      ],
    }] : []),
  ];

  const allItems = navGroups.flatMap(g => g.items);
  const current = allItems.find(i => i.key === active)!;

  const renderContent = () => {
    switch (active) {
      case 'profile':     return <ProfileTab />;
      case 'security':    return <SecurityTab />;
      case 'church':      return <ChurchTab />;
      case 'departments': return <DepartmentsTab />;
      case 'data':        return <DataTab />;
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <SettingsIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">Manage your account and church preferences</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* ── Sidebar navigation ── */}
        <aside className="w-full lg:w-64 shrink-0">
          {/* Mobile: horizontal scrollable pills */}
          <div className="lg:hidden overflow-x-auto -mx-4 px-4 pb-2">
            <div className="inline-flex gap-1.5 min-w-max">
              {allItems.map(item => (
                <button key={item.key} onClick={() => setActive(item.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all border
                    ${active === item.key
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted/60'}`}>
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Desktop: grouped vertical nav */}
          <div className="hidden lg:block">
            <nav className="space-y-5">
              {navGroups.map(group => (
                <div key={group.label}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-3 mb-1.5">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map(item => (
                      <button key={item.key} onClick={() => setActive(item.key)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group
                          ${active === item.key
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all
                          ${active === item.key ? 'bg-white/20' : 'bg-muted group-hover:bg-muted-foreground/10'}`}>
                          <item.icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-none">{item.label}</p>
                          <p className={`text-xs mt-0.5 truncate ${active === item.key ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                            {item.desc}
                          </p>
                        </div>
                        {active === item.key && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* ── Content area ── */}
        <div className="flex-1 min-w-0">
          <Card className="shadow-sm">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-primary/10`}>
                  <current.icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{current.label}</CardTitle>
                  <CardDescription className="text-xs mt-0.5">{current.desc}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {renderContent()}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   PROFILE TAB
══════════════════════════════════════════════════════════════════════════════ */
function ProfileTab() {
  const { user, profile, role } = useAuth();
  const [fullName,    setFullName]    = useState(profile?.full_name ?? '');
  const [phone,       setPhone]       = useState('');
  const [email,       setEmail]       = useState(profile?.email ?? '');
  const [username,    setUsername]    = useState('');
  const [avatarUrl,   setAvatarUrl]   = useState<string | null>(profile?.avatar_url ?? null);
  const [createdAt,   setCreatedAt]   = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => {
    if (!user) return;
    apiFetch<{ data: any }>('/api/db', {
      method: 'POST',
      body: JSON.stringify({ table: 'profiles', op: 'select', filters: [{ col: 'user_id', op: 'eq', value: user.id }], maybeSingle: true }),
    }).then(res => {
      const d = res.data; if (!d) return;
      setPhone(d.phone ?? ''); setUsername(d.username ?? ''); setAvatarUrl(d.avatar_url ?? null);
      setCreatedAt(d.created_at ?? null);
      if (d.full_name) setFullName(d.full_name);
      if (d.email) setEmail(d.email);
    }).catch(() => {});
  }, [user]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !user) return;
    if (!file.type.startsWith('image/')) return toast.error('Please select an image file');
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be smaller than 5 MB');
    setUploading(true);
    try {
      const res = await apiUpload('avatars', file, `${user.id}/avatar-${Date.now()}.${file.name.split('.').pop()?.toLowerCase() || 'png'}`);
      await apiFetch('/api/db', { method: 'POST', body: JSON.stringify({ table: 'profiles', op: 'update', values: { avatar_url: res.url }, filters: [{ col: 'user_id', op: 'eq', value: user.id }] }) });
      setAvatarUrl(res.url); toast.success('Profile picture updated');
    } catch (err) { toast.error((err as Error).message); }
    finally { setUploading(false); }
  };

  const removeAvatar = async () => {
    if (!user) return;
    await apiFetch('/api/db', { method: 'POST', body: JSON.stringify({ table: 'profiles', op: 'update', values: { avatar_url: null }, filters: [{ col: 'user_id', op: 'eq', value: user.id }] }) });
    setAvatarUrl(null); toast.success('Profile picture removed');
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault(); if (!user) return; setSaving(true);
    try {
      await apiFetch('/api/db', { method: 'POST', body: JSON.stringify({ table: 'profiles', op: 'update', values: { full_name: fullName.trim() }, filters: [{ col: 'user_id', op: 'eq', value: user.id }] }) });
      toast.success('Profile saved');
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const saveEmail = async (e: React.FormEvent) => {
    e.preventDefault(); if (!user) return;
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return toast.error('Enter a valid email');
    setSavingEmail(true);
    try { await apiFetch('/api/auth/update-email', { method: 'POST', body: JSON.stringify({ email: trimmed }) }); toast.success('Email updated'); }
    catch (err) { toast.error((err as Error).message); }
    finally { setSavingEmail(false); }
  };

  const roleLabel   = role ? role.replace(/_/g, ' ') : 'Member';
  const memberSince = createdAt ? new Date(createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

  return (
    <div className="divide-y">
      {/* Avatar */}
      <Section title="Profile picture" description="Your photo appears next to your name across the app.">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="relative shrink-0">
            <Avatar className="h-24 w-24 ring-4 ring-background shadow-lg">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName} />}
              <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary text-2xl font-bold">
                {getInitials(fullName)}
              </AvatarFallback>
            </Avatar>
            <label htmlFor="avatar-upload"
              className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-2 cursor-pointer shadow-md hover:bg-primary/90 transition-colors border-2 border-background">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              <input id="avatar-upload" type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} disabled={uploading} />
            </label>
          </div>

          <div className="flex-1 text-center sm:text-left space-y-3">
            <div>
              <p className="text-lg font-bold">{fullName || 'Unnamed user'}</p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-1.5">
                <Badge className="gap-1.5 capitalize text-xs py-0.5"><Shield className="h-3 w-3" />{roleLabel}</Badge>
                {username && <Badge variant="outline" className="text-xs py-0.5">@{username}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center sm:justify-start gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Member since {memberSince}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
              <Button asChild variant="outline" size="sm" disabled={uploading} className="gap-1.5 h-8">
                <label htmlFor="avatar-upload-alt" className="cursor-pointer">
                  <Upload className="h-3.5 w-3.5" /> Upload new photo
                  <input id="avatar-upload-alt" type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} disabled={uploading} />
                </label>
              </Button>
              {avatarUrl && (
                <Button variant="ghost" size="sm" onClick={removeAvatar} className="gap-1.5 h-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                  <Trash className="h-3.5 w-3.5" /> Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PNG, JPG or GIF · Max 5 MB</p>
          </div>
        </div>
      </Section>

      {/* Personal info */}
      <Section title="Personal information" description="Update your display name. Contact an admin to change your username or phone.">
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full name</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} required maxLength={120} placeholder="John Doe" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Username</Label>
              <Input value={username} disabled className="bg-muted/40 cursor-not-allowed" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <PhoneIcon className="h-3 w-3" /> Phone
              </Label>
              <Input value={phone} disabled className="bg-muted/40 cursor-not-allowed" />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">Only your full name can be changed here.</p>
            <Button type="submit" disabled={saving} size="sm" className="gap-2 min-w-[120px]">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save changes
            </Button>
          </div>
        </form>
      </Section>

      {/* Email address */}
      <Section title="Email address" description="Used for account recovery and notifications." noBorder>
        <form onSubmit={saveEmail} className="space-y-4 max-w-sm">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={255} placeholder="you@example.com" className="pl-9" />
            </div>
          </div>
          <Button type="submit" variant="secondary" size="sm" disabled={savingEmail} className="gap-2 min-w-[130px]">
            {savingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}Update email
          </Button>
        </form>
      </Section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   SECURITY TAB
══════════════════════════════════════════════════════════════════════════════ */
function getStrength(pw: string) {
  const checks = {
    length:    pw.length >= 8,
    uppercase: /[A-Z]/.test(pw),
    lowercase: /[a-z]/.test(pw),
    number:    /[0-9]/.test(pw),
    special:   /[^A-Za-z0-9]/.test(pw),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const map: [string, string][] = [
    ['Too short', 'bg-destructive'], ['Weak', 'bg-orange-500'], ['Fair', 'bg-yellow-500'],
    ['Good', 'bg-blue-500'], ['Strong', 'bg-emerald-500'], ['Very strong', 'bg-emerald-600'],
  ];
  const [label, color] = map[score] ?? map[0];
  return { score, label, color, checks };
}
const CHECK_LABELS: Record<string, string> = {
  length:    'At least 8 characters',
  uppercase: 'One uppercase letter (A–Z)',
  lowercase: 'One lowercase letter (a–z)',
  number:    'One number (0–9)',
  special:   'One special character (!@#$…)',
};

function SecurityTab() {
  const [currentPw, setCurrentPw] = useState('');
  const [pw,        setPw]        = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showC,     setShowC]     = useState(false);
  const [showN,     setShowN]     = useState(false);
  const [showF,     setShowF]     = useState(false);
  const [saving,    setSaving]    = useState(false);
  const strength = getStrength(pw);

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPw) return toast.error('Current password is required');
    if (pw.length < 8) return toast.error('New password must be at least 8 characters');
    if (pw !== confirm) return toast.error('Passwords do not match');
    setSaving(true);
    try {
      await apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password: currentPw, password: pw }) });
      toast.success('Password updated'); setCurrentPw(''); setPw(''); setConfirm('');
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const textColor = strength.score <= 1 ? 'text-destructive' : strength.score === 2 ? 'text-orange-500' : strength.score === 3 ? 'text-yellow-600' : strength.score === 4 ? 'text-blue-600' : 'text-emerald-600';

  return (
    <div className="divide-y">
      <Section title="Change password" description="Choose a strong password to keep your account secure. You must enter your current password to set a new one." noBorder>
        <form onSubmit={change} className="space-y-5 max-w-sm">
          {/* Current */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current password</Label>
            <div className="relative">
              <Input type={showC ? 'text' : 'password'} value={currentPw} onChange={e => setCurrentPw(e.target.value)} required className="pr-10" placeholder="Your current password" />
              <EyeBtn show={showC} toggle={() => setShowC(p => !p)} />
            </div>
          </div>

          <Separator />

          {/* New */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New password</Label>
            <div className="relative">
              <Input type={showN ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} required className="pr-10" placeholder="Create a new password" />
              <EyeBtn show={showN} toggle={() => setShowN(p => !p)} />
            </div>

            {/* Strength indicator */}
            {pw.length > 0 && (
              <div className="mt-3 p-4 rounded-xl bg-muted/40 border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium">Password strength</span>
                  <span className={`text-xs font-bold ${textColor}`}>{strength.label}</span>
                </div>
                <div className="flex gap-1.5">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className={`h-2 flex-1 rounded-full transition-all duration-300 ${i <= strength.score ? strength.color : 'bg-muted'}`} />
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(strength.checks).map(([key, passed]) => (
                    <div key={key} className={`flex items-center gap-2 text-xs ${passed ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                      {passed
                        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        : <Circle className="h-3.5 w-3.5 shrink-0" />}
                      {CHECK_LABELS[key]}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Confirm */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Confirm new password</Label>
            <div className="relative">
              <Input type={showF ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} required className="pr-10" placeholder="Repeat new password" />
              <EyeBtn show={showF} toggle={() => setShowF(p => !p)} />
            </div>
            {confirm.length > 0 && (
              <p className={`text-xs flex items-center gap-1.5 mt-1 ${pw === confirm ? 'text-emerald-600' : 'text-destructive'}`}>
                {pw === confirm ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                {pw === confirm ? 'Passwords match' : 'Passwords do not match'}
              </p>
            )}
          </div>

          <Button type="submit" disabled={saving || (confirm.length > 0 && pw !== confirm)} className="gap-2 w-full sm:w-auto min-w-[140px]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Update password
          </Button>
        </form>
      </Section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   CHURCH TAB
══════════════════════════════════════════════════════════════════════════════ */
function ChurchTab() {
  const [info, setInfo] = useState<ChurchInfo>(DEFAULT_CHURCH);
  useEffect(() => { try { const s = localStorage.getItem(CHURCH_INFO_KEY); if (s) setInfo({ ...DEFAULT_CHURCH, ...JSON.parse(s) }); } catch {} }, []);

  const save = (e: React.FormEvent) => {
    e.preventDefault(); localStorage.setItem(CHURCH_INFO_KEY, JSON.stringify(info)); toast.success('Church information saved');
  };

  return (
    <form onSubmit={save} className="divide-y">
      <Section title="Identity" description="Your church's name and branch information. Used in reports and receipts.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Church name</Label>
            <Input value={info.name} onChange={e => setInfo({ ...info, name: e.target.value })} placeholder="Africa Gospel Church" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Branch</Label>
            <Input value={info.branch} onChange={e => setInfo({ ...info, branch: e.target.value })} placeholder="Cheswerta" />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Address</Label>
            <Textarea value={info.address} onChange={e => setInfo({ ...info, address: e.target.value })} rows={2} placeholder="Street, Town, County" />
          </div>
        </div>
      </Section>

      <Section title="Contact details" description="How to reach the church for official matters.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone</Label>
            <Input type="tel" value={info.phone} onChange={e => setInfo({ ...info, phone: e.target.value })} placeholder="+254 700 000000" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</Label>
            <Input type="email" value={info.email} onChange={e => setInfo({ ...info, email: e.target.value })} placeholder="church@example.com" />
          </div>
        </div>
      </Section>

      <Section title="Leadership & format" description="Senior leadership and localisation preferences." noBorder>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Senior pastor</Label>
            <Input value={info.pastor} onChange={e => setInfo({ ...info, pastor: e.target.value })} placeholder="Rev. Name" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Currency code</Label>
            <Input value={info.currency} onChange={e => setInfo({ ...info, currency: e.target.value.toUpperCase() })} maxLength={5} placeholder="KES" />
          </div>
        </div>
        <div className="flex justify-end mt-5">
          <Button type="submit" className="gap-2 min-w-[140px]"><Building2 className="h-4 w-4" />Save church info</Button>
        </div>
      </Section>
    </form>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   DEPARTMENTS TAB
══════════════════════════════════════════════════════════════════════════════ */
function DepartmentsTab() {
  const [items,   setItems]   = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form,    setForm]    = useState({ name: '', description: '', leader_name: '' });
  const [saving,  setSaving]  = useState(false);

  const load = async () => {
    setLoading(true);
    try { const res = await apiFetch<{ data: Department[] }>('/api/db', { method: 'POST', body: JSON.stringify({ table: 'departments', op: 'select', order: [{ col: 'name', ascending: true }] }) }); setItems(res.data ?? []); }
    catch (err) { toast.error((err as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setForm({ name: '', description: '', leader_name: '' }); setEditing(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const payload = { name: form.name.trim(), description: form.description.trim() || null, leader_name: form.leader_name.trim() || null };
    try {
      await apiFetch('/api/db', { method: 'POST', body: JSON.stringify(editing
        ? { table: 'departments', op: 'update', values: payload, filters: [{ col: 'id', op: 'eq', value: editing.id }] }
        : { table: 'departments', op: 'insert', values: payload }) });
      toast.success(editing ? 'Updated' : 'Added'); setOpen(false); reset(); load();
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    try { await apiFetch('/api/db', { method: 'POST', body: JSON.stringify({ table: 'departments', op: 'delete', filters: [{ col: 'id', op: 'eq', value: id }] }) }); toast.success('Removed'); load(); }
    catch (err) { toast.error((err as Error).message); }
  };

  return (
    <div className="divide-y">
      <Section title="Departments" description="Create and manage church departments. These appear in the member ministry dropdown." noBorder>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">{items.length} department{items.length !== 1 ? 's' : ''}</p>
          <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" />Add department</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editing ? 'Edit department' : 'New department'}</DialogTitle>
                <DialogDescription>Departments group members for ministry activities.</DialogDescription>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4 pt-2">
                {[
                  { label: 'Name *', key: 'name', required: true, maxLength: 80 },
                  { label: 'Leader name', key: 'leader_name', maxLength: 120 },
                ].map(f => (
                  <div key={f.key} className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{f.label}</Label>
                    <Input value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} required={f.required} maxLength={f.maxLength} />
                  </div>
                ))}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</Label>
                  <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} maxLength={500} />
                </div>
                <DialogFooter>
                  <Button variant="outline" type="button" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={saving} className="gap-2 min-w-[80px]">
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border rounded-xl bg-muted/20">
            <UsersIcon className="h-10 w-10 opacity-20 mb-2" />
            <p className="text-sm">No departments yet</p>
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="font-semibold">Name</TableHead>
                <TableHead className="font-semibold">Leader</TableHead>
                <TableHead className="hidden md:table-cell font-semibold">Description</TableHead>
                <TableHead className="text-right font-semibold">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {items.map(d => (
                  <TableRow key={d.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{d.leader_name ?? '—'}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm max-w-xs truncate">{d.description ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(d); setForm({ name: d.name, description: d.description ?? '', leader_name: d.leader_name ?? '' }); setOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></AlertDialogTrigger>
                          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {d.name}?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(d.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   DATA & EXPORT TAB
══════════════════════════════════════════════════════════════════════════════ */
function DataTab() {
  const [busy, setBusy] = useState<string | null>(null);

  const exportCsv = async (table: string) => {
    setBusy(table);
    try {
      const res = await apiFetch<{ data: any[] }>('/api/db', { method: 'POST', body: JSON.stringify({ table, op: 'select' }) });
      const data = res.data ?? [];
      if (data.length === 0) return toast.info('No data to export');
      const headers = Object.keys(data[0]);
      const rows = data.map(row => headers.map(h => { const v = (row as any)[h]; return `"${v == null ? '' : String(v).replace(/"/g, '""')}"`; }).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `${table}-${new Date().toISOString().slice(0,10)}.csv`; a.click();
      toast.success(`${table} exported`);
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(null); }
  };

  const exports = [
    { key: 'members',     label: 'Members',     desc: 'All member records including contact and baptism details', color: 'bg-primary/10 text-primary' },
    { key: 'givings',     label: 'Givings',     desc: 'Complete financial records — tithes, offerings and more', color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' },
    { key: 'attendance',  label: 'Attendance',  desc: 'All service attendance records with demographic breakdown', color: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400' },
    { key: 'departments', label: 'Departments', desc: 'Department and ministry records', color: 'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400' },
  ];

  return (
    <div className="divide-y">
      <Section title="Export data" description="Download your church data as CSV files for backup, archival or external analysis." noBorder>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {exports.map(e => (
            <div key={e.key} className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-muted/20 transition-colors">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${e.color}`}>
                <FileDown className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{e.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{e.desc}</p>
              </div>
              <Button variant="outline" size="sm" disabled={busy === e.key} onClick={() => exportCsv(e.key)} className="shrink-0 gap-1.5 min-w-[80px]">
                {busy === e.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}CSV
              </Button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}