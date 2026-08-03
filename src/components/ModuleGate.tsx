import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemSettings } from '@/contexts/SystemSettingsContext';
import { Card, CardContent } from '@/components/ui/card';
import { PowerOff } from 'lucide-react';


export default function ModuleGate({
  moduleKey,
  children,
}: {
  moduleKey: string;
  children: React.ReactNode;
}) {
  const { isModuleEnabled, loading } = useSystemSettings();
  const { role } = useAuth();
  if (loading) return <>{children}</>;
  if (role === 'super_admin') return <>{children}</>;
  if (isModuleEnabled(moduleKey)) return <>{children}</>;

  return (
    <div className="flex items-center justify-center py-24">
      <Card className="max-w-md text-center">
        <CardContent className="p-8 space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <PowerOff className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold">Module unavailable</h2>
          <p className="text-muted-foreground text-sm">
            This module has been disabled by an administrator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
