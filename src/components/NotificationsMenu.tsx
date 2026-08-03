import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Inbox, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

type Notification = {
  id: string;
  title: string;
  message: string;
  time: Date;
  read: boolean;
  type: 'info' | 'finance' | 'attendance' | 'member';
};

const STORAGE_KEY = 'agc.notifications.read';

const TYPE_STYLES: Record<Notification['type'], string> = {
  finance:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  attendance: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  member:     'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
  info:       'bg-muted text-muted-foreground',
};

const TYPE_DOT: Record<Notification['type'], string> = {
  finance:    'bg-emerald-500',
  attendance: 'bg-blue-500',
  member:     'bg-purple-500',
  info:       'bg-primary',
};

export function NotificationsMenu() {
  const { role } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const getReadIds = (): string[] => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  };

  const markRead = (id: string) => {
    const ids = [...new Set([...getReadIds(), id])];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = () => {
    const ids = notifications.map(n => n.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const loadNotifications = async () => {
    try {
      const readIds = getReadIds();
      const items: Notification[] = [];

      if (role === 'admin' || role === 'super_admin' || role === 'treasurer') {
        const res = await apiFetch<{ data: any[] }>('/api/db', {
          method: 'POST',
          body: JSON.stringify({
            table: 'givings', op: 'select',
            columns: 'id,type,amount,member_name,created_at',
            order: [{ col: 'created_at', ascending: false }], limit: 5,
          }),
        });
        (res.data ?? []).forEach(g => items.push({
          id: `giving-${g.id}`,
          title: `New ${g.type}`,
          message: `${g.member_name || 'Anonymous'} • KES ${Number(g.amount).toLocaleString()}`,
          time: new Date(g.created_at),
          read: readIds.includes(`giving-${g.id}`),
          type: 'finance',
        }));
      }

      if (role === 'admin' || role === 'super_admin' || role === 'secretary' || role === 'pastor') {
        const [attRes, memRes] = await Promise.all([
          apiFetch<{ data: any[] }>('/api/db', {
            method: 'POST',
            body: JSON.stringify({
              table: 'attendance', op: 'select',
              columns: 'id,event_name,total_present,created_at',
              order: [{ col: 'created_at', ascending: false }], limit: 5,
            }),
          }),
          apiFetch<{ data: any[] }>('/api/db', {
            method: 'POST',
            body: JSON.stringify({
              table: 'members', op: 'select',
              columns: 'id,full_name,created_at',
              order: [{ col: 'created_at', ascending: false }], limit: 3,
            }),
          }),
        ]);
        (attRes.data ?? []).forEach(a => items.push({
          id: `att-${a.id}`,
          title: 'Attendance recorded',
          message: `${a.event_name} • ${a.total_present} present`,
          time: new Date(a.created_at),
          read: readIds.includes(`att-${a.id}`),
          type: 'attendance',
        }));
        (memRes.data ?? []).forEach(m => items.push({
          id: `mem-${m.id}`,
          title: 'New member registered',
          message: m.full_name,
          time: new Date(m.created_at),
          read: readIds.includes(`mem-${m.id}`),
          type: 'member',
        }));
      }

      items.sort((a, b) => b.time.getTime() - a.time.getTime());
      setNotifications(items.slice(0, 15));
    } catch (err) {
      console.error('Failed to load notifications', err);
    }
  };

  useEffect(() => {
    if (!role) return;
    loadNotifications();
    const interval = setInterval(loadNotifications, 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const unread = notifications.filter(n => !n.read);
  const read   = notifications.filter(n => n.read);

  const NotifItem = ({ n }: { n: Notification }) => (
    <li
      key={n.id}
      className={`px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer ${!n.read ? 'bg-accent/5 border-l-2 border-primary' : 'border-l-2 border-transparent'}`}
      onClick={() => !n.read && markRead(n.id)}
    >
      <div className="flex items-start gap-2.5">
        <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${!n.read ? TYPE_DOT[n.type] : 'bg-transparent'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className={`text-xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${TYPE_STYLES[n.type]}`}>{n.type}</p>
          </div>
          <p className="text-sm font-medium truncate">{n.title}</p>
          <p className="text-xs text-muted-foreground truncate">{n.message}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
            {formatDistanceToNow(n.time, { addSuffix: true })}
          </p>
        </div>
        {!n.read && (
          <button
            className="text-[10px] text-primary hover:underline shrink-0 mt-1"
            onClick={e => { e.stopPropagation(); markRead(n.id); }}
          >
            Mark read
          </button>
        )}
      </div>
    </li>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread.length > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full px-1 flex items-center justify-center text-[10px] bg-primary text-primary-foreground">
              {unread.length > 9 ? '9+' : unread.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-84 p-0 shadow-xl" style={{ width: 340 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">
              {unread.length > 0 ? `${unread.length} unread` : 'All caught up'}
            </p>
          </div>
          {unread.length > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="h-8 text-xs gap-1">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="h-[380px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <BellOff className="h-8 w-8 opacity-40" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <>
              {/* ── Unread section ── */}
              {unread.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-muted/40 border-b">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />
                      Unread ({unread.length})
                    </p>
                  </div>
                  <ul className="divide-y">
                    {unread.map(n => <NotifItem key={n.id} n={n} />)}
                  </ul>
                </>
              )}

              {/* ── Read section ── */}
              {read.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-muted/20 border-y">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <Inbox className="h-3 w-3" />
                      Read ({read.length})
                    </p>
                  </div>
                  <ul className="divide-y opacity-70">
                    {read.map(n => <NotifItem key={n.id} n={n} />)}
                  </ul>
                </>
              )}
            </>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}