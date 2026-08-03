import { useEffect, useState, useCallback } from "react";
import { Plus, Users, Edit, Trash2, Loader2, X, Church, UserCheck, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";
import { BulkImportDialog } from "@/components/BulkImportDialog";
import { toast } from "sonner";

type Department = { id: string; name: string; description: string | null; leader_name: string | null; member_count: number; };
type FormState = { name: string; description: string; leader_name: string; };

const COLOR_PAIRS = [
  { bar: "bg-primary", icon: "bg-primary/10 text-primary" },
  { bar: "bg-blue-500", icon: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400" },
  { bar: "bg-emerald-500", icon: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" },
  { bar: "bg-orange-500", icon: "bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400" },
  { bar: "bg-purple-500", icon: "bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400" },
  { bar: "bg-teal-500", icon: "bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-400" },
  { bar: "bg-rose-500", icon: "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400" },
  { bar: "bg-indigo-500", icon: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400" },
];
const INIT: FormState = { name: "", description: "", leader_name: "" };

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
      <div className="relative z-10 bg-background rounded-2xl shadow-2xl w-full max-w-md border">
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function DeptForm({ form, setForm, saving, error, onSubmit, onCancel, isEdit }: {
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  saving: boolean; error: string; onSubmit: (e: React.FormEvent) => void; onCancel: () => void; isEdit: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <div className="rounded-xl bg-destructive/10 text-destructive text-sm px-4 py-3 border border-destructive/20">{error}</div>}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Department Name *</Label>
        <Input required maxLength={100} placeholder="e.g. Evangelism, Choir, Men's Ministry" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Leader Name</Label>
        <Input maxLength={100} placeholder="Name of the department leader" value={form.leader_name} onChange={e => setForm(p => ({ ...p, leader_name: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description <span className="normal-case font-normal">(optional)</span></Label>
        <Textarea maxLength={300} rows={3} placeholder="Brief description of the department's mission…" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
      </div>
      <div className="flex justify-end gap-2 pt-3 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving} className="min-w-[140px]">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{isEdit ? "Update Department" : "Create Department"}</Button>
      </div>
    </form>
  );
}

export default function Ministries() {
  const [items, setItems] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Department | null>(null);
  const [form, setForm] = useState<FormState>(INIT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try { const r = await apiFetch<{ departments: Department[] }>("/api/departments"); setItems(r.departments ?? []); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm(INIT); setError(""); setAddOpen(true); };
  const openEdit = (d: Department) => { setForm({ name: d.name, description: d.description ?? "", leader_name: d.leader_name ?? "" }); setError(""); setEditTarget(d); };

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError("");
    const name = form.name.trim();
    if (!name) { setError("Department name is required"); setSaving(false); return; }
    const payload = { name, description: form.description.trim() || null, leader_name: form.leader_name.trim() || null };
    try {
      if (editTarget) { await apiFetch(`/api/departments/${editTarget.id}`, { method: "PUT", body: JSON.stringify(payload) }); toast.success("Department updated"); setEditTarget(null); }
      else { await apiFetch("/api/departments", { method: "POST", body: JSON.stringify(payload) }); toast.success("Department created!"); setAddOpen(false); }
      load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }, [form, editTarget]);

  const deleteItem = async (id: string) => {
    try {
      const res = await apiFetch<{ pending?: boolean; message?: string }>(`/api/departments/${id}`, { method: "DELETE" });
      // Deletes now go through admin approval — the department isn't gone yet,
      // just queued. See the Pending Deletions page for the review queue.
      toast.success(res?.pending ? (res.message || "Deletion requested — pending admin approval") : "Removed");
      load();
    } catch (e) { toast.error((e as Error).message); }
  };

  const totalMembers = items.reduce((a, d) => a + (d.member_count || 0), 0);

  return (
    <div className="animate-fade-in space-y-5">
      <Modal open={addOpen} title="Create Department" onClose={() => { setAddOpen(false); setError(""); }}>
        <DeptForm form={form} setForm={setForm} saving={saving} error={error} onSubmit={submit} onCancel={() => { setAddOpen(false); setError(""); }} isEdit={false} />
      </Modal>
      <Modal open={!!editTarget} title="Edit Department" onClose={() => { setEditTarget(null); setError(""); }}>
        <DeptForm form={form} setForm={setForm} saving={saving} error={error} onSubmit={submit} onCancel={() => { setEditTarget(null); setError(""); }} isEdit={true} />
      </Modal>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Departments & Ministries</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{items.length} departments · {totalMembers} assigned members</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => setBulkOpen(true)} className="gap-2">
            <UploadCloud className="h-4 w-4" /> Bulk Import
          </Button>
          <Button onClick={openAdd} className="gap-2"><Plus className="h-4 w-4" /> New Department</Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Church className="h-5 w-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Departments</p><p className="text-xl font-bold tabular-nums">{items.length}</p></div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center shrink-0"><UserCheck className="h-5 w-5 text-emerald-600" /></div>
            <div><p className="text-xs text-muted-foreground">Assigned Members</p><p className="text-xl font-bold tabular-nums">{totalMembers}</p></div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Church className="h-14 w-14 opacity-20 mb-4" />
          <p className="font-semibold text-base">No departments yet</p>
          <p className="text-sm mt-1">Create your first department to get started.</p>
          <Button onClick={openAdd} className="mt-4 gap-2"><Plus className="h-4 w-4" /> Create Department</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((dept, idx) => {
            const cp = COLOR_PAIRS[idx % COLOR_PAIRS.length];
            return (
              <Card key={dept.id} className="overflow-hidden hover:shadow-lg transition-all duration-200 group">
                {/* Top accent bar */}
                <div className={`h-1.5 w-full ${cp.bar}`} />
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cp.icon}`}>
                      <Church className="h-5 w-5" />
                    </div>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(dept)}><Edit className="h-3.5 w-3.5" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></AlertDialogTrigger>
                        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove {dept.name}?</AlertDialogTitle><AlertDialogDescription>This sends a deletion request for admin approval — {dept.name} stays until it's approved.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteItem(dept.id)}>Request deletion</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <h3 className="font-bold text-base leading-tight mb-1.5">{dept.name}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4 min-h-[2.5rem] line-clamp-2">{dept.description ?? "No description added."}</p>

                  <div className="flex items-center justify-between pt-3 border-t">
                    <div className="flex items-center gap-1.5 text-sm">
                      <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">Leader:</span>
                      <span className="font-semibold truncate max-w-[100px]">{dept.leader_name ?? "—"}</span>
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${cp.icon}`}>
                      <Users className="h-3 w-3" />
                      {dept.member_count}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <BulkImportDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        defaultResource="departments"
        lockResource
        onImported={load}
      />
    </div>
  );
}