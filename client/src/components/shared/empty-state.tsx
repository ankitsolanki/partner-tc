import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  "data-testid"?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  "data-testid": testId,
}: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-16 text-center"
      data-testid={testId}
    >
      <div className="flex items-center justify-center rounded-md bg-muted p-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold" data-testid={testId ? `${testId}-title` : undefined}>
          {title}
        </h3>
        <p className="text-sm text-muted-foreground" data-testid={testId ? `${testId}-description` : undefined}>
          {description}
        </p>
      </div>
      {actionLabel && onAction && (
        <Button onClick={onAction} data-testid={testId ? `${testId}-action` : undefined}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
