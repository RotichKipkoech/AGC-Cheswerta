import { useEffect, useState, useCallback } from "react";
import { ScrollText, RefreshCw, Loader2, CheckCircle2, Clock, XCircle, WifiOff, PhoneOff, Trash2, Filter, X, RotateCw, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────
type SmsLogEntry = {
  id: string;
  event_type: string;
  recipient_phone: string;
  recipient_name: string | null;
  message: string;
  provider: string | null;
  status: string;
  error_detail: string | null;
  sent_by: string | null;
  created_at: string;
};

type Summary = { total: number; sent: number; failed: number; no_provider: number };

type Pagination = { page: number; per_page: number; total: number; total_pages: number };

type Filters = { status: string; event_type: string; date_from: string; date_to: string };

const INIT_FILTERS: Filters = { status: "", event_type: "", date_from: "", date_to: "" };

// ─── Status config ─────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; badge: string }> = {
  sent:        { label: "Sent",        icon: <CheckCircle2 className="h-3.5 w-3.5" />, badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400" },
  queued:      { label: "Queued",      icon: <Clock className="h-3.5 w-3.5" />,        badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400" },
  failed:      { label: "Failed",      icon: <XCircle className="h-3.5 w-3.5" />,      badge: "bg-destructive/10 text-destructive border-destructive/20" },
  no_provider: { label: "No Provider", icon: <WifiOff className="h-3.5 w-3.5" />,      badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400" },
  no_phone:    { label: "No Phone",    icon: <PhoneOff className="h-3.5 w-3.5" />,     badge: "bg-muted text-muted-foreground" },
};

const EVENT_LABELS: Record<string, string> = {
  welcome: "Welcome SMS", otp_reset: "OTP Reset", broadcast: "Broadcast",
  fellowship_reminder: "Fellowship Reminder", sunday_welcome: "Sunday Welcome",
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, icon: null, badge: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tabular-nums">{value.toLocaleString()}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ────────────────────────────────────────────
export default function SmsLogs() {
  const { role } = useAuth();
  const isSuper = role === "super_admin";

  const [logs, setLogs] = useState<SmsLogEntry[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, sent: 0, failed: 0, no_provider: 0 });
  const [pagination, setPagination] = useState<Pagination>({ page: 1, per_page: 20, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(INIT_FILTERS);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  const load = useCallback(async (f: Filters = filters, page: number = pagination.page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.status)     params.set("status",     f.status);
      if (f.event_type) params.set("event_type", f.event_type);
      if (f.date_from)  params.set("date_from",  f.date_from);
      if (f.date_to)    params.set("date_to",    f.date_to);
      params.set("page", String(page));
      params.set("per_page", String(pagination.per_page));

      const res = await apiFetch<{ logs: SmsLogEntry[]; summary: Summary; pagination: Pagination }>(
        `/api/sms-logs?${params.toString()}`
      );
      setLogs(res.logs ?? []);
      setSummary(res.summary ?? { total: 0, sent: 0, failed: 0, no_provider: 0 });
      if (res.pagination) setPagination(res.pagination);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.per_page]);

  useEffect(() => { load(); }, []);

  const applyFilters = () => load(filters, 1);

  const resetFilters = () => {
    setFilters(INIT_FILTERS);
    load(INIT_FILTERS, 1);
  };

  const goToPage = (page: number) => {
    if (page < 1 || page > pagination.total_pages) return;
    load(filters, page);
  };

  const deleteOne = async (id: string) => {
    try {
      await apiFetch(`/api/sms-logs/${id}`, { method: "DELETE" });
      toast.success("Log entry deleted");
      load();
    } catch (e) { toast.error((e as Error).message); }
  };

  const clearAll = async () => {
    try {
      await apiFetch("/api/sms-logs", { method: "DELETE" });
      toast.success("All SMS logs cleared");
      load(filters, 1);
    } catch (e) { toast.error((e as Error).message); }
  };

  const retryOne = async (id: string) => {
    setRetryingId(id);
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>(`/api/sms-logs/${id}/retry`, { method: "POST" });
      if (res.ok) {
        toast.success("Message resent successfully");
      } else {
        toast.error(res.error || "Retry failed");
      }
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRetryingId(null);
    }
  };

  const retryAllFailed = async () => {
    setRetryingAll(true);
    try {
      const res = await apiFetch<{ ok: boolean; retried: number; succeeded: number; failed: number }>(
        "/api/sms-logs/retry-failed", { method: "POST" }
      );
      if (res.retried === 0) {
        toast.info("No failed messages to retry");
      } else {
        toast.success(`Retried ${res.retried} — ${res.succeeded} succeeded, ${res.failed} still failed`);
      }
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRetryingAll(false);
    }
  };

  const hasFilters = Object.values(filters).some(Boolean);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" }) +
      " " + d.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SMS Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All outbound SMS attempts — welcome messages, OTP resets, broadcasts
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => load()} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          {summary.failed > 0 && (
            <Button variant="outline" size="sm" className="gap-2 text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950"
              onClick={retryAllFailed} disabled={retryingAll}>
              {retryingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
              Retry All Failed ({summary.failed})
            </Button>
          )}
          {isSuper && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2" disabled={summary.total === 0}>
                  <Trash2 className="h-3.5 w-3.5" /> Clear All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all SMS logs?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {summary.total.toLocaleString()} log entries. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={clearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Sent" value={summary.total}
          icon={<ScrollText className="h-5 w-5 text-primary" />}
          color="bg-primary/10" />
        <StatCard label="Delivered" value={summary.sent}
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          color="bg-emerald-50 dark:bg-emerald-950" />
        <StatCard label="Failed" value={summary.failed}
          icon={<XCircle className="h-5 w-5 text-destructive" />}
          color="bg-destructive/10" />
        <StatCard label="No Provider" value={summary.no_provider}
          icon={<WifiOff className="h-5 w-5 text-amber-600" />}
          color="bg-amber-50 dark:bg-amber-950" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
              <Filter className="h-4 w-4" /> Filters
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
              <Select value={filters.status || "all"} onValueChange={v => setFilters(f => ({ ...f, status: v === "all" ? "" : v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="no_provider">No Provider</SelectItem>
                  <SelectItem value="no_phone">No Phone</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filters.event_type || "all"} onValueChange={v => setFilters(f => ({ ...f, event_type: v === "all" ? "" : v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="welcome">Welcome SMS</SelectItem>
                  <SelectItem value="otp_reset">OTP Reset</SelectItem>
                  <SelectItem value="broadcast">Broadcast</SelectItem>
                  <SelectItem value="fellowship_reminder">Fellowship Reminder</SelectItem>
                  <SelectItem value="sunday_welcome">Sunday Welcome</SelectItem>
                </SelectContent>
              </Select>

              <Input type="date" className="h-9 text-xs" value={filters.date_from}
                onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} />
              <Input type="date" className="h-9 text-xs" value={filters.date_to}
                onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} />
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" onClick={applyFilters} className="h-9">Apply</Button>
              {hasFilters && (
                <Button size="sm" variant="outline" onClick={resetFilters} className="h-9 gap-1">
                  <X className="h-3 w-3" /> Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <ScrollText className="h-14 w-14 opacity-20 mb-4" />
          <p className="font-semibold">No SMS logs found</p>
          <p className="text-sm mt-1">{hasFilters ? "Try clearing your filters." : "Logs will appear here once messages are sent."}</p>
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {logs.length.toLocaleString()} result{logs.length !== 1 ? "s" : ""}
              {hasFilters && " (filtered)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => (
                  <TableRow key={log.id} className="hover:bg-muted/30">
                    <TableCell>
                      <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium whitespace-nowrap">
                        {EVENT_LABELS[log.event_type] ?? log.event_type}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium text-sm max-w-[140px] truncate">
                      {log.recipient_name ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {log.recipient_phone}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-xs text-muted-foreground truncate cursor-default">
                            {log.message || "—"}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-xs whitespace-pre-wrap">{log.message || "No message recorded"}</p>
                          {log.provider && (
                            <p className="text-xs mt-1.5 opacity-70 capitalize">via {log.provider}</p>
                          )}
                          {log.error_detail && (
                            <p className="text-xs mt-1.5 text-destructive-foreground/90">
                              <span className="font-semibold">Error: </span>{log.error_detail}
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell><StatusBadge status={log.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(log.status === "failed" || log.status === "no_provider") && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
                            disabled={retryingId === log.id}
                            onClick={() => retryOne(log.id)}
                            title="Retry sending this message">
                            {retryingId === log.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        {isSuper && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this log entry?</AlertDialogTitle>
                                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteOne(log.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {!loading && logs.length > 0 && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.per_page + 1}–{Math.min(pagination.page * pagination.per_page, pagination.total)} of {pagination.total.toLocaleString()}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8"
              disabled={pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: pagination.total_pages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === pagination.total_pages || Math.abs(p - pagination.page) <= 1)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center">
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-muted-foreground text-xs">…</span>}
                  <Button variant={p === pagination.page ? "default" : "outline"} size="icon" className="h-8 w-8 text-xs"
                    onClick={() => goToPage(p)}>
                    {p}
                  </Button>
                </span>
              ))}
            <Button variant="outline" size="icon" className="h-8 w-8"
              disabled={pagination.page >= pagination.total_pages} onClick={() => goToPage(pagination.page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}