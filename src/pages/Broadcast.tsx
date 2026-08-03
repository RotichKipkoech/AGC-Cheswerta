import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  MessageSquare, Users, Send, Clock, CheckCircle2,
  XCircle, AlertTriangle, Loader2, RefreshCw, History,
  ChevronRight, ChevronLeft, Phone, User as UserIcon, Droplet, ShieldCheck, RotateCw, Eye,
  ListChecks, Search, X,
} from 'lucide-react';

const MAX_CHARS = 640;
const SMS_PART = 160;

// ── types ────────────────────────────────────────────────────────────────────

interface PreviewResult {
  audience_label: string;
  total_members: number;
  reachable: number;
  no_phone: number;
  sample: { name: string; phone: string }[];
  sms_parts: number;
  char_count: number;
}

interface SendResult {
  ok: boolean;
  audience_label: string;
  sent: number;
  failed: number;
  skipped: number;
  total: number;
  failed_details: { name: string; phone: string; error: string }[];
}

interface HistoryEntry {
  id: string;
  actor_email: string;
  new_data: {
    audience: string;
    message_preview: string;
    sent: number;
    failed: number;
    skipped: number;
    total: number;
  };
  created_at: string;
}

interface Pagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

interface FailureEntry {
  id: string;
  recipient_name: string | null;
  recipient_phone: string;
  status: string;
  error_detail: string | null;
  created_at: string;
}

interface PickedMember {
  id: string;
  full_name: string;
  phone: string | null;
  department?: string | null;
}

// ── audience options ─────────────────────────────────────────────────────────

const STATIC_AUDIENCES = [
  { value: 'all',          label: 'All active members',         icon: Users },
  { value: 'new_members',  label: 'New members (last 90 days)', icon: UserIcon },
  { value: 'council',      label: 'Church council / leadership', icon: ShieldCheck },
  { value: 'baptized',     label: 'Baptized members',            icon: Droplet },
  { value: 'not_baptized', label: 'Not yet baptized',            icon: Droplet },
];

// ── main page ─────────────────────────────────────────────────────────────────

export default function Broadcast() {
  const { role } = useAuth();
  const [tab, setTab] = useState<'compose' | 'history'>('compose');

  const allowed = ['super_admin', 'admin', 'pastor', 'treasurer', 'secretary', 'lay_leader'].includes(role ?? '');
  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <MessageSquare className="h-10 w-10 opacity-30" />
        <p>You don't have permission to send broadcasts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 text-primary p-2">
          <MessageSquare className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SMS Broadcast</h1>
          <p className="text-muted-foreground">Send messages to targeted groups of members</p>
        </div>
      </div>

      {/* tab switcher */}
      <div className="flex gap-2 border-b pb-0">
        {(['compose', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'compose' ? <><Send className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5"/>Compose</> : <><History className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5"/>History</>}
          </button>
        ))}
      </div>

      {tab === 'compose' ? <ComposeTab /> : <HistoryTab />}
    </div>
  );
}

// ── compose tab ───────────────────────────────────────────────────────────────

function ComposeTab() {
  const [departments, setDepartments] = useState<string[]>([]);
  const [mode, setMode]                = useState<'group' | 'individual'>('group');
  const [audience, setAudience]       = useState('');
  const [message, setMessage]         = useState('');
  const [preview, setPreview]         = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing]   = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending]         = useState(false);
  const [result, setResult]           = useState<SendResult | null>(null);

  // individual member picker
  const [memberSearch, setMemberSearch]       = useState('');
  const [memberResults, setMemberResults]     = useState<PickedMember[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<PickedMember[]>([]);

  useEffect(() => {
    apiFetch<{ departments: string[] }>('/api/broadcast/departments')
      .then(r => setDepartments(r.departments ?? []))
      .catch(() => {});
  }, []);

  // keep `audience` in sync with the picker mode
  useEffect(() => {
    if (mode === 'individual') {
      setAudience(selectedMembers.length > 0 ? 'selected' : '');
    } else if (audience === 'selected') {
      setAudience('');
    }
  }, [mode, selectedMembers.length]);

  const searchMembers = useCallback(async (q: string) => {
    setSearchingMembers(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      params.set('status', 'active');
      params.set('limit', '50');
      const res = await apiFetch<{ members: PickedMember[] }>(`/api/members?${params.toString()}`);
      setMemberResults(res.members ?? []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSearchingMembers(false);
    }
  }, []);

  // load an initial member list when switching into individual mode, then debounce on typing
  useEffect(() => {
    if (mode !== 'individual') return;
    const t = setTimeout(() => searchMembers(memberSearch), 300);
    return () => clearTimeout(t);
  }, [mode, memberSearch, searchMembers]);

  const toggleMember = (m: PickedMember) => {
    setSelectedMembers(prev =>
      prev.some(s => s.id === m.id) ? prev.filter(s => s.id !== m.id) : [...prev, m]
    );
  };

  // auto-preview whenever audience + message are both filled
  useEffect(() => {
    if (!audience || !message.trim()) { setPreview(null); return; }
    if (audience === 'selected' && selectedMembers.length === 0) { setPreview(null); return; }
    const t = setTimeout(() => loadPreview(), 400);
    return () => clearTimeout(t);
  }, [audience, message, selectedMembers]);

  const loadPreview = useCallback(async () => {
    if (!audience || !message.trim()) return;
    if (audience === 'selected' && selectedMembers.length === 0) return;
    setPreviewing(true);
    try {
      const res = await apiFetch<PreviewResult>('/api/broadcast/preview', {
        method: 'POST',
        body: JSON.stringify({
          audience,
          message,
          ...(audience === 'selected' ? { member_ids: selectedMembers.map(m => m.id) } : {}),
        }),
      });
      setPreview(res);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPreviewing(false);
    }
  }, [audience, message, selectedMembers]);

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await apiFetch<SendResult>('/api/broadcast/send', {
        method: 'POST',
        body: JSON.stringify({
          audience,
          message,
          ...(audience === 'selected' ? { member_ids: selectedMembers.map(m => m.id) } : {}),
        }),
      });
      setResult(res);
      setConfirmOpen(false);
      toast.success(`Broadcast sent — ${res.sent} delivered`);
      // reset form
      setAudience('');
      setMessage('');
      setPreview(null);
      setSelectedMembers([]);
      setMode('group');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const charCount  = message.length;
  const smsParts   = message ? Math.ceil(charCount / SMS_PART) : 0;
  const overLimit  = charCount > MAX_CHARS;

  const allAudiences = [
    ...STATIC_AUDIENCES,
    ...departments.map(d => ({ value: `department:${d}`, label: d, icon: Users })),
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* left: form */}
      <div className="lg:col-span-3 space-y-4">
        {/* audience */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Audience
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={mode === 'group' ? 'default' : 'outline'}
                onClick={() => setMode('group')} className="gap-1.5">
                <Users className="h-3.5 w-3.5" /> Audience group
              </Button>
              <Button type="button" size="sm" variant={mode === 'individual' ? 'default' : 'outline'}
                onClick={() => setMode('individual')} className="gap-1.5">
                <ListChecks className="h-3.5 w-3.5" /> Pick members
              </Button>
            </div>

            {mode === 'group' ? (
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose who receives this message…" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    General
                  </div>
                  {STATIC_AUDIENCES.map(a => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                  {departments.length > 0 && (
                    <>
                      <div className="px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        By Department
                      </div>
                      {departments.map(d => (
                        <SelectItem key={`department:${d}`} value={`department:${d}`}>{d}</SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Search members by name…"
                    value={memberSearch} onChange={e => setMemberSearch(e.target.value)} />
                </div>

                {selectedMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedMembers.map(m => (
                      <Badge key={m.id} variant="secondary" className="gap-1 pr-1">
                        {m.full_name}
                        <button type="button" onClick={() => toggleMember(m)} className="ml-1 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="border rounded-lg max-h-56 overflow-y-auto divide-y">
                  {searchingMembers ? (
                    <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />Searching…
                    </div>
                  ) : memberResults.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No members found.</p>
                  ) : (
                    memberResults.map(m => {
                      const checked = selectedMembers.some(s => s.id === m.id);
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => toggleMember(m)}
                          className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-muted/50 transition-colors ${checked ? 'bg-primary/10' : ''}`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{m.full_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {m.phone || 'No phone'}{m.department ? ` · ${m.department}` : ''}
                            </p>
                          </div>
                          {checked && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  {selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''} selected
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* message */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Message
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={6}
              placeholder="Type your message here…"
              value={message}
              onChange={e => setMessage(e.target.value)}
              className={overLimit ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className={overLimit ? 'text-destructive font-medium' : ''}>
                {charCount}/{MAX_CHARS} characters
              </span>
              <span>{smsParts} SMS {smsParts === 1 ? 'part' : 'parts'}</span>
            </div>
            {overLimit && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Message exceeds the 640-character limit
              </p>
            )}
          </CardContent>
        </Card>

        {/* send button */}
        <Button
          className="w-full"
          size="lg"
          disabled={!audience || !message.trim() || overLimit || !preview || previewing}
          onClick={() => setConfirmOpen(true)}
        >
          {previewing
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Calculating…</>
            : <><Send className="h-4 w-4 mr-2" />Send broadcast</>}
        </Button>
      </div>

      {/* right: preview panel */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="sticky top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ChevronRight className="h-4 w-4" /> Preview
            </CardTitle>
            <CardDescription>Live recipient estimate</CardDescription>
          </CardHeader>
          <CardContent>
            {!audience && !message ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Select an audience and write a message to see a preview.
              </p>
            ) : previewing ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : preview ? (
              <div className="space-y-4">
                <div className="rounded-md bg-muted/50 px-3 py-2 text-sm font-medium">
                  {preview.audience_label}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border p-3 text-center">
                    <p className="text-2xl font-bold text-primary">{preview.reachable}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Will receive</p>
                  </div>
                  <div className="rounded-md border p-3 text-center">
                    <p className="text-2xl font-bold">{preview.total_members}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">In group</p>
                  </div>
                </div>

                {preview.no_phone > 0 && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 rounded-md px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {preview.no_phone} member{preview.no_phone !== 1 ? 's' : ''} have no phone number and will be skipped
                  </div>
                )}

                {preview.sample.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Sample recipients</p>
                      <div className="space-y-1.5">
                        {preview.sample.map((s, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                              <UserIcon className="h-3 w-3" />
                            </div>
                            <span className="flex-1 truncate font-medium">{s.name}</span>
                            <span className="text-muted-foreground font-mono text-xs">{s.phone}</span>
                          </div>
                        ))}
                        {preview.reachable > 5 && (
                          <p className="text-xs text-muted-foreground pl-8">+{preview.reachable - 5} more</p>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {message.trim() && preview.sample.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Message preview
                      </p>
                      <div className="rounded-md bg-muted/60 border px-3 py-2 text-sm font-mono leading-relaxed break-words">
                        {`Dear ${preview.sample[0].name.trim().split(' ')[0]}, ${message.trim()} - CheswertaAGC`}
                      </div>
                    </div>
                  </>
                )}
                <Separator />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{preview.char_count} chars (body only)</span>
                  <span>{preview.reachable} recipients</span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm broadcast</DialogTitle>
            <DialogDescription>
              This will send a live SMS to <strong>{preview?.reachable ?? 0} recipients</strong>. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-1">Audience</p>
              <p>{preview?.audience_label}</p>
            </div>
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-1">Message</p>
              <p className="whitespace-pre-wrap">{message}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded border p-2">
                <p className="font-bold text-primary">{preview?.reachable}</p>
                <p className="text-xs text-muted-foreground">Recipients</p>
              </div>
              <div className="rounded border p-2">
                <p className="font-bold">{smsParts}</p>
                <p className="text-xs text-muted-foreground">SMS parts</p>
              </div>
              <div className="rounded border p-2">
                <p className="font-bold">{charCount}</p>
                <p className="text-xs text-muted-foreground">Characters</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</>
                : <><Send className="h-4 w-4 mr-2" />Send now</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* result dialog */}
      {result && (
        <Dialog open={!!result} onOpenChange={() => setResult(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" /> Broadcast complete
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md border p-3">
                <p className="text-2xl font-bold text-emerald-600">{result.sent}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Sent</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-2xl font-bold text-destructive">{result.failed}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Failed</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-2xl font-bold text-muted-foreground">{result.skipped}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Skipped</p>
              </div>
            </div>
            {result.failed_details.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-destructive uppercase tracking-wide">Failed deliveries</p>
                <div className="rounded-md border divide-y max-h-40 overflow-y-auto">
                  {result.failed_details.map((f, i) => (
                    <div key={i} className="px-3 py-2 text-sm flex items-center gap-2">
                      <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      <span className="font-medium">{f.name}</span>
                      <span className="text-muted-foreground font-mono text-xs">{f.phone}</span>
                      <span className="text-destructive text-xs ml-auto">{f.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setResult(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── history tab ───────────────────────────────────────────────────────────────

function HistoryTab() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, per_page: 20, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);

  // Failures dialog
  const [failuresOpen, setFailuresOpen] = useState(false);
  const [failuresEntry, setFailuresEntry] = useState<HistoryEntry | null>(null);
  const [failures, setFailures] = useState<FailureEntry[]>([]);
  const [failuresLoading, setFailuresLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  const load = useCallback(async (page: number = 1) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ history: HistoryEntry[]; pagination: Pagination }>(
        `/api/broadcast/history?page=${page}&per_page=${pagination.per_page}`
      );
      setEntries(res.history ?? []);
      if (res.pagination) setPagination(res.pagination);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [pagination.per_page]);

  useEffect(() => { load(1); }, [load]);

  const goToPage = (page: number) => {
    if (page < 1 || page > pagination.total_pages) return;
    load(page);
  };

  const openFailures = async (entry: HistoryEntry) => {
    setFailuresEntry(entry);
    setFailuresOpen(true);
    setFailuresLoading(true);
    try {
      const res = await apiFetch<{ failures: FailureEntry[] }>(`/api/broadcast/history/${entry.id}/failures`);
      setFailures(res.failures ?? []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setFailuresLoading(false);
    }
  };

  const retryOne = async (id: string) => {
    setRetryingId(id);
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>(`/api/sms-logs/${id}/retry`, { method: 'POST' });
      if (res.ok) {
        toast.success('Message resent successfully');
        setFailures(prev => prev.filter(f => f.id !== id));
      } else {
        toast.error(res.error || 'Retry failed');
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRetryingId(null);
    }
  };

  const retryAllInDialog = async () => {
    if (failures.length === 0) return;
    setRetryingAll(true);
    try {
      const res = await apiFetch<{ ok: boolean; retried: number; succeeded: number; failed: number }>(
        '/api/sms-logs/retry-failed', { method: 'POST' }
      );
      toast.success(`Retried ${res.retried} — ${res.succeeded} succeeded, ${res.failed} still failed`);
      if (failuresEntry) await openFailures(failuresEntry);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRetryingAll(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Broadcast history</CardTitle>
              <CardDescription>All past SMS broadcasts</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => load(pagination.page)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <History className="h-8 w-8 opacity-30" />
              <p>No broadcasts sent yet.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Audience</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="text-center">Sent</TableHead>
                    <TableHead className="text-center">Failed</TableHead>
                    <TableHead className="text-center">Skipped</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map(e => {
                    const d = e.new_data ?? {};
                    const hasFailures = (d.failed ?? 0) > 0;
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium max-w-[180px] truncate">{d.audience ?? '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{d.message_preview ?? '—'}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 border-0">
                            <CheckCircle2 className="h-3 w-3 mr-1" />{d.sent ?? 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {hasFailures ? (
                            <button onClick={() => openFailures(e)} className="inline-flex">
                              <Badge variant="destructive" className="border-0 cursor-pointer hover:opacity-80 transition-opacity gap-1">
                                <XCircle className="h-3 w-3" />{d.failed}
                                <Eye className="h-3 w-3 ml-0.5" />
                              </Badge>
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-sm">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">{d.skipped ?? 0}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{e.actor_email ?? '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          <span title={new Date(e.created_at).toLocaleString()}>
                            {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination.total_pages > 1 && (
                <div className="flex items-center justify-between gap-3 pt-4 mt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    Page {pagination.page} of {pagination.total_pages} · {pagination.total.toLocaleString()} total
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
                          <Button variant={p === pagination.page ? 'default' : 'outline'} size="icon" className="h-8 w-8 text-xs"
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Failures dialog */}
      <Dialog open={failuresOpen} onOpenChange={setFailuresOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Failed messages</DialogTitle>
            <DialogDescription>
              {failuresEntry?.new_data.audience} · sent {failuresEntry && formatDistanceToNow(new Date(failuresEntry.created_at), { addSuffix: true })}
            </DialogDescription>
          </DialogHeader>

          {failuresLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : failures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground text-sm">
              <CheckCircle2 className="h-8 w-8 opacity-30" />
              No failure records found for this broadcast.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {failures.map(f => (
                <div key={f.id} className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.recipient_name || '—'}</p>
                    <p className="text-xs text-muted-foreground font-mono">{f.recipient_phone}</p>
                    {f.error_detail && <p className="text-xs text-destructive mt-1 line-clamp-2">{f.error_detail}</p>}
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0 gap-1.5"
                    disabled={retryingId === f.id} onClick={() => retryOne(f.id)}>
                    {retryingId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                    Retry
                  </Button>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFailuresOpen(false)}>Close</Button>
            {failures.length > 0 && (
              <Button onClick={retryAllInDialog} disabled={retryingAll} className="gap-2">
                {retryingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                Retry All ({failures.length})
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}