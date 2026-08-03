import { Wallet, HandCoins, Gift, Globe2, Baby, Sparkles, Loader2, Receipt, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useDashboard } from "@/lib/useDashboard";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";

const KES = (n: number) => `KES ${Number(n ?? 0).toLocaleString()}`;

const pctChange = (curr: number, prev: number) => {
  if (prev > 0) return ((curr - prev) / prev) * 100;
  return curr > 0 ? 100 : 0;
};

function GrowthBadge({ pct, dark = false }: { pct: number; dark?: boolean }) {
  const up = pct >= 0;
  const positiveClasses = dark ? "text-emerald-200" : "text-emerald-600";
  const negativeClasses = dark ? "text-red-200" : "text-red-500";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? positiveClasses : negativeClasses}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : "-"}{Math.abs(Math.round(pct))}%
    </span>
  );
}

const BREAKDOWN_COLORS = [
  "hsl(0,84%,60%)",    // Tithes
  "hsl(220,80%,60%)",  // Offerings
  "hsl(160,70%,45%)",  // Mission
  "hsl(0,50%,65%)",    // Baby Center
  "hsl(230,60%,65%)",  // Special
];

export default function TreasurerDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { stats, loading } = useDashboard();

  const monthly = stats.monthlyGivings ?? [];
  const current = monthly[monthly.length - 1];
  const previous = monthly[monthly.length - 2];

  const thisMonth = {
    tithes: current?.tithes ?? 0,
    offerings: current?.offerings ?? 0,
    mission: current?.mission ?? 0,
    babyCenter: current?.babyCenter ?? 0,
    special: current?.special ?? 0,
  };
  const prevMonth = {
    tithes: previous?.tithes ?? 0,
    offerings: previous?.offerings ?? 0,
    mission: previous?.mission ?? 0,
    babyCenter: previous?.babyCenter ?? 0,
    special: previous?.special ?? 0,
  };

  const thisMonthTotal = thisMonth.tithes + thisMonth.offerings + thisMonth.mission + thisMonth.babyCenter + thisMonth.special;
  const prevMonthTotal = prevMonth.tithes + prevMonth.offerings + prevMonth.mission + prevMonth.babyCenter + prevMonth.special;

  const growth = {
    total: pctChange(thisMonthTotal, prevMonthTotal),
    tithes: pctChange(thisMonth.tithes, prevMonth.tithes),
    offerings: pctChange(thisMonth.offerings, prevMonth.offerings),
    mission: pctChange(thisMonth.mission, prevMonth.mission),
    babyCenter: pctChange(thisMonth.babyCenter, prevMonth.babyCenter),
    special: pctChange(thisMonth.special, prevMonth.special),
  };

  const givingTrends = monthly; // [{ month, tithes, offerings, mission, babyCenter, special }]
  const recentTransactions = stats.recentGivings ?? [];

  const breakdownData = [
    { name: "Tithes", value: thisMonth.tithes },
    { name: "Offerings", value: thisMonth.offerings },
    { name: "Mission", value: thisMonth.mission },
    { name: "Baby Center", value: thisMonth.babyCenter },
    { name: "Special", value: thisMonth.special },
  ];

  const categoryCards = [
    { title: "Tithes", value: thisMonth.tithes, growth: growth.tithes, icon: HandCoins, from: "from-red-500/20", text: "text-red-600" },
    { title: "Offerings", value: thisMonth.offerings, growth: growth.offerings, icon: Gift, from: "from-blue-500/20", text: "text-blue-600" },
    { title: "Mission", value: thisMonth.mission, growth: growth.mission, icon: Globe2, from: "from-teal-500/20", text: "text-teal-600" },
    { title: "Baby Center", value: thisMonth.babyCenter, growth: growth.babyCenter, icon: Baby, from: "from-rose-500/20", text: "text-rose-600" },
    { title: "Special", value: thisMonth.special, growth: growth.special, icon: Sparkles, from: "from-indigo-500/20", text: "text-indigo-600" },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 text-white p-6 shadow-lg">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/4" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-5 w-5 opacity-80" />
              <Badge className="bg-white/20 text-white border-0 text-xs">Treasurer</Badge>
            </div>
            <h1 className="text-2xl font-bold">Welcome, {profile?.full_name?.split(" ")[0] || "Treasurer"}</h1>
            <p className="text-white/70 text-sm mt-1">Givings management — tithes, offerings, mission &amp; reports</p>
          </div>
          <Button variant="secondary" className="bg-white/20 hover:bg-white/30 text-white border-0 gap-2 shrink-0" onClick={() => navigate("/finance")}>
            <Receipt className="h-4 w-4" /> Record Giving
          </Button>
        </div>

        <div className="relative mt-5 bg-white/10 rounded-xl p-4 backdrop-blur-sm flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-white/60 text-xs">Total Givings This Month</p>
            <p className="text-white font-bold text-2xl tabular-nums mt-0.5">{KES(thisMonthTotal)}</p>
          </div>
          <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-3 py-1.5">
            <GrowthBadge pct={growth.total} dark />
            <span className="text-white/60 text-xs">vs last month</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin mr-2 text-muted-foreground" />
          Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {categoryCards.map((m) => (
              <Card key={m.title} className="hover:shadow-md transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{m.title}</p>
                      <p className="text-xl font-bold mt-1 tabular-nums truncate">{KES(m.value)}</p>
                      <div className="mt-2"><GrowthBadge pct={m.growth} /></div>
                    </div>
                    <div className={`bg-gradient-to-br ${m.from} to-transparent p-2 rounded-xl shrink-0`}>
                      <m.icon className={`h-4 w-4 ${m.text}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <Card className="lg:col-span-3 hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Givings Trends</CardTitle>
              </CardHeader>
              <CardContent>
                {givingTrends.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={givingTrends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} formatter={(v: number) => KES(v)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="tithes" stroke="hsl(0,84%,60%)" name="Tithes" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="offerings" stroke="hsl(220,80%,60%)" name="Offerings" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="mission" stroke="hsl(160,70%,45%)" name="Mission" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No data yet</div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Givings Breakdown</CardTitle>
                <p className="text-xs text-muted-foreground">This month</p>
              </CardHeader>
              <CardContent>
                {thisMonthTotal > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={breakdownData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={65}
                        outerRadius={100}
                        paddingAngle={2}
                      >
                        {breakdownData.map((_, i) => (
                          <Cell key={i} fill={BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} formatter={(v: number) => KES(v)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No data yet</div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentTransactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <Receipt className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No transactions yet</p>
                </div>
              ) : (
                recentTransactions.map((t: any) => {
                  const donor = t.member_name ?? t.full_name ?? t.donor_name ?? "—";
                  const date = (t.date ?? t.created_at ?? "").slice(0, 10);
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <Receipt className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{donor}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.type} • {date}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-emerald-600 shrink-0">{KES(t.amount)}</p>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}