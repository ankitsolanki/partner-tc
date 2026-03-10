import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Key, Users, CheckCircle, Activity, Plus, UserPlus,
  ArrowRight, TrendingUp, ShieldOff, RefreshCw,
} from "lucide-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { StatsCard } from "@/components/shared/stats-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TIER_LABELS } from "@/lib/constants";

interface TierDistribution {
  tier: number;
  total: number;
  available: number;
}

interface PartnerSummary {
  id: number;
  name: string;
  displayName: string | null;
  contactEmail: string | null;
  isActive: boolean;
  totalCreated: number;
  available: number;
  consumed: number;
  redeemed: number;
  deactivated: number;
  upgraded: number;
  downgraded: number;
  tierDistribution: TierDistribution[];
}

interface AdminStats {
  totalPartners: number;
  totalKeys: number;
  totalRedeemed: number;
  totalActive: number;
  partnerSummaries: PartnerSummary[];
}

function StatChip({
  label,
  value,
  color = "default",
}: {
  label: string;
  value: number;
  color?: "default" | "yellow" | "green" | "red" | "blue";
}) {
  const colorClass = {
    default: "bg-muted/60 text-foreground",
    yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    green: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    red: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  }[color];

  return (
    <div className={`flex flex-col items-center rounded-md px-3 py-2 ${colorClass}`}>
      <span className="text-base font-bold tabular-nums">{value.toLocaleString()}</span>
      <span className="text-[10px] font-medium opacity-75 mt-0.5 whitespace-nowrap">{label}</span>
    </div>
  );
}

function ConversionBar({ total, consumed, redeemed }: { total: number; consumed: number; redeemed: number }) {
  if (total === 0) {
    return <p className="text-xs text-muted-foreground">No licenses created yet</p>;
  }

  const consumedPct = Math.min(100, Math.round((consumed / total) * 100));
  const redeemedPct = Math.min(100, Math.round((redeemed / total) * 100));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-yellow-400 dark:bg-yellow-500"
          style={{ width: `${consumedPct}%` }}
        />
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-green-500"
          style={{ width: `${redeemedPct}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        <span className="text-yellow-600 dark:text-yellow-400 font-medium">{consumedPct}% consumed</span>
        <span className="mx-1">·</span>
        <span className="text-green-600 dark:text-green-400 font-medium">{redeemedPct}% redeemed</span>
        <span className="mx-1">·</span>
        of {total.toLocaleString()} total
      </p>
    </div>
  );
}

function PartnerCard({ partner, onClick }: { partner: PartnerSummary; onClick: () => void }) {
  const sortedTiers = [...partner.tierDistribution].sort((a, b) => a.tier - b.tier);

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={onClick}
      data-testid={`card-partner-${partner.id}`}
    >
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight truncate" data-testid={`text-partner-name-${partner.id}`}>
              {partner.displayName || partner.name}
            </p>
            {partner.contactEmail && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{partner.contactEmail}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge
              variant={partner.isActive ? "default" : "secondary"}
              className="text-[10px] h-5"
              data-testid={`badge-partner-status-${partner.id}`}
            >
              {partner.isActive ? "Active" : "Inactive"}
            </Badge>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 flex flex-col gap-4">
        <div className="grid grid-cols-5 gap-1.5">
          <StatChip
            label="Created"
            value={partner.totalCreated}
            data-testid={`stat-created-${partner.id}`}
          />
          <StatChip
            label="Available"
            value={partner.available}
            data-testid={`stat-available-${partner.id}`}
          />
          <StatChip
            label="Consumed"
            value={partner.consumed}
            color="yellow"
            data-testid={`stat-consumed-${partner.id}`}
          />
          <StatChip
            label="Redeemed"
            value={partner.redeemed}
            color="green"
            data-testid={`stat-redeemed-${partner.id}`}
          />
          <StatChip
            label="Deactivated"
            value={partner.deactivated}
            color="red"
            data-testid={`stat-deactivated-${partner.id}`}
          />
        </div>

        <ConversionBar
          total={partner.totalCreated}
          consumed={partner.consumed + partner.redeemed}
          redeemed={partner.redeemed}
        />

        {sortedTiers.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground font-medium">Tiers:</span>
            {sortedTiers.map((t) => (
              <div
                key={t.tier}
                className="flex items-center gap-1 rounded bg-muted/60 px-2 py-0.5"
                data-testid={`tier-badge-${partner.id}-${t.tier}`}
              >
                <span className="text-[10px] font-semibold">{TIER_LABELS[t.tier] ?? `T${t.tier}`}</span>
                <span className="text-[10px] text-muted-foreground">
                  {t.total.toLocaleString()} ({t.available.toLocaleString()} avail)
                </span>
              </div>
            ))}
          </div>
        )}

        {(partner.upgraded > 0 || partner.downgraded > 0) && (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground border-t pt-2">
            {partner.upgraded > 0 && (
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-blue-500" />
                {partner.upgraded} upgraded
              </span>
            )}
            {partner.downgraded > 0 && (
              <span className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3 text-orange-500" />
                {partner.downgraded} downgraded
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const [, navigate] = useLocation();

  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });

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
              label="Available Keys"
              value={stats?.totalActive ?? 0}
              icon={Activity}
              data-testid="stat-total-active"
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Partner Analytics</h2>
            <span className="text-xs text-muted-foreground">
              {stats?.partnerSummaries?.length ?? 0} partner{(stats?.partnerSummaries?.length ?? 0) !== 1 ? "s" : ""}
            </span>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-40 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (stats?.partnerSummaries?.length ?? 0) === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <ShieldOff className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No partners yet</p>
                <p className="text-xs text-muted-foreground mb-4">Create a partner to start tracking license analytics</p>
                <Button variant="outline" size="sm" onClick={() => navigate("/admin/partners")}>
                  <UserPlus className="h-4 w-4 mr-1.5" />
                  Create Partner
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {stats!.partnerSummaries.map((partner) => (
                <PartnerCard
                  key={partner.id}
                  partner={partner}
                  onClick={() => navigate(`/admin/partners/${partner.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
