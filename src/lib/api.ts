const TOKEN_KEY = "agc_token";

export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) || "https://agc-cheswerta.onrender.com";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};

export async function apiFetch<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const isFormData = opts.body instanceof FormData;
  const headers: Record<string, string> = isFormData
    ? {}
    : { "Content-Type": "application/json", ...(opts.headers as Record<string, string>) };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  const body = text ? safeJSON(text) : null;
  if (!res.ok) {
    const msg =
      (body && (body.error || body.message)) ||
      (res.status === 403 ? "You do not have permission to perform this action." : null) ||
      (res.status === 401 ? "Session expired. Please sign in again." : null) ||
      res.statusText ||
      "Request failed";
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg)) as any;
    err.status = res.status; err.body = body;
    if (res.status === 401) setToken(null);
    throw err;
  }
  return body as T;
}

function safeJSON(s: string) {
  try { return JSON.parse(s); } catch { return s; }
}

export async function apiUpload(
  bucket: "avatars" | "branding",
  file: File,
  suggestedPath?: string,
): Promise<{ url: string; path: string }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("bucket", bucket);
  if (suggestedPath) fd.append("path", suggestedPath);
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/storage/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = "Upload failed";
    try { msg = JSON.parse(text).error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────
//  Bulk CSV/JSON import (members, departments)
// ─────────────────────────────────────────────────────────────

export type BulkImportResource = "members" | "departments";

export interface BulkImportResult {
  total_rows: number;
  imported: number;
  failed: number;
  errors: { row: number; error: string }[];
  items: any[];
  sms_sent?: number;
}

export async function apiBulkImport(
  resource: BulkImportResource,
  file: File,
  opts: { sendWelcomeSms?: boolean } = {},
): Promise<BulkImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  const token = getToken();
  const qs = opts.sendWelcomeSms ? "?send_welcome_sms=true" : "";
  const res = await fetch(`${API_BASE}/api/${resource}/bulk-import${qs}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const text = await res.text();
  const body = text ? safeJSON(text) : null;
  if (!res.ok) {
    const msg =
      (body && (body.error || body.message)) ||
      (res.status === 403 ? "You do not have permission to perform this action." : null) ||
      (res.status === 401 ? "Session expired. Please sign in again." : null) ||
      res.statusText ||
      "Import failed";
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg)) as any;
    err.status = res.status; err.body = body;
    if (res.status === 401) setToken(null);
    throw err;
  }
  return body as BulkImportResult;
}