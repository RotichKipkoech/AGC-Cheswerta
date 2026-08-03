import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, UserPlus, Loader2, X, Lock, Unlock, Search, Users as UsersIcon, Shield, Filter, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { AppRole, useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';

type ManagedUser = {
  user_id: string; full_name: string; username: string | null;
  email: string | null; phone: string | null; role: AppRole | null;
  is_active: boolean; created_at: string;
};

type CreateFormState = { full_name: string; username: string; phone: string; role: AppRole; password: string; };
type EditFormState   = { full_name: string; username: string; phone: string; role: AppRole | ''; password: string; };

const ALL_ROLES: AppRole[] = ['super_admin', 'admin', 'pastor', 'secretary', 'treasurer', 'ministry_leader', 'lay_leader'];
const INIT_CREATE: CreateFormState = { full_name: '', username: '', phone: '', role: 'ministry_leader', password: '' };
const INIT_EDIT: EditFormState    = { full_name: '', username: '', phone: '', role: '', password: '' };

const ROLE_COLORS: Record<string, string> = {
  super_admin:     'bg-destructive/10 text-destructive border-destructive/20',
  admin:           'bg-primary/10 text-primary border-primary/20',
  pastor:          'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400',
  secretary:       'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400',
  treasurer:       'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400',
  ministry_leader: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-400',
  lay_leader:      'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-400',
};

function Modal({ open, title, subtitle, onClose, children }: {
  open: boolean; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-background rounded-2xl shadow-2xl w-full max-w-md border">
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b px-6 py-4 flex items-start justify-between rounded-t-2xl">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted ml-3 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function CreateForm({ form, setForm, error, submitting, visibleRoles, onSubmit, onCancel }: {
  form: CreateFormState; setForm: React.Dispatch<React.SetStateAction<CreateFormState>>;
  error: string; submitting: boolean; visibleRoles: AppRole[];
  onSubmit: (e: React.FormEvent) => void; onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <div className="rounded-xl bg-destructive/10 text-destructive text-sm px-4 py-3 border border-destructive/20">{error}</div>}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name *</Label>
        <Input required value={form.full_name} maxLength={120} placeholder="John Doe" onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Username *</Label>
          <Input required value={form.username} maxLength={40} placeholder="johndoe" autoCapitalize="none"
            onChange={e => setForm(p => ({ ...p, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone</Label>
          <Input type="tel" value={form.phone} maxLength={20} placeholder="+254 7XX XXX XXX" onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role *</Label>
        <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v as AppRole }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{visibleRoles.map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Temporary Password *</Label>
        <Input required type="text" value={form.password} minLength={8} maxLength={72} placeholder="Min. 8 characters" onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
        <p className="text-xs text-muted-foreground">Share this securely. The user can change it after first login.</p>
      </div>
      <div className="flex justify-end gap-2 pt-3 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting} className="gap-2 min-w-[120px]">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}Create User
        </Button>
      </div>
    </form>
  );
}

function EditForm({ form, setForm, error, submitting, visibleRoles, onSubmit, onCancel }: {
  form: EditFormState; setForm: React.Dispatch<React.SetStateAction<EditFormState>>;
  error: string; submitting: boolean; visibleRoles: AppRole[];
  onSubmit: (e: React.FormEvent) => void; onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <div className="rounded-xl bg-destructive/10 text-destructive text-sm px-4 py-3 border border-destructive/20">{error}</div>}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name *</Label>
        <Input required value={form.full_name} maxLength={120} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Username *</Label>
          <Input required value={form.username} maxLength={40} autoCapitalize="none" onChange={e => setForm(p => ({ ...p, username: e.target.value.toLowerCase() }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone</Label>
          <Input type="tel" value={form.phone} maxLength={20} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</Label>
        <Select value={form.role || '__keep__'} onValueChange={v => setForm(p => ({ ...p, role: v === '__keep__' ? '' : v as AppRole }))}>
          <SelectTrigger><SelectValue placeholder="Keep current role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__keep__">— Keep current role —</SelectItem>
            {visibleRoles.map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Password <span className="normal-case font-normal">(optional)</span></Label>
        <Input type="text" value={form.password} maxLength={72} placeholder="Leave blank to keep current" onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
      </div>
      <div className="flex justify-end gap-2 pt-3 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting} className="min-w-[120px]">
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save Changes
        </Button>
      </div>
    </form>
  );
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0,2).map(n => n[0] ?? '').join('').toUpperCase() || '?';
}

export default function Users() {
  const { role: myRole } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ManagedUser | null>(null);
  const [createForm, setCreateForm] = useState<CreateFormState>(INIT_CREATE);
  const [editForm, setEditForm] = useState<EditFormState>(INIT_EDIT);
  const [createError, setCreateError] = useState('');
  const [editError, setEditError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<AppRole | 'all'>('all');

  const visibleRoles = myRole === 'super_admin' ? ALL_ROLES : ALL_ROLES.filter(r => r !== 'super_admin');

  const callFn = async (body: Record<string, unknown>) => {
    const data = await apiFetch<any>('/api/admin/users', { method: 'POST', body: JSON.stringify(body) });
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const load = async () => {
    setLoading(true);
    try { const data = await callFn({ action: 'list' }); setUsers(data.users ?? []); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (u.full_name ?? '').toLowerCase().includes(s) || (u.username ?? '').toLowerCase().includes(s);
  }), [users, search, roleFilter]);

  const stats = useMemo(() => ({
    total:  users.length,
    active: users.filter(u => u.is_active).length,
    locked: users.filter(u => !u.is_active).length,
  }), [users]);

  const openCreate = () => { setCreateForm(INIT_CREATE); setCreateError(''); setCreateOpen(true); };
  const openEdit = (u: ManagedUser) => {
    setEditForm({ full_name: u.full_name || '', username: u.username ?? '', phone: u.phone ?? '', role: u.role ?? '', password: '' });
    setEditError(''); setEditTarget(u);
  };

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault(); setCreateError('');
    if (!createForm.username.trim()) { setCreateError('Username is required'); return; }
    if (createForm.password.length < 8) { setCreateError('Password must be at least 8 characters'); return; }
    setSubmitting(true);
    try {
      await callFn({ action: 'create', ...createForm, username: createForm.username.trim().toLowerCase() });
      toast.success(`User @${createForm.username} created`);
      setCreateOpen(false); setCreateForm(INIT_CREATE); await load();
    } catch (e) { setCreateError((e as Error).message); }
    finally { setSubmitting(false); }
  }, [createForm]);

  const handleUpdate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault(); setEditError('');
    if (!editTarget) return;
    const payload: Record<string, unknown> = {
      action: 'update', user_id: editTarget.user_id,
      full_name: editForm.full_name, username: editForm.username.toLowerCase(), phone: editForm.phone || null,
    };
    if (editForm.role) payload.role = editForm.role;
    if (editForm.password) payload.password = editForm.password;
    setSubmitting(true);
    try {
      await callFn(payload); toast.success('User updated'); setEditTarget(null); await load();
    } catch (e) { setEditError((e as Error).message); }
    finally { setSubmitting(false); }
  }, [editForm, editTarget]);

  const toggleActive = async (u: ManagedUser) => {
    try {
      await callFn({ action: u.is_active ? 'deactivate' : 'activate', user_id: u.user_id });
      toast.success(u.is_active ? 'Account locked' : 'Account unlocked'); await load();
    } catch (e) { toast.error((e as Error).message); }
  };

  const handleDelete = async (userId: string, name: string) => {
    try { await callFn({ action: 'delete', user_id: userId }); toast.success(`${name} deleted`); await load(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="animate-fade-in space-y-5">
      <Modal open={createOpen} title="Create New User" subtitle="The account is active immediately after creation." onClose={() => setCreateOpen(false)}>
        <CreateForm form={createForm} setForm={setCreateForm} error={createError} submitting={submitting}
          visibleRoles={visibleRoles} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} />
      </Modal>
      <Modal open={!!editTarget} title="Edit User" subtitle="Leave password blank to keep the current one." onClose={() => setEditTarget(null)}>
        <EditForm form={editForm} setForm={setEditForm} error={editError} submitting={submitting}
          visibleRoles={visibleRoles} onSubmit={handleUpdate} onCancel={() => setEditTarget(null)} />
      </Modal>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage system users and their roles</p>
        </div>
        <Button onClick={openCreate} className="gap-2 shrink-0"><UserPlus className="h-4 w-4" />New User</Button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Users", value: stats.total,  icon: UsersIcon, color: "text-primary",    bg: "bg-primary/10" },
          { label: "Active",      value: stats.active, icon: Unlock,    color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950" },
          { label: "Locked",      value: stats.locked, icon: Lock,      color: "text-destructive", bg: "bg-destructive/10" },
        ].map(s => (
          <Card key={s.label} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.bg}`}>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <div><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-xl font-bold tabular-nums">{s.value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + filter */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search name or username…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-2 shrink-0">
              <Select value={roleFilter} onValueChange={v => setRoleFilter(v as any)}>
                <SelectTrigger className="w-full sm:w-44 h-10">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /><SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {ALL_ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="shrink-0" onClick={load} title="Refresh">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2">
              <UsersIcon className="h-10 w-10 opacity-20" />
              <p className="text-sm">{search || roleFilter !== 'all' ? 'No users match filters' : 'No users yet'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-semibold">User</TableHead>
                    <TableHead className="font-semibold">Role</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="hidden md:table-cell font-semibold">Phone</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(u => {
                    const initials = getInitials(u.full_name || u.username || '?');
                    const roleStyle = ROLE_COLORS[u.role ?? ''] ?? 'bg-muted text-muted-foreground';
                    return (
                      <TableRow key={u.user_id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{u.full_name || '—'}</p>
                              <p className="text-xs text-muted-foreground">@{u.username ?? '—'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-semibold capitalize ${roleStyle}`}>
                            <Shield className="h-3 w-3 shrink-0" />
                            {u.role?.replace(/_/g, ' ') ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {u.is_active
                            ? <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-semibold bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400">
                                <Unlock className="h-3 w-3" />Active
                              </span>
                            : <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-semibold bg-destructive/10 text-destructive border-destructive/20">
                                <Lock className="h-3 w-3" />Locked
                              </span>}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{u.phone ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => openEdit(u)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title={u.is_active ? 'Lock' : 'Unlock'} onClick={() => toggleActive(u)}>
                              {u.is_active ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="Delete">
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete {u.full_name}?</AlertDialogTitle>
                                  <AlertDialogDescription>This permanently removes the user and revokes all access. This cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(u.user_id, u.full_name)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}