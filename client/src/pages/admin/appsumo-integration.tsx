import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  CheckCircle,
  XCircle,
  Copy,
  Send,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  ChevronRight,
  Plug,
  ShieldCheck,
  GitBranch,
  Webhook,
  KeyRound,
  Globe,
} from "lucide-react";
import { TIER_LABELS } from "@/lib/constants";

interface PartnerConfig {
  id: number;
  name: string;
  displayName: string;
  isActive: boolean;
  apiKey: string | null;
  webhookSecret: string | null;
  oauthClientId: string | null;
  oauthClientSecret: string | null;
  stats: {
    totalGenerated: number;
    totalConsumed: number;
    totalRedeemed: number;
    totalDeactivated: number;
  };
}

interface LicenseOption {
  licenseKey: string;
  status: string;
  tier: number;
}

interface WebhookTestResult {
  event: string;
  success: boolean;
  license?: {
    licenseKey: string;
    status: string;
    tier: number;
    consumedAt?: string;
    redeemedAt?: string;
    upgradedAt?: string;
    downgradedAt?: string;
    deactivatedAt?: string;
    userId?: number;
  };
  error?: string;
}

const EVENT_TYPES = [
  { value: "test", label: "test — Validate your endpoint" },
  { value: "purchase", label: "purchase — Customer buys a license" },
  { value: "activate", label: "activate — Customer activates license" },
  { value: "upgrade", label: "upgrade — Customer upgrades tier" },
  { value: "downgrade", label: "downgrade — Customer downgrades tier" },
  { value: "deactivate", label: "deactivate — License cancelled/refunded" },
];

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      data-testid="button-copy"
    >
      {copied ? <CheckCircle className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      {label ?? (copied ? "Copied" : "Copy")}
    </button>
  );
}

function SecretField({ value, label }: { value: string | null; label: string }) {
  const [visible, setVisible] = useState(false);
  if (!value) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground italic">Not configured</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
      <code className="flex-1 text-xs font-mono break-all">
        {visible ? value : "•".repeat(Math.min(value.length, 40))}
      </code>
      <button
        onClick={() => setVisible((v) => !v)}
        className="text-muted-foreground hover:text-foreground"
        data-testid={`button-toggle-${label}`}
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <CopyButton value={value} />
    </div>
  );
}

function CodeBlock({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`relative rounded-md bg-zinc-950 dark:bg-zinc-900 group ${className ?? ""}`}>
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton value={children} />
      </div>
      <pre className="overflow-x-auto p-4 text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap break-all">
        {children}
      </pre>
    </div>
  );
}

function SectionHeading({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-primary shrink-0" />
      <h3 className="font-semibold text-sm">{children}</h3>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-green-500" : "bg-red-400"}`} />
  );
}

function DocsPanel() {
  return (
    <div className="flex flex-col gap-8 text-sm text-foreground">

      <div>
        <h2 className="text-base font-bold mb-1">AppSumo Integration for Tiny Command</h2>
        <p className="text-muted-foreground text-xs leading-relaxed">
          This platform manages the full lifecycle of license keys sold through AppSumo. Tiny Command
          pre-generates UUID-based license keys, exports them to AppSumo, and AppSumo distributes them
          to customers. Two integration points bring that flow to life: <strong>Webhooks</strong> (AppSumo
          pushes real-time events to us) and <strong>OAuth</strong> (customers activate their license
          and land in our app for the first time).
        </p>
      </div>

      <Separator />

      <div>
        <SectionHeading icon={GitBranch}>Integration Architecture</SectionHeading>
        <CodeBlock>{`AppSumo Platform
   │
   ├─ [Customer buys/activates/upgrades]
   │         │
   │         ▼ POST /api/webhooks/partner
   │    Webhook Handler
   │    • Validates HMAC signature
   │    • Updates license status in DB
   │    • Logs event to audit trail
   │
   └─ [Customer clicks "Get Access"]
             │
             ▼ GET /api/auth/partner/callback
        OAuth Callback Handler
        • Exchanges code for access token
        • Fetches license key from AppSumo
        • Stores pending license in session
        • Redirects user to onboarding`}</CodeBlock>
      </div>

      <Separator />

      <div>
        <SectionHeading icon={Webhook}>Webhook Endpoint</SectionHeading>
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary" className="font-mono text-xs">POST</Badge>
          <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">/api/webhooks/partner</code>
        </div>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          AppSumo calls this endpoint whenever a license lifecycle event occurs. It must return
          <code className="mx-1 bg-muted px-1 rounded">200 OK</code> with
          <code className="mx-1 bg-muted px-1 rounded">{"{ event, success: true }"}</code>.
        </p>

        <p className="text-xs font-medium mb-2">Required Headers</p>
        <div className="rounded-md border text-xs overflow-hidden mb-4">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 font-medium">Header</th>
                <th className="text-left p-2 font-medium">Value</th>
                <th className="text-left p-2 font-medium">Required</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="p-2 font-mono">x-partner-name</td>
                <td className="p-2 text-muted-foreground">appsumo</td>
                <td className="p-2">Yes</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono">x-webhook-signature</td>
                <td className="p-2 text-muted-foreground">HMAC-SHA256 hex</td>
                <td className="p-2">Recommended</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono">x-webhook-timestamp</td>
                <td className="p-2 text-muted-foreground">Unix timestamp (ms)</td>
                <td className="p-2">Recommended</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-xs font-medium mb-2">HMAC Signature Formula</p>
        <CodeBlock className="mb-4">{`signature = HMAC-SHA256(webhookSecret, timestamp + "." + rawBodyString)
// Compare: x-webhook-signature header === computed signature`}</CodeBlock>

        <p className="text-xs font-medium mb-3">Event Payloads</p>
        <div className="flex flex-col gap-3">
          <div>
            <Badge variant="outline" className="mb-1 text-xs">purchase</Badge>
            <CodeBlock>{`{
  "event": "purchase",
  "license_key": "3794577c-3dbc-11ec-9bbc-0242ac130002",
  "tier": 1,
  "test": false   // true = validation ping, do not process
}`}</CodeBlock>
          </div>
          <div>
            <Badge variant="outline" className="mb-1 text-xs">activate</Badge>
            <CodeBlock>{`{
  "event": "activate",
  "license_key": "3794577c-3dbc-11ec-9bbc-0242ac130002",
  "user_id": 12345
}`}</CodeBlock>
          </div>
          <div>
            <Badge variant="outline" className="mb-1 text-xs">upgrade</Badge>
            <CodeBlock>{`{
  "event": "upgrade",
  "prev_license_key": "3794577c-3dbc-11ec-9bbc-0242ac130002",
  "new_license_key": "c86ad3d7-3942-4d11-8814-b0bd81971691",
  "new_tier": 2
}
// Note: AppSumo generates a new UUID for the upgraded key`}</CodeBlock>
          </div>
          <div>
            <Badge variant="outline" className="mb-1 text-xs">downgrade</Badge>
            <CodeBlock>{`{
  "event": "downgrade",
  "prev_license_key": "c86ad3d7-3942-4d11-8814-b0bd81971691",
  "new_license_key": "7f1a2b3c-0000-4d11-0000-b0bd81971691",
  "new_tier": 1
}`}</CodeBlock>
          </div>
          <div>
            <Badge variant="outline" className="mb-1 text-xs">deactivate</Badge>
            <CodeBlock>{`{
  "event": "deactivate",
  "license_key": "3794577c-3dbc-11ec-9bbc-0242ac130002"
}`}</CodeBlock>
          </div>
          <div>
            <Badge variant="outline" className="mb-1 text-xs">test</Badge>
            <CodeBlock>{`{
  "event": "test",
  "test": true
}
// Required response: { "event": "test", "success": true }`}</CodeBlock>
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <SectionHeading icon={KeyRound}>License State Machine</SectionHeading>
        <div className="rounded-md border text-xs overflow-hidden mb-2">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 font-medium">Event</th>
                <th className="text-left p-2 font-medium">Affected Key</th>
                <th className="text-left p-2 font-medium">Status Change</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["purchase", "license_key", "generated → consumed"],
                ["activate", "license_key", "consumed → redeemed"],
                ["upgrade", "prev_license_key", "redeemed → upgraded"],
                ["upgrade", "new_license_key", "generated → redeemed"],
                ["downgrade", "prev_license_key", "redeemed → downgraded"],
                ["downgrade", "new_license_key", "generated → redeemed"],
                ["deactivate", "license_key", "any → deactivated"],
              ].map(([event, key, change], i) => (
                <tr key={i} className="border-t">
                  <td className="p-2 font-mono">{event}</td>
                  <td className="p-2 text-muted-foreground">{key}</td>
                  <td className="p-2">
                    <code className="bg-muted px-1 rounded">{change}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Every status change is logged in <code className="bg-muted px-1 rounded">partner_license_events</code> with
          full webhook payload for audit purposes.
        </p>
      </div>

      <Separator />

      <div>
        <SectionHeading icon={Globe}>OAuth Callback</SectionHeading>
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary" className="font-mono text-xs">GET</Badge>
          <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">/api/auth/partner/callback</code>
        </div>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          When a customer clicks "Get Access" on AppSumo, they are redirected here with a one-time
          authorization <code className="bg-muted px-1 rounded">code</code> parameter. This endpoint
          exchanges it for an access token, fetches the customer's license key, and stores it in the
          session before redirecting to onboarding.
        </p>
        <p className="text-xs font-medium mb-2">Query Parameters</p>
        <CodeBlock className="mb-3">{`GET /api/auth/partner/callback?code=<auth_code>&partner=appsumo`}</CodeBlock>
        <p className="text-xs font-medium mb-2">Step-by-Step Flow</p>
        <ol className="flex flex-col gap-2 text-xs">
          {[
            "Customer activates license on AppSumo and grants OAuth consent",
            "AppSumo redirects to your callback URL with ?code=<one-time-code>&partner=appsumo",
            "Server exchanges code for access_token via POST to AppSumo token endpoint",
            "Server fetches license_key using the access_token from AppSumo license endpoint",
            "license_key stored in session as pendingLicenseKey",
            "User redirected to /onboarding to create account and link the license",
          ].map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-[10px]">
                {i + 1}
              </span>
              <span className="text-muted-foreground leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <Separator />

      <div>
        <SectionHeading icon={AlertTriangle}>Assumptions & Known Gaps</SectionHeading>
        <div className="flex flex-col gap-3">
          {[
            {
              label: "x-partner-name header",
              severity: "warn",
              text: "Our webhook endpoint identifies the partner via an x-partner-name header. AppSumo's real webhooks may not send this. If needed, create a dedicated endpoint /api/webhooks/appsumo that hardcodes the partner name.",
            },
            {
              label: "OAuth token endpoint",
              severity: "warn",
              text: "Implemented as https://<partner>.com/oauth/token. AppSumo's actual endpoint is POST https://appsumo.com/openid/token/ — needs updating before go-live.",
            },
            {
              label: "OAuth license endpoint",
              severity: "warn",
              text: "Implemented as https://<partner>.com/api/license. AppSumo's actual endpoint is GET https://appsumo.com/openid/license_key/?access_token=... — needs updating before go-live.",
            },
            {
              label: "HMAC signing string",
              severity: "info",
              text: 'Our implementation signs: HMAC-SHA256(webhookSecret, timestamp + "." + body). AppSumo\'s docs show timestamp + body (no dot separator). Align with AppSumo\'s exact format once confirmed.',
            },
            {
              label: "Tier system",
              severity: "ok",
              text: "AppSumo tiers are integers (1, 2, 3). Our schema uses integer tiers. ✓ Aligned.",
            },
            {
              label: "License key format",
              severity: "ok",
              text: "AppSumo uses UUID license keys. Our schema generates UUIDs via gen_random_uuid(). ✓ Aligned.",
            },
          ].map((item) => (
            <div
              key={item.label}
              className={`rounded-md border p-3 text-xs ${
                item.severity === "warn"
                  ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
                  : item.severity === "ok"
                  ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
                  : "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30"
              }`}
            >
              <div className="flex items-center gap-1.5 font-medium mb-1">
                {item.severity === "warn" && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                {item.severity === "ok" && <CheckCircle className="h-3 w-3 text-green-500" />}
                {item.severity === "info" && <ShieldCheck className="h-3 w-3 text-blue-500" />}
                {item.label}
              </div>
              <p className="text-muted-foreground leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <SectionHeading icon={ChevronRight}>AppSumo Partner Portal Checklist</SectionHeading>
        <ol className="flex flex-col gap-2 text-xs">
          {[
            "Log into AppSumo Partner Portal → Settings → Integrations",
            "Set Webhook URL: https://<your-domain>/api/webhooks/partner",
            "AppSumo will send a test webhook — your endpoint must return 200 with { event: \"test\", success: true }",
            "Set OAuth Redirect URL: https://<your-domain>/api/auth/partner/callback?partner=appsumo",
            "AppSumo validates the URL with a GET request — your endpoint must return 200",
            "Copy the Webhook Secret from AppSumo → paste into this system's AppSumo partner record",
            "Obtain OAuth client_id and client_secret from AppSumo → store in partner record (admin portal)",
            "Generate initial key batches and export CSV → upload to AppSumo",
            "Use AppSumo developer credits to run a test purchase end-to-end",
          ].map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold text-[10px]">
                {i + 1}
              </span>
              <span className="text-muted-foreground leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function WebhookTester({ config, baseUrl }: { config: PartnerConfig; baseUrl: string }) {
  const { toast } = useToast();
  const [eventType, setEventType] = useState("test");
  const [licenseKey, setLicenseKey] = useState("");
  const [prevLicenseKey, setPrevLicenseKey] = useState("");
  const [newLicenseKey, setNewLicenseKey] = useState("");
  const [tier, setTier] = useState("1");
  const [newTier, setNewTier] = useState("2");
  const [userId, setUserId] = useState("1");
  const [result, setResult] = useState<WebhookTestResult | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);

  const { data: licenses = [] } = useQuery<LicenseOption[]>({
    queryKey: [`/api/admin/test/licenses?partnerId=${config.id}`],
    enabled: !!config.id,
  });

  const byStatus = useMemo(() => {
    const map: Record<string, LicenseOption[]> = {};
    for (const l of licenses) {
      if (!map[l.status]) map[l.status] = [];
      map[l.status].push(l);
    }
    return map;
  }, [licenses]);

  const curlPreview = useMemo(() => {
    const body: Record<string, unknown> = { event: eventType };
    if (eventType === "purchase") { body.license_key = licenseKey || "<key>"; body.tier = parseInt(tier); }
    if (eventType === "activate") { body.license_key = licenseKey || "<key>"; body.user_id = parseInt(userId); }
    if (eventType === "upgrade" || eventType === "downgrade") {
      body.prev_license_key = prevLicenseKey || "<prev_key>";
      body.new_license_key = newLicenseKey || "<new_key>";
      body.new_tier = parseInt(newTier);
    }
    if (eventType === "deactivate") { body.license_key = licenseKey || "<key>"; }

    return `curl -X POST ${baseUrl}/api/webhooks/partner \\
  -H "Content-Type: application/json" \\
  -H "x-partner-name: appsumo" \\
  -d '${JSON.stringify(body, null, 2)}'`;
  }, [eventType, licenseKey, prevLicenseKey, newLicenseKey, tier, newTier, userId, baseUrl]);

  const testMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { event: eventType, partnerName: "appsumo" };
      if (eventType === "purchase") { body.license_key = licenseKey; body.tier = parseInt(tier); }
      if (eventType === "activate") { body.license_key = licenseKey; body.user_id = parseInt(userId); }
      if (eventType === "upgrade" || eventType === "downgrade") {
        body.prev_license_key = prevLicenseKey;
        body.new_license_key = newLicenseKey;
        body.new_tier = parseInt(newTier);
      }
      if (eventType === "deactivate") { body.license_key = licenseKey; }

      const res = await apiRequest("POST", "/api/admin/test/webhook", body);
      setHttpStatus(res.status);
      return res.json() as Promise<WebhookTestResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.success) {
        toast({ title: `Event "${data.event}" sent successfully` });
      } else {
        toast({ title: "Event failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      setHttpStatus(500);
      toast({ title: "Request failed", description: err.message, variant: "destructive" });
    },
  });

  const selectForStatus = (statuses: string[], value: string, onChange: (v: string) => void, placeholder: string) => {
    const opts = statuses.flatMap((s) => byStatus[s] ?? []);
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger data-testid={`select-${placeholder.toLowerCase().replace(/\s/g, "-")}`}>
          <SelectValue placeholder={opts.length ? placeholder : `No ${statuses.join("/")} keys`} />
        </SelectTrigger>
        <SelectContent>
          {opts.map((l) => (
            <SelectItem key={l.licenseKey} value={l.licenseKey}>
              <span className="font-mono text-xs">{l.licenseKey.slice(0, 14)}…</span>
              <span className="ml-2 text-muted-foreground text-xs">{TIER_LABELS[l.tier] ?? `Tier ${l.tier}`}</span>
            </SelectItem>
          ))}
          {opts.length === 0 && (
            <SelectItem value="__none__" disabled>No matching keys</SelectItem>
          )}
        </SelectContent>
      </Select>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Label className="mb-2 block text-xs font-medium">Event Type</Label>
        <Select
          value={eventType}
          onValueChange={(v) => { setEventType(v); setResult(null); setLicenseKey(""); setPrevLicenseKey(""); setNewLicenseKey(""); }}
        >
          <SelectTrigger data-testid="select-event-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map((e) => (
              <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {eventType === "purchase" && (
        <div className="flex flex-col gap-3">
          <div>
            <Label className="mb-2 block text-xs font-medium">License Key <span className="text-muted-foreground">(generated)</span></Label>
            {selectForStatus(["generated"], licenseKey, setLicenseKey, "Select generated key")}
          </div>
          <div>
            <Label className="mb-2 block text-xs font-medium">Tier</Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger data-testid="select-tier"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIER_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {eventType === "activate" && (
        <div className="flex flex-col gap-3">
          <div>
            <Label className="mb-2 block text-xs font-medium">License Key <span className="text-muted-foreground">(consumed)</span></Label>
            {selectForStatus(["consumed"], licenseKey, setLicenseKey, "Select consumed key")}
          </div>
          <div>
            <Label className="mb-2 block text-xs font-medium">User ID</Label>
            <Input
              type="number"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="12345"
              data-testid="input-user-id"
            />
            <p className="text-xs text-muted-foreground mt-1">Integer user ID from the end-user system</p>
          </div>
        </div>
      )}

      {(eventType === "upgrade" || eventType === "downgrade") && (
        <div className="flex flex-col gap-3">
          <div>
            <Label className="mb-2 block text-xs font-medium">Previous License Key <span className="text-muted-foreground">(redeemed)</span></Label>
            {selectForStatus(["redeemed"], prevLicenseKey, setPrevLicenseKey, "Select redeemed key")}
          </div>
          <div>
            <Label className="mb-2 block text-xs font-medium">New License Key <span className="text-muted-foreground">(generated by AppSumo)</span></Label>
            <Input
              value={newLicenseKey}
              onChange={(e) => setNewLicenseKey(e.target.value)}
              placeholder="New UUID from AppSumo (or pick a generated key)"
              data-testid="input-new-license-key"
            />
            <p className="text-xs text-muted-foreground mt-1">
              In production AppSumo sends a new UUID. For testing, paste any generated key UUID from your pool above.
            </p>
            <div className="mt-2">
              {selectForStatus(["generated"], newLicenseKey, setNewLicenseKey, "…or pick from generated pool")}
            </div>
          </div>
          <div>
            <Label className="mb-2 block text-xs font-medium">New Tier</Label>
            <Select value={newTier} onValueChange={setNewTier}>
              <SelectTrigger data-testid="select-new-tier"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIER_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {eventType === "deactivate" && (
        <div>
          <Label className="mb-2 block text-xs font-medium">License Key</Label>
          {selectForStatus(["redeemed", "consumed", "generated"], licenseKey, setLicenseKey, "Select key to deactivate")}
        </div>
      )}

      {eventType === "test" && (
        <div className="rounded-md bg-muted/40 border p-3 text-xs text-muted-foreground">
          No fields needed. This sends a validation ping to confirm your endpoint is reachable and returns the correct format.
        </div>
      )}

      <div>
        <Label className="mb-2 block text-xs font-medium">cURL Preview</Label>
        <CodeBlock>{curlPreview}</CodeBlock>
      </div>

      <Button
        onClick={() => testMutation.mutate()}
        disabled={testMutation.isPending}
        data-testid="button-send-test"
      >
        {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Send Test Event
      </Button>

      {result && (
        <div className="flex flex-col gap-3 rounded-md border p-4 bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">Response</span>
            {httpStatus && (
              <Badge variant={httpStatus < 300 ? "default" : "destructive"} className="text-xs font-mono">
                {httpStatus}
              </Badge>
            )}
            {result.success
              ? <CheckCircle className="h-4 w-4 text-green-500" />
              : <XCircle className="h-4 w-4 text-red-500" />}
          </div>
          <CodeBlock>{JSON.stringify(result, null, 2)}</CodeBlock>

          {result.license && (
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs font-medium mb-2">Updated License State</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Key</span>
                <code className="font-mono">{result.license.licenseKey.slice(0, 18)}…</code>
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline" className="w-fit text-xs">{result.license.status}</Badge>
                <span className="text-muted-foreground">Tier</span>
                <span>{TIER_LABELS[result.license.tier] ?? `Tier ${result.license.tier}`}</span>
                {result.license.userId && (
                  <>
                    <span className="text-muted-foreground">User ID</span>
                    <span>{result.license.userId}</span>
                  </>
                )}
                {result.license.consumedAt && (
                  <>
                    <span className="text-muted-foreground">Consumed</span>
                    <span>{new Date(result.license.consumedAt).toLocaleString()}</span>
                  </>
                )}
                {result.license.redeemedAt && (
                  <>
                    <span className="text-muted-foreground">Redeemed</span>
                    <span>{new Date(result.license.redeemedAt).toLocaleString()}</span>
                  </>
                )}
                {result.license.deactivatedAt && (
                  <>
                    <span className="text-muted-foreground">Deactivated</span>
                    <span>{new Date(result.license.deactivatedAt).toLocaleString()}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OAuthSetup({ config, baseUrl }: { config: PartnerConfig; baseUrl: string }) {
  const webhookUrl = `${baseUrl}/api/webhooks/partner`;
  const oauthCallbackUrl = `${baseUrl}/api/auth/partner/callback?partner=appsumo`;

  const checks = [
    { label: "Partner active", ok: config.isActive },
    { label: "API key configured", ok: !!config.apiKey },
    { label: "Webhook secret configured", ok: !!config.webhookSecret },
    { label: "OAuth client ID configured", ok: !!config.oauthClientId },
    { label: "OAuth client secret configured", ok: config.oauthClientSecret === "configured" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-semibold mb-3">Configuration Status</h3>
        <div className="flex flex-col gap-2">
          {checks.map((c) => (
            <div key={c.label} className="flex items-center gap-2 text-xs">
              <StatusDot ok={c.ok} />
              <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
              {!c.ok && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Action needed</Badge>}
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-semibold mb-3">URLs to Configure in AppSumo Partner Portal</h3>
        <div className="flex flex-col gap-3">
          <div>
            <Label className="text-xs mb-1 block">Webhook URL</Label>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <code className="flex-1 text-xs font-mono break-all">{webhookUrl}</code>
              <CopyButton value={webhookUrl} />
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1 block">OAuth Redirect URL</Label>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <code className="flex-1 text-xs font-mono break-all">{oauthCallbackUrl}</code>
              <CopyButton value={oauthCallbackUrl} />
            </div>
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-semibold mb-3">Secrets</h3>
        <div className="flex flex-col gap-3">
          <div>
            <Label className="text-xs mb-1 block">Webhook Secret <span className="text-muted-foreground">(copy to AppSumo Partner Portal)</span></Label>
            <SecretField value={config.webhookSecret} label="webhook-secret" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">API Key</Label>
            <SecretField value={config.apiKey} label="api-key" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">OAuth Client ID <span className="text-muted-foreground">(from AppSumo Portal → paste here)</span></Label>
            <SecretField value={config.oauthClientId} label="oauth-client-id" />
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-semibold mb-3">OAuth Flow — Step by Step</h3>
        <div className="flex flex-col gap-2 text-xs">
          {[
            { step: "Customer activates on AppSumo", detail: "They click \"Get Access\" on the AppSumo product page after purchasing." },
            { step: "AppSumo redirects to your callback", detail: `GET ${oauthCallbackUrl.replace("your-domain.com", "<your-domain>")}&code=<one-time-code>` },
            { step: "Your server exchanges the code", detail: "POST https://appsumo.com/openid/token/ → returns access_token + refresh_token" },
            { step: "Your server fetches the license", detail: "GET https://appsumo.com/openid/license_key/?access_token=<token> → returns license_key, tier" },
            { step: "License stored in session", detail: "pendingLicenseKey saved to session; user redirected to /onboarding" },
            { step: "User completes sign-up", detail: "User creates account or logs in; license linked to their account in the database." },
          ].map((item, i) => (
            <div key={i} className="flex gap-3 rounded-md border p-3 bg-muted/20">
              <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-[10px]">
                {i + 1}
              </span>
              <div>
                <p className="font-medium mb-0.5">{item.step}</p>
                <code className="text-muted-foreground break-all">{item.detail}</code>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-xs">
        <div className="flex items-center gap-1.5 font-medium mb-1 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Before Go-Live — Update OAuth Endpoints
        </div>
        <p className="text-muted-foreground leading-relaxed">
          The current OAuth implementation uses generic partner URLs. Before going live, update
          <code className="mx-1 bg-muted px-1 rounded">server/routes/oauth.ts</code> to use AppSumo's
          actual endpoints:
          <code className="block mt-1 bg-muted px-2 py-1 rounded">POST https://appsumo.com/openid/token/</code>
          <code className="block mt-1 bg-muted px-2 py-1 rounded">GET https://appsumo.com/openid/license_key/?access_token=...</code>
        </p>
      </div>
    </div>
  );
}

export default function AppSumoIntegration() {
  const { data: config, isLoading, error } = useQuery<PartnerConfig>({
    queryKey: ["/api/admin/test/partner-config"],
  });

  const [baseUrl, setBaseUrl] = useState(
    typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"
  );

  return (
    <AdminLayout>
      <div className="flex flex-col gap-4 h-full">
        <div className="flex items-center gap-3">
          <Plug className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-page-title">AppSumo Integration</h1>
            <p className="text-xs text-muted-foreground">Documentation, configuration status, and end-to-end test tools</p>
          </div>
          {config && (
            <Badge variant={config.isActive ? "default" : "secondary"} className="ml-auto">
              {config.isActive ? "Active" : "Inactive"}
            </Badge>
          )}
        </div>

        <div className="flex flex-1 gap-4 min-h-0 overflow-hidden">
          <div className="w-[400px] shrink-0 rounded-lg border bg-card">
            <ScrollArea className="h-full p-5">
              <DocsPanel />
              <div className="h-8" />
            </ScrollArea>
          </div>

          <div className="flex-1 min-w-0 rounded-lg border bg-card">
            {isLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center p-8 text-center">
                <div>
                  <XCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Could not load AppSumo partner config. Make sure the AppSumo partner is seeded in the database.
                  </p>
                </div>
              </div>
            ) : config ? (
              <ScrollArea className="h-full p-5">
                <div className="mb-5 rounded-md border bg-muted/30 px-4 py-3 flex items-center gap-3">
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs font-medium block mb-1">
                      Base URL
                      <span className="ml-2 font-normal text-muted-foreground">— all webhook and OAuth URLs below update automatically</span>
                    </Label>
                    <Input
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value.replace(/\/$/, ""))}
                      className="h-7 text-xs font-mono"
                      placeholder="https://your-domain.com"
                      data-testid="input-base-url"
                    />
                  </div>
                  <CopyButton value={baseUrl} label="Copy" />
                </div>

                <Tabs defaultValue="webhook" className="w-full">
                  <TabsList className="mb-5 w-full" data-testid="tabs-test">
                    <TabsTrigger value="webhook" className="flex-1" data-testid="tab-webhook">
                      <Webhook className="h-3.5 w-3.5 mr-1.5" />
                      Webhook Tester
                    </TabsTrigger>
                    <TabsTrigger value="oauth" className="flex-1" data-testid="tab-oauth">
                      <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                      OAuth Setup
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="webhook">
                    <WebhookTester config={config} baseUrl={baseUrl} />
                  </TabsContent>
                  <TabsContent value="oauth">
                    <OAuthSetup config={config} baseUrl={baseUrl} />
                  </TabsContent>
                </Tabs>
                <div className="h-8" />
              </ScrollArea>
            ) : null}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
