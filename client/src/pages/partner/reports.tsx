import { useQuery } from "@tanstack/react-query";
import { PartnerLayout } from "@/components/layout/partner-layout";
import { StatsCard } from "@/components/shared/stats-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { TIER_LABELS } from "@/lib/constants";
import { TrendingUp, ArrowRight, Key, CheckCircle } from "lucide-react";

interface ReportsData {
  funnel: {
    generated: number;
    consumed: number;
    redeemed: number;
  };
  dailyActivity: Array<{
    date: string;
    count: number;
  }>;
  tierDistribution: Array<{
    tier: number;
    total: number;
  }>;
}

const PIE_COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(221, 70%, 45%)",
  "hsl(221, 60%, 38%)",
  "hsl(221, 50%, 32%)",
  "hsl(221, 40%, 26%)",
];

function FunnelBar({
  label,
  value,
  maxValue,
  percentage,
}: {
  label: string;
  value: number;
  maxValue: number;
  percentage: number;
}) {
  const widthPercent = maxValue > 0 ? Math.max((value / maxValue) * 100, 4) : 4;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">
          {value.toLocaleString()} ({percentage}%)
        </span>
      </div>
      <div className="h-8 w-full rounded-md bg-muted overflow-hidden">
        <div
          className="h-full rounded-md bg-primary transition-all"
          style={{ width: `${widthPercent}%` }}
        />
      </div>
    </div>
  );
}

export default function PartnerReports() {
  const { data, isLoading } = useQuery<ReportsData>({
    queryKey: ["/api/partner/reports/overview"],
  });

  return (
    <PartnerLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            Reports
          </h1>
          <p className="text-sm text-muted-foreground">
            Analytics and insights for your license keys
          </p>
        </div>

        {isLoading || !data ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <Skeleton className="h-64" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatsCard
                label="Total Generated"
                value={data.funnel.generated}
                icon={Key}
                data-testid="stat-generated"
              />
              <StatsCard
                label="Consumed"
                value={data.funnel.consumed}
                icon={TrendingUp}
                data-testid="stat-consumed"
              />
              <StatsCard
                label="Redeemed"
                value={data.funnel.redeemed}
                icon={CheckCircle}
                data-testid="stat-redeemed"
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Conversion Funnel</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4" data-testid="section-funnel">
                  <FunnelBar
                    label="Generated"
                    value={data.funnel.generated}
                    maxValue={data.funnel.generated}
                    percentage={100}
                  />
                  <div className="flex items-center justify-center">
                    <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
                  </div>
                  <FunnelBar
                    label="Consumed"
                    value={data.funnel.consumed}
                    maxValue={data.funnel.generated}
                    percentage={
                      data.funnel.generated > 0
                        ? Math.round((data.funnel.consumed / data.funnel.generated) * 100)
                        : 0
                    }
                  />
                  <div className="flex items-center justify-center">
                    <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
                  </div>
                  <FunnelBar
                    label="Redeemed"
                    value={data.funnel.redeemed}
                    maxValue={data.funnel.generated}
                    percentage={
                      data.funnel.generated > 0
                        ? Math.round((data.funnel.redeemed / data.funnel.generated) * 100)
                        : 0
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Daily Activity (Last 30 Days)</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.dailyActivity.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No activity data available</p>
                  ) : (
                    <div className="h-64" data-testid="chart-daily-activity">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.dailyActivity}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 11 }}
                            className="fill-muted-foreground"
                            tickFormatter={(val: string) => {
                              const d = new Date(val);
                              return `${d.getMonth() + 1}/${d.getDate()}`;
                            }}
                          />
                          <YAxis
                            tick={{ fontSize: 11 }}
                            className="fill-muted-foreground"
                            allowDecimals={false}
                          />
                          <RechartsTooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "6px",
                              fontSize: "12px",
                            }}
                          />
                          <Bar
                            dataKey="count"
                            fill="hsl(221, 83%, 53%)"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tier Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.tierDistribution.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No distribution data available</p>
                  ) : (
                    <div className="h-64" data-testid="chart-tier-distribution">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.tierDistribution.map((d) => ({
                              name: TIER_LABELS[d.tier] ?? `Tier ${d.tier}`,
                              value: d.total,
                            }))}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            dataKey="value"
                            label={({ name, percent }) =>
                              `${name} (${(percent * 100).toFixed(0)}%)`
                            }
                          >
                            {data.tierDistribution.map((_, i) => (
                              <Cell
                                key={i}
                                fill={PIE_COLORS[i % PIE_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Legend />
                          <RechartsTooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "6px",
                              fontSize: "12px",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </PartnerLayout>
  );
}
