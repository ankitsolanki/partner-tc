import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, Plus, LogOut } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAdminAuth, useAdminLogout } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";

const navItems = [
  { title: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { title: "Partners", href: "/admin/partners", icon: Users },
  { title: "Generate Keys", href: "/admin/generate", icon: Plus },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location, navigate] = useLocation();
  const { user, isLoading } = useAdminAuth();
  const logoutMutation = useAdminLogout();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/admin/login");
    }
  }, [isLoading, user, navigate]);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => navigate("/admin/login"),
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <Sidebar>
          <SidebarHeader className="p-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold" data-testid="text-admin-name">
                Admin Portal
              </span>
              {user.name && (
                <span className="text-xs text-muted-foreground" data-testid="text-admin-user">
                  {user.name}
                </span>
              )}
            </div>
          </SidebarHeader>
          <Separator className="mx-2 w-auto" />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Management</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={location === item.href}
                        tooltip={item.title}
                      >
                        <Link href={item.href} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </Button>
          </SidebarFooter>
        </Sidebar>
        <div className="flex flex-1 flex-col">
          <header className="flex items-center gap-2 border-b p-2 sticky top-0 z-50 bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
