import { Users, ClipboardCheck, CalendarDays, TrendingUp, FileText, UserPlus, Loader2, Receipt, Church, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useDashboard } from "@/lib/useDashboard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function SecretaryDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { stats, loading } = useDashboard();

  return (
    <div className="animate-fade-in space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white p-6 shadow-lg">
        <div className="absolute top-0 left-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 -translate-x-1/4" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-5 w-5 opacity-80" />
              <Badge className="bg-white/20 text-white border-0 text-xs">Secretary</Badge>
            </div>
            <h1 className="text-2xl font-bold">Welcome, {profile?.full_name?.split(' ')[0] || 'Secretary'}</h1>
            <p className="text-white/70 text-sm mt-1">Membership records, attendance & church administration</p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0 gap-2" onClick={() => navigate("/members")}>
              <UserPlus className="h-4 w-4" /> Add Member
            </Button>
            <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0 gap-2" onClick={() => navigate("/finance")}>
              <Receipt className="h-4 w-4" /> Record Giving
            </Button>
            <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0 gap-2" onClick={() => navigate("/departments")}>
              <Church className="h-4 w-4" /> Departments
            </Button>
            <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0 gap-2" onClick={() => navigate("/broadcast")}>
              <MessageSquare className="h-4 w-4" /> Broadcast
            </Button>
          </div>
        </div>
        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[["Members", stats.totalMembers], ["Active", stats.activeMembers], ["Attendance Records", stats.attendanceRecords], ["Events", stats.upcomingEventsCount]].map(([l, v]) => (
            <div key={l as string} className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
              <p className="text-white/60 text-xs">{l}</p>
              <p className="text-white font-bold text-xl tabular-nums mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {loading ? <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin mr-2 text-muted-foreground" />Loading…</div> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { title: "Total Members", value: stats.totalMembers, sub: `${stats.baptizedMembers} baptized`, icon: Users, from: "from-blue-500/20", text: "text-blue-600", border: "border-blue-500/20" },
              { title: "Attendance Records", value: stats.attendanceRecords, sub: "services recorded", icon: ClipboardCheck, from: "from-teal-500/20", text: "text-teal-600", border: "border-teal-500/20" },
              { title: "Upcoming Events", value: stats.upcomingEventsCount, sub: "scheduled", icon: CalendarDays, from: "from-purple-500/20", text: "text-purple-600", border: "border-purple-500/20" },
            ].map(m => (
              <Card key={m.title} className={`border ${m.border} hover:shadow-md transition-all`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{m.title}</p>
                      <p className="text-2xl font-bold mt-1 tabular-nums">{m.value}</p>
                      <div className="flex items-center gap-1 mt-2"><TrendingUp className={`h-3 w-3 ${m.text}`} /><span className="text-xs text-muted-foreground">{m.sub}</span></div>
                    </div>
                    <div className={`bg-gradient-to-br ${m.from} to-transparent p-2.5 rounded-xl`}><m.icon className={`h-5 w-5 ${m.text}`} /></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <Card className="lg:col-span-3 hover:shadow-md transition-shadow">
              <CardHeader className="pb-2"><CardTitle className="text-base">Attendance Trends</CardTitle></CardHeader>
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
                ) : <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No data yet</div>}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 hover:shadow-md transition-shadow">
              <CardHeader className="pb-2"><CardTitle className="text-base">Recent Members</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {stats.recentMembers.length === 0
                  ? <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2"><Users className="h-8 w-8 opacity-30" /><p className="text-sm">No members yet</p></div>
                  : stats.recentMembers.map((m: any) => {
                    const initials = m.full_name?.split(' ').slice(0,2).map((n:string)=>n[0]??'').join('').toUpperCase()||'?';
                    return (
                      <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors">
                        <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-blue-600">{initials}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{m.full_name}</p>
                          <p className="text-xs text-muted-foreground">{m.department ?? '—'} • {m.phone ?? '—'}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0 capitalize">{m.status}</Badge>
                      </div>
                    );
                  })}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}