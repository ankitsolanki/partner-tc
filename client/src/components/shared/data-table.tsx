import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  onRowClick?: (row: T) => void;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  "data-testid"?: string;
}

function DataTableSkeleton<T>({ columns }: { columns: DataTableColumn<T>[] }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {columns.map((col) => (
            <TableCell key={col.key} className={col.className}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  isLoading,
  emptyTitle = "No data",
  emptyDescription = "No records found.",
  emptyActionLabel,
  onEmptyAction,
  onRowClick,
  page,
  totalPages,
  onPageChange,
  "data-testid": testId,
}: DataTableProps<T>) {
  if (!isLoading && data.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={emptyTitle}
        description={emptyDescription}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
        data-testid={testId ? `${testId}-empty` : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid={testId}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={col.className}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <DataTableSkeleton columns={columns} />
          ) : (
            data.map((row, index) => (
              <TableRow
                key={(row.id as string | number) ?? index}
                className={onRowClick ? "cursor-pointer" : undefined}
                onClick={() => onRowClick?.(row)}
                data-testid={testId ? `${testId}-row-${(row.id as string | number) ?? index}` : undefined}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.render
                      ? col.render(row)
                      : (row[col.key] as React.ReactNode) ?? "—"}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {page !== undefined && totalPages !== undefined && totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            data-testid={testId ? `${testId}-prev-page` : undefined}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground" data-testid={testId ? `${testId}-page-info` : undefined}>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            data-testid={testId ? `${testId}-next-page` : undefined}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
