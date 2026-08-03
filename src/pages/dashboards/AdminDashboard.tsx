import { useState } from "react";
import { Users, Wallet, ClipboardCheck, CalendarDays, TrendingUp, ArrowUpRight, Shield, Settings, Loader2, Heart, Activity, MessageSquare, UploadCloud } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useDashboard } from "@/lib/useDashboard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { BulkImportDialog } from "@/components/BulkImportDialog";

export default function AdminDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { stats, loading } = useDashboard();
  const [importOpen, setImportOpen] = useState(false);

  const metrics = [
    { title: "Total Members", value: stats.totalMembers.toLocaleString(), sub: `${stats.baptizedMembers} baptized`, icon: Users, gradient: "from-primary/20 to-primary/5", iconColor: "text-primary", border: "border-primary/20" },
    { title: "Total Givings", value: `KES ${stats.totalGivings.toLocaleString()}`, sub: `Tithes: KES ${stats.totalTithes.toLocaleString()}`, icon: Wallet, gradient: "from-emerald-500/20 to-emerald-500/5", iconColor: "text-emerald-600", border: "border-emerald-500/20" },
    { title: "Last Sunday", value: stats.lastSundayAttendance.toLocaleString(), sub: "attendance", icon: ClipboardCheck, gradient: "from-blue-500/20 to-blue-500/5", iconColor: "text-blue-600", border: "border-blue-500/20" },
    { title: "Upcoming Events", value: stats.upcomingEventsCount.toString(), sub: "scheduled", icon: CalendarDays, gradient: "from-purple-500/20 to-purple-500/5", iconColor: "text-purple-600", border: "border-purple-500/20" },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-white p-6 shadow-lg">
        <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,transparent,white)]" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-5 w-5 opacity-80" />
              <Badge className="bg-white/20 text-white border-0 text-xs">Administrator</Badge>
            </div>
            <h1 className="text-2xl font-bold">Welcome back, {profile?.full_name?.split(' ')[0] || 'Admin'}</h1>
            <p className="text-white/70 text-sm mt-1">Full system overview — manage all church operations</p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Button variant="secondary" size="sm" className="gap-2 bg-white/20 hover:bg-white/30 text-white border-0" onClick={() => navigate("/cpanel?tab=overview")}>
              <Settings className="h-4 w-4" /> Control Panel
            </Button>
            <Button variant="secondary" size="sm" className="gap-2 bg-white/20 hover:bg-white/30 text-white border-0" onClick={() => navigate("/broadcast")}>
              <MessageSquare className="h-4 w-4" /> Broadcast
            </Button>
            <Button variant="secondary" size="sm" className="gap-2 bg-white/20 hover:bg-white/30 text-white border-0" onClick={() => setImportOpen(true)}>
              <UploadCloud className="h-4 w-4" /> Bulk Import
            </Button>
          </div>
        </div>
        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[["Members", stats.totalMembers], ["Givings (KES)", stats.totalGivings.toLocaleString()], ["Attendance", stats.attendanceRecords], ["Events", stats.upcomingEventsCount]].map(([l, v]) => (
            <div key={l as string} className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
              <p className="text-white/60 text-xs">{l}</p>
              <p className="text-white font-bold text-xl tabular-nums mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading dashboard…</div>
      ) : (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.map(m => (
              <Card key={m.title} className={`border ${m.border} hover:shadow-md transition-all duration-200 overflow-hidden`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{m.title}</p>
                      <p className="text-2xl font-bold mt-1 tabular-nums truncate">{m.value}</p>
                      <div className="flex items-center gap-1 mt-2">
                        <TrendingUp className="h-3 w-3 text-emerald-500 shrink-0" />
                        <span className="text-xs text-muted-foreground">{m.sub}</span>
                      </div>
                    </div>
                    <div className={`bg-gradient-to-br ${m.gradient} p-2.5 rounded-xl shrink-0 ml-2`}>
                      <m.icon className={`h-5 w-5 ${m.iconColor}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  Attendance Trends
                  <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.monthlyAttendance.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={stats.monthlyAttendance} barCategoryGap="35%">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="sunday" fill="hsl(0,84%,50%)" name="Sunday" radius={[6,6,0,0]} />
                      <Bar dataKey="thursday" fill="hsl(220,80%,60%)" name="Thursday" radius={[6,6,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No attendance data yet</div>}
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  Givings Overview
                  <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.monthlyGivings.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={stats.monthlyGivings}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} formatter={(v: number) => `KES ${v.toLocaleString()}`} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="tithes" stroke="hsl(0,84%,50%)" strokeWidth={2.5} name="Tithes" dot={false} />
                      <Line type="monotone" dataKey="offerings" stroke="hsl(220,80%,60%)" strokeWidth={2.5} name="Offerings" dot={false} />
                      <Line type="monotone" dataKey="mission" stroke="hsl(160,64%,40%)" strokeWidth={2.5} name="Mission" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No givings data yet</div>}
              </CardContent>
            </Card>
          </div>

          {/* Bottom Row: Recent Members + Recent Givings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2"><CardTitle className="text-base">Recent Members</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {stats.recentMembers.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No members yet</p>
                  : stats.recentMembers.map((m: any) => {
                    const initials = m.full_name?.split(' ').slice(0,2).map((n:string)=>n[0]??'').join('').toUpperCase()||'?';
                    return (
                      <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-primary">{initials}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{m.full_name}</p>
                          <p className="text-xs text-muted-foreground">{m.department ?? 'No ministry'}</p>
                        </div>
                        <Badge variant={m.status === 'active' ? 'secondary' : 'outline'} className="text-[10px] shrink-0">{m.status}</Badge>
                      </div>
                    );
                  })}
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2"><CardTitle className="text-base">Recent Transactions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {stats.recentGivings.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No transactions yet</p>
                  : stats.recentGivings.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 flex items-center justify-center shrink-0">
                        <Wallet className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.member_name || '—'}</p>
                        <p className="text-xs text-muted-foreground">{r.type} • {r.date}</p>
                      </div>
                      <span className="text-sm font-bold text-emerald-600 tabular-nums shrink-0">KES {Number(r.amount).toLocaleString()}</span>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <BulkImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}