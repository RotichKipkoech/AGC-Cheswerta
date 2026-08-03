import { useEffect, useState, useCallback } from "react";
import { Plus, Edit, Trash2, Loader2, X, Phone, Mail, ShieldCheck, UserX, Search, UserPlus, Link2, Crown, Gavel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

type CouncilMember = {
  id: string;
  member_id: string | null;
  full_name: string;
  role: string;
  phone: string;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  linked_member: boolean;
  created_at: string;
};

type AvailableMember = { id: string; full_name: string; phone: string | null; email: string | null; department: string | null };

type ExistingFormState = { member_id: string; role: string; notes: string; is_active: boolean };
type ManualFormState = { full_name: string; role: string; phone: string; email: string; notes: string; is_active: boolean };
type EditFormState = { role: string; notes: string; is_active: boolean; full_name: string; phone: string; email: string };

const INIT_EXISTING: ExistingFormState = { member_id: "", role: "", notes: "", is_active: true };
const INIT_MANUAL: ManualFormState = { full_name: "", role: "", phone: "", email: "", notes: "", is_active: true };

// Rotating accent palette — gives each card a distinct but harmonious identity
const ACCENT_PALETTE = [
  { bar: "bg-violet-500", chip: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-400", avatar: "from-violet-500/25 to-violet-500/10 text-violet-700 dark:text-violet-300" },
  { bar: "bg-blue-500",   chip: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400",         avatar: "from-blue-500/25 to-blue-500/10 text-blue-700 dark:text-blue-300" },
  { bar: "bg-emerald-500",chip: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400", avatar: "from-emerald-500/25 to-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  { bar: "bg-amber-500",  chip: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400",     avatar: "from-amber-500/25 to-amber-500/10 text-amber-700 dark:text-amber-300" },
  { bar: "bg-rose-500",   chip: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-400",         avatar: "from-rose-500/25 to-rose-500/10 text-rose-700 dark:text-rose-300" },
  { bar: "bg-teal-500",   chip: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-400",         avatar: "from-teal-500/25 to-teal-500/10 text-teal-700 dark:text-teal-300" },
];

// Senior leadership roles get a crown icon instead of a shield
const SENIOR_ROLE_PATTERN = /chair|bishop|overseer|president|head/i;

function accentFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length];
}

function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
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
      <div className="relative z-10 bg-background rounded-2xl shadow-2xl w-full max-w-md border max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export default function CouncilMembers() {
  const [items, setItems] = useState<CouncilMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CouncilMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Add — "from existing member" tab
  const [addTab, setAddTab] = useState<"existing" | "manual">("existing");
  const [availableMembers, setAvailableMembers] = useState<AvailableMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [existingForm, setExistingForm] = useState<ExistingFormState>(INIT_EXISTING);
  const [manualForm, setManualForm] = useState<ManualFormState>(INIT_MANUAL);

  // Edit
  const [editForm, setEditForm] = useState<EditFormState>({ role: "", notes: "", is_active: true, full_name: "", phone: "", email: "" });

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiFetch<{ council_members: CouncilMember[] }>("/api/council-members");
      setItems(r.council_members ?? []);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const loadAvailableMembers = useCallback(async (q: string) => {
    setLoadingMembers(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const r = await apiFetch<{ members: AvailableMember[] }>(`/api/council-members/available-members?${params}`);
      setAvailableMembers(r.members ?? []);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoadingMembers(false); }
  }, []);

  const openAdd = () => {
    setAddTab("existing");
    setExistingForm(INIT_EXISTING);
    setManualForm(INIT_MANUAL);
    setMemberSearch("");
    setError("");
    setAddOpen(true);
    loadAvailableMembers("");
  };

  const openEdit = (c: CouncilMember) => {
    setEditForm({ role: c.role, notes: c.notes ?? "", is_active: c.is_active, full_name: c.full_name, phone: c.phone, email: c.email ?? "" });
    setError("");
    setEditTarget(c);
  };

  // Debounced search
  useEffect(() => {
    if (!addOpen || addTab !== "existing") return;
    const t = setTimeout(() => loadAvailableMembers(memberSearch), 300);
    return () => clearTimeout(t);
  }, [memberSearch, addOpen, addTab, loadAvailableMembers]);

  const submitExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!existingForm.member_id) { setError("Select a member first"); return; }
    if (!existingForm.role.trim()) { setError("Role is required"); return; }
    setSaving(true); setError("");
    try {
      await apiFetch("/api/council-members", {
        method: "POST",
        body: JSON.stringify({
          member_id: existingForm.member_id,
          role: existingForm.role.trim(),
          notes: existingForm.notes.trim() || null,
          is_active: existingForm.is_active,
        }),
      });
      toast.success("Added to council!");
      setAddOpen(false);
      load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const full_name = manualForm.full_name.trim();
    const role = manualForm.role.trim();
    const phone = manualForm.phone.trim();
    if (!full_name) { setError("Full name is required"); return; }
    if (!role) { setError("Role is required"); return; }
    if (!phone) { setError("Phone number is required"); return; }
    setSaving(true); setError("");
    try {
      await apiFetch("/api/council-members", {
        method: "POST",
        body: JSON.stringify({
          full_name, role, phone,
          email: manualForm.email.trim() || null,
          notes: manualForm.notes.trim() || null,
          is_active: manualForm.is_active,
        }),
      });
      toast.success("Council member added!");
      setAddOpen(false);
      load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    if (!editForm.role.trim()) { setError("Role is required"); return; }
    setSaving(true); setError("");
    try {
      const payload: any = { role: editForm.role.trim(), notes: editForm.notes.trim() || null, is_active: editForm.is_active };
      if (!editTarget.linked_member) {
        payload.full_name = editForm.full_name.trim();
        payload.phone = editForm.phone.trim();
        payload.email = editForm.email.trim() || null;
      }
      await apiFetch(`/api/council-members/${editTarget.id}`, { method: "PUT", body: JSON.stringify(payload) });
      toast.success("Updated");
      setEditTarget(null);
      load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const deleteItem = async (id: string) => {
    try {
      const res = await apiFetch<{ pending?: boolean; message?: string }>(`/api/council-members/${id}`, { method: "DELETE" });
      toast.success(res?.pending ? (res.message || "Deletion requested — pending admin approval") : "Removed");
      load();
    } catch (e) { toast.error((e as Error).message); }
  };

  const activeCount = items.filter(c => c.is_active).length;
  const selectedMember = availableMembers.find(m => m.id === existingForm.member_id);

  return (
    <div className="animate-fade-in space-y-5">
      {/* ── Add Modal ── */}
      <Modal open={addOpen} title="Add Council Member" onClose={() => { setAddOpen(false); setError(""); }}>
        <Tabs value={addTab} onValueChange={v => { setAddTab(v as any); setError(""); }}>
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="existing" className="gap-1.5"><Link2 className="h-3.5 w-3.5" /> From Existing Member</TabsTrigger>
            <TabsTrigger value="manual" className="gap-1.5"><UserPlus className="h-3.5 w-3.5" /> New Person</TabsTrigger>
          </TabsList>

          {error && <div className="rounded-xl bg-destructive/10 text-destructive text-sm px-4 py-3 border border-destructive/20 mb-4">{error}</div>}

          {/* From existing member */}
          <TabsContent value="existing" className="mt-0">
            <form onSubmit={submitExisting} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Search Members *</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Type a name…" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} />
                </div>

                <div className="border rounded-xl max-h-48 overflow-y-auto divide-y mt-2">
                  {loadingMembers ? (
                    <div className="flex items-center justify-center py-6 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin mr-2" />Searching…</div>
                  ) : availableMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No matching members found.</p>
                  ) : (
                    availableMembers.map(m => (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => setExistingForm(p => ({ ...p, member_id: m.id }))}
                        className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-muted/50 transition-colors ${existingForm.member_id === m.id ? "bg-primary/10" : ""}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{m.full_name}</p>
                          <p className="text-xs text-muted-foreground">{m.phone ?? "No phone"} {m.department ? `· ${m.department}` : ""}</p>
                        </div>
                        {existingForm.member_id === m.id && <ShieldCheck className="h-4 w-4 text-primary shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
                {selectedMember && (
                  <p className="text-xs text-muted-foreground">Selected: <span className="font-medium text-foreground">{selectedMember.full_name}</span></p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Council Role / Title *</Label>
                <Input required maxLength={150} placeholder="e.g. Chairman, Treasurer, Elder" value={existingForm.role} onChange={e => setExistingForm(p => ({ ...p, role: e.target.value }))} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes <span className="normal-case font-normal">(optional)</span></Label>
                <Textarea rows={2} maxLength={300} placeholder="Any additional notes…" value={existingForm.notes} onChange={e => setExistingForm(p => ({ ...p, notes: e.target.value }))} />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving || !existingForm.member_id} className="min-w-[140px]">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add to Council</Button>
              </div>
            </form>
          </TabsContent>

          {/* Manual / new person */}
          <TabsContent value="manual" className="mt-0">
            <form onSubmit={submitManual} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name *</Label>
                <Input required maxLength={150} placeholder="e.g. John Kamau" value={manualForm.full_name} onChange={e => setManualForm(p => ({ ...p, full_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role / Title *</Label>
                <Input required maxLength={150} placeholder="e.g. Chairman, Treasurer, Elder" value={manualForm.role} onChange={e => setManualForm(p => ({ ...p, role: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone Number *</Label>
                <Input required maxLength={50} placeholder="e.g. 0712345678" value={manualForm.phone} onChange={e => setManualForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email <span className="normal-case font-normal">(optional)</span></Label>
                <Input type="email" maxLength={255} placeholder="e.g. john@example.com" value={manualForm.email} onChange={e => setManualForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes <span className="normal-case font-normal">(optional)</span></Label>
                <Textarea rows={2} maxLength={300} placeholder="Any additional notes…" value={manualForm.notes} onChange={e => setManualForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving} className="min-w-[140px]">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add Member</Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </Modal>

      {/* ── Edit Modal ── */}
      <Modal open={!!editTarget} title="Edit Council Member" onClose={() => { setEditTarget(null); setError(""); }}>
        <form onSubmit={submitEdit} className="space-y-4">
          {error && <div className="rounded-xl bg-destructive/10 text-destructive text-sm px-4 py-3 border border-destructive/20">{error}</div>}

          {editTarget?.linked_member && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <Link2 className="h-3.5 w-3.5 shrink-0" />
              Linked to Members — name, phone & email sync automatically from their member profile.
            </div>
          )}

          {!editTarget?.linked_member && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name *</Label>
                <Input required maxLength={150} value={editForm.full_name} onChange={e => setEditForm(p => ({ ...p, full_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone Number *</Label>
                <Input required maxLength={50} value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</Label>
                <Input type="email" maxLength={255} value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role / Title *</Label>
            <Input required maxLength={150} value={editForm.role} onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</Label>
            <Textarea rows={2} maxLength={300} value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
          <div className="flex items-center justify-between rounded-xl border px-4 py-3">
            <div>
              <Label className="text-sm font-medium">Active</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Inactive members are kept on record but hidden from broadcasts.</p>
            </div>
            <Switch checked={editForm.is_active} onCheckedChange={v => setEditForm(p => ({ ...p, is_active: v }))} />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="min-w-[140px]">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Update Member</Button>
          </div>
        </form>
      </Modal>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white p-6 shadow-lg">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/4" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Gavel className="h-5 w-5 opacity-80" />
              <Badge className="bg-white/20 text-white border-0 text-xs">Governance</Badge>
            </div>
            <h1 className="text-2xl font-bold">Church Council</h1>
            <p className="text-white/70 text-sm mt-1">Leadership roster — roles, titles & contact details</p>
          </div>
          <Button variant="secondary" size="sm" className="shrink-0 gap-2 bg-white/20 hover:bg-white/30 text-white border-0" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Council Member
          </Button>
        </div>
        <div className="relative grid grid-cols-3 gap-3 mt-5">
          {[["Total", items.length], ["Active", activeCount], ["Linked to Members", items.filter(c => c.linked_member).length]].map(([l, v]) => (
            <div key={l as string} className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
              <p className="text-white/60 text-xs">{l}</p>
              <p className="text-white font-bold text-xl tabular-nums mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
            <Gavel className="h-10 w-10 text-violet-500/60" />
          </div>
          <p className="font-semibold text-base">No council members yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">Build your leadership roster by linking existing members or adding someone new — chairmen, elders, treasurers, and more.</p>
          <Button onClick={openAdd} className="mt-5 gap-2"><Plus className="h-4 w-4" /> Add Council Member</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(c => {
            const accent = accentFor(c.id);
            const isSenior = SENIOR_ROLE_PATTERN.test(c.role);
            const initials = c.full_name.split(" ").slice(0, 2).map(n => n[0] ?? "").join("").toUpperCase() || "?";
            return (
              <Card key={c.id} className={`overflow-hidden hover:shadow-lg transition-all duration-200 group ${!c.is_active ? "opacity-60" : ""}`}>
                <div className={`h-1.5 w-full ${accent.bar}`} />
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className={`relative w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-gradient-to-br ${accent.avatar} font-bold text-base`}>
                      {initials}
                      {isSenior && (
                        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center shadow-sm ring-2 ring-background">
                          <Crown className="h-3 w-3 text-amber-900" />
                        </div>
                      )}
                    </div>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Edit className="h-3.5 w-3.5" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove {c.full_name}?</AlertDialogTitle>
                            <AlertDialogDescription>This sends a deletion request for admin approval — {c.full_name} stays on the roster until it's approved.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteItem(c.id)}>Request deletion</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 mb-1.5">
                    <h3 className="font-bold text-base leading-tight truncate">{c.full_name}</h3>
                    {c.linked_member && (
                      <span title="Linked to Members"><Link2 className="h-3 w-3 text-muted-foreground shrink-0" /></span>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border mb-3.5 ${accent.chip}`}>
                    <ShieldCheck className="h-3 w-3" /> {c.role}
                  </span>

                  <div className="space-y-1.5 text-sm pt-3 border-t">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-mono text-xs">{c.phone}</span>
                    </div>
                    {c.email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-xs truncate">{c.email}</span>
                      </div>
                    )}
                  </div>

                  {c.notes && <p className="text-xs text-muted-foreground mt-3 pt-3 border-t line-clamp-2 italic">"{c.notes}"</p>}

                  {!c.is_active && (
                    <div className="mt-3 pt-3 border-t flex items-center gap-1.5 text-xs text-muted-foreground">
                      <UserX className="h-3 w-3" /> Inactive
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}