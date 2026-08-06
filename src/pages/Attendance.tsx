import { useEffect, useState, useCallback } from "react";
import { Plus, Edit, Trash2, Loader2, X, ClipboardCheck, TrendingUp, Calendar, MapPin, Mic2, ScrollText, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

type AttRecord = { id: string; service_type?: string; event_name?: string; date: string; men?: number; women?: number; youths?: number; children?: number; visitors?: number; total_attendees?: number; total_present?: number; created_at: string; };
type FormState = { service_type: string; date: string; men: string; women: string; youths: string; children: string; visitors: string; };
type FellowshipInfo = { venue: string; speaker: string; programmer: string };

const getServiceType = (r: AttRecord) => r.service_type || r.event_name || "—";
const getTotal = (r: AttRecord) => r.total_attendees ?? r.total_present ?? 0;
const SERVICE_TYPES = ["Sunday Service", "Thursday Fellowship", "Special Service"];
const INIT: FormState = { service_type: "Sunday Service", date: new Date().toISOString().slice(0, 10), men: "0", women: "0", youths: "0", children: "0", visitors: "0" };

function nextThursdayISO(): string {
  const d = new Date();
  const day = d.getDay(); // 0 Sun ... 4 Thu ... 6 Sat
  let diff = (4 - day + 7) % 7;
  if (diff === 0) diff = 7; // if today IS Thursday, target next week's
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
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
      <div className="relative z-10 bg-background rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border">
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function AttForm({ form, setForm, saving, onSubmit, onCancel, isEdit }: {
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  saving: boolean; onSubmit: (e: React.FormEvent) => void; onCancel: () => void; isEdit: boolean;
}) {
  const calcTotal = () => (["men","women","youths","children","visitors"] as const).reduce((s, k) => s + (parseInt(form[k]) || 0), 0);
  const setNum = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value.replace(/[^0-9]/g, "") }));

  const isThursday = form.service_type === "Thursday Fellowship";
  const [nextDate] = useState(() => nextThursdayISO());
  const [fellowshipForm, setFellowshipForm] = useState({ venue: "", speaker: "", programmer: "" });
  const [fellowshipExists, setFellowshipExists] = useState(false);
  const [loadingFellowship, setLoadingFellowship] = useState(false);
  const [savingFellowship, setSavingFellowship] = useState(false);

  useEffect(() => {
    if (!isThursday) return;
    let active = true;
    setLoadingFellowship(true);
    apiFetch<{ schedule: FellowshipInfo | null }>(`/api/fellowship/by-date?date=${nextDate}`)
      .then(res => {
        if (!active) return;
        if (res.schedule) {
          setFellowshipForm({ venue: res.schedule.venue, speaker: res.schedule.speaker, programmer: res.schedule.programmer });
          setFellowshipExists(true);
        } else {
          setFellowshipExists(false);
        }
      })
      .catch(() => {})
      .finally(() => { if (active) setLoadingFellowship(false); });
    return () => { active = false; };
  }, [isThursday, nextDate]);

  const saveFellowship = async () => {
    if (!fellowshipForm.venue.trim() || !fellowshipForm.speaker.trim() || !fellowshipForm.programmer.trim()) {
      toast.error("Venue, speaker and programmer are all required");
      return;
    }
    setSavingFellowship(true);
    try {
      await apiFetch("/api/fellowship", {
        method: "POST",
        body: JSON.stringify({
          fellowship_date: nextDate,
          venue: fellowshipForm.venue.trim(),
          speaker: fellowshipForm.speaker.trim(),
          programmer: fellowshipForm.programmer.trim(),
        }),
      });
      setFellowshipExists(true);
      toast.success("Next fellowship details saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingFellowship(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date *</Label><Input required type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Service Type *</Label>
          <Select value={form.service_type} onValueChange={v => setForm(p => ({ ...p, service_type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SERVICE_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {isThursday && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30 px-4 py-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide flex items-center gap-1.5">
              <Calendar className="h-3 w-3" /> Plan Next Fellowship — {nextDate}
            </p>
            {loadingFellowship ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
            ) : fellowshipExists ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 font-medium shrink-0">Already set</span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 font-medium shrink-0">Not set yet</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <MapPin className="h-3 w-3" />Venue
              </Label>
              <Input className="h-9 text-sm" placeholder="e.g. Main Sanctuary" value={fellowshipForm.venue}
                onChange={e => setFellowshipForm(p => ({ ...p, venue: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Mic2 className="h-3 w-3" />Speaker
              </Label>
              <Input className="h-9 text-sm" placeholder="e.g. Pastor John" value={fellowshipForm.speaker}
                onChange={e => setFellowshipForm(p => ({ ...p, speaker: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <ScrollText className="h-3 w-3" />Programmer
            </Label>
            <Textarea className="text-sm" rows={2} placeholder="e.g. Grace"
              value={fellowshipForm.programmer} onChange={e => setFellowshipForm(p => ({ ...p, programmer: e.target.value }))} />
          </div>

          <Button type="button" size="sm" variant="outline" className="w-full gap-2" onClick={saveFellowship} disabled={savingFellowship}>
            {savingFellowship ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {fellowshipExists ? "Update Fellowship Details" : "Save Fellowship Details"}
          </Button>
        </div>
      )}

      <div className="bg-gradient-to-br from-muted/60 to-muted/30 rounded-xl p-4 space-y-4 border border-border/50">
        <p className="text-sm font-semibold flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-primary" />Attendance Breakdown</p>
        <div className="grid grid-cols-5 gap-2">
          {(["men","women","youths","children","visitors"] as const).map(field => (
            <div key={field} className="space-y-1.5 text-center">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block">{field}</Label>
              <Input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={form[field]}
                onChange={setNum(field)}
                onFocus={e => { if (e.target.value === "0") setForm(p => ({ ...p, [field]: "" })); }}
                onBlur={e => { if (!e.target.value) setForm(p => ({ ...p, [field]: "0" })); }}
                className="text-center font-mono font-semibold text-base h-11" />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <span className="text-sm text-muted-foreground font-medium">Total Attendance</span>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold tabular-nums text-primary">{calcTotal()}</span>
            <span className="text-xs text-muted-foreground">people</span>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving} className="min-w-[120px]">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{isEdit ? "Update" : "Save Record"}</Button>
      </div>
    </form>
  );
}

const serviceBadgeClass = (s: string) =>
  s === "Sunday Service" ? "bg-primary/10 text-primary border-primary/20"
  : s === "Thursday Fellowship" ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400"
  : "bg-muted text-muted-foreground";

export default function Attendance() {
  const [records, setRecords] = useState<AttRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AttRecord | null>(null);
  const [form, setForm] = useState<FormState>(INIT);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await apiFetch<{ attendance: AttRecord[] }>("/api/attendance"); setRecords(r.attendance ?? []); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm(INIT); setAddOpen(true); };
  const openEdit = (r: AttRecord) => {
    setForm({ service_type: getServiceType(r), date: r.date, men: String(r.men ?? 0), women: String(r.women ?? 0), youths: String(r.youths ?? 0), children: String(r.children ?? 0), visitors: String(r.visitors ?? 0) });
    setEditTarget(r);
  };
  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const payload = { service_type: form.service_type, date: form.date, men: parseInt(form.men)||0, women: parseInt(form.women)||0, youths: parseInt(form.youths)||0, children: parseInt(form.children)||0, visitors: parseInt(form.visitors)||0 };
    try {
      if (editTarget) { await apiFetch(`/api/attendance/${editTarget.id}`, { method: "PUT", body: JSON.stringify(payload) }); toast.success("Updated"); setEditTarget(null); }
      else { await apiFetch("/api/attendance", { method: "POST", body: JSON.stringify(payload) }); toast.success("Recorded!"); setAddOpen(false); }
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }, [form, editTarget]);
  const deleteRecord = async (id: string) => {
    try {
      const res = await apiFetch<{ pending?: boolean; message?: string }>(`/api/attendance/${id}`, { method: "DELETE" });
      toast.success(res?.pending ? (res.message || "Deletion requested — pending admin approval") : "Deleted");
      load();
    } catch (e) { toast.error((e as Error).message); }
  };

  const sundays = records.filter(r => getServiceType(r) === "Sunday Service");
  const thursdays = records.filter(r => getServiceType(r) === "Thursday Fellowship");
  const avgSunday = sundays.length ? Math.round(sundays.reduce((a, r) => a + getTotal(r), 0) / sundays.length) : 0;
  const avgThursday = thursdays.length ? Math.round(thursdays.reduce((a, r) => a + getTotal(r), 0) / thursdays.length) : 0;
  const totalPeople = records.reduce((a, r) => a + getTotal(r), 0);

  const toMonthLabel = (ym: string) => { const [y, mo] = ym.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleString('en-US', { month: 'short' }); };
  const chartMap: Record<string, any> = {};
  records.forEach(r => { const m = r.date.slice(0,7); if (!chartMap[m]) chartMap[m] = { month: toMonthLabel(m), sunday: 0, thursday: 0 }; if (getServiceType(r)==="Sunday Service") chartMap[m].sunday += getTotal(r); else if (getServiceType(r)==="Thursday Fellowship") chartMap[m].thursday += getTotal(r); });
  const chartData = Object.entries(chartMap).sort(([a],[b]) => a.localeCompare(b)).slice(-6).map(([,v]) => v);

  return (
    <div className="animate-fade-in space-y-5">
      <Modal open={addOpen} title="Record Attendance" onClose={() => setAddOpen(false)}>
        <AttForm form={form} setForm={setForm} saving={saving} onSubmit={submit} onCancel={() => setAddOpen(false)} isEdit={false} />
      </Modal>
      <Modal open={!!editTarget} title="Edit Attendance" onClose={() => setEditTarget(null)}>
        <AttForm form={form} setForm={setForm} saving={saving} onSubmit={submit} onCancel={() => setEditTarget(null)} isEdit={true} />
      </Modal>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Attendance</h1><p className="text-sm text-muted-foreground mt-0.5">Track service attendance by demographics</p></div>
        <Button onClick={openAdd} className="gap-2 shrink-0"><Plus className="h-4 w-4" /> Record Attendance</Button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Avg. Sunday", value: avgSunday, color: "text-primary", bg: "bg-primary/10" },
          { label: "Avg. Thursday", value: avgThursday, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950" },
          { label: "Total Records", value: records.length, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950" },
          { label: "Total Attendance", value: totalPeople.toLocaleString(), color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950" },
        ].map(s => (
          <Card key={s.label} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center mb-2`}>
                <ClipboardCheck className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-500" />Monthly Trends</CardTitle></CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sunday" fill="hsl(0,84%,50%)" name="Sunday" radius={[6,6,0,0]} />
                <Bar dataKey="thursday" fill="hsl(220,80%,60%)" name="Thursday" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2"><Calendar className="h-8 w-8 opacity-20" /><p className="text-sm">No data yet</p></div>}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Records</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…</div> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Service</TableHead>
                    <TableHead className="text-right font-semibold">Men</TableHead>
                    <TableHead className="text-right font-semibold">Women</TableHead>
                    <TableHead className="text-right font-semibold">Youth</TableHead>
                    <TableHead className="text-right font-semibold">Children</TableHead>
                    <TableHead className="text-right font-semibold">Visitors</TableHead>
                    <TableHead className="text-right font-semibold">Total</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.length === 0
                    ? <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-12"><ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-20" /><p>No records yet</p></TableCell></TableRow>
                    : records.map(r => (
                      <TableRow key={r.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium">{r.date}</TableCell>
                        <TableCell><span className={`inline-flex text-xs px-2.5 py-1 rounded-full border font-medium ${serviceBadgeClass(getServiceType(r))}`}>{getServiceType(r)}</span></TableCell>
                        <TableCell className="text-right tabular-nums">{r.men ?? 0}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.women ?? 0}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.youths ?? 0}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.children ?? 0}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.visitors ?? 0}</TableCell>
                        <TableCell className="text-right font-bold tabular-nums text-primary">{getTotal(r)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-0.5">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Edit className="h-3.5 w-3.5" /></Button>
                            <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></AlertDialogTrigger>
                              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Request deletion?</AlertDialogTitle><AlertDialogDescription>This sends a deletion request for admin approval — the record stays until it's approved.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteRecord(r.id)}>Request deletion</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                            </AlertDialog>
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
    </div>
  );
}