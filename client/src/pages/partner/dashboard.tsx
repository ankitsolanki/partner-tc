import { useQuery } from "@tanstack/react-query";
import { PartnerLayout } from "@/components/layout/partner-layout";
import { StatsCard } from "@/components/shared/stats-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { TIER_LABELS } from "@/lib/constants";
import {
  Key,
  ShoppingCart,
  CheckCircle,
  Package,
  XCircle,
  ArrowUpCircle,
  Clock,
} from "lucide-react";

interface PartnerStats {
  totalGenerated: number;
  totalConsumed: number;
  totalRedeemed: number;
  totalAvailable: number;
  totalDeactivated: number;
  totalUpgraded: number;
  tierDistribution: Array<{
    tier: number;
    total: number;
    available: number;
  }>;
  recentEvents: Array<{
    id: number;
    licenseKey: string;
    eventType: string;
    newStatus: string;
    tier: number | null;
    createdAt: string;
  }>;
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function PartnerDashboard() {
  const { data: stats, isLoading } = useQuery<PartnerStats>({
    queryKey: ["/api/partner/licenses/stats"],
  });

  return (
    <PartnerLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Overview of your license key activity
          </p>
        </div>

        {isLoading || !stats ? (
          <DashboardSkeleton />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatsCard
                label="Total Generated"
                value={stats.totalGenerated}
                icon={Key}
                data-testid="stat-generated"
              />
              <StatsCard
                label="Consumed"
                value={stats.totalConsumed}
                icon={ShoppingCart}
                data-testid="stat-consumed"
              />
              <StatsCard
                label="Redeemed"
                value={stats.totalRedeemed}
                icon={CheckCircle}
                data-testid="stat-redeemed"
              />
              <StatsCard
                label="Available"
                value={stats.totalAvailable}
                icon={Package}
                data-testid="stat-available"
              />
              <StatsCard
                label="Deactivated"
                value={stats.totalDeactivated}
                icon={XCircle}
                data-testid="stat-deactivated"
              />
              <StatsCard
                label="Upgraded"
                value={stats.totalUpgraded}
                icon={ArrowUpCircle}
                data-testid="stat-upgraded"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tier Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-4" data-testid="section-tier-distribution">
                    {stats.tierDistribution.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No keys generated yet</p>
                    ) : (
                      stats.tierDistribution.map((tier) => {
                        const pct = tier.total > 0 ? Math.round((tier.available / tier.total) * 100) : 0;
                        return (
                          <div key={tier.tier} className="flex flex-col gap-1" data-testid={`tier-dist-${tier.tier}`}>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-sm font-medium">
                                {TIER_LABELS[tier.tier] ?? `Tier ${tier.tier}`}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {tier.available} / {tier.total} available
                              </span>
                            </div>
                            <Progress value={pct} className="h-2" />
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3" data-testid="section-recent-activity">
                    {stats.recentEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No recent activity</p>
                    ) : (
                      stats.recentEvents.map((event) => (
                        <div
                          key={event.id}
                          className="flex items-center justify-between gap-2 flex-wrap"
                          data-testid={`event-${event.id}`}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusBadge status={event.newStatus} />
                            <span className="text-xs font-mono text-muted-foreground">
                              {event.licenseKey.slice(0, 8)}...
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {formatTimeAgo(event.createdAt)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </PartnerLayout>
  );
}
