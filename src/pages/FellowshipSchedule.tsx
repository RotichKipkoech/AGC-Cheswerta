import { useEffect, useState, useCallback } from "react";
import { CalendarDays, MapPin, Mic2, ScrollText, Save, Loader2, History, CheckCircle2, Clock, PlayCircle, AlertTriangle, Sunrise } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type ScheduleEntry = {
  id: string;
  fellowship_date: string;
  venue: string;
  speaker: string;
  programmer: string;
  notes: string | null;
  reminder_sent_at: string | null;
  created_at: string;
};

type FormState = { fellowship_date: string; venue: string; speaker: string; programmer: string; notes: string };

function nextThursdayISO(): string {
  const d = new Date();
  const day = d.getDay(); // 0 Sun ... 4 Thu ... 6 Sat
  let diff = (4 - day + 7) % 7;
  if (diff === 0) diff = 7; // if today IS Thursday, target next week's
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function ReadOnlyField({ icon: Icon, label, value, multiline }: {
  icon?: any; label: string; value: string; multiline?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </Label>
      <p className={`text-sm rounded-md border bg-muted/30 px-3 py-2 ${multiline ? "whitespace-pre-wrap" : ""}`}>
        {value}
      </p>
    </div>
  );
}

export default function FellowshipSchedule() {
  const { role } = useAuth();
  const isSuper = role === "super_admin" || role === "admin";

  const [form, setForm] = useState<FormState>({ fellowship_date: nextThursdayISO(), venue: "", speaker: "", programmer: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [loadingNext, setLoadingNext] = useState(true);
  const [existingId, setExistingId] = useState<string | null>(null);

  const [history, setHistory] = useState<ScheduleEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [sendingThu, setSendingThu] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [sendingSun, setSendingSun] = useState(false);

  const loadNext = useCallback(async () => {
    setLoadingNext(true);
    try {
      const res = await apiFetch<{ schedule: ScheduleEntry | null; target_date: string }>("/api/fellowship/next");
      if (res.schedule) {
        setForm({
          fellowship_date: res.schedule.fellowship_date,
          venue: res.schedule.venue,
          speaker: res.schedule.speaker,
          programmer: res.schedule.programmer,
          notes: res.schedule.notes ?? "",
        });
        setExistingId(res.schedule.id);
      } else {
        setForm(f => ({ ...f, fellowship_date: res.target_date }));
        setExistingId(null);
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoadingNext(false); }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await apiFetch<{ schedules: ScheduleEntry[] }>("/api/fellowship");
      setHistory(res.schedules ?? []);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoadingHistory(false); }
  }, []);

  useEffect(() => { loadNext(); loadHistory(); }, [loadNext, loadHistory]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.venue.trim() || !form.speaker.trim() || !form.programmer.trim()) {
      toast.error("Venue, speaker and programmer are all required");
      return;
    }
    setSaving(true);
    try {
      const saved = await apiFetch<ScheduleEntry>("/api/fellowship", {
        method: "POST",
        body: JSON.stringify({
          fellowship_date: form.fellowship_date,
          venue: form.venue.trim(),
          speaker: form.speaker.trim(),
          programmer: form.programmer.trim(),
          notes: form.notes.trim() || null,
        }),
      });
      setExistingId(saved.id);
      toast.success("Fellowship details saved");
      loadHistory();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const sendThursdayNow = async () => {
    setSendingThu(true);
    try {
      const res = await apiFetch<{ ok: boolean; skipped?: boolean; reason?: string; sent?: number; failed?: number }>(
        "/api/fellowship/send-thursday-now", { method: "POST" }
      );
      if (res.skipped) toast.info(res.reason || "Skipped");
      else toast.success(`Sent to ${res.sent} member${res.sent !== 1 ? "s" : ""}${res.failed ? `, ${res.failed} failed` : ""}`);
      loadHistory();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSendingThu(false); }
  };

  const sendReminderNow = async () => {
    setSendingReminder(true);
    try {
      const res = await apiFetch<{ ok: boolean; skipped?: boolean; reason?: string; sent?: number; failed?: number }>(
        "/api/fellowship/send-thursday-reminder-now", { method: "POST" }
      );
      if (res.skipped) toast.info(res.reason || "Skipped");
      else toast.success(`Reminder sent to ${res.sent} member${res.sent !== 1 ? "s" : ""}${res.failed ? `, ${res.failed} failed` : ""}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSendingReminder(false); }
  };

  const sendSundayNow = async () => {
    setSendingSun(true);
    try {
      const res = await apiFetch<{ ok: boolean; skipped?: boolean; reason?: string; sent?: number; failed?: number }>(
        "/api/fellowship/send-sunday-now", { method: "POST" }
      );
      if (res.skipped) toast.info(res.reason || "Skipped");
      else toast.success(`Sent to ${res.sent} member${res.sent !== 1 ? "s" : ""}${res.failed ? `, ${res.failed} failed` : ""}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSendingSun(false); }
  };

  const formatDate = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-KE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="animate-fade-in space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white p-6 shadow-lg">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <CalendarDays className="h-5 w-5 opacity-80" />
            <Badge className="bg-white/20 text-white border-0 text-xs">Automated Messaging</Badge>
          </div>
          <h1 className="text-2xl font-bold">Fellowship Scheduler</h1>
          <p className="text-white/70 text-sm mt-1 max-w-2xl">
            Set next week's Thursday Fellowship details. A day-of reminder is sent every Thursday at 13:00 PM (venue + 3 PM arrival), members are thanked at 7:00 PM with next week's details, and welcomed every Sunday at 8:30 AM.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Form */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Next Fellowship
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingNext ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…
              </div>
            ) : isSuper ? (
              <form onSubmit={submit} className="space-y-4">
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm font-medium flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1">{formatDate(form.fellowship_date)}</span>
                  {existingId && <Badge variant="outline" className="text-[10px] shrink-0">Already set</Badge>}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" /> Venue *
                  </Label>
                  <Input required maxLength={255} placeholder="e.g. Main Sanctuary"
                    value={form.venue} onChange={e => setForm(f => ({ ...f, venue: e.target.value }))} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Mic2 className="h-3 w-3" /> Speaker *
                  </Label>
                  <Input required maxLength={255} placeholder="e.g. Pastor John Mwangi"
                    value={form.speaker} onChange={e => setForm(f => ({ ...f, speaker: e.target.value }))} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <ScrollText className="h-3 w-3" /> Programmer *
                  </Label>
                  <Textarea required rows={3} maxLength={500} placeholder="e.g. Grace"
                    value={form.programmer} onChange={e => setForm(f => ({ ...f, programmer: e.target.value }))} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Notes <span className="normal-case font-normal">(optional — internal only, not sent in the SMS)</span>
                  </Label>
                  <Textarea rows={2} maxLength={300} placeholder="For internal reference only"
                    value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>

                <Button type="submit" disabled={saving} className="w-full gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {existingId ? "Update Details" : "Save Details"}
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm font-medium flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1">{formatDate(form.fellowship_date)}</span>
                  {existingId && <Badge variant="outline" className="text-[10px] shrink-0">Confirmed</Badge>}
                </div>

                {existingId ? (
                  <>
                    <ReadOnlyField icon={MapPin} label="Venue" value={form.venue} />
                    <ReadOnlyField icon={Mic2} label="Speaker" value={form.speaker} />
                    <ReadOnlyField icon={ScrollText} label="Programmer" value={form.programmer} multiline />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                    <CalendarDays className="h-8 w-8 opacity-30" />
                    <p className="text-sm text-center">Details for next week's fellowship haven't been set yet.</p>
                  </div>
                )}

                <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-3 border-t">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Only Admins can edit fellowship details — you're viewing in read-only mode.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Schedule info + test triggers */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Automatic Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                  <MapPin className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="font-medium">Thursdays at 13:00 PM</p>
                  <p className="text-xs text-muted-foreground">Day-of reminder — venue &amp; arrive by 3:00 PM</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <CalendarDays className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium">Thursdays at 7:00 PM</p>
                  <p className="text-xs text-muted-foreground">Thanks members for today's fellowship &amp; shares next week's details</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Sunrise className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Sundays at 8:30 AM</p>
                  <p className="text-xs text-muted-foreground">Welcome message to all active members</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {isSuper && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><PlayCircle className="h-4 w-4" /> Test Send</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full gap-2" disabled={sendingReminder}>
                      {sendingReminder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                      Send Thursday Reminder Now
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />Send real SMS now?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This immediately texts every active member today's fellowship venue and asks them to arrive by 3:00 PM. Requires a FellowshipSchedule entry for today's date.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={sendReminderNow}>Send Now</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full gap-2" disabled={sendingThu}>
                      {sendingThu ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
                      Send Thursday Follow-up Now
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />Send real SMS now?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This immediately texts every active member with a phone number — thanking them and sharing next week's fellowship details. This is for testing; use with care.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={sendThursdayNow}>Send Now</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full gap-2" disabled={sendingSun}>
                      {sendingSun ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sunrise className="h-3.5 w-3.5" />}
                      Send Sunday Welcome Now
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />Send real SMS now?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This immediately texts every active member with a phone number a Sunday welcome message. This is for testing; use with care.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={sendSundayNow}>Send Now</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No fellowship schedules recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Speaker</TableHead>
                  <TableHead>Programmer</TableHead>
                  <TableHead>Reminder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map(h => (
                  <TableRow key={h.id}>
                    <TableCell className="text-sm font-medium whitespace-nowrap">{formatDate(h.fellowship_date)}</TableCell>
                    <TableCell className="text-sm">{h.venue}</TableCell>
                    <TableCell className="text-sm">{h.speaker}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">{h.programmer}</TableCell>
                    <TableCell>
                      {h.reminder_sent_at ? (
                        <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 border-0 gap-1">
                          <CheckCircle2 className="h-3 w-3" />Sent
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}