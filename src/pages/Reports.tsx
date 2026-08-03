import { useEffect, useState, useMemo, useCallback } from "react";
import { Download, Filter, Printer, Loader2, FileText, TrendingUp, Users, ClipboardCheck, X, Calendar, ChevronDown, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, getToken, API_BASE } from "@/lib/api";
import { useSystemSettings } from "@/contexts/SystemSettingsContext";
import { toast } from "sonner";

type Giving    = { id: string; type: string; amount: number; member_name: string | null; date: string; notes: string | null; };
type AttRecord = { id: string; service_type: string; event_name?: string; date: string; men: number; women: number; youths: number; children: number; visitors: number; total_present: number; total_attendees?: number; };
type Member    = { id: string; full_name: string; gender: string | null; phone: string | null; department: string | null; baptism_status: string | null; join_date: string | null; status: string; };

const getTotal   = (r: AttRecord) => r.total_attendees ?? r.total_present ?? 0;
const getService = (r: AttRecord) => r.service_type || r.event_name || "—";

const TYPE_COLORS: Record<string, string> = {
  "Tithe":         "bg-primary/10 text-primary border-primary/20",
  "Offering":      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400",
  "Mission":       "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400",
  "Baby Center":   "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-400",
  "Special Giving":"bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400",
};

async function downloadPDF(body: Record<string, unknown>, label: string) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/stats/report/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text(); let msg = "PDF generation failed";
    try { msg = JSON.parse(t).error || msg; } catch {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `AGC_${label}_${new Date().toISOString().slice(0,10)}.pdf`; a.click();
  URL.revokeObjectURL(url);
}

/* ── Stat pill ──────────────────────────────────────────────────────────────── */
function StatPill({ label, value, color = "text-foreground" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

/* ── Download button ────────────────────────────────────────────────────────── */
function DlBtn({ type, extra = {}, downloading, onDl }: { type: string; extra?: Record<string, unknown>; downloading: string | null; onDl: (type: string, extra?: Record<string, unknown>) => void }) {
  return (
    <Button variant="outline" size="sm" disabled={!!downloading} onClick={() => onDl(type, extra)} className="gap-1.5 shrink-0">
      {downloading === type ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">Download PDF</span>
    </Button>
  );
}

export default function Reports() {
  const [givings,    setGivings]    = useState<Giving[]>([]);
  const [attendance, setAttendance] = useState<AttRecord[]>([]);
  const [members,    setMembers]    = useState<Member[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const [givingType,   setGivingType]   = useState("all");
  const [memberFilter, setMemberFilter] = useState("all");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");

  const loadAll = useCallback(async () => {
    setLoadingData(true);
    try {
      const [g, a, m] = await Promise.all([
        apiFetch<{ givings: Giving[] }>("/api/givings"),
        apiFetch<{ attendance: AttRecord[] }>("/api/attendance"),
        apiFetch<{ members: Member[] }>("/api/members"),
      ]);
      setGivings(g.givings ?? []); setAttendance(a.attendance ?? []); setMembers(m.members ?? []);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoadingData(false); }
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const availableMonths = useMemo(() => {
    const s = new Set<string>();
    givings.forEach(g => s.add(g.date.slice(0,7)));
    attendance.forEach(a => s.add(a.date.slice(0,7)));
    return Array.from(s).sort().reverse();
  }, [givings, attendance]);

  const applyMonth = (ym: string) => {
    setSelectedMonth(ym);
    if (!ym || ym === "all") { setDateFrom(""); setDateTo(""); }
    else {
      const [y, m] = ym.split("-").map(Number);
      // Build YYYY-MM-DD directly from local components — do NOT use
      // .toISOString() here, since it converts to UTC first. In any
      // timezone ahead of UTC (e.g. Africa/Nairobi, UTC+3), local
      // midnight on the 1st becomes ~21:00 UTC on the LAST day of the
      // PREVIOUS month, silently shifting the whole range back by a day
      // (e.g. "June 2026" → 2026-05-31 .. 2026-06-29 instead of
      // 2026-06-01 .. 2026-06-30).
      const pad = (n: number) => String(n).padStart(2, "0");
      const lastDay = new Date(y, m, 0).getDate();
      setDateFrom(`${y}-${pad(m)}-01`);
      setDateTo(`${y}-${pad(m)}-${pad(lastDay)}`);
    }
  };
  const handleDateFrom = (v: string) => { setDateFrom(v); setSelectedMonth(""); };
  const handleDateTo   = (v: string) => { setDateTo(v);   setSelectedMonth(""); };

  const activeLabel = useMemo(() => {
    if (selectedMonth) { const [y,m] = selectedMonth.split("-").map(Number); return new Date(y,m-1,1).toLocaleString("en-US",{month:"long",year:"numeric"}); }
    if (dateFrom || dateTo) return `${dateFrom||"…"} → ${dateTo||"…"}`;
    return null;
  }, [selectedMonth, dateFrom, dateTo]);

  const filteredGivings    = useMemo(() => givings.filter(r => {
    if (givingType !== "all" && r.type !== givingType) return false;
    if (dateFrom && r.date < dateFrom) return false;
    if (dateTo   && r.date > dateTo)   return false;
    return true;
  }), [givings, givingType, dateFrom, dateTo]);

  const filteredAttendance = useMemo(() => attendance.filter(r => {
    if (dateFrom && r.date < dateFrom) return false;
    if (dateTo   && r.date > dateTo)   return false;
    return true;
  }), [attendance, dateFrom, dateTo]);

  const filteredMembers = useMemo(() => members.filter(m => {
    if (memberFilter !== "all" && m.gender !== memberFilter) return false;
    return true;
  }), [members, memberFilter]);

  const givingsTotal   = filteredGivings.reduce((a,b) => a + b.amount, 0);
  const attendanceAvg  = filteredAttendance.length ? Math.round(filteredAttendance.reduce((a,r) => a + getTotal(r), 0) / filteredAttendance.length) : 0;

  const dl = async (type: string, extra: Record<string, unknown> = {}) => {
    setDownloading(type);
    try { await downloadPDF({ type, date_from: dateFrom || null, date_to: dateTo || null, ...extra }, type); toast.success("PDF downloaded"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setDownloading(null); }
  };

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Filter and download PDF reports</p>
        </div>
        {loadingData && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading data…</div>}
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            {/* Month picker */}
            <div className="space-y-1 min-w-0">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Month</Label>
              <Select value={selectedMonth || "all"} onValueChange={v => applyMonth(v === "all" ? "" : v)}>
                <SelectTrigger className="w-44 h-9"><SelectValue placeholder="All months" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All months</SelectItem>
                  {availableMonths.map(ym => {
                    const [y,m] = ym.split("-").map(Number);
                    return <SelectItem key={ym} value={ym}>{new Date(y,m-1,1).toLocaleString("en-US",{month:"long",year:"numeric"})}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>

            <span className="text-xs text-muted-foreground self-end pb-2">or</span>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">From</Label>
              <Input type="date" value={dateFrom} onChange={e => handleDateFrom(e.target.value)} className="w-36 h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">To</Label>
              <Input type="date" value={dateTo} onChange={e => handleDateTo(e.target.value)} className="w-36 h-9 text-sm" />
            </div>

            <Button variant="outline" size="sm" className="self-end h-9 gap-1.5"
              onClick={() => { setDateFrom(""); setDateTo(""); setSelectedMonth(""); setGivingType("all"); setMemberFilter("all"); }}>
              <Filter className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>

          {activeLabel && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Showing:</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                <Calendar className="h-3 w-3" />{activeLabel}
                <button onClick={() => { setDateFrom(""); setDateTo(""); setSelectedMonth(""); }} className="hover:text-primary/70 ml-0.5 leading-none">
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="monthly">
        {/* Scrollable tabs on mobile */}
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <TabsList className="inline-flex h-auto w-auto min-w-full sm:w-auto gap-0.5 p-1 mb-4">
            {[
              { value: "monthly",    icon: FileText,      label: "Monthly Report" },
              { value: "givings",    icon: TrendingUp,    label: "Givings" },
              { value: "attendance", icon: ClipboardCheck, label: "Attendance" },
              { value: "members",    icon: Users,         label: "Members" },
            ].map(t => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <t.icon className="h-3.5 w-3.5 shrink-0" />{t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Monthly District Report */}
        <TabsContent value="monthly">
          <MonthlyReport attendance={filteredAttendance} givings={filteredGivings} dateFrom={dateFrom} dateTo={dateTo} selectedMonth={selectedMonth} onDownloadPDF={dl} downloading={downloading} />
        </TabsContent>

        {/* Givings Report */}
        <TabsContent value="givings">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Giving Report</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{filteredGivings.length} records</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={givingType} onValueChange={setGivingType}>
                    <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All types" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {["Tithe","Offering","Mission","Baby Center","Special Giving"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <DlBtn type="givings" extra={{ giving_type: givingType }} downloading={downloading} onDl={dl} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Summary pills */}
              <div className="flex flex-wrap gap-2 mb-4">
                <StatPill label="Total" value={`KES ${givingsTotal.toLocaleString()}`} color="text-emerald-600" />
                <StatPill label="Records" value={filteredGivings.length} />
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-semibold">Date</TableHead><TableHead className="font-semibold">Type</TableHead>
                    <TableHead className="font-semibold">Member</TableHead><TableHead className="text-right font-semibold">Amount</TableHead>
                    <TableHead className="hidden md:table-cell font-semibold">Notes</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredGivings.length === 0
                      ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10"><TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-20" /><p>No records match filters</p></TableCell></TableRow>
                      : filteredGivings.map(r => (
                        <TableRow key={r.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{r.date}</TableCell>
                          <TableCell><span className={`inline-flex text-xs px-2.5 py-1 rounded-full border font-medium ${TYPE_COLORS[r.type] ?? "bg-muted text-muted-foreground"}`}>{r.type}</span></TableCell>
                          <TableCell className="text-muted-foreground">{r.member_name ?? "—"}</TableCell>
                          <TableCell className="text-right font-bold tabular-nums text-emerald-600">KES {r.amount.toLocaleString()}</TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{r.notes ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attendance Report */}
        <TabsContent value="attendance">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Attendance Report</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{filteredAttendance.length} services</p>
                </div>
                <DlBtn type="attendance" downloading={downloading} onDl={dl} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                <StatPill label="Services" value={filteredAttendance.length} />
                <StatPill label="Average" value={attendanceAvg} color="text-primary" />
                <StatPill label="Total attendance" value={filteredAttendance.reduce((a,r) => a + getTotal(r), 0).toLocaleString()} color="text-blue-600" />
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-semibold">Date</TableHead><TableHead className="font-semibold">Service</TableHead>
                    <TableHead className="text-right font-semibold">Men</TableHead><TableHead className="text-right font-semibold">Women</TableHead>
                    <TableHead className="text-right font-semibold hidden sm:table-cell">Youth</TableHead>
                    <TableHead className="text-right font-semibold hidden sm:table-cell">Children</TableHead>
                    <TableHead className="text-right font-semibold hidden sm:table-cell">Visitors</TableHead>
                    <TableHead className="text-right font-semibold">Total</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredAttendance.length === 0
                      ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10"><ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-20" /><p>No records match filters</p></TableCell></TableRow>
                      : filteredAttendance.map(r => (
                        <TableRow key={r.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{r.date}</TableCell>
                          <TableCell>
                            <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border font-medium
                              ${getService(r) === "Sunday Service" ? "bg-primary/10 text-primary border-primary/20"
                              : getService(r) === "Thursday Fellowship" ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400"
                              : "bg-muted text-muted-foreground"}`}>{getService(r)}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.men ?? 0}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.women ?? 0}</TableCell>
                          <TableCell className="text-right tabular-nums hidden sm:table-cell">{r.youths ?? 0}</TableCell>
                          <TableCell className="text-right tabular-nums hidden sm:table-cell">{r.children ?? 0}</TableCell>
                          <TableCell className="text-right tabular-nums hidden sm:table-cell">{r.visitors ?? 0}</TableCell>
                          <TableCell className="text-right font-bold tabular-nums text-primary">{getTotal(r)}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Members Report */}
        <TabsContent value="members">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Members Report</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{filteredMembers.length} members</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={memberFilter} onValueChange={setMemberFilter}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem></SelectContent>
                  </Select>
                  <DlBtn type="members" extra={{ gender: memberFilter }} downloading={downloading} onDl={dl} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                <StatPill label="Total" value={filteredMembers.length} />
                <StatPill label="Baptized" value={filteredMembers.filter(m => m.baptism_status === "Baptized").length} color="text-emerald-600" />
                <StatPill label="Active" value={filteredMembers.filter(m => m.status === "active").length} color="text-blue-600" />
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-semibold">Name</TableHead>
                    <TableHead className="font-semibold hidden sm:table-cell">Gender</TableHead>
                    <TableHead className="font-semibold hidden md:table-cell">Phone</TableHead>
                    <TableHead className="font-semibold">Ministry</TableHead>
                    <TableHead className="font-semibold hidden sm:table-cell">Baptism</TableHead>
                    <TableHead className="font-semibold hidden md:table-cell">Joined</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredMembers.length === 0
                      ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10"><Users className="h-8 w-8 mx-auto mb-2 opacity-20" /><p>No members match filters</p></TableCell></TableRow>
                      : filteredMembers.map(m => {
                        const initials = m.full_name.split(' ').slice(0,2).map(n=>n[0]??'').join('').toUpperCase();
                        return (
                          <TableRow key={m.id} className="hover:bg-muted/30">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-[10px] font-bold text-primary">{initials}</div>
                                <span className="font-medium text-sm">{m.full_name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">{m.gender ?? "—"}</TableCell>
                            <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{m.phone ?? "—"}</TableCell>
                            <TableCell>{m.department ? <span className="inline-flex text-xs px-2 py-0.5 rounded-full border bg-muted text-muted-foreground font-medium">{m.department}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="hidden sm:table-cell"><Badge variant={m.baptism_status === "Baptized" ? "default" : "secondary"} className="text-xs">{m.baptism_status ?? "—"}</Badge></TableCell>
                            <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{m.join_date ?? "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Monthly District Report ─────────────────────────────────────────────────── */
interface MonthlyReportProps {
  attendance: AttRecord[]; givings: Giving[];
  dateFrom: string; dateTo: string; selectedMonth: string;
  onDownloadPDF: (type: string, extra?: Record<string, unknown>) => Promise<void>;
  downloading: string | null;
}

function MonthlyReport({ attendance, givings, dateFrom, dateTo, selectedMonth, onDownloadPDF, downloading }: MonthlyReportProps) {
  const { branding } = useSystemSettings();
  const [meta, setMeta] = useState({
    district: "", localChurch: "", code: "",
    month: new Date().toLocaleString("en-US", { month: "long" }),
    year: String(new Date().getFullYear()),
    pastorPension: 1000, refPension: "",
    refCentral: "", refArea: "", refRegional: "", refDistrict: "",
    sundaySchools: 4, buildingType: "Permanent",
    titleDeedNo: "", pastorName: "", districtLeaderName: "", comments: "",
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setMeta(p => ({ ...p, [k]: e.target.value }));

  // ── auto-fill: District / Local Church / Code from saved church-info ──────
  const [loadingChurchInfo, setLoadingChurchInfo] = useState(true);
  const [savingChurchInfo, setSavingChurchInfo] = useState(false);

  useEffect(() => {
    apiFetch<{ district: string; local_church: string; code: string }>("/api/church-info")
      .then(res => {
        setMeta(p => ({
          ...p,
          district: res.district || p.district,
          localChurch: res.local_church || p.localChurch,
          code: res.code || p.code,
        }));
      })
      .catch(() => {})
      .finally(() => setLoadingChurchInfo(false));
  }, []);

  const saveChurchInfo = async () => {
    setSavingChurchInfo(true);
    try {
      await apiFetch("/api/church-info", {
        method: "PUT",
        body: JSON.stringify({ district: meta.district, local_church: meta.localChurch, code: meta.code }),
      });
      toast.success("Church info saved — it will auto-fill next time");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingChurchInfo(false);
    }
  };

  // ── auto-fill: Month / Year from the page's month picker ──────────────────
  useEffect(() => {
    if (!selectedMonth) return;
    const [y, m] = selectedMonth.split("-").map(Number);
    setMeta(p => ({ ...p, month: new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long" }), year: String(y) }));
  }, [selectedMonth]);

  const sundayRows = useMemo(() => attendance.filter(a => getService(a) === "Sunday Service").map(a => {
    const dg = givings.filter(g => g.date === a.date);
    return { ...a, offering: dg.filter(g => g.type === "Offering").reduce((s,g) => s + g.amount, 0), tithes: dg.filter(g => g.type === "Tithe").reduce((s,g) => s + g.amount, 0), tithers: dg.filter(g => g.type === "Tithe").length };
  }), [attendance, givings]);

  const weekdayRows = useMemo(() => attendance.filter(a => getService(a) === "Thursday Fellowship").map(a => ({
    ...a, offering: givings.filter(g => g.date === a.date && g.type === "Offering").reduce((s,g) => s + g.amount, 0)
  })), [attendance, givings]);

  const s = <T,>(arr: T[], k: (x: T) => number) => arr.reduce((a,x) => a + k(x), 0);
  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a,b) => a + b, 0) / arr.length) : 0;

  const totals = {
    men: s(sundayRows,r=>r.men), women: s(sundayRows,r=>r.women), youths: s(sundayRows,r=>r.youths),
    children: s(sundayRows,r=>r.children), visitors: s(sundayRows,r=>r.visitors),
    offering: s(sundayRows,r=>r.offering), tithes: s(sundayRows,r=>r.tithes), tithers: s(sundayRows,r=>r.tithers),
  };
  const wdTotals = { no: s(weekdayRows,r=>getTotal(r)), offering: s(weekdayRows,r=>r.offering) };
  const grandTotal = totals.offering + totals.tithes + wdTotals.offering;
  const splits = [["10% To Central", grandTotal*0.10],["5% To Regional", grandTotal*0.05],["10% To Area", grandTotal*0.10],["5% To District", grandTotal*0.05]] as [string, number][];
  // Each entry: [label, amount, meta-key for ref input (null = no ref)]
  const splitsWithRefs: [string, number, string | null][] = [
    ["10% To Central",  grandTotal * 0.10, "refCentral"],
    ["5% To Regional",  grandTotal * 0.05, "refRegional"],
    ["10% To Area",     grandTotal * 0.10, "refArea"],
    ["5% To District",  grandTotal * 0.05, "refDistrict"],
  ];

  const field = (label: string, key: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1">
      <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</Label>
      <Input value={(meta as any)[key]} onChange={set(key)} className="h-8 text-sm" {...props} />
    </div>
  );

  const thCls = "text-[10px] font-semibold uppercase tracking-wide bg-muted/50 py-1.5 px-2 text-left border";
  const tdCls = "text-xs py-1.5 px-2 tabular-nums border";
  const tfCls = "text-xs font-bold py-1.5 px-2 tabular-nums border bg-muted/30";

  return (
    <Card className="print:shadow-none print:border-0">
      {/* Header bar */}
      <CardHeader className="pb-3 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base">Monthly District Report</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Official AGC monthly submission form</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" disabled={!!downloading} onClick={() => onDownloadPDF("monthly", { meta, date_from: dateFrom || null, date_to: dateTo || null })} className="gap-1.5">
              {downloading === "monthly" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Download PDF
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 print:p-0">
        {/* Church info */}
        <div className="bg-muted/20 rounded-xl p-4 border space-y-4 print:rounded-none">
          <h3 className="text-xs font-bold uppercase tracking-widest text-center text-primary">AFRICA GOSPEL CHURCH — MONTHLY DISTRICT REPORT</h3>
          {loadingChurchInfo && (
            <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />Loading saved church info…
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field("District", "district")}
            {field("Local Church", "localChurch")}
            <div className="flex items-end gap-2">
              <div className="flex-1">{field("Code", "code")}</div>
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 shrink-0" disabled={savingChurchInfo} onClick={saveChurchInfo}>
                {savingChurchInfo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {field("Month", "month")}
              {field("Year", "year")}
            </div>
          </div>
          {(dateFrom || dateTo) && <p className="text-xs text-muted-foreground">Period: {dateFrom||"…"} → {dateTo||"…"}</p>}
        </div>

        {/* Sunday Service table */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <span className="h-1.5 w-4 bg-primary rounded-full" />Church Service — Sunday Service
          </h4>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full border-collapse text-xs min-w-[600px]">
              <thead>
                <tr>{["Date","Men","Women","Youth","Children","Visitors","N/Conv","Total","Offering","Tithes","No."].map(h => <th key={h} className={thCls}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {sundayRows.length === 0
                  ? <tr><td colSpan={11} className="text-center text-muted-foreground py-4 text-xs">No Sunday service records</td></tr>
                  : sundayRows.map(r => (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className={tdCls}>{r.date}</td>
                      <td className={tdCls}>{r.men}</td><td className={tdCls}>{r.women}</td>
                      <td className={tdCls}>{r.youths}</td><td className={tdCls}>{r.children}</td>
                      <td className={tdCls}>{r.visitors}</td><td className={tdCls}>—</td>
                      <td className={`${tdCls} font-semibold text-primary`}>{getTotal(r)}</td>
                      <td className={tdCls}>{r.offering.toLocaleString()}</td>
                      <td className={tdCls}>{r.tithes.toLocaleString()}</td>
                      <td className={tdCls}>{r.tithers}</td>
                    </tr>
                  ))}
                <tr className="border-t-2">
                  <td className={tfCls}>Total</td>
                  <td className={tfCls}>{totals.men}</td><td className={tfCls}>{totals.women}</td>
                  <td className={tfCls}>{totals.youths}</td><td className={tfCls}>{totals.children}</td>
                  <td className={tfCls}>{totals.visitors}</td><td className={tfCls}>—</td>
                  <td className={`${tfCls} text-primary`}>{totals.men+totals.women+totals.youths+totals.children+totals.visitors}</td>
                  <td className={tfCls}>{totals.offering.toLocaleString()}</td>
                  <td className={tfCls}>{totals.tithes.toLocaleString()}</td>
                  <td className={tfCls}>{totals.tithers}</td>
                </tr>
                <tr>
                  <td className={tdCls}>Ave</td>
                  <td className={tdCls}>{avg(sundayRows.map(r=>r.men))}</td>
                  <td className={tdCls}>{avg(sundayRows.map(r=>r.women))}</td>
                  <td className={tdCls}>{avg(sundayRows.map(r=>r.youths))}</td>
                  <td className={tdCls}>{avg(sundayRows.map(r=>r.children))}</td>
                  <td className={tdCls}>{avg(sundayRows.map(r=>r.visitors))}</td>
                  <td className={tdCls}>—</td>
                  <td className={tdCls}>{avg(sundayRows.map(r=>getTotal(r)))}</td>
                  <td className={tdCls}>{avg(sundayRows.map(r=>r.offering)).toLocaleString()}</td>
                  <td className={tdCls}>{avg(sundayRows.map(r=>r.tithes)).toLocaleString()}</td>
                  <td className={tdCls}>—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Thursday Fellowship */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <span className="h-1.5 w-4 bg-blue-500 rounded-full" />Week Day Fellowship
          </h4>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full border-collapse text-xs">
              <thead><tr><th className={thCls}>Date</th><th className={thCls}>No.</th><th className={thCls}>Offering</th></tr></thead>
              <tbody>
                {weekdayRows.length === 0
                  ? <tr><td colSpan={3} className="text-center text-muted-foreground py-4 text-xs">No fellowship records</td></tr>
                  : weekdayRows.map(r => <tr key={r.id} className="hover:bg-muted/20"><td className={tdCls}>{r.date}</td><td className={tdCls}>{getTotal(r)}</td><td className={tdCls}>{r.offering.toLocaleString()}</td></tr>)}
                <tr className="border-t-2">
                  <td className={tfCls}>Total</td>
                  <td className={tfCls}>{wdTotals.no}</td>
                  <td className={tfCls}>{wdTotals.offering.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Grand total + splits */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl p-4 border border-primary/20">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">Grand Total</p>
            <p className="text-2xl font-bold tabular-nums">KES {grandTotal.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Item</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Amount</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ref</th>
                </tr>
              </thead>
              <tbody>
                {splitsWithRefs.map(([l, v, refKey]) => (
                  <tr key={l} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 text-muted-foreground">{l}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">KES {(v as number).toLocaleString()}</td>
                    <td className="px-3 py-2 text-muted-foreground font-mono text-[10px]">
                      {refKey ? (
                        <Input
                          value={(meta as any)[refKey]}
                          onChange={set(refKey)}
                          className="h-6 text-[10px] px-1.5 w-28 font-mono"
                          placeholder="Ref no."
                        />
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Additional fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 border rounded-xl bg-muted/10">
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Pastor's Pension (KES)</Label>
            <Input type="number" value={meta.pastorPension} onChange={e => setMeta(p=>({...p, pastorPension: Number(e.target.value)}))} className="h-8 text-sm" />
          </div>
          {field("Ref (Pension)", "refPension")}
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">No. of Sunday Schools</Label>
            <Input type="number" value={meta.sundaySchools} onChange={e => setMeta(p=>({...p, sundaySchools: Number(e.target.value)}))} className="h-8 text-sm" />
          </div>
          {field("Building Type", "buildingType")}
          {field("Title Deed No.", "titleDeedNo")}
        </div>

        {/* Remittance reference numbers */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Remittance Reference Numbers</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border rounded-xl bg-muted/10">
            {field("Ref — 10% Central",  "refCentral")}
            {field("Ref — 5% Regional",  "refRegional")}
            {field("Ref — 10% Area",     "refArea")}
            {field("Ref — 5% District",  "refDistrict")}
          </div>
        </div>

        {/* Comments */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Comments / Remarks</Label>
          <textarea className="w-full border rounded-xl p-3 text-sm min-h-[60px] bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" value={meta.comments} onChange={set("comments")} placeholder="Any additional comments…" />
        </div>

        {/* Signature strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 border rounded-xl bg-muted/10">
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Pastor's Name</Label>
            <Input value={meta.pastorName} onChange={set("pastorName")} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Signature</Label>
            <div className="h-8 border-b border-dashed" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Date</Label>
            <div className="h-8 border-b border-dashed" />
          </div>
        </div>

        {/* District Leader signature strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 border rounded-xl bg-muted/10">
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">District Leader's Name</Label>
            <Input value={meta.districtLeaderName} onChange={set("districtLeaderName")} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Signature</Label>
            <div className="h-8 border-b border-dashed" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Date</Label>
            <div className="h-8 border-b border-dashed" />
          </div>
        </div>

        {/* Official stamp — set once in CPanel → Branding → Logos & images;
            shown here and embedded in the downloaded PDF automatically. */}
        <div className="flex justify-end">
          <div className="w-28 space-y-1.5">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-center block">Official Stamp</Label>
            <div className="h-28 w-28 rounded-lg border border-dashed flex items-center justify-center overflow-hidden bg-muted/10 mx-auto">
              {branding.report_stamp_url
                ? <img src={branding.report_stamp_url} alt="Official stamp" className="h-full w-full object-contain" />
                : <span className="text-[10px] text-muted-foreground text-center px-2">Set in Branding</span>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}