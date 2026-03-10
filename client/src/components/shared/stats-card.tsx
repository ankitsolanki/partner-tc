import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  "data-testid"?: string;
}

export function StatsCard({
  label,
  value,
  icon: Icon,
  trend,
  className,
  "data-testid": testId,
}: StatsCardProps) {
  return (
    <Card className={cn(className)} data-testid={testId}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground" data-testid={testId ? `${testId}-label` : undefined}>
              {label}
            </span>
            <span className="text-2xl font-semibold" data-testid={testId ? `${testId}-value` : undefined}>
              {value}
            </span>
            {trend && (
              <span
                className={cn(
                  "text-xs",
                  trend.isPositive
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                )}
                data-testid={testId ? `${testId}-trend` : undefined}
              >
                {trend.isPositive ? "+" : ""}{trend.value}%
              </span>
            )}
          </div>
          <div className="flex items-center justify-center rounded-md bg-muted p-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
