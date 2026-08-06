import { useEffect, useState, useCallback } from "react";
import { Plus, Download, TrendingUp, Edit, Trash2, Loader2, X, Wallet, PiggyBank, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

type FinancialRecord = { id: string; type: string; amount: number; member_name: string | null; date: string; notes: string | null; };
type FormState = { type: string; customType: string; amount: string; member_name: string; date: string; notes: string };

const TYPES = ["Tithe", "Offering", "Mission", "Baby Center", "Special Giving", "Other"];
const NEEDS_NAME = new Set(["Tithe", "Other"]);
const INIT: FormState = { type: "Offering", customType: "", amount: "", member_name: "", date: new Date().toISOString().slice(0, 10), notes: "" };

const TYPE_COLORS: Record<string, string> = {
  "Tithe":         "bg-primary/10 text-primary border-primary/20",
  "Offering":      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400",
  "Mission":       "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400",
  "Baby Center":   "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-400",
  "Special Giving":"bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400",
};

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
      <div className="relative z-10 bg-background rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border">
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function GivingForm({ form, setForm, saving, onSubmit, onCancel, isEdit }: {
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  saving: boolean; onSubmit: (e: React.FormEvent) => void; onCancel: () => void; isEdit: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date *</Label><Input required type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
      <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Giving Type *</Label>
        <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v, customType: "" }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t === "Other" ? "Other / Custom" : t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {form.type === "Other" && <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Custom Type *</Label><Input required value={form.customType} placeholder="e.g. Building Fund, Thanksgiving" onChange={e => setForm(p => ({ ...p, customType: e.target.value }))} /></div>}
      {NEEDS_NAME.has(form.type) && <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Member Name</Label><Input value={form.member_name} placeholder="Name of the giving member" maxLength={100} onChange={e => setForm(p => ({ ...p, member_name: e.target.value }))} /></div>}
      <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount (KES) *</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-semibold">KES</span>
          <Input required type="number" min="1" step="0.01" placeholder="0.00" value={form.amount} className="pl-14 font-mono text-base" onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes <span className="normal-case font-normal">(optional)</span></Label><Input value={form.notes} placeholder="Any additional notes…" maxLength={200} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
      <div className="flex justify-end gap-2 pt-3 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving} className="min-w-[130px]">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{isEdit ? "Update" : "Record Giving"}</Button>
      </div>
    </form>
  );
}

export default function Finance() {
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FinancialRecord | null>(null);
  const [form, setForm] = useState<FormState>(INIT);
  const [saving, setSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try { const r = await apiFetch<{ givings: FinancialRecord[] }>("/api/givings"); setRecords(r.givings ?? []); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = typeFilter === "all" ? records : records.filter(r => r.type === typeFilter);

  const openAdd = () => { setForm(INIT); setAddOpen(true); };
  const openEdit = (r: FinancialRecord) => {
    const knownTypes = TYPES.slice(0, -1);
    const isCustom = !knownTypes.includes(r.type);
    setForm({ type: isCustom ? "Other" : r.type, customType: isCustom ? r.type : "", amount: String(r.amount), member_name: r.member_name ?? "", date: r.date, notes: r.notes ?? "" });
    setEditTarget(r);
  };

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const finalType = form.type === "Other" ? (form.customType.trim() || "Special Giving") : form.type;
    const amount = parseFloat(form.amount);
    if (!amount || isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount"); setSaving(false); return; }
    const payload = { type: finalType, amount, member_name: NEEDS_NAME.has(form.type) ? (form.member_name.trim() || null) : null, date: form.date, notes: form.notes.trim() || null };
    try {
      if (editTarget) { await apiFetch(`/api/givings/${editTarget.id}`, { method: "PUT", body: JSON.stringify(payload) }); toast.success("Updated"); setEditTarget(null); }
      else { await apiFetch("/api/givings", { method: "POST", body: JSON.stringify(payload) }); toast.success("Recorded!"); setAddOpen(false); }
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }, [form, editTarget]);

  const deleteRecord = async (id: string) => {
    try {
      const res = await apiFetch<{ pending?: boolean; message?: string }>(`/api/givings/${id}`, { method: "DELETE" });
      toast.success(res?.pending ? (res.message || "Deletion requested — pending admin approval") : "Deleted");
      load();
    } catch (e) { toast.error((e as Error).message); }
  };

  const totals = records.reduce((acc, r) => {
    acc.grand += r.amount;
    if (r.type === "Tithe") acc.tithes += r.amount;
    else if (r.type === "Offering") acc.offerings += r.amount;
    else if (r.type === "Mission") acc.mission += r.amount;
    else if (r.type === "Baby Center") acc.babyCenter += r.amount;
    else if (r.type === "Special Giving") acc.special += r.amount;
    return acc;
  }, { grand: 0, tithes: 0, offerings: 0, mission: 0, babyCenter: 0, special: 0 });

  const toMonthLabel = (ym: string) => { const [y, mo] = ym.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleString('en-US', { month: 'short' }); };
  const chartMap: Record<string, any> = {};
  records.forEach(r => { const m = r.date.slice(0,7); if (!chartMap[m]) chartMap[m] = { month: toMonthLabel(m), tithes:0, offerings:0, mission:0, babyCenter:0 }; if (r.type==="Tithe") chartMap[m].tithes+=r.amount; else if (r.type==="Offering") chartMap[m].offerings+=r.amount; else if (r.type==="Mission") chartMap[m].mission+=r.amount; else if (r.type==="Baby Center") chartMap[m].babyCenter+=r.amount; });
  const chartData = Object.entries(chartMap).sort(([a],[b]) => a.localeCompare(b)).slice(-6).map(([,v]) => v);

  const exportCsv = () => {
    const csv = ["Date,Type,Member,Amount,Notes", ...records.map(r => [r.date,r.type,r.member_name??"",r.amount,r.notes??""].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download="givings.csv"; a.click();
  };

  const summaryItems = [
    { label: "Grand Total", value: totals.grand, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950", border: "border-emerald-200 dark:border-emerald-800" },
    { label: "Tithes", value: totals.tithes, color: "text-primary", bg: "bg-primary/8", border: "border-primary/20" },
    { label: "Offerings", value: totals.offerings, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950", border: "border-blue-200 dark:border-blue-800" },
    { label: "Mission", value: totals.mission, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950", border: "border-teal-200 dark:border-teal-800" },
    { label: "Baby Center", value: totals.babyCenter, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950", border: "border-orange-200 dark:border-orange-800" },
    { label: "Special", value: totals.special, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950", border: "border-purple-200 dark:border-purple-800" },
  ];

  return (
    <div className="animate-fade-in space-y-5">
      <Modal open={addOpen} title="Record Giving" onClose={() => setAddOpen(false)}>
        <GivingForm form={form} setForm={setForm} saving={saving} onSubmit={submit} onCancel={() => setAddOpen(false)} isEdit={false} />
      </Modal>
      <Modal open={!!editTarget} title="Edit Giving" onClose={() => setEditTarget(null)}>
        <GivingForm form={form} setForm={setForm} saving={saving} onSubmit={submit} onCancel={() => setEditTarget(null)} isEdit={true} />
      </Modal>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Givings</h1><p className="text-sm text-muted-foreground mt-0.5">Tithes, offerings, mission, baby center & special givings</p></div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={exportCsv} className="gap-2"><Download className="h-4 w-4" /></Button>
          <Button onClick={openAdd} className="gap-2"><Plus className="h-4 w-4" /> Record Giving</Button>
        </div>
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {summaryItems.map(s => (
          <Card key={s.label} className={`border ${s.border} hover:shadow-sm transition-shadow`}>
            <CardContent className="p-4">
              <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center mb-2`}>
                <PiggyBank className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{s.label}</p>
              <p className={`text-sm font-bold tabular-nums mt-0.5 ${s.color}`}>
                {s.value > 0 ? `KES ${s.value.toLocaleString()}` : '—'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-500" />Monthly Trends</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }} formatter={(v: number) => `KES ${v.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="tithes"    fill="hsl(0,84%,50%)"    name="Tithes"      radius={[6,6,0,0]} />
                <Bar dataKey="offerings" fill="hsl(220,80%,60%)"  name="Offerings"   radius={[6,6,0,0]} />
                <Bar dataKey="mission"   fill="hsl(160,64%,40%)"  name="Mission"     radius={[6,6,0,0]} />
                <Bar dataKey="babyCenter" fill="hsl(30,80%,55%)"  name="Baby Center" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2"><Wallet className="h-8 w-8 opacity-20" /><p className="text-sm">No data yet</p></div>}
        </CardContent>
      </Card>

      {/* Table with filter */}
      <Card>
        <div className="flex items-center justify-between px-4 pt-4 pb-2 gap-2">
          <h2 className="text-sm font-semibold">Transactions</h2>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40 h-8 text-xs"><Filter className="h-3 w-3 mr-1.5 text-muted-foreground" /><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Types</SelectItem>{TYPES.slice(0,-1).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <CardContent className="p-0">
          {loading ? <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…</div> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Type</TableHead>
                    <TableHead className="font-semibold">Member</TableHead>
                    <TableHead className="text-right font-semibold">Amount</TableHead>
                    <TableHead className="hidden md:table-cell font-semibold">Notes</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0
                    ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12"><PiggyBank className="h-8 w-8 mx-auto mb-2 opacity-20" /><p>No records yet</p></TableCell></TableRow>
                    : filtered.map(r => {
                      const typeStyle = TYPE_COLORS[r.type] ?? "bg-muted text-muted-foreground";
                      return (
                        <TableRow key={r.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{r.date}</TableCell>
                          <TableCell><span className={`inline-flex text-xs px-2.5 py-1 rounded-full border font-medium ${typeStyle}`}>{r.type}</span></TableCell>
                          <TableCell className="text-muted-foreground">{r.member_name ?? "—"}</TableCell>
                          <TableCell className="text-right font-bold tabular-nums text-emerald-600">KES {r.amount.toLocaleString()}</TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{r.notes ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-0.5">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Edit className="h-3.5 w-3.5" /></Button>
                              <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></AlertDialogTrigger>
                                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Request deletion?</AlertDialogTitle><AlertDialogDescription>This sends a deletion request for admin approval — the record stays until it's approved.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteRecord(r.id)}>Request deletion</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
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