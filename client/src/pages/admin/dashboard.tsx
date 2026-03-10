import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Key, Users, CheckCircle, Activity, Plus, UserPlus } from "lucide-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { StatsCard } from "@/components/shared/stats-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminStats {
  totalPartners: number;
  totalKeys: number;
  totalRedeemed: number;
  totalActive: number;
  partnerSummaries: Array<{
    id: number;
    name: string;
    displayName: string | null;
    contactEmail: string | null;
    isActive: boolean;
    generated: number;
    consumed: number;
    redeemed: number;
  }>;
}

export default function AdminDashboard() {
  const [, navigate] = useLocation();

  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });

  const partnerColumns: DataTableColumn<AdminStats["partnerSummaries"][0]>[] = [
    {
      key: "name",
      header: "Partner",
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{row.displayName || row.name}</span>
          {row.contactEmail && (
            <span className="text-xs text-muted-foreground">{row.contactEmail}</span>
          )}
        </div>
      ),
    },
    {
      key: "isActive",
      header: "Status",
      render: (row) => (
        <StatusBadge
          status={row.isActive ? "redeemed" : "deactivated"}
          data-testid={`badge-partner-status-${row.id}`}
        />
      ),
    },
    {
      key: "generated",
      header: "Generated",
      render: (row) => <span data-testid={`text-generated-${row.id}`}>{row.generated}</span>,
    },
    {
      key: "consumed",
      header: "Consumed",
      render: (row) => <span data-testid={`text-consumed-${row.id}`}>{row.consumed}</span>,
    },
    {
      key: "redeemed",
      header: "Redeemed",
      render: (row) => <span data-testid={`text-redeemed-${row.id}`}>{row.redeemed}</span>,
    },
  ];

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">System-wide overview</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => navigate("/admin/partners")}
              data-testid="button-create-partner"
            >
              <UserPlus className="h-4 w-4" />
              <span>Create Partner</span>
            </Button>
            <Button
              onClick={() => navigate("/admin/generate")}
              data-testid="button-generate-keys"
            >
              <Plus className="h-4 w-4" />
              <span>Generate Keys</span>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              label="Total Partners"
              value={stats?.totalPartners ?? 0}
              icon={Users}
              data-testid="stat-total-partners"
            />
            <StatsCard
              label="Total Keys"
              value={stats?.totalKeys ?? 0}
              icon={Key}
              data-testid="stat-total-keys"
            />
            <StatsCard
              label="Total Redeemed"
              value={stats?.totalRedeemed ?? 0}
              icon={CheckCircle}
              data-testid="stat-total-redeemed"
            />
            <StatsCard
              label="Total Active"
              value={stats?.totalActive ?? 0}
              icon={Activity}
              data-testid="stat-total-active"
            />
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Partner Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={partnerColumns as DataTableColumn<Record<string, unknown>>[]}
              data={(stats?.partnerSummaries ?? []) as unknown as Record<string, unknown>[]}
              isLoading={isLoading}
              emptyTitle="No partners"
              emptyDescription="No partners have been created yet."
              emptyActionLabel="Create Partner"
              onEmptyAction={() => navigate("/admin/partners")}
              onRowClick={(row) => navigate(`/admin/partners/${(row as unknown as AdminStats["partnerSummaries"][0]).id}`)}
              data-testid="table-partner-summary"
            />
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
