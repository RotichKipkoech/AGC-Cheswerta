import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { UploadCloud, Download, Loader2, CheckCircle2, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { apiBulkImport, type BulkImportResource, type BulkImportResult } from '@/lib/api';

const TEMPLATES: Record<BulkImportResource, { columns: string[]; example: string[] }> = {
  members: {
    columns: ['full_name', 'email', 'phone', 'gender', 'date_of_birth', 'address', 'baptism_status', 'department', 'join_date', 'status'],
    example: ['Jane Wanjiru', 'jane@example.com', '+254712345678', 'female', '1990-05-14', 'Nairobi', 'baptized', 'Choir', '2024-01-10', 'active'],
  },
  departments: {
    columns: ['name', 'description', 'leader_name'],
    example: ['Youth Ministry', 'Ministry for teens and young adults', 'John Otieno'],
  },
};

function downloadTemplate(resource: BulkImportResource) {
  const { columns, example } = TEMPLATES[resource];
  const csv = [columns.join(','), example.map(v => `"${v.replace(/"/g, '""')}"`).join(',')].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${resource}-template.csv`; a.click();
  URL.revokeObjectURL(url);
}

export function BulkImportDialog({ open, onOpenChange, defaultResource = 'members', onImported, lockResource = false }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultResource?: BulkImportResource;
  onImported?: () => void;
  /** When true, hides the resource picker — used when the dialog is opened
   * from a page that already implies what's being imported (Members page,
   * Departments page), so you can't accidentally switch to the other type. */
  lockResource?: boolean;
}) {
  const [resource, setResource] = useState<BulkImportResource>(defaultResource);
  const [file, setFile] = useState<File | null>(null);
  const [sendWelcomeSms, setSendWelcomeSms] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  // Keep resource in sync with defaultResource whenever the dialog (re)opens —
  // matters if the same component instance is ever reused across contexts.
  useEffect(() => {
    if (open) setResource(defaultResource);
  }, [open, defaultResource]);

  const reset = () => { setFile(null); setResult(null); setSendWelcomeSms(false); };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await apiBulkImport(resource, file, { sendWelcomeSms: resource === 'members' && sendWelcomeSms });
      setResult(res);
      if (res.imported > 0) {
        toast.success(`Imported ${res.imported} of ${res.total_rows} ${resource}`);
        onImported?.();
      } else {
        toast.error('No rows were imported — see details below');
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const columns = TEMPLATES[resource].columns;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UploadCloud className="h-5 w-5" />Bulk import</DialogTitle>
          <DialogDescription>
            {lockResource
              ? `Upload a CSV or JSON file to create many ${resource} at once. Rows with problems are skipped and listed below — the rest still import.`
              : 'Upload a CSV or JSON file to create many records at once. Rows with problems are skipped and listed below — the rest still import.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!lockResource && (
            <div className="space-y-2">
              <Label>What are you importing?</Label>
              <Select value={resource} onValueChange={v => { setResource(v as BulkImportResource); reset(); }} disabled={importing}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="members">Members</SelectItem>
                  <SelectItem value="departments">Departments</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>File (.csv or .json)</Label>
              <button type="button" onClick={() => downloadTemplate(resource)} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                <Download className="h-3 w-3" />Download template
              </button>
            </div>
            <Input
              type="file"
              accept=".csv,.json,application/json,text/csv"
              disabled={importing}
              onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
            />
            <p className="text-xs text-muted-foreground">
              Columns recognised for {resource}: {columns.join(', ')}. Only {resource === 'members' ? 'full_name' : 'name'} is required — headers are matched loosely (case and spacing don't matter).
            </p>
          </div>

          {resource === 'members' && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="bulk-import-sms" className="cursor-pointer">Send welcome SMS</Label>
                <p className="text-xs text-muted-foreground">Off by default for imports, so you don't SMS-blast historical or bulk data.</p>
              </div>
              <Switch id="bulk-import-sms" checked={sendWelcomeSms} onCheckedChange={setSendWelcomeSms} disabled={importing} />
            </div>
          )}

          {result && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-emerald-500/15 text-emerald-700 border-0 gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{result.imported} imported</Badge>
                  {result.failed > 0 && <Badge className="bg-destructive/10 text-destructive border-0 gap-1"><FileWarning className="h-3.5 w-3.5" />{result.failed} skipped</Badge>}
                  <span className="text-xs text-muted-foreground">of {result.total_rows} rows</span>
                  {typeof result.sms_sent === 'number' && <span className="text-xs text-muted-foreground">· {result.sms_sent} SMS sent</span>}
                </div>
                {result.errors.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border divide-y">
                    {result.errors.map((e, i) => (
                      <div key={i} className="px-3 py-1.5 text-xs flex gap-2">
                        <span className="text-muted-foreground shrink-0">Row {e.row}</span>
                        <span className="text-destructive">{e.error}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>{result ? 'Done' : 'Cancel'}</Button>
          <Button onClick={handleImport} disabled={!file || importing} className="gap-2">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {importing ? 'Importing…' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}