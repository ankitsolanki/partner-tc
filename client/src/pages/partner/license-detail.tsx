import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { PartnerLayout } from "@/components/layout/partner-layout";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { TIER_LABELS } from "@/lib/constants";
import {
  ArrowLeft,
  Copy,
  Check,
  Clock,
  ArrowUpCircle,
  ArrowDownCircle,
  Link as LinkIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { PartnerLicenseKey, PartnerLicenseEvent } from "@shared/schema";

interface LicenseDetailResponse {
  license: PartnerLicenseKey;
  events: PartnerLicenseEvent[];
}

const EVENT_ICONS: Record<string, typeof Clock> = {
  generated: Clock,
  consumed: Clock,
  redeemed: Check,
  upgraded: ArrowUpCircle,
  downgraded: ArrowDownCircle,
  deactivated: Clock,
};

function formatDate(dateStr: string | null | Date): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleString();
}

export default function PartnerLicenseDetail() {
  const params = useParams<{ licenseKey: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery<LicenseDetailResponse>({
    queryKey: ["/api/partner/licenses", params.licenseKey],
  });

  const handleCopy = async () => {
    if (!data?.license.licenseKey) return;
    await navigator.clipboard.writeText(data.license.licenseKey);
    setCopied(true);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <PartnerLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/partner/licenses")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            License Detail
          </h1>
        </div>

        {isLoading || !data ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-64" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">License Key</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code
                      className="rounded-md bg-muted px-3 py-2 font-mono text-sm"
                      data-testid="text-license-key"
                    >
                      {data.license.licenseKey}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCopy}
                      data-testid="button-copy-key"
                    >
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Status</span>
                      <StatusBadge status={data.license.status} data-testid="badge-status" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Tier</span>
                      <span className="text-sm font-medium" data-testid="text-tier">
                        {TIER_LABELS[data.license.tier] ?? `Tier ${data.license.tier}`}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Generated</span>
                      <span className="text-sm" data-testid="text-generated-at">
                        {formatDate(data.license.generatedAt)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Batch</span>
                      <span className="text-sm font-mono" data-testid="text-batch">
                        {data.license.batchId ?? "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {(data.license.previousKey || data.license.upgradedToKey) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Related Keys</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3">
                    {data.license.previousKey && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <LinkIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Previous Key:</span>
                        <Link
                          href={`/partner/licenses/${data.license.previousKey}`}
                          className="font-mono text-sm text-primary"
                          data-testid="link-previous-key"
                        >
                          {data.license.previousKey.slice(0, 12)}...
                        </Link>
                      </div>
                    )}
                    {data.license.upgradedToKey && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <LinkIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Upgraded to:</span>
                        <Link
                          href={`/partner/licenses/${data.license.upgradedToKey}`}
                          className="font-mono text-sm text-primary"
                          data-testid="link-upgraded-to-key"
                        >
                          {data.license.upgradedToKey.slice(0, 12)}...
                        </Link>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Event Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {data.events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events recorded</p>
                ) : (
                  <div className="relative flex flex-col gap-0" data-testid="section-timeline">
                    {data.events.map((event, index) => {
                      const EventIcon = EVENT_ICONS[event.eventType] ?? Clock;
                      const isLast = index === data.events.length - 1;
                      return (
                        <div key={event.id} className="flex gap-3" data-testid={`event-${event.id}`}>
                          <div className="flex flex-col items-center">
                            <div className="flex items-center justify-center rounded-full bg-muted p-1.5">
                              <EventIcon className="h-3 w-3 text-muted-foreground" />
                            </div>
                            {!isLast && (
                              <div className="h-full w-px bg-border" />
                            )}
                          </div>
                          <div className="flex flex-col gap-1 pb-6">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium capitalize">
                                {event.eventType}
                              </span>
                              <StatusBadge status={event.newStatus} />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(event.createdAt)} &middot; via {event.triggeredBy}
                            </span>
                            {event.previousStatus && (
                              <span className="text-xs text-muted-foreground">
                                From: {event.previousStatus}
                              </span>
                            )}
                            {event.tier !== null && event.previousTier !== null && event.tier !== event.previousTier && (
                              <span className="text-xs text-muted-foreground">
                                Tier {event.previousTier} → Tier {event.tier}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PartnerLayout>
  );
}
