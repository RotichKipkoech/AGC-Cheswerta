import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch, getToken, setToken } from '@/lib/api';

export type AppRole =
  | 'super_admin'
  | 'admin'
  | 'pastor'
  | 'secretary'
  | 'treasurer'
  | 'ministry_leader'
  | 'lay_leader';

export interface AppUser {
  id: string;
  username: string;
  email: string;
}

export interface AppProfile {
  full_name: string;
  email: string | null;
  avatar_url: string | null;
}

interface AuthContextType {
  user: AppUser | null;
  role: AppRole | null;
  profile: AppProfile | null;
  loading: boolean;
  /** Returns true when a valid token exists */
  isAuthenticated: boolean;
  signIn: (username: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [loading, setLoading] = useState(true);

  /** Hydrate auth state from the backend using the stored JWT. */
  const hydrateFromToken = async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<{ user: AppUser; profile: AppProfile | null; role: AppRole | null }>('/api/auth/me');
      setUser(data.user);
      setProfile(data.profile);
      setRole(data.role);
    } catch {
      // Token invalid / expired — clear it
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    hydrateFromToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (username: string, password: string): Promise<{ error: Error | null }> => {
    try {
      const data = await apiFetch<{
        token: string;
        user: AppUser;
        profile: AppProfile | null;
        role: AppRole | null;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
      });
      setToken(data.token);
      setUser(data.user);
      setProfile(data.profile);
      setRole(data.role);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Invalid username or password') };
    }
  };

  const signOut = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Best-effort; clear client state regardless
    } finally {
      setToken(null);
      setUser(null);
      setRole(null);
      setProfile(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        profile,
        loading,
        isAuthenticated: !!user,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}