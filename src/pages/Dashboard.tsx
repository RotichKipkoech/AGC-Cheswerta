import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AdminDashboard from './dashboards/AdminDashboard';
import PastorDashboard from './dashboards/PastorDashboard';
import SecretaryDashboard from './dashboards/SecretaryDashboard';
import TreasurerDashboard from './dashboards/TreasurerDashboard';
import MinistryLeaderDashboard from './dashboards/MinistryLeaderDashboard';

export default function Dashboard() {
  const { role } = useAuth();

  if (role === 'super_admin') return <Navigate to="/cpanel?tab=overview" replace />;

  switch (role) {
    case 'admin':      return <AdminDashboard />;
    case 'pastor':     return <PastorDashboard />;
    case 'lay_leader': return <PastorDashboard />;
    case 'secretary':  return <SecretaryDashboard />;
    case 'treasurer':  return <TreasurerDashboard />;
    case 'ministry_leader': return <MinistryLeaderDashboard />;
    default:           return <AdminDashboard />;
  }
}