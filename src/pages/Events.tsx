import { useEffect, useState, useCallback } from "react";
import { Plus, MapPin, Clock, Calendar, Edit, Trash2, Loader2, X, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

type ChurchEvent = { id: string; title: string; date: string; time: string | null; location: string | null; type: string; description: string | null; };
type FormState = { title: string; date: string; time: string; location: string; type: string; description: string; };

const EVENT_TYPES = ["Service", "Fellowship", "Meeting", "Special Event", "Outreach", "Training", "Other"];
const INIT: FormState = { title: "", date: new Date().toISOString().slice(0, 10), time: "", location: "", type: "Service", description: "" };

const TYPE_STYLES: Record<string, string> = {
  "Service":       "bg-primary/10 text-primary border-primary/20",
  "Fellowship":    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400",
  "Meeting":       "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400",
  "Special Event": "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400",
  "Outreach":      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400",
  "Training":      "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-400",
  "Other":         "bg-muted text-muted-foreground",
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

function EventForm({ form, setForm, saving, onSubmit, onCancel, isEdit }: {
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  saving: boolean; onSubmit: (e: React.FormEvent) => void; onCancel: () => void; isEdit: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Event Title *</Label><Input required maxLength={100} placeholder="e.g. Sunday Worship Service" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date *</Label><Input required type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Time</Label><Input type="time" value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} /></div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</Label><Input maxLength={100} placeholder="e.g. Main Sanctuary" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} /></div>
      <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Event Type</Label>
        <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description <span className="normal-case font-normal">(optional)</span></Label>
        <Textarea rows={3} maxLength={500} placeholder="Brief description of the event…" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
      </div>
      <div className="flex justify-end gap-2 pt-3 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving} className="min-w-[130px]">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{isEdit ? "Update Event" : "Schedule Event"}</Button>
      </div>
    </form>
  );
}

export default function Events() {
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ChurchEvent | null>(null);
  const [form, setForm] = useState<FormState>(INIT);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await apiFetch<{ data: ChurchEvent[] }>("/api/db", { method: "POST", body: JSON.stringify({ table: "events", op: "select", order: [{ col: "date", ascending: true }] }) }); setEvents(r.data ?? []); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm(INIT); setAddOpen(true); };
  const openEdit = (ev: ChurchEvent) => { setForm({ title: ev.title, date: ev.date, time: ev.time ?? "", location: ev.location ?? "", type: ev.type, description: ev.description ?? "" }); setEditTarget(ev); };

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    if (!form.title.trim()) { toast.error("Title is required"); setSaving(false); return; }
    const values = { title: form.title.trim(), date: form.date, time: form.time || null, location: form.location.trim() || null, type: form.type, description: form.description.trim() || null };
    try {
      if (editTarget) { await apiFetch("/api/db", { method: "POST", body: JSON.stringify({ table: "events", op: "update", values, filters: [{ col: "id", op: "eq", value: editTarget.id }] }) }); toast.success("Event updated"); setEditTarget(null); }
      else { await apiFetch("/api/db", { method: "POST", body: JSON.stringify({ table: "events", op: "insert", values }) }); toast.success("Event created!"); setAddOpen(false); }
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }, [form, editTarget]);

  const deleteEvent = async (id: string) => {
    try { await apiFetch("/api/db", { method: "POST", body: JSON.stringify({ table: "events", op: "delete", filters: [{ col: "id", op: "eq", value: id }] }) }); toast.success("Deleted"); load(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter(e => e.date >= today);
  const past = events.filter(e => e.date < today);

  const EventCard = ({ ev, isPast }: { ev: ChurchEvent; isPast?: boolean }) => {
    const d = new Date(ev.date + 'T00:00:00');
    const typeStyle = TYPE_STYLES[ev.type] ?? TYPE_STYLES["Other"];
    return (
      <Card className={`overflow-hidden hover:shadow-md transition-all duration-200 ${isPast ? 'opacity-60' : ''}`}>
        <CardContent className="p-0">
          <div className="flex items-stretch">
            {/* Date chip */}
            <div className={`flex flex-col items-center justify-center px-4 py-4 shrink-0 ${isPast ? 'bg-muted/40' : 'bg-primary/8'} border-r min-w-[64px]`}>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${isPast ? 'text-muted-foreground' : 'text-primary'}`}>
                {d.toLocaleString('en-US', { month: 'short' })}
              </span>
              <span className={`text-2xl font-extrabold leading-none mt-0.5 ${isPast ? 'text-muted-foreground' : 'text-primary'}`}>
                {d.getDate()}
              </span>
              <span className={`text-[10px] ${isPast ? 'text-muted-foreground/60' : 'text-primary/60'}`}>
                {d.getFullYear()}
              </span>
            </div>
            {/* Content */}
            <div className="flex-1 p-4 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <h3 className="font-semibold text-sm">{ev.title}</h3>
                    <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-full border font-semibold ${typeStyle}`}>{ev.type}</span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {ev.time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{ev.time}</span>}
                    {ev.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{ev.location}</span>}
                  </div>
                  {ev.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{ev.description}</p>}
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(ev)}><Edit className="h-3.5 w-3.5" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></AlertDialogTrigger>
                    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete event?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteEvent(ev.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="animate-fade-in space-y-5">
      <Modal open={addOpen} title="Schedule New Event" onClose={() => setAddOpen(false)}>
        <EventForm form={form} setForm={setForm} saving={saving} onSubmit={submit} onCancel={() => setAddOpen(false)} isEdit={false} />
      </Modal>
      <Modal open={!!editTarget} title="Edit Event" onClose={() => setEditTarget(null)}>
        <EventForm form={form} setForm={setForm} saving={saving} onSubmit={submit} onCancel={() => setEditTarget(null)} isEdit={true} />
      </Modal>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Events</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{upcoming.length} upcoming · {past.length} past</p>
        </div>
        <Button onClick={openAdd} className="gap-2 shrink-0"><Plus className="h-4 w-4" /> New Event</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…</div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <CalendarDays className="h-14 w-14 opacity-20 mb-4" />
          <p className="font-semibold">No events yet</p>
          <p className="text-sm mt-1">Schedule your first event to get started.</p>
          <Button onClick={openAdd} className="mt-4 gap-2"><Plus className="h-4 w-4" /> Schedule Event</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Upcoming</h2>
                <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">{upcoming.length}</span>
              </div>
              <div className="space-y-2">{upcoming.map(ev => <EventCard key={ev.id} ev={ev} />)}</div>
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Past Events</h2>
              <div className="space-y-2">{past.slice(0, 10).map(ev => <EventCard key={ev.id} ev={ev} isPast />)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}