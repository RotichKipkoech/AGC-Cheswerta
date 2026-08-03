import { useEffect, useState, useCallback } from "react";
import {
  ShieldAlert, Check, X, Loader2, RefreshCw, ChevronDown, ChevronRight,
  Clock, User as UserIcon, MessageSquareText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

type PendingRequest = {
  id: string;
  table_name: string;
  record_id: string;
  record_label: string | null;
  record_snapshot: Record<string, any> | null;
  requested_by_email: string | null;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
};

const TABLE_LABELS: Record<string, string> = {
  members: "Member",
  givings: "Giving",
  attendance: "Attendance Record",
  departments: "Department",
  council_members: "Council Member",
  fellowship_schedules: "Fellowship Schedule",
  users: "User",
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function RequestCard({ req, onDecided }: { req: PendingRequest; onDecided: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);

  const decide = async (action: "approve" | "reject") => {
    setBusy(action);
    try {
      await apiFetch(`/api/pending-deletions/${req.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      toast.success(action === "approve" ? "Deletion approved and completed" : "Deletion request rejected — record kept");
      onDecided();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      setConfirmAction(null);
    }
  };

  const snapshotEntries = req.record_snapshot
    ? Object.entries(req.record_snapshot).filter(([k]) => !["id", "created_at"].includes(k))
    : [];

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px]">{TABLE_LABELS[req.table_name] ?? req.table_name}</Badge>
              {req.status !== "pending" && (
                <Badge className={`text-[10px] border-0 ${req.status === "approved" ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                  {req.status}
                </Badge>
              )}
            </div>
            <p className="font-semibold text-sm mt-1 truncate">{req.record_label || req.record_id}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><UserIcon className="h-3 w-3" />{req.requested_by_email ?? "System"}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(req.created_at)}</span>
            </div>
            {req.reason && (
              <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1">
                <MessageSquareText className="h-3 w-3 mt-0.5 shrink-0" />
                <span className="italic">"{req.reason}"</span>
              </p>
            )}
            {req.status !== "pending" && req.reviewed_by_email && (
              <p className="text-xs text-muted-foreground mt-1.5">
                {req.status === "approved" ? "Approved" : "Rejected"} by {req.reviewed_by_email}
                {req.reviewed_at && ` · ${timeAgo(req.reviewed_at)}`}
                {req.review_note && <span className="italic"> — "{req.review_note}"</span>}
              </p>
            )}
          </div>

          {snapshotEntries.length > 0 && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setExpanded(e => !e)}>
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {expanded && snapshotEntries.length > 0 && (
          <div className="mt-3 rounded-lg border bg-muted/30 divide-y text-xs">
            {snapshotEntries.map(([k, v]) => (
              <div key={k} className="flex px-3 py-1.5 gap-2">
                <span className="font-mono text-muted-foreground w-32 shrink-0">{k}</span>
                <span className="break-all">{v === null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))}
          </div>
        )}

        {req.status === "pending" && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t">
            <Textarea
              placeholder="Optional note (visible to whoever requested this)"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={1}
              className="text-xs min-h-0 h-8 py-1.5 resize-none flex-1"
            />
            <Button
              size="sm" variant="outline" className="gap-1.5 shrink-0"
              onClick={() => setConfirmAction("reject")}
              disabled={busy !== null}
            >
              {busy === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              Reject
            </Button>
            <Button
              size="sm" className="gap-1.5 shrink-0"
              onClick={() => setConfirmAction("approve")}
              disabled={busy !== null}
            >
              {busy === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Approve
            </Button>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmAction !== null} onOpenChange={o => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "approve" ? "Approve this deletion?" : "Reject this request?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "approve"
                ? `"${req.record_label}" will be permanently deleted. This cannot be undone.`
                : `"${req.record_label}" will be kept — the request is discarded.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmAction && decide(confirmAction)}>
              {confirmAction === "approve" ? "Yes, delete it" : "Yes, reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function PendingDeletions() {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ requests: PendingRequest[] }>(`/api/pending-deletions?status=${status}`);
      setRequests(res.requests ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 text-primary p-2">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pending Deletions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Nothing is ever deleted immediately — review and approve every request here.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={v => setStatus(v as typeof status)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {status === "pending" && (
        <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              {pendingCount} request{pendingCount !== 1 ? "s" : ""} awaiting review
            </CardTitle>
            <CardDescription>
              Anyone (including admins) can request a deletion, but nothing is actually removed until an admin or super admin approves it here.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <ShieldAlert className="h-12 w-12 opacity-20" />
          <p className="font-medium">Nothing here</p>
          <p className="text-sm">No {status !== "all" ? status : ""} deletion requests right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <RequestCard key={req.id} req={req} onDecided={load} />
          ))}
        </div>
      )}
    </div>
  );
}