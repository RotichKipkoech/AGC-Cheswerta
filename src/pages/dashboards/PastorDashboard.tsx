import { Users, ClipboardCheck, TrendingUp, TrendingDown, BookOpen, Heart, Loader2, Receipt, ClipboardList, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

const ROLE_LABELS: Record<string, string> = { pastor: "Pastor", lay_leader: "Lay Leader" };
import { useNavigate } from "react-router-dom";
import { useDashboard } from "@/lib/useDashboard";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const KES = (n: number) => `KES ${Number(n ?? 0).toLocaleString()}`;

export default function PastorDashboard() {
  const { profile, role } = useAuth();
  const roleLabel = ROLE_LABELS[role ?? ""] ?? "Pastor";
  const navigate = useNavigate();
  const { stats, loading } = useDashboard();

  const currentMonth = stats.monthlyGivings[stats.monthlyGivings.length - 1];
  const thisMonthGivings = currentMonth
    ? currentMonth.tithes + currentMonth.offerings + currentMonth.mission + currentMonth.babyCenter
    : 0;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 to-violet-700 text-white p-6 shadow-lg">
        <div className="absolute bottom-0 right-0 w-40 h-40 bg-white/5 rounded-full translate-y-1/2 translate-x-1/4" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-5 w-5 opacity-80" />
              <Badge className="bg-white/20 text-white border-0 text-xs">{roleLabel}</Badge>
            </div>
            <h1 className="text-2xl font-bold">Welcome, {profile?.full_name?.split(' ')[0] || roleLabel}</h1>
            <p className="text-white/70 text-sm mt-1">Spiritual oversight — membership, attendance & upcoming events</p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0 gap-2" onClick={() => navigate("/finance")}>
              <Receipt className="h-4 w-4" /> Record Giving
            </Button>
            <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0 gap-2" onClick={() => navigate("/attendance")}>
              <ClipboardList className="h-4 w-4" /> Attendance
            </Button>
            <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0 gap-2" onClick={() => navigate("/broadcast")}>
              <MessageSquare className="h-4 w-4" /> Broadcast
            </Button>
          </div>
        </div>
        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { label: "Members", value: stats.totalMembers as number | string, growthPct: undefined as number | undefined },
            { label: "Baptized", value: stats.baptizedMembers, growthPct: undefined },
            { label: "Last Sunday", value: stats.lastSundayAttendance, growthPct: stats.lastSundayGrowthPct },
            { label: "This Month", value: KES(thisMonthGivings), growthPct: undefined },
          ].map((s) => (
            <div key={s.label} className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
              <p className="text-white/60 text-xs">{s.label}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-white font-bold text-xl tabular-nums">{s.value}</p>
                {s.growthPct !== undefined && (
                  <span className={`text-[11px] font-semibold flex items-center gap-0.5 ${s.growthPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {s.growthPct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {s.growthPct >= 0 ? "+" : "-"}{Math.abs(Math.round(s.growthPct))}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {loading ? <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin mr-2 text-muted-foreground" />Loading…</div> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { title: "Church Members", value: stats.totalMembers, sub: `${stats.baptizedMembers} baptized`, icon: Users, from: "from-violet-500/20", text: "text-violet-600", border: "border-violet-500/20", growthPct: undefined as number | undefined },
              { title: "Last Sunday", value: stats.lastSundayAttendance, sub: "attendance", icon: ClipboardCheck, from: "from-blue-500/20", text: "text-blue-600", border: "border-blue-500/20", growthPct: stats.lastSundayGrowthPct },
              { title: "This Month Givings", value: KES(thisMonthGivings), sub: "tithes, offerings & mission", icon: Receipt, from: "from-emerald-500/20", text: "text-emerald-600", border: "border-emerald-500/20", growthPct: undefined },
            ].map(m => (
              <Card key={m.title} className={`border ${m.border} hover:shadow-md transition-all`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{m.title}</p>
                      <p className="text-2xl font-bold mt-1 tabular-nums">{m.value}</p>
                      <div className="flex items-center gap-1 mt-2">
                        {m.growthPct !== undefined ? (
                          <>
                            {m.growthPct >= 0 ? <TrendingUp className="h-3 w-3 text-emerald-600" /> : <TrendingDown className="h-3 w-3 text-red-600" />}
                            <span className={`text-xs font-medium ${m.growthPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {m.growthPct >= 0 ? "+" : "-"}{Math.abs(Math.round(m.growthPct))}% vs last week
                            </span>
                          </>
                        ) : (
                          <>
                            <Heart className={`h-3 w-3 ${m.text}`} /><span className="text-xs text-muted-foreground">{m.sub}</span>
                          </>
                        )}
                      </div>
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
                ) : <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No attendance data yet</div>}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 hover:shadow-md transition-shadow">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Givings Overview</CardTitle>
                <span className="text-sm font-semibold text-violet-600 tabular-nums">{KES(stats.totalGivings)}</span>
              </CardHeader>
              <CardContent>
                {stats.monthlyGivings.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={stats.monthlyGivings}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} formatter={(v: number) => KES(v)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="tithes" stroke="hsl(0,84%,60%)" name="Tithes" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="offerings" stroke="hsl(220,80%,60%)" name="Offerings" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="mission" stroke="hsl(160,70%,45%)" name="Mission" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No givings data yet</div>}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}