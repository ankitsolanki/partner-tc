import { log, verbose, error, logCurl } from "../utils/logger";

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

// ─── Resolve workspace ID (externalId) to internal customerId ─────────────────
// Workspace ID from Heimdall = externalId in tiny-track's customer model.
// We must resolve it to the internal customerId before querying subscriptions.
async function resolveCustomerId(
  workspaceId: string
): Promise<{ customerId: string; organizationId: string } | null> {
  const url = `${TRACK_BASE}/api/external/customers/${workspaceId}`;
  const headers = authHeaders();

  log("Track:resolveCustomer", "Resolving externalId to customerId", workspaceId);
  verbose("Track:resolveCustomer", "URL:", url);
  verbose("Track:resolveCustomer", "Headers:", headers);
  logCurl("Track:resolveCustomer", "GET", url, headers);

  const res = await fetch(url, { headers });

  verbose("Track:resolveCustomer", "Response status:", res.status);
  verbose("Track:resolveCustomer", "Response content-type:", res.headers.get("content-type"));

  if (!res.ok) {
    const body = await res.text();
    verbose("Track:resolveCustomer", "Response body (error):", body.slice(0, 500));
    log("Track:resolveCustomer", "FAILED — Customer not found for externalId:", workspaceId);
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  verbose("Track:resolveCustomer", "Response body:", JSON.stringify(data).slice(0, 800));

  const customer = (data.data ?? data) as Record<string, unknown>;
  const customerId = (customer._id ?? customer.id) as string | undefined;
  const organizationId = customer.organizationId as string | undefined;

  verbose("Track:resolveCustomer", "Parsed:", {
    customerId: customerId ?? "MISSING",
    organizationId: organizationId ?? "MISSING",
    externalId: customer.externalId ?? "MISSING",
    name: customer.name ?? "N/A",
  });

  if (!customerId) {
    log("Track:resolveCustomer", "FAILED — No customerId in response");
    return null;
  }

  log("Track:resolveCustomer", `SUCCESS — externalId ${workspaceId} → customerId ${customerId}`);
  return { customerId, organizationId: organizationId || "" };
}

// ─── Get subscription by internal customerId ──────────────────────────────────
async function getSubscriptionByCustomer(
  customerId: string
): Promise<{ subscriptionId: string; planId: string; creditAllowance: number } | null> {
  const url = `${TRACK_BASE}/api/subscriptions/customer/${customerId}`;
  const headers = authHeaders();

  log("Track:getSub", "Getting subscription for customerId:", customerId);
  verbose("Track:getSub", "URL:", url);
  verbose("Track:getSub", "Headers:", headers);
  logCurl("Track:getSub", "GET", url, headers);

  const res = await fetch(url, { headers });

  verbose("Track:getSub", "Response status:", res.status);
  verbose("Track:getSub", "Response content-type:", res.headers.get("content-type"));

  if (!res.ok) {
    const body = await res.text();
    verbose("Track:getSub", "Response body (error):", body.slice(0, 500));
    log("Track:getSub", "FAILED — returning null");
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  verbose("Track:getSub", "Response body:", JSON.stringify(data).slice(0, 800));

  const sub = (data.data ?? data) as Record<string, unknown>;
  const subscriptionId = (sub._id ?? sub.id) as string | undefined;
  const planId = (sub.planId as Record<string, unknown>)?._id as string ?? sub.planId as string | undefined;
  const entitlements = sub.entitlements as Record<string, unknown> | undefined;
  const creditAllowance = (entitlements?.creditAllowance as number) ?? 0;

  verbose("Track:getSub", "Parsed:", {
    subscriptionId: subscriptionId ?? "MISSING",
    planId: planId ?? "MISSING",
    creditAllowance,
    entitlements: entitlements ? JSON.stringify(entitlements).slice(0, 300) : "MISSING",
  });

  if (!subscriptionId || !planId) {
    log("Track:getSub", "FAILED — No valid subscription in response");
    return null;
  }

  log("Track:getSub", "SUCCESS");
  return { subscriptionId, planId, creditAllowance };
}

// ─── Get plan's base creditAllowance ──────────────────────────────────────────
async function getPlanCreditAllowance(planId: string): Promise<number> {
  const url = `${TRACK_BASE}/api/plans/${planId}`;
  const headers = authHeaders();

  log("Track:getPlan", "Getting plan:", planId);
  verbose("Track:getPlan", "URL:", url);
  verbose("Track:getPlan", "Headers:", headers);
  logCurl("Track:getPlan", "GET", url, headers);

  const res = await fetch(url, { headers });

  verbose("Track:getPlan", "Response status:", res.status);
  verbose("Track:getPlan", "Response content-type:", res.headers.get("content-type"));

  if (!res.ok) {
    const body = await res.text();
    error("Track:getPlan", "Response body (error):", body.slice(0, 500));
    throw new TrackError(`Failed to fetch plan ${planId}: HTTP ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  verbose("Track:getPlan", "Response body:", JSON.stringify(data).slice(0, 800));

  const plan = (data.data ?? data) as Record<string, unknown>;
  const creditAllowance = (plan.creditAllowance as number) ?? 0;

  verbose("Track:getPlan", "Parsed: creditAllowance =", { creditAllowance, planName: plan.name ?? "N/A" });
  log("Track:getPlan", "SUCCESS");
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

  log("Track:updateSub", "Updating subscription creditAllowance:", subscriptionId);
  verbose("Track:updateSub", "URL:", url);
  verbose("Track:updateSub", "Headers:", headers);
  verbose("Track:updateSub", "Request body:", requestBody);
  logCurl("Track:updateSub", "PUT", url, headers, JSON.stringify(requestBody));

  const res = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(requestBody),
  });

  verbose("Track:updateSub", "Response status:", res.status);
  verbose("Track:updateSub", "Response content-type:", res.headers.get("content-type"));

  if (!res.ok) {
    const resBody = await res.text();
    error("Track:updateSub", "Response body (error):", resBody.slice(0, 500));
    throw new TrackError(`Failed to update subscription: HTTP ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  verbose("Track:updateSub", "Response body:", JSON.stringify(data).slice(0, 800));

  if (data.success === false) {
    throw new TrackError(`Subscription update failed: ${(data.message as string) || "unknown error"}`);
  }

  log("Track:updateSub", `SUCCESS — creditAllowance set to ${newCreditAllowance}`);
}

// ─── Cancel subscription (for deactivate/refund) ─────────────────────────────
export async function cancelSubscription(
  workspaceId: string,
  reason: string
): Promise<void> {
  log("Track:cancel", `Cancelling subscription for workspace ${workspaceId}, reason: ${reason}`);
  verbose("Track:cancel", "TRACK_API_URL:", TRACK_BASE);
  verbose("Track:cancel", "TRACK_API_TOKEN:", TRACK_TOKEN ? `set (${TRACK_TOKEN.length} chars)` : "NOT SET");

  if (!TRACK_TOKEN) {
    error("Track:cancel", "TRACK_API_TOKEN not configured — skipping");
    throw new TrackError("TRACK_API_TOKEN not configured");
  }

  // Step 1: Resolve externalId → customerId
  log("Track:cancel", "Step 1/3: Resolving workspace to customerId...");
  const customer = await resolveCustomerId(workspaceId);
  if (!customer) {
    log("Track:cancel", `Customer not found for workspace ${workspaceId} — nothing to cancel`);
    return;
  }

  // Step 2: Find the subscription
  log("Track:cancel", `Step 2/3: Looking up subscription for customerId: ${customer.customerId}`);
  const sub = await getSubscriptionByCustomer(customer.customerId);
  if (!sub) {
    log("Track:cancel", "No subscription found — nothing to cancel");
    return;
  }
  verbose("Track:cancel", "Found subscription:", {
    subscriptionId: sub.subscriptionId,
    planId: sub.planId,
    creditAllowance: sub.creditAllowance,
  });

  // Step 3: Cancel the subscription immediately
  const url = `${TRACK_BASE}/api/subscriptions/${sub.subscriptionId}/cancel`;
  const headers = authHeaders();
  const requestBody = {
    reason,
    cancelType: "immediate",
  };

  log("Track:cancel", "Step 3/3: Cancelling subscription...");
  verbose("Track:cancel", "URL:", url);
  verbose("Track:cancel", "Headers:", headers);
  verbose("Track:cancel", "Request body:", requestBody);
  logCurl("Track:cancel", "POST", url, headers, JSON.stringify(requestBody));

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  verbose("Track:cancel", "Response status:", res.status);
  verbose("Track:cancel", "Response content-type:", res.headers.get("content-type"));

  if (!res.ok) {
    const resBody = await res.text();
    error("Track:cancel", "Response body (error):", resBody.slice(0, 500));
    throw new TrackError(`Failed to cancel subscription: HTTP ${res.status} — ${resBody.slice(0, 200)}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  verbose("Track:cancel", "Response body:", JSON.stringify(data).slice(0, 800));

  if (data.success === false) {
    const errMsg = (data.message as string) || "unknown error";
    error("Track:cancel", "Cancel returned success:false:", errMsg);
    throw new TrackError(`Subscription cancel failed: ${errMsg}`);
  }

  log("Track:cancel", `SUCCESS — subscription ${sub.subscriptionId} cancelled for workspace ${workspaceId}`);
}

// ─── Update monthly credit allowance (for add-on units) ──────────────────────
export async function updateAddOnCredits(
  workspaceId: string,
  unitQuantity: number,
  tier: number
): Promise<void> {
  log("Track:addOn", `Updating add-on credits for workspace ${workspaceId}, units: ${unitQuantity}, tier: ${tier}`);
  verbose("Track:addOn", "TRACK_API_URL:", TRACK_BASE);
  verbose("Track:addOn", "TRACK_API_TOKEN:", TRACK_TOKEN ? `set (${TRACK_TOKEN.length} chars)` : "NOT SET");
  verbose("Track:addOn", `Each unit = ${CREDITS_PER_UNIT} credits/month`);

  if (!TRACK_TOKEN) {
    error("Track:addOn", "TRACK_API_TOKEN not configured — skipping");
    throw new TrackError("TRACK_API_TOKEN not configured");
  }

  // Step 1: Resolve externalId → customerId
  log("Track:addOn", "Step 1/4: Resolving workspace to customerId...");
  const customer = await resolveCustomerId(workspaceId);
  if (!customer) {
    error("Track:addOn", `Customer not found for workspace: ${workspaceId}`);
    throw new TrackError(`Customer not found for workspace ${workspaceId}`);
  }

  // Step 2: Get current subscription
  log("Track:addOn", `Step 2/4: Looking up subscription for customerId: ${customer.customerId}`);
  const sub = await getSubscriptionByCustomer(customer.customerId);
  if (!sub) {
    error("Track:addOn", `No subscription found for customerId: ${customer.customerId}`);
    throw new TrackError(`No subscription found for customer ${customer.customerId}`);
  }

  // Step 3: Get the base plan's creditAllowance
  log("Track:addOn", `Step 3/4: Fetching base plan: ${sub.planId}`);
  const baseCreditAllowance = await getPlanCreditAllowance(sub.planId);

  // Step 4: Calculate and update
  const addOnCredits = unitQuantity * CREDITS_PER_UNIT;
  const newCreditAllowance = baseCreditAllowance + addOnCredits;
  log("Track:addOn", "Step 4/4: Updating subscription...");
  verbose("Track:addOn", "Credit calculation:", {
    basePlanCredits: baseCreditAllowance,
    addOnUnits: unitQuantity,
    addOnCredits: `${unitQuantity} × ${CREDITS_PER_UNIT} = ${addOnCredits}`,
    newTotalAllowance: newCreditAllowance,
  });

  await updateSubscriptionCreditAllowance(sub.subscriptionId, newCreditAllowance);

  log("Track:addOn", `SUCCESS — monthly credit allowance updated to ${newCreditAllowance}`);
}
