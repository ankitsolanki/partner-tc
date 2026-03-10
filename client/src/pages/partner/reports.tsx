import { useQuery } from "@tanstack/react-query";
import { PartnerLayout } from "@/components/layout/partner-layout";
import { StatsCard } from "@/components/shared/stats-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { TrendingUp, ArrowRight, Key, CheckCircle, Activity } from "lucide-react";

interface ReportsData {
  funnel: {
    generated: number;
    consumed: number;
    redeemed: number;
  };
  dailyActivity: Array<{
    date: string;
    count: number;
    eventType: string;
  }>;
  tierDistribution: Array<{
    tier: number;
    total: number;
  }>;
}

interface PivotedDay {
  date: string;
  label: string;
  generate: number;
  purchase: number;
  activate: number;
  deactivate: number;
  upgrade: number;
  downgrade: number;
}

const PIE_COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(221, 70%, 45%)",
  "hsl(221, 60%, 38%)",
  "hsl(221, 50%, 32%)",
  "hsl(221, 40%, 26%)",
];

const EVENT_CONFIG: Record<string, { label: string; color: string }> = {
  generate:   { label: "Generated",   color: "hsl(217, 91%, 60%)" },
  purchase:   { label: "Purchased",   color: "hsl(38, 92%, 50%)"  },
  activate:   { label: "Redeemed",    color: "hsl(142, 71%, 45%)" },
  deactivate: { label: "Deactivated", color: "hsl(0, 72%, 51%)"   },
  upgrade:    { label: "Upgraded",    color: "hsl(270, 60%, 55%)" },
  downgrade:  { label: "Downgraded",  color: "hsl(20, 80%, 55%)"  },
};

function pivotDailyActivity(raw: ReportsData["dailyActivity"]): PivotedDay[] {
  const byDate = new Map<string, PivotedDay>();

  for (const row of raw) {
    if (!byDate.has(row.date)) {
      const d = new Date(row.date);
      byDate.set(row.date, {
        date: row.date,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        generate: 0,
        purchase: 0,
        activate: 0,
        deactivate: 0,
        upgrade: 0,
        downgrade: 0,
      });
    }
    const entry = byDate.get(row.date)!;
    const key = row.eventType as keyof Omit<PivotedDay, "date" | "label">;
    if (key in entry) {
      (entry[key] as number) += row.count;
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function getRedemptionInsight(pivoted: PivotedDay[]): string | null {
  if (pivoted.length === 0) return null;
  const total = pivoted.reduce((sum, d) => sum + d.activate, 0);
  if (total === 0) return "No redemptions recorded in the last 30 days.";
  const peak = pivoted.reduce((best, d) => (d.activate > best.activate ? d : best), pivoted[0]);
  const peakDate = new Date(peak.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${total} redemption${total !== 1 ? "s" : ""} in the last 30 days — peak activity on ${peakDate} (${peak.activate}).`;
}

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

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value > 0);
  if (items.length === 0) return null;
  return (
    <div
      style={{
        backgroundColor: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: "6px",
        padding: "8px 12px",
        fontSize: "12px",
      }}
    >
      <p className="font-medium mb-1">{label}</p>
      {items.map((item) => (
        <div key={item.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-muted-foreground">
            {EVENT_CONFIG[item.dataKey]?.label ?? item.dataKey}:
          </span>
          <span className="font-medium ml-auto pl-3">{item.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function PartnerReports() {
  const { data, isLoading } = useQuery<ReportsData>({
    queryKey: ["/api/partner/reports/overview"],
  });

  const pivoted = data ? pivotDailyActivity(data.dailyActivity) : [];
  const insight = data ? getRedemptionInsight(pivoted) : null;
  const activeEventTypes = Object.keys(EVENT_CONFIG).filter((key) =>
    pivoted.some((d) => (d[key as keyof PivotedDay] as number) > 0)
  );

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
            <Skeleton className="h-80" />
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

            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="text-base">Activity Breakdown (Last 30 Days)</CardTitle>
                    <CardDescription className="mt-1">
                      Daily event counts by type — see when keys are being purchased, redeemed, or deactivated
                    </CardDescription>
                  </div>
                  <Activity className="h-4 w-4 text-muted-foreground mt-0.5" />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {pivoted.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity data available</p>
                ) : (
                  <>
                    <div className="h-72" data-testid="chart-daily-activity">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={pivoted} barSize={12}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11 }}
                            className="fill-muted-foreground"
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            tick={{ fontSize: 11 }}
                            className="fill-muted-foreground"
                            allowDecimals={false}
                          />
                          <RechartsTooltip content={<CustomTooltip />} />
                          {activeEventTypes.map((key) => (
                            <Bar
                              key={key}
                              dataKey={key}
                              stackId="events"
                              fill={EVENT_CONFIG[key].color}
                              radius={key === activeEventTypes[activeEventTypes.length - 1] ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-2" data-testid="chart-legend">
                      {activeEventTypes.map((key) => (
                        <div key={key} className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: EVENT_CONFIG[key].color }}
                          />
                          <span className="text-xs text-muted-foreground">{EVENT_CONFIG[key].label}</span>
                        </div>
                      ))}
                    </div>

                    {insight && (
                      <div className="rounded-md border bg-muted/40 px-4 py-3" data-testid="text-redemption-insight">
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Redemption trend: </span>
                          {insight}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Event Summary (Last 30 Days)</CardTitle>
                  <CardDescription>Total counts by event type across all days</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3" data-testid="section-event-summary">
                    {activeEventTypes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No events recorded</p>
                    ) : (
                      activeEventTypes.map((key) => {
                        const total = pivoted.reduce(
                          (sum, d) => sum + ((d[key as keyof PivotedDay] as number) ?? 0),
                          0
                        );
                        const maxTotal = Math.max(
                          ...activeEventTypes.map((k) =>
                            pivoted.reduce((sum, d) => sum + ((d[k as keyof PivotedDay] as number) ?? 0), 0)
                          )
                        );
                        const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
                        return (
                          <div key={key} className="flex flex-col gap-1" data-testid={`event-summary-${key}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-sm flex-shrink-0"
                                  style={{ backgroundColor: EVENT_CONFIG[key].color }}
                                />
                                <span className="text-sm">{EVENT_CONFIG[key].label}</span>
                              </div>
                              <span className="text-sm font-medium tabular-nums">{total.toLocaleString()}</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: EVENT_CONFIG[key].color,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })
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
