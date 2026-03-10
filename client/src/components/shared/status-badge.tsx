import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
  "data-testid"?: string;
}

export function StatusBadge({ status, className, "data-testid": testId }: StatusBadgeProps) {
  const colorClass = STATUS_COLORS[status] ?? STATUS_COLORS.generated;
  const label = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <Badge
      variant="outline"
      className={cn("no-default-hover-elevate border-transparent", colorClass, className)}
      data-testid={testId}
    >
      {label}
    </Badge>
  );
}
