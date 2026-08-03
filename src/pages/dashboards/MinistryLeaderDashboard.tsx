import { Users, ClipboardCheck, CalendarDays, BookOpen, Loader2, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useDashboard } from "@/lib/useDashboard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function MinistryLeaderDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { stats, loading } = useDashboard();

  return (
    <div className="animate-fade-in space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6 shadow-lg">
        <div className="absolute bottom-0 left-0 w-36 h-36 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/4" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-5 w-5 opacity-80" />
              <Badge className="bg-white/20 text-white border-0 text-xs">Ministry Leader</Badge>
            </div>
            <h1 className="text-2xl font-bold">Welcome, {profile?.full_name?.split(' ')[0] || 'Leader'}</h1>
            <p className="text-white/70 text-sm mt-1">Ministry overview — attendance and upcoming events</p>
          </div>
          <Button variant="secondary" size="sm" className="shrink-0 bg-white/20 hover:bg-white/30 text-white border-0 gap-2" onClick={() => navigate("/broadcast")}>
            <MessageSquare className="h-4 w-4" /> Broadcast
          </Button>
        </div>
        <div className="relative grid grid-cols-3 gap-3 mt-5">
          {[["Members", stats.totalMembers], ["Last Sunday", stats.lastSundayAttendance], ["Events", stats.upcomingEventsCount]].map(([l, v]) => (
            <div key={l as string} className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
              <p className="text-white/60 text-xs">{l}</p>
              <p className="text-white font-bold text-xl tabular-nums mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {loading ? <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin mr-2 text-muted-foreground" />Loading…</div> : (
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
            <CardHeader className="pb-2"><CardTitle className="text-base">Upcoming Events</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {stats.upcomingEvents.length === 0
                ? <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2"><CalendarDays className="h-8 w-8 opacity-30" /><p className="text-sm">No upcoming events</p></div>
                : stats.upcomingEvents.map((ev: any) => (
                  <div key={ev.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0 text-center leading-none">
                      <div>
                        <div className="text-[10px] font-bold text-orange-600 uppercase">{new Date(ev.date).toLocaleString('en-US',{month:'short'})}</div>
                        <div className="text-sm font-bold text-orange-600">{new Date(ev.date).getDate()}</div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{ev.title}</p>
                      <p className="text-xs text-muted-foreground">{ev.time ?? ev.date}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{ev.type}</Badge>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}