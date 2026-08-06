import { useEffect, useState } from 'react';
import { apiFetch } from './api';

export interface DashboardStats {
  totalMembers: number;
  baptizedMembers: number;
  activeMembers: number;
  totalGivings: number;
  totalTithes: number;
  totalOfferings: number;
  totalMission: number;
  totalBabyCenter: number;
  totalSpecial: number;
  lastSundayAttendance: number;
  lastSundayGrowthPct: number;
  attendanceRecords: number;
  upcomingEventsCount: number;
  upcomingEvents: any[];
  recentMembers: any[];
  recentGivings: any[];
  monthlyAttendance: { month: string; sunday: number; thursday: number }[];
  monthlyGivings: { month: string; tithes: number; offerings: number; mission: number; babyCenter: number; special: number }[];
}

const DEFAULTS: DashboardStats = {
  totalMembers: 0, baptizedMembers: 0, activeMembers: 0,
  totalGivings: 0, totalTithes: 0, totalOfferings: 0, totalMission: 0, totalBabyCenter: 0, totalSpecial: 0,
  lastSundayAttendance: 0, lastSundayGrowthPct: 0, attendanceRecords: 0,
  upcomingEventsCount: 0, upcomingEvents: [], recentMembers: [], recentGivings: [],
  monthlyAttendance: [], monthlyGivings: [],
};

export function useDashboard() {
  const [stats, setStats] = useState<DashboardStats>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [membersRes, givingsRes, attendanceRes, eventsRes] = await Promise.allSettled([
          // /api/members now paginates (default 50/page) — request the backend's
          // max page size so this hook still sees the whole roster for computing
          // baptized/active/recent-members, and read `total` (not array length)
          // for the headline member count so it stays correct even beyond 200.
          apiFetch<{ members: any[]; total: number }>('/api/members?per_page=200'),
          apiFetch<{ givings: any[] }>('/api/givings'),
          apiFetch<{ attendance: any[] }>('/api/attendance'),
          apiFetch<{ data: any[] }>('/api/db', {
            method: 'POST',
            body: JSON.stringify({
              table: 'events', op: 'select',
              filters: [{ col: 'date', op: 'gte', value: new Date().toISOString().slice(0, 10) }],
              order: [{ col: 'date', ascending: true }], limit: 5,
            }),
          }),
        ]);

        if (!mounted) return;

        const members: any[] = membersRes.status === 'fulfilled' ? (membersRes.value.members ?? []) : [];
        const membersTotal: number = membersRes.status === 'fulfilled'
          ? (membersRes.value.total ?? members.length)
          : 0;
        const givings: any[] = givingsRes.status === 'fulfilled' ? (givingsRes.value.givings ?? []) : [];
        const attendance: any[] = attendanceRes.status === 'fulfilled' ? (attendanceRes.value.attendance ?? []) : [];
        const events: any[] = eventsRes.status === 'fulfilled' ? (eventsRes.value.data ?? []) : [];

        // Members
        const baptized = members.filter(m => m.baptism_status === 'Baptized').length;
        const active = members.filter(m => m.status === 'active').length;
        const recent = [...members].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

        // Givings
        const totals = givings.reduce((acc, g) => {
          acc.grand += Number(g.amount);
          if (g.type === 'Tithe') acc.tithes += Number(g.amount);
          else if (g.type === 'Offering') acc.offerings += Number(g.amount);
          else if (g.type === 'Mission') acc.mission += Number(g.amount);
          else if (g.type === 'Baby Center') acc.babyCenter += Number(g.amount);
          else if (g.type === 'Special Giving') acc.special += Number(g.amount);
          return acc;
        }, { grand: 0, tithes: 0, offerings: 0, mission: 0, babyCenter: 0, special: 0 });

        const recentGivings = [...givings].sort((a, b) => new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime()).slice(0, 5);

        // "2025-05" → "May", "2025-01" → "Jan", etc.
        const monthLabel = (ym: string) => {
          const [y, mo] = ym.split('-').map(Number);
          return new Date(y, mo - 1, 1).toLocaleString('en-US', { month: 'short' });
        };

        // Monthly givings (last 6 months)
        const gMap: Record<string, any> = {};
        givings.forEach(g => {
          const m = g.date.slice(0, 7);
          if (!gMap[m]) gMap[m] = { month: monthLabel(m), tithes: 0, offerings: 0, mission: 0, babyCenter: 0, special: 0 };
          if (g.type === 'Tithe') gMap[m].tithes += Number(g.amount);
          else if (g.type === 'Offering') gMap[m].offerings += Number(g.amount);
          else if (g.type === 'Mission') gMap[m].mission += Number(g.amount);
          else if (g.type === 'Baby Center') gMap[m].babyCenter += Number(g.amount);
          else if (g.type === 'Special Giving') gMap[m].special += Number(g.amount);
        });
        const monthlyGivings = Object.entries(gMap).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([, v]) => v);

        // Attendance
        const sortedAttendance = [...attendance].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const sundays = sortedAttendance.filter(a => (a.service_type || a.event_name || '').includes('Sunday'));
        const lastSunday = sundays[0]?.total_present ?? 0;
        const prevSunday = sundays[1]?.total_present ?? 0;
        const lastSundayGrowthPct = prevSunday > 0
          ? ((lastSunday - prevSunday) / prevSunday) * 100
          : (lastSunday > 0 ? 100 : 0);

        const aMap: Record<string, any> = {};
        attendance.forEach(a => {
          const m = a.date.slice(0, 7);
          if (!aMap[m]) aMap[m] = { month: monthLabel(m), sunday: 0, thursday: 0 };
          const st = a.service_type || a.event_name || '';
          if (st.includes('Sunday')) aMap[m].sunday += a.total_present ?? 0;
          else if (st.includes('Thursday')) aMap[m].thursday += a.total_present ?? 0;
        });
        const monthlyAttendance = Object.entries(aMap).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([, v]) => v);

        setStats({
          totalMembers: membersTotal,
          baptizedMembers: baptized,
          activeMembers: active,
          totalGivings: totals.grand,
          totalTithes: totals.tithes,
          totalOfferings: totals.offerings,
          totalMission: totals.mission,
          totalBabyCenter: totals.babyCenter,
          totalSpecial: totals.special,
          lastSundayAttendance: lastSunday,
          lastSundayGrowthPct,
          attendanceRecords: attendance.length,
          upcomingEventsCount: events.length,
          upcomingEvents: events,
          recentMembers: recent,
          recentGivings: recentGivings,
          monthlyAttendance,
          monthlyGivings,
        });
      } catch (e) {
        console.error('Dashboard load error', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  return { stats, loading };
}