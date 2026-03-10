import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PartnerLayout } from "@/components/layout/partner-layout";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LICENSE_STATUSES, TIER_LABELS } from "@/lib/constants";
import { Plus, Download, Search } from "lucide-react";
import type { PartnerLicenseKey } from "@shared/schema";

interface LicensesResponse {
  data: PartnerLicenseKey[];
  total: number;
  page: number;
  totalPages: number;
}

const PAGE_SIZE = 50;

export default function PartnerLicenses() {
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("limit", String(PAGE_SIZE));
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (tierFilter !== "all") queryParams.set("tier", tierFilter);
  if (search) queryParams.set("search", search);

  const { data, isLoading } = useQuery<LicensesResponse>({
    queryKey: [`/api/partner/licenses?${queryParams.toString()}`],
  });

  const columns: DataTableColumn<PartnerLicenseKey & Record<string, unknown>>[] = [
    {
      key: "licenseKey",
      header: "License Key",
      render: (row) => (
        <span className="font-mono text-xs" data-testid={`text-key-${row.id}`}>
          {(row.licenseKey as string).slice(0, 12)}...
        </span>
      ),
    },
    {
      key: "tier",
      header: "Tier",
      render: (row) => (
        <span data-testid={`text-tier-${row.id}`}>
          {TIER_LABELS[row.tier as number] ?? `Tier ${row.tier}`}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge status={row.status as string} data-testid={`badge-status-${row.id}`} />
      ),
    },
    {
      key: "generatedAt",
      header: "Created",
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.generatedAt as unknown as string).toLocaleDateString()}
        </span>
      ),
    },
  ];

  const handleExport = (type: "current" | "all") => {
    const exportParams = new URLSearchParams();
    if (type === "current") {
      if (statusFilter !== "all") exportParams.set("status", statusFilter);
      if (tierFilter !== "all") exportParams.set("tier", tierFilter);
      if (search) exportParams.set("search", search);
    }
    const url = `/api/partner/licenses/export?${exportParams.toString()}`;
    window.open(url, "_blank");
  };

  return (
    <PartnerLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">
              Licenses
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage and track all license keys
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" data-testid="button-export">
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  onClick={() => handleExport("current")}
                  data-testid="button-export-current"
                >
                  Export Current View
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExport("all")}
                  data-testid="button-export-all"
                >
                  Export All
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={() => navigate("/partner/generate")}
              data-testid="button-generate-keys"
            >
              <Plus className="h-4 w-4" />
              Generate Keys
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by license key..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {LICENSE_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={tierFilter}
            onValueChange={(val) => {
              setTierFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[130px]" data-testid="select-tier-filter">
              <SelectValue placeholder="Tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              {Object.entries(TIER_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DataTable
          columns={columns}
          data={(data?.data ?? []) as (PartnerLicenseKey & Record<string, unknown>)[]}
          isLoading={isLoading}
          emptyTitle="No licenses found"
          emptyDescription="Generate some license keys to get started."
          emptyActionLabel="Generate Keys"
          onEmptyAction={() => navigate("/partner/generate")}
          onRowClick={(row) => navigate(`/partner/licenses/${row.licenseKey}`)}
          page={data?.page}
          totalPages={data?.totalPages}
          onPageChange={setPage}
          data-testid="table-licenses"
        />
      </div>
    </PartnerLayout>
  );
}
