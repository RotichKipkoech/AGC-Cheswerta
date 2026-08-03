/**
 * session.ts — Client-side JWT parsing + session security utilities.
 *
 * - Decodes JWT payload (no verify — signature verified by backend)
 * - Detects token expiry
 * - Tracks user activity for inactivity timeout
 */

export interface JWTPayload {
  sub: string;       // user id
  exp: number;       // expiry (unix seconds)
  iat: number;       // issued at
}

/** Decode a JWT without verifying the signature. Returns null if malformed. */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload as JWTPayload;
  } catch {
    return null;
  }
}

/** Returns true if token is expired or will expire within `bufferSeconds`. */
export function isTokenExpired(token: string, bufferSeconds = 0): boolean {
  const payload = decodeJWT(token);
  if (!payload?.exp) return true;
  return Date.now() / 1000 >= payload.exp - bufferSeconds;
}

/** Returns seconds until token expires. Negative = already expired. */
export function tokenSecondsRemaining(token: string): number {
  const payload = decodeJWT(token);
  if (!payload?.exp) return -1;
  return payload.exp - Date.now() / 1000;
}

/** Returns true if token expires within the next `minutes` minutes. */
export function tokenExpiresSoon(token: string, minutes = 10): boolean {
  return tokenSecondsRemaining(token) < minutes * 60;
}

// ── Inactivity tracker ────────────────────────────────────────────────────────
const EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
let lastActivity = Date.now();
let trackingStarted = false;

function handleActivity() {
  lastActivity = Date.now();
}

export function startActivityTracking() {
  if (trackingStarted) return;
  EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
  trackingStarted = true;
}

export function stopActivityTracking() {
  EVENTS.forEach(e => window.removeEventListener(e, handleActivity));
  trackingStarted = false;
}

/** Returns seconds since last user activity. */
export function secondsSinceActivity(): number {
  return (Date.now() - lastActivity) / 1000;
}

/** Returns true if user has been inactive longer than `minutes`. */
export function isInactive(minutes: number): boolean {
  return secondsSinceActivity() > minutes * 60;
}