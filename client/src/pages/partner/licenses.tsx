import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
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
import { Plus, Download, Search, Filter } from "lucide-react";
import type { PartnerLicenseKey } from "@shared/schema";

interface LicensesResponse {
  data: PartnerLicenseKey[];
  total: number;
  page: number;
  totalPages: number;
}

const PAGE_SIZE = 50;

export default function PartnerLicenses() {
  const [location, navigate] = useLocation();
  const search = useSearch();

  const initialStatus = new URLSearchParams(search).get("status") ?? "all";
  const initialTier = new URLSearchParams(search).get("tier") ?? "all";

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [tierFilter, setTierFilter] = useState<string>(initialTier);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(search);
    const s = params.get("status") ?? "all";
    const t = params.get("tier") ?? "all";
    setStatusFilter(s);
    setTierFilter(t);
    setPage(1);
  }, [search]);

  const syncUrl = (newStatus: string, newTier: string) => {
    const params = new URLSearchParams();
    if (newStatus !== "all") params.set("status", newStatus);
    if (newTier !== "all") params.set("tier", newTier);
    const qs = params.toString();
    navigate(`/partner/licenses${qs ? `?${qs}` : ""}`, { replace: true });
  };

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("limit", String(PAGE_SIZE));
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (tierFilter !== "all") queryParams.set("tier", tierFilter);
  if (searchText) queryParams.set("search", searchText);

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
      if (searchText) exportParams.set("search", searchText);
    }
    const url = `/api/partner/licenses/export?${exportParams.toString()}`;
    window.open(url, "_blank");
  };

  const activeFilterCount = [statusFilter !== "all", tierFilter !== "all", !!searchText].filter(Boolean).length;

  return (
    <PartnerLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">
              Licenses
            </h1>
            <p className="text-sm text-muted-foreground">
              {activeFilterCount > 0 ? (
                <span>
                  Showing{" "}
                  <span className="font-medium text-foreground">
                    {statusFilter !== "all"
                      ? LICENSE_STATUSES.find((s) => s.value === statusFilter)?.label ?? statusFilter
                      : "all statuses"}
                  </span>
                  {tierFilter !== "all" && (
                    <>
                      {" "}· <span className="font-medium text-foreground">{TIER_LABELS[Number(tierFilter)] ?? `Tier ${tierFilter}`}</span>
                    </>
                  )}
                  {" "}— {data?.total ?? "..."} license{data?.total !== 1 ? "s" : ""}
                </span>
              ) : (
                "Manage and track all license keys"
              )}
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
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setPage(1);
              }}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <Filter className="h-4 w-4 text-primary" aria-label="Filters active" />
            )}
            <Select
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val);
                setPage(1);
                syncUrl(val, tierFilter);
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
                syncUrl(statusFilter, val);
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
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter("all");
                  setTierFilter("all");
                  setSearchText("");
                  setPage(1);
                  navigate("/partner/licenses", { replace: true });
                }}
                data-testid="button-clear-filters"
                className="text-muted-foreground hover:text-foreground"
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        <DataTable
          columns={columns}
          data={(data?.data ?? []) as (PartnerLicenseKey & Record<string, unknown>)[]}
          isLoading={isLoading}
          emptyTitle="No licenses found"
          emptyDescription={
            activeFilterCount > 0
              ? "No licenses match the current filters. Try adjusting or clearing them."
              : "Generate some license keys to get started."
          }
          emptyActionLabel={activeFilterCount > 0 ? "Clear Filters" : "Generate Keys"}
          onEmptyAction={() => {
            if (activeFilterCount > 0) {
              setStatusFilter("all");
              setTierFilter("all");
              setSearchText("");
              navigate("/partner/licenses", { replace: true });
            } else {
              navigate("/partner/generate");
            }
          }}
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
