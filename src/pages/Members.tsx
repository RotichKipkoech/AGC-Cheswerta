import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, Plus, Edit, Trash2, Eye, Loader2, X, Users, UserCheck, UserX, Filter, UploadCloud, Phone, User, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";
import { BulkImportDialog } from "@/components/BulkImportDialog";
import { toast } from "sonner";

type Member = {
  id: string; full_name: string; phone: string | null;
  gender: string | null;
  baptism_status: string | null; department: string | null;
  join_date: string | null; status: string;
};
type FormState = {
  firstName: string; lastName: string; phone: string;
  gender: string;
  baptism_status: string; department: string; status: string;
};
type MembersResponse = {
  members: Member[]; total: number; page: number; pages: number; per_page: number;
};

const MINISTRIES = ["Men","Women","Youth","Children","Choir","Sunday School","Evangelism","Mission","Compassion","Education","Discipleship"];
const INIT_FORM: FormState = { firstName:"", lastName:"", phone:"", gender:"", baptism_status:"", department:"", status:"active" };
const PER_PAGE = 20;

function Modal({ open, title, wide, onClose, children }: { open: boolean; title: string; wide?: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 bg-background rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[92vh] overflow-y-auto border`}>
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function MemberForm({ form, setForm, saving, onSubmit, onCancel, isEdit }: {
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  saving: boolean; onSubmit: (e: React.FormEvent) => void; onCancel: () => void; isEdit: boolean;
}) {
  const set = (k: keyof FormState) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">First Name *</Label><Input required value={form.firstName} placeholder="John" maxLength={80} onChange={e => set("firstName")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Name *</Label><Input required value={form.lastName} placeholder="Doe" maxLength={80} onChange={e => set("lastName")(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone</Label><Input type="tel" value={form.phone} placeholder="+254 700 000000" maxLength={20} onChange={e => set("phone")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gender</Label>
          <Select value={form.gender || "__none__"} onValueChange={v => set("gender")(v === "__none__" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Not specified" /></SelectTrigger>
            <SelectContent><SelectItem value="__none__">— Not specified —</SelectItem><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem></SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Baptism Status</Label>
          <Select value={form.baptism_status || "__none__"} onValueChange={v => set("baptism_status")(v === "__none__" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Not specified" /></SelectTrigger>
            <SelectContent><SelectItem value="__none__">— Not specified —</SelectItem><SelectItem value="Baptized">Baptized</SelectItem><SelectItem value="Not Baptized">Not Baptized</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ministry Group</Label>
          <Select value={form.department || "__none__"} onValueChange={v => set("department")(v === "__none__" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Select ministry" /></SelectTrigger>
            <SelectContent><SelectItem value="__none__">— Not specified —</SelectItem>{MINISTRIES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</Label>
        <Select value={form.status} onValueChange={set("status")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="visitor">Visitor</SelectItem></SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2 pt-3 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving} className="min-w-[120px]">{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}{isEdit ? "Update Member" : "Register Member"}</Button>
      </div>
    </form>
  );
}

const statusBadge = (s: string) => {
  if (s === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400';
  if (s === 'inactive') return 'bg-muted text-muted-foreground';
  return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400';
};

/** Numbered page control: 1 … [current-1] [current] [current+1] … last,
 * collapsing with ellipses once there are more pages than fit comfortably. */
function PageNumbers({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  const items = useMemo(() => {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    const set = new Set<number>([1, pages, page, page - 1, page + 1]);
    return Array.from(set).filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  }, [page, pages]);

  const withGaps: (number | "gap")[] = [];
  items.forEach((n, i) => {
    if (i > 0 && n - (items[i - 1] as number) > 1) withGaps.push("gap");
    withGaps.push(n);
  });

  return (
    <div className="flex items-center gap-1">
      {withGaps.map((n, i) =>
        n === "gap" ? (
          <span key={`gap-${i}`} className="px-1.5 text-sm text-muted-foreground">…</span>
        ) : (
          <Button
            key={n}
            size="sm"
            variant={n === page ? "default" : "outline"}
            className="h-8 min-w-8 px-2.5 tabular-nums"
            onClick={() => onChange(n)}
          >
            {n}
          </Button>
        )
      )}
    </div>
  );
}

export default function Members() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [globalStats, setGlobalStats] = useState({ total: 0, active: 0, baptized: 0 });

  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Member | null>(null);
  const [viewTarget, setViewTarget] = useState<Member | null>(null);
  const [form, setForm] = useState<FormState>(INIT_FORM);
  const [saving, setSaving] = useState(false);

  // Debounce the search box so we're not hitting the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Any time the search text or status filter actually changes, go back to page 1.
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const r = await apiFetch<MembersResponse>(`/api/members?${params}`);
      setMembers(r.members ?? []);
      setPages(Math.max(r.pages ?? 1, 1));
      setTotal(r.total ?? 0);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Global summary cards (Total / Active / Baptized) reflect the whole
  // roster, independent of the current search/filter/page — each is a
  // cheap per_page=1 request, reading only the `total` count back.
  const loadGlobalStats = useCallback(async () => {
    try {
      const countOf = async (qs: string) => {
        const r = await apiFetch<MembersResponse>(`/api/members?per_page=1${qs}`);
        return r.total ?? 0;
      };
      const [t, active, baptized] = await Promise.all([
        countOf(""),
        countOf("&status=active"),
        countOf("&baptism_status=Baptized"),
      ]);
      setGlobalStats({ total: t, active, baptized });
    } catch { /* summary cards are non-critical — fail quietly */ }
  }, []);

  useEffect(() => { loadGlobalStats(); }, [loadGlobalStats]);

  const refreshAll = () => { load(); loadGlobalStats(); };

  const openAdd = () => { setForm(INIT_FORM); setAddOpen(true); };
  const openEdit = (m: Member) => {
    const [first = "", ...rest] = m.full_name.trim().split(" ");
    setForm({ firstName: first, lastName: rest.join(" "), phone: m.phone ?? "", gender: m.gender ?? "", baptism_status: m.baptism_status ?? "", department: m.department ?? "", status: m.status });
    setEditTarget(m);
  };

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const full_name = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
    if (!full_name) { toast.error("First name is required"); setSaving(false); return; }
    const payload = { full_name, phone: form.phone || null,  gender: form.gender || null, baptism_status: form.baptism_status || null, department: form.department || null, status: form.status };
    try {
      if (editTarget) {
        await apiFetch(`/api/members/${editTarget.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast.success("Member updated");
        setEditTarget(null);
      } else {
        const created = await apiFetch<any>("/api/members", { method: "POST", body: JSON.stringify(payload) });
        setAddOpen(false);
        // Primary success toast
        toast.success(`${form.firstName.trim()} registered successfully!`);
        // Secondary SMS status toast
        const smsStatus: string = created?.sms_status ?? "";
        if (smsStatus === "sent" || smsStatus === "queued") {
          toast.success("Welcome SMS sent to member.");
        } else if (smsStatus === "no_phone") {
          toast.info("No phone number — welcome SMS skipped.");
        } else if (smsStatus === "no_provider") {
          toast.info("SMS not configured — welcome SMS skipped.");
        } else if (smsStatus.startsWith("failed:")) {
          toast.warning("Welcome SMS failed — will retry automatically.");
        }
      }
      refreshAll();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }, [form, editTarget]);

  const deleteMember = async (id: string) => {
    try {
      const res = await apiFetch<{ pending?: boolean; message?: string }>(`/api/members/${id}`, { method: "DELETE" });
      toast.success(res?.pending ? (res.message || "Deletion requested — pending admin approval") : "Member removed");
      refreshAll();
    } catch (e) { toast.error((e as Error).message); }
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const rangeEnd = Math.min(page * PER_PAGE, total);

  return (
    <div className="animate-fade-in space-y-5">
      <Modal open={addOpen} title="Register New Member" onClose={() => setAddOpen(false)}>
        <MemberForm form={form} setForm={setForm} saving={saving} onSubmit={submit} onCancel={() => setAddOpen(false)} isEdit={false} />
      </Modal>
      <Modal open={!!editTarget} title="Edit Member" onClose={() => setEditTarget(null)}>
        <MemberForm form={form} setForm={setForm} saving={saving} onSubmit={submit} onCancel={() => setEditTarget(null)} isEdit={true} />
      </Modal>
      <Modal open={!!viewTarget} title="Member Details" onClose={() => setViewTarget(null)}>
        {viewTarget && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 pb-4 border-b">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xl font-bold text-primary">
                  {viewTarget.full_name.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase()}
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold">{viewTarget.full_name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${statusBadge(viewTarget.status)}`}>{viewTarget.status}</span>
                  {viewTarget.baptism_status && <Badge variant={viewTarget.baptism_status === "Baptized" ? "default" : "secondary"} className="text-xs">{viewTarget.baptism_status}</Badge>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
              {[
                { label: "Phone", value: viewTarget.phone, icon: Phone },
                { label: "Gender", value: viewTarget.gender, icon: User },
                { label: "Ministry", value: viewTarget.department, icon: Users },
                { label: "Joined", value: viewTarget.join_date ? new Date(viewTarget.join_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null, icon: Calendar },
              ].map(f => (
                <div key={f.label} className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <f.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">{f.label}</p>
                    <p className="font-medium truncate">{f.value ?? "—"}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{globalStats.total} registered members</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => setBulkOpen(true)} className="gap-2">
            <UploadCloud className="h-4 w-4" /> Bulk Import
          </Button>
          <Button onClick={openAdd} className="gap-2"><Plus className="h-4 w-4" /> Add Member</Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: globalStats.total, icon: Users, color: "text-primary", bg: "bg-primary/10" },
          { label: "Active", value: globalStats.active, icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950" },
          { label: "Baptized", value: globalStats.baptized, icon: UserX, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950" },
        ].map(s => (
          <Card key={s.label} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg} shrink-0`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-xl font-bold tabular-nums">{s.value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + Filter */}
      <Card>
        <CardContent className="p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search name, phone, ministry…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 shrink-0"><Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="visitor">Visitor</SelectItem></SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…</div> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-semibold">Name</TableHead>
                    <TableHead className="hidden md:table-cell font-semibold">Phone</TableHead>
                    <TableHead className="hidden lg:table-cell font-semibold">Gender</TableHead>
                    <TableHead className="font-semibold">Ministry</TableHead>
                    <TableHead className="hidden md:table-cell font-semibold">Baptism</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.length === 0
                    ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                        <Users className="h-10 w-10 mx-auto mb-2 opacity-20" />
                        <p>No members found</p>
                      </TableCell></TableRow>
                    : members.map(m => {
                      const initials = m.full_name.split(' ').slice(0,2).map(n=>n[0]??'').join('').toUpperCase();
                      return (
                        <TableRow key={m.id} className="hover:bg-muted/30">
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">{initials}</div>
                              <span className="font-medium">{m.full_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">{m.phone ?? "—"}</TableCell>
                          <TableCell className="hidden lg:table-cell text-muted-foreground">{m.gender ?? "—"}</TableCell>
                          <TableCell>{m.department ? <Badge variant="secondary" className="text-xs">{m.department}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant={m.baptism_status === "Baptized" ? "default" : "outline"} className="text-xs">{m.baptism_status ?? "—"}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${statusBadge(m.status)}`}>{m.status}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-0.5">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewTarget(m)}><Eye className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)}><Edit className="h-3.5 w-3.5" /></Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></AlertDialogTrigger>
                                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove {m.full_name}?</AlertDialogTitle><AlertDialogDescription>This sends a deletion request for admin approval — {m.full_name} stays until it's approved.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteMember(m.id)}>Request deletion</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
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

          {/* Pagination footer */}
          {!loading && total > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Showing <span className="font-medium text-foreground">{rangeStart}–{rangeEnd}</span> of{" "}
                <span className="font-medium text-foreground">{total}</span> members
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline" size="sm" className="h-8 w-8 p-0"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <PageNumbers page={page} pages={pages} onChange={setPage} />
                <Button
                  variant="outline" size="sm" className="h-8 w-8 p-0"
                  disabled={page >= pages}
                  onClick={() => setPage(p => Math.min(pages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <BulkImportDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        defaultResource="members"
        lockResource
        onImported={refreshAll}
      />
    </div>
  );
}