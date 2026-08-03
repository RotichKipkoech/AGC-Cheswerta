import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Wallet, Church, CalendarDays, ClipboardCheck, LogOut, FileText, UserCog, Settings as SettingsIcon, ShieldAlert,
  Activity, Palette, ToggleLeft, Shield, Globe, Plug, HardDrive, Megaphone, Wrench, Database, MessageSquare, ScrollText, ShieldCheck, CalendarClock,
  KeyRound, ChevronRight,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { useSystemSettings } from "@/contexts/SystemSettingsContext";
import { usePermissions } from "@/lib/usePermissions";
import { apiFetch } from "@/lib/api";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import agcLogo from '@/assets/agc-logo.png';

type NavItem = { title: string; url: string; icon: any; roles?: AppRole[]; moduleKey?: string; permKey?: string };

// Items shown to non-super-admin staff
const staffNav: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Members", url: "/members", icon: Users, roles: ['admin', 'secretary', 'pastor', 'lay_leader'], moduleKey: 'members', permKey: 'members' },
  { title: "Finance", url: "/finance", icon: Wallet, roles: ['admin', 'treasurer', 'secretary', 'pastor', 'lay_leader'], moduleKey: 'finance', permKey: 'finance' },
  { title: "Departments", url: "/departments", icon: Church, roles: ['admin', 'pastor', 'ministry_leader','secretary', 'lay_leader'], moduleKey: 'departments', permKey: 'departments' },
  { title: "Council", url: "/council", icon: ShieldCheck, roles: ['admin', 'pastor', 'secretary', 'lay_leader'], permKey: 'council' },
  { title: "Fellowship", url: "/fellowship", icon: CalendarClock }, // visible to all — read-only unless admin/super_admin
  { title: "Events", url: "/events", icon: CalendarDays, moduleKey: 'events' },
  { title: "Attendance", url: "/attendance", icon: ClipboardCheck, roles: ['admin', 'secretary', 'pastor', 'lay_leader'], moduleKey: 'attendance', permKey: 'attendance' },
  { title: "Reports", url: "/reports", icon: FileText, roles: ['admin', 'treasurer', 'secretary', 'pastor', 'lay_leader'], moduleKey: 'reports', permKey: 'reports' },
  { title: "Broadcast", url: "/broadcast", icon: MessageSquare, roles: ['admin', 'secretary', 'pastor', 'treasurer', 'ministry_leader', 'lay_leader'], moduleKey: 'broadcast', permKey: 'broadcast' },
  { title: "SMS Logs", url: "/sms-logs", icon: ScrollText, roles: ['admin'], moduleKey: 'sms_logs' },
  { title: "Users", url: "/users", icon: UserCog, roles: ['admin'], moduleKey: 'users' },
  { title: "Pending Deletions", url: "/pending-deletions", icon: ShieldAlert, roles: ['admin'] },
  // Admins get expanded Control Panel access (excluding Localization, Integrations, Health, Users, Data Tools)
  { title: "Branding", url: "/cpanel?tab=branding", icon: Palette, roles: ['admin'] },
  { title: "Modules", url: "/cpanel?tab=modules", icon: ToggleLeft, roles: ['admin'] },
  { title: "Security", url: "/cpanel?tab=security", icon: Shield, roles: ['admin'] },
  { title: "Announcements", url: "/cpanel?tab=announcements", icon: Megaphone, roles: ['admin'] },
  { title: "Maintenance", url: "/cpanel?tab=maintenance", icon: Wrench, roles: ['admin'] },
  { title: "Activity Log", url: "/cpanel?tab=audit", icon: Activity, roles: ['admin'] },
  { title: "Settings", url: "/settings", icon: SettingsIcon, moduleKey: 'settings' },
  
];

// Super admin gets the cPanel sections directly in the sidebar, organized
// into the same logical groups CPanel's own header now reflects — this is
// the ONLY navigation for super admin; CPanel no longer duplicates it with
// its own internal tab bar.
type NavGroup = { group: string; items: NavItem[] };

const superAdminNavGroups: NavGroup[] = [
  {
    group: 'Dashboard',
    items: [
      { title: "Overview", url: "/cpanel?tab=overview", icon: ShieldAlert },
    ],
  },
  {
    group: 'Appearance',
    items: [
      { title: "Branding", url: "/cpanel?tab=branding", icon: Palette },
      { title: "Modules", url: "/cpanel?tab=modules", icon: ToggleLeft },
    ],
  },
  {
    group: 'System',
    items: [
      { title: "Security", url: "/cpanel?tab=security", icon: Shield },
      { title: "Localization", url: "/cpanel?tab=localization", icon: Globe },
      { title: "Integrations", url: "/cpanel?tab=integrations", icon: Plug },
      { title: "Health", url: "/cpanel?tab=health", icon: HardDrive },
    ],
  },
  {
    group: 'People & Access',
    items: [
      { title: "Users", url: "/cpanel?tab=users", icon: Users },
      { title: "Permissions", url: "/cpanel?tab=permissions", icon: KeyRound },
      { title: "Council", url: "/council", icon: ShieldCheck },
      { title: "Pending Deletions", url: "/pending-deletions", icon: ShieldAlert },
    ],
  },
  {
    group: 'Communication',
    items: [
      { title: "Announcements", url: "/cpanel?tab=announcements", icon: Megaphone },
      { title: "Broadcast", url: "/broadcast", icon: MessageSquare },
      { title: "SMS Logs", url: "/sms-logs", icon: ScrollText },
    ],
  },
  {
    group: 'Operations',
    items: [
      { title: "Fellowship", url: "/fellowship", icon: CalendarClock },
      { title: "Maintenance", url: "/cpanel?tab=maintenance", icon: Wrench },
      { title: "Activity Log", url: "/cpanel?tab=audit", icon: Activity },
      { title: "Data Tools", url: "/cpanel?tab=data", icon: Database },
    ],
  },
  {
    group: 'General',
    items: [
      { title: "Settings", url: "/settings", icon: SettingsIcon },
    ],
  },
];

/** Renders one nav link, shared between the grouped (super admin) and flat (staff) layouts. */
function NavItemRow({ item, collapsed, isMobile, setOpenMobile, badge }: {
  item: NavItem; collapsed: boolean; isMobile: boolean; setOpenMobile: (v: boolean) => void; badge?: number;
}) {
  const pathOnly = item.url.split('?')[0];
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <NavLink
          to={item.url}
          end={pathOnly === "/"}
          className="hover:bg-sidebar-accent/50 text-sidebar-foreground/80"
          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          onClick={() => { if (isMobile) setOpenMobile(false); }}
        >
          <item.icon className="mr-2 h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate flex-1">{item.title}</span>}
          {!collapsed && !!badge && (
            <span className="ml-auto shrink-0 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** True if `item.url` matches the current location — handles both plain
 * paths ("/council") and query-based cpanel routes ("/cpanel?tab=branding"). */
function isItemActive(item: NavItem, pathname: string, search: string): boolean {
  const [itemPath, itemQuery] = item.url.split('?');
  if (itemPath !== pathname) return false;
  if (!itemQuery) return true;
  const current = new URLSearchParams(search);
  const wanted = new URLSearchParams(itemQuery);
  for (const [key, val] of wanted.entries()) {
    if (current.get(key) !== val) return false;
  }
  return true;
}

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const { role, profile, signOut } = useAuth();
  const { branding, isModuleEnabled } = useSystemSettings();
  const { canAccess } = usePermissions();
  const location = useLocation();

  const isSuper = role === 'super_admin';

  // Live badge count for the Pending Deletions nav item — only admins and
  // super admins can see/act on this page, so only they need to poll it.
  const [pendingDeletionsCount, setPendingDeletionsCount] = useState(0);
  useEffect(() => {
    if (role !== 'admin' && role !== 'super_admin') return;
    let mounted = true;
    const poll = () => {
      apiFetch<{ pending: number }>('/api/pending-deletions/count')
        .then(res => { if (mounted) setPendingDeletionsCount(res.pending ?? 0); })
        .catch(() => {});
    };
    poll();
    const t = setInterval(poll, 30000);
    return () => { mounted = false; clearInterval(t); };
  }, [role]);

  // Whichever group contains the page you're currently on — used to
  // auto-expand that section (and collapse the rest) as you navigate.
  const activeGroupName = useMemo(() => {
    for (const { group, items } of superAdminNavGroups) {
      if (items.some(item => isItemActive(item, location.pathname, location.search))) return group;
    }
    return superAdminNavGroups[0]?.group ?? null;
  }, [location.pathname, location.search]);

  const [openGroup, setOpenGroup] = useState<string | null>(activeGroupName);

  // Re-sync whenever navigation changes which group is "current" — but this
  // never fights a manual click, since it only fires when activeGroupName
  // itself changes (i.e. you actually navigated), not on every render.
  useEffect(() => {
    setOpenGroup(activeGroupName);
  }, [activeGroupName]);

  const toggleGroup = (group: string) => {
    setOpenGroup(prev => (prev === group ? null : group));
  };

  // Staff (non-super-admin): single filtered flat list — unchanged behaviour.
  const visibleStaffItems = staffNav.filter(item => {
    if (item.permKey) {
      if (!role) return false;
      if (!canAccess(item.permKey, role, item.roles ?? [])) return false;
    } else if (item.roles && (!role || !item.roles.includes(role))) {
      return false;
    }
    if (item.moduleKey && !isModuleEnabled(item.moduleKey)) return false;
    return true;
  });

  const logoSrc = branding.logo_url || agcLogo;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="flex flex-col h-full">
        <div className="px-4 py-5">
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <img src={logoSrc} alt={branding.short_name} className="h-10 w-auto object-contain" />
              <div>
                <h1 className="text-sm font-bold text-sidebar-foreground tracking-tight">{branding.short_name}</h1>
                <p className="text-xs text-sidebar-foreground/70">
                  {isSuper ? 'Control Panel' : branding.sidebar_tagline}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center">
              <img src={logoSrc} alt={branding.short_name} className="h-8 w-auto object-contain" />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {isSuper ? (
            superAdminNavGroups.map(({ group, items }) => {
              const isOpen = collapsed || openGroup === group;
              return (
                <SidebarGroup key={group} className="mt-1 first:mt-0">
                  {!collapsed && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(group)}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors
                        ${isOpen ? 'bg-sidebar-accent/25' : 'hover:bg-sidebar-accent/15'}`}
                    >
                      <span className="text-sidebar-foreground/60 text-[10.5px] font-semibold tracking-wider uppercase">
                        {group}
                      </span>
                      <ChevronRight
                        className={`h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40 transition-transform duration-200
                          ${isOpen ? 'rotate-90 text-sidebar-foreground/70' : ''}`}
                      />
                    </button>
                  )}
                  {collapsed ? (
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {items.map(item => (
                          <NavItemRow key={item.title} item={item} collapsed={collapsed} isMobile={isMobile} setOpenMobile={setOpenMobile} badge={item.title === "Pending Deletions" ? pendingDeletionsCount : undefined} />
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  ) : (
                    <div
                      className={`grid transition-[grid-template-rows] duration-200 ease-out
                        ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                    >
                      <div className="overflow-hidden">
                        <SidebarGroupContent>
                          <SidebarMenu>
                            {items.map(item => (
                              <NavItemRow key={item.title} item={item} collapsed={collapsed} isMobile={isMobile} setOpenMobile={setOpenMobile} badge={item.title === "Pending Deletions" ? pendingDeletionsCount : undefined} />
                            ))}
                          </SidebarMenu>
                        </SidebarGroupContent>
                      </div>
                    </div>
                  )}
                </SidebarGroup>
              );
            })
          ) : (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleStaffItems.map(item => (
                    <NavItemRow key={item.title} item={item} collapsed={collapsed} isMobile={isMobile} setOpenMobile={setOpenMobile} badge={item.title === "Pending Deletions" ? pendingDeletionsCount : undefined} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </div>

        <div className="px-3 py-4 border-t border-sidebar-border">
          {!collapsed && profile && (
            <div className="mb-3 px-1">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{profile.full_name}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">{role?.replace('_', ' ') || 'User'}</p>
            </div>
          )}
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            onClick={signOut}
            className="w-full text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}