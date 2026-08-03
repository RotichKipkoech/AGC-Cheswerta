import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { SystemSettingsProvider } from "@/contexts/SystemSettingsContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import { MaintenanceGate } from "@/components/SystemBanner";
import ModuleGate from "@/components/ModuleGate";
import Dashboard from "./pages/Dashboard";
import Members from "./pages/Members";
import Finance from "./pages/Finance";
import Ministries from "./pages/Ministries";
import Events from "./pages/Events";
import Attendance from "./pages/Attendance";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import CPanel from "./pages/CPanel";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Broadcast from '@/pages/Broadcast';
import CouncilMembers from '@/pages/CouncilMembers';
import FellowshipSchedule from '@/pages/FellowshipSchedule';
import SmsLogs from '@/pages/SmsLogs';
import PendingDeletions from '@/pages/PendingDeletions';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SystemSettingsProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <MaintenanceGate>
                      <AppLayout>
                        <Routes>
                          <Route path="/" element={<Dashboard />} />
                          <Route path="/members" element={<ProtectedRoute permKey="members" allowedRoles={['admin', 'secretary', 'pastor', 'lay_leader']}><ModuleGate moduleKey="members"><Members /></ModuleGate></ProtectedRoute>} />
                          <Route path="/finance" element={<ProtectedRoute permKey="finance" allowedRoles={['admin', 'treasurer', 'pastor', 'lay_leader']}><ModuleGate moduleKey="finance"><Finance /></ModuleGate></ProtectedRoute>} />
                          <Route path="/departments" element={<ProtectedRoute permKey="departments" allowedRoles={['admin', 'pastor', 'ministry_leader', 'lay_leader']}><ModuleGate moduleKey="departments"><Ministries /></ModuleGate></ProtectedRoute>} />
                          <Route path="/events" element={<ModuleGate moduleKey="events"><Events /></ModuleGate>} />
                          <Route path="/attendance" element={<ProtectedRoute permKey="attendance" allowedRoles={['admin', 'secretary', 'pastor', 'lay_leader']}><ModuleGate moduleKey="attendance"><Attendance /></ModuleGate></ProtectedRoute>} />
                          <Route path="/reports" element={<ProtectedRoute permKey="reports" allowedRoles={['admin', 'treasurer', 'secretary', 'pastor', 'lay_leader']}><ModuleGate moduleKey="reports"><Reports /></ModuleGate></ProtectedRoute>} />
                          <Route path="/users" element={<ProtectedRoute allowedRoles={['admin']}><ModuleGate moduleKey="users"><Users /></ModuleGate></ProtectedRoute>} />
                          <Route path="/settings" element={<ModuleGate moduleKey="settings"><Settings /></ModuleGate>} />
                          <Route path="/cpanel" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']}><CPanel /></ProtectedRoute>} />
                          <Route path="/broadcast" element={<ProtectedRoute permKey="broadcast" allowedRoles={['super_admin', 'admin', 'secretary', 'pastor', 'treasurer', 'ministry_leader', 'lay_leader']}><ModuleGate moduleKey="broadcast"><Broadcast /></ModuleGate></ProtectedRoute>} />
                          <Route path="/council" element={<ProtectedRoute permKey="council" allowedRoles={['super_admin', 'admin', 'pastor', 'secretary', 'lay_leader']}><CouncilMembers /></ProtectedRoute>} />
                          <Route path="/fellowship" element={<ProtectedRoute><FellowshipSchedule /></ProtectedRoute>} />  {/* open to all authenticated users — read-only unless admin/super_admin */}
                          <Route path="/sms-logs" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']}><SmsLogs /></ProtectedRoute>} />
                          <Route path="/pending-deletions" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']}><PendingDeletions /></ProtectedRoute>} />
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                      </AppLayout>
                    </MaintenanceGate>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </SystemSettingsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;