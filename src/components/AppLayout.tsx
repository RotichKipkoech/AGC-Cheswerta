import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationsMenu } from "@/components/NotificationsMenu";
import { UserMenu } from "@/components/UserMenu";
import { SystemBanner } from "@/components/SystemBanner";
import { SessionGuard } from "@/components/SessionGuard";
import { useSystemSettings } from "@/contexts/SystemSettingsContext";

/** Inner wrapper so we can call useSidebar */
function LayoutInner({ children }: { children: React.ReactNode }) {
  const { branding } = useSystemSettings();
  const { isMobile, setOpenMobile } = useSidebar();

  // Close mobile sidebar whenever the main content area is clicked
  const handleContentClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <div className="min-h-screen flex w-full bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 flex items-center justify-between border-b bg-card/80 backdrop-blur-sm px-4 shrink-0 sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <SidebarTrigger className="shrink-0" />
            <span className="text-sm font-medium text-muted-foreground truncate hidden sm:block">
              {branding.name}
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <NotificationsMenu />
            <UserMenu />
          </div>
        </header>

        <SystemBanner />

        <main
          className="flex-1 p-4 sm:p-6 overflow-auto"
          onClick={handleContentClick}
        >
          {children}
        </main>
      </div>
      <SessionGuard />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <LayoutInner>{children}</LayoutInner>
    </SidebarProvider>
  );
}