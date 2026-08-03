import { Navigate } from 'react-router-dom';
import { useAuth, AppRole } from '@/contexts/AuthContext';
import { usePermissions } from '@/lib/usePermissions';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
  /**
   * Optional key into the super-admin-configurable permission map (CPanel →
   * Permissions). When set, access is decided dynamically from the DB
   * instead of the static `allowedRoles` list — `allowedRoles` still serves
   * as the fallback default while permissions are loading, or if this
   * module hasn't been configured yet.
   */
  permKey?: string;
}

export default function ProtectedRoute({ children, allowedRoles, permKey }: ProtectedRouteProps) {
  const { isAuthenticated, role, loading } = useAuth();
  const { canAccess, loading: permsLoading } = usePermissions();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-primary font-display text-lg">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const denied = permKey
    ? !permsLoading && !canAccess(permKey, role, allowedRoles ?? [])
    : !!(allowedRoles && role && !allowedRoles.includes(role));

  if (denied) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <h2 className="text-2xl font-bold font-display text-foreground mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}