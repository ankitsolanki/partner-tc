const TRACK_BASE = process.env.TRACK_API_URL || "https://app-credify.tinycommand.com";
const TRACK_TOKEN = process.env.TRACK_API_TOKEN || "";

const CREDITS_PER_UNIT = 50_000;

export class TrackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrackError";
  }
}

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TRACK_TOKEN}`,
  };
}

function logConfig(): void {
  console.log("[Track:config] TRACK_API_URL:", TRACK_BASE);
  console.log("[Track:config] TRACK_API_TOKEN:", TRACK_TOKEN ? `set (${TRACK_TOKEN.length} chars, starts with: ${TRACK_TOKEN.slice(0, 20)}...)` : "NOT SET");
}

function logHeaders(headers: Record<string, string>): void {
  console.log("[Track:headers]", JSON.stringify({
    "Content-Type": headers["Content-Type"],
    Authorization: headers.Authorization ? `Bearer ${headers.Authorization.replace("Bearer ", "").slice(0, 20)}...` : "NOT SET",
  }));
}

function logCurl(method: string, url: string, headers: Record<string, string>, body?: string): void {
  const parts = [`curl -X ${method} '${url}'`];
  for (const [key, value] of Object.entries(headers)) {
    parts.push(`-H '${key}: ${value}'`);
  }
  if (body) {
    parts.push(`-d '${body}'`);
  }
  console.log("[Track:curl]", parts.join(" \\\n  "));
}

// ─── Resolve workspace ID (externalId) to internal customerId ─────────────────
// Workspace ID from Heimdall = externalId in tiny-track's customer model.
// We must resolve it to the internal customerId before querying subscriptions.
async function resolveCustomerId(
  workspaceId: string
): Promise<{ customerId: string; organizationId: string } | null> {
  const url = `${TRACK_BASE}/api/external/customers/${workspaceId}`;
  const headers = authHeaders();

  console.log("[Track:resolveCustomer] ─── Resolving externalId to customerId ───");
  console.log("[Track:resolveCustomer] URL:", url);
  console.log("[Track:resolveCustomer] Method: GET");
  logHeaders(headers);
  logCurl("GET", url, headers);

  const res = await fetch(url, { headers });

  console.log("[Track:resolveCustomer] Response status:", res.status);
  console.log("[Track:resolveCustomer] Response content-type:", res.headers.get("content-type"));

  if (!res.ok) {
    const body = await res.text();
    console.log("[Track:resolveCustomer] Response body (error):", body.slice(0, 500));
    console.log("[Track:resolveCustomer] Customer not found for externalId:", workspaceId);
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  console.log("[Track:resolveCustomer] Response body:", JSON.stringify(data).slice(0, 800));

  const customer = (data.data ?? data) as Record<string, unknown>;
  const customerId = (customer._id ?? customer.id) as string | undefined;
  const organizationId = customer.organizationId as string | undefined;

  console.log("[Track:resolveCustomer] Parsed:", {
    customerId: customerId ?? "MISSING",
    organizationId: organizationId ?? "MISSING",
    externalId: customer.externalId ?? "MISSING",
    name: customer.name ?? "N/A",
  });

  if (!customerId) {
    console.log("[Track:resolveCustomer] No customerId in response");
    return null;
  }

  console.log("[Track:resolveCustomer] ─── SUCCESS — externalId", workspaceId, "→ customerId", customerId, "───");
  return { customerId, organizationId: organizationId || "" };
}

// ─── Get subscription by internal customerId ──────────────────────────────────
async function getSubscriptionByCustomer(
  customerId: string
): Promise<{ subscriptionId: string; planId: string; creditAllowance: number } | null> {
  const url = `${TRACK_BASE}/api/subscriptions/customer/${customerId}`;
  const headers = authHeaders();

  console.log("[Track:getSub] ─── GET Subscription by Customer ───");
  console.log("[Track:getSub] URL:", url);
  console.log("[Track:getSub] Method: GET");
  logHeaders(headers);
  logCurl("GET", url, headers);

  const res = await fetch(url, { headers });

  console.log("[Track:getSub] Response status:", res.status);
  console.log("[Track:getSub] Response content-type:", res.headers.get("content-type"));

  if (!res.ok) {
    const body = await res.text();
    console.log("[Track:getSub] Response body (error):", body.slice(0, 500));
    console.log("[Track:getSub] FAILED — returning null");
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  console.log("[Track:getSub] Response body:", JSON.stringify(data).slice(0, 800));

  const sub = (data.data ?? data) as Record<string, unknown>;
  const subscriptionId = (sub._id ?? sub.id) as string | undefined;
  const planId = (sub.planId as Record<string, unknown>)?._id as string ?? sub.planId as string | undefined;
  const entitlements = sub.entitlements as Record<string, unknown> | undefined;
  const creditAllowance = (entitlements?.creditAllowance as number) ?? 0;

  console.log("[Track:getSub] Parsed:", {
    subscriptionId: subscriptionId ?? "MISSING",
    planId: planId ?? "MISSING",
    creditAllowance,
    entitlements: entitlements ? JSON.stringify(entitlements).slice(0, 300) : "MISSING",
  });

  if (!subscriptionId || !planId) {
    console.log("[Track:getSub] No valid subscription in response");
    return null;
  }

  console.log("[Track:getSub] ─── SUCCESS ───");
  return { subscriptionId, planId, creditAllowance };
}

// ─── Get plan's base creditAllowance ──────────────────────────────────────────
async function getPlanCreditAllowance(planId: string): Promise<number> {
  const url = `${TRACK_BASE}/api/plans/${planId}`;
  const headers = authHeaders();

  console.log("[Track:getPlan] ─── GET Plan ───");
  console.log("[Track:getPlan] URL:", url);
  console.log("[Track:getPlan] Method: GET");
  logHeaders(headers);
  logCurl("GET", url, headers);

  const res = await fetch(url, { headers });

  console.log("[Track:getPlan] Response status:", res.status);
  console.log("[Track:getPlan] Response content-type:", res.headers.get("content-type"));

  if (!res.ok) {
    const body = await res.text();
    console.error("[Track:getPlan] Response body (error):", body.slice(0, 500));
    throw new TrackError(`Failed to fetch plan ${planId}: HTTP ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  console.log("[Track:getPlan] Response body:", JSON.stringify(data).slice(0, 800));

  const plan = (data.data ?? data) as Record<string, unknown>;
  const creditAllowance = (plan.creditAllowance as number) ?? 0;

  console.log("[Track:getPlan] Parsed: creditAllowance =", creditAllowance, "| plan name:", plan.name ?? "N/A");
  console.log("[Track:getPlan] ─── SUCCESS ───");
  return creditAllowance;
}

// ─── Update subscription's entitlements.creditAllowance ───────────────────────
async function updateSubscriptionCreditAllowance(
  subscriptionId: string,
  newCreditAllowance: number
): Promise<void> {
  const url = `${TRACK_BASE}/api/subscriptions/${subscriptionId}`;
  const headers = authHeaders();
  const requestBody = {
    entitlements: {
      creditAllowance: newCreditAllowance,
    },
  };

  console.log("[Track:updateSub] ─── PUT Update Subscription ───");
  console.log("[Track:updateSub] URL:", url);
  console.log("[Track:updateSub] Method: PUT");
  logHeaders(headers);
  console.log("[Track:updateSub] Request body:", JSON.stringify(requestBody));
  logCurl("PUT", url, headers, JSON.stringify(requestBody));

  const res = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(requestBody),
  });

  console.log("[Track:updateSub] Response status:", res.status);
  console.log("[Track:updateSub] Response content-type:", res.headers.get("content-type"));

  if (!res.ok) {
    const resBody = await res.text();
    console.error("[Track:updateSub] Response body (error):", resBody.slice(0, 500));
    throw new TrackError(`Failed to update subscription: HTTP ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  console.log("[Track:updateSub] Response body:", JSON.stringify(data).slice(0, 800));

  if (data.success === false) {
    throw new TrackError(`Subscription update failed: ${(data.message as string) || "unknown error"}`);
  }

  console.log("[Track:updateSub] ─── SUCCESS — creditAllowance set to", newCreditAllowance, "───");
}

// ─── Cancel subscription (for deactivate/refund) ─────────────────────────────
export async function cancelSubscription(
  workspaceId: string,
  reason: string
): Promise<void> {
  console.log("[Track:cancel] ═══════════════════════════════════════");
  console.log("[Track:cancel] Cancelling subscription");
  console.log("[Track:cancel] Workspace (externalId):", workspaceId);
  console.log("[Track:cancel] Reason:", reason);
  logConfig();

  if (!TRACK_TOKEN) {
    console.error("[Track:cancel] TRACK_API_TOKEN not configured — skipping");
    throw new TrackError("TRACK_API_TOKEN not configured");
  }

  // Step 1: Resolve externalId → customerId
  console.log("[Track:cancel] Step 1/3: Resolving workspace to customerId...");
  const customer = await resolveCustomerId(workspaceId);
  if (!customer) {
    console.log("[Track:cancel] Customer not found for workspace:", workspaceId, "— nothing to cancel");
    console.log("[Track:cancel] ═══════════════════════════════════════");
    return;
  }

  // Step 2: Find the subscription
  console.log("[Track:cancel] Step 2/3: Looking up subscription for customerId:", customer.customerId);
  const sub = await getSubscriptionByCustomer(customer.customerId);
  if (!sub) {
    console.log("[Track:cancel] No subscription found — nothing to cancel");
    console.log("[Track:cancel] ═══════════════════════════════════════");
    return;
  }
  console.log("[Track:cancel] Found subscription:", sub.subscriptionId, "| plan:", sub.planId, "| creditAllowance:", sub.creditAllowance);

  // Step 3: Cancel the subscription immediately
  const url = `${TRACK_BASE}/api/subscriptions/${sub.subscriptionId}/cancel`;
  const headers = authHeaders();
  const requestBody = {
    reason,
    cancelType: "immediate",
  };

  console.log("[Track:cancel] Step 3/3: Cancelling subscription...");
  console.log("[Track:cancel] URL:", url);
  console.log("[Track:cancel] Method: POST");
  logHeaders(headers);
  console.log("[Track:cancel] Request body:", JSON.stringify(requestBody));
  logCurl("POST", url, headers, JSON.stringify(requestBody));

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  console.log("[Track:cancel] Response status:", res.status);
  console.log("[Track:cancel] Response content-type:", res.headers.get("content-type"));

  if (!res.ok) {
    const resBody = await res.text();
    console.error("[Track:cancel] Response body (error):", resBody.slice(0, 500));
    throw new TrackError(`Failed to cancel subscription: HTTP ${res.status} — ${resBody.slice(0, 200)}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  console.log("[Track:cancel] Response body:", JSON.stringify(data).slice(0, 800));

  if (data.success === false) {
    const errMsg = (data.message as string) || "unknown error";
    console.error("[Track:cancel] Cancel returned success:false:", errMsg);
    throw new TrackError(`Subscription cancel failed: ${errMsg}`);
  }

  console.log("[Track:cancel] ═══════════════════════════════════════");
  console.log("[Track:cancel] SUCCESS — subscription", sub.subscriptionId, "cancelled for workspace", workspaceId);
}

// ─── Update monthly credit allowance (for add-on units) ──────────────────────
export async function updateAddOnCredits(
  workspaceId: string,
  unitQuantity: number,
  tier: number
): Promise<void> {
  console.log("[Track:addOn] ═══════════════════════════════════════");
  console.log("[Track:addOn] Updating add-on credit allowance");
  console.log("[Track:addOn] Workspace (externalId):", workspaceId);
  console.log("[Track:addOn] Unit quantity:", unitQuantity, "(each =", CREDITS_PER_UNIT, "credits/month)");
  console.log("[Track:addOn] Tier:", tier);
  logConfig();

  if (!TRACK_TOKEN) {
    console.error("[Track:addOn] TRACK_API_TOKEN not configured — skipping");
    throw new TrackError("TRACK_API_TOKEN not configured");
  }

  // Step 1: Resolve externalId → customerId
  console.log("[Track:addOn] Step 1/4: Resolving workspace to customerId...");
  const customer = await resolveCustomerId(workspaceId);
  if (!customer) {
    console.error("[Track:addOn] Customer not found for workspace:", workspaceId);
    throw new TrackError(`Customer not found for workspace ${workspaceId}`);
  }

  // Step 2: Get current subscription
  console.log("[Track:addOn] Step 2/4: Looking up subscription for customerId:", customer.customerId);
  const sub = await getSubscriptionByCustomer(customer.customerId);
  if (!sub) {
    console.error("[Track:addOn] No subscription found for customerId:", customer.customerId);
    throw new TrackError(`No subscription found for customer ${customer.customerId}`);
  }

  // Step 3: Get the base plan's creditAllowance
  console.log("[Track:addOn] Step 3/4: Fetching base plan:", sub.planId);
  const baseCreditAllowance = await getPlanCreditAllowance(sub.planId);

  // Step 4: Calculate and update
  const addOnCredits = unitQuantity * CREDITS_PER_UNIT;
  const newCreditAllowance = baseCreditAllowance + addOnCredits;
  console.log("[Track:addOn] Step 4/4: Updating subscription...");
  console.log("[Track:addOn] Credit calculation:", {
    basePlanCredits: baseCreditAllowance,
    addOnUnits: unitQuantity,
    addOnCredits: `${unitQuantity} × ${CREDITS_PER_UNIT} = ${addOnCredits}`,
    newTotalAllowance: newCreditAllowance,
  });

  await updateSubscriptionCreditAllowance(sub.subscriptionId, newCreditAllowance);

  console.log("[Track:addOn] ═══════════════════════════════════════");
  console.log("[Track:addOn] SUCCESS — monthly credit allowance updated to", newCreditAllowance);
}
