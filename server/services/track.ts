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

/**
 * Fetch the active subscription for a workspace (customer) from tiny-track.
 * Returns the subscription object including entitlements and planId.
 */
async function getSubscriptionByCustomer(
  workspaceId: string
): Promise<{ subscriptionId: string; planId: string; creditAllowance: number } | null> {
  const url = `${TRACK_BASE}/api/subscription/customer/${workspaceId}`;
  const headers = authHeaders();

  console.log("[Track:getSub] ─── GET Subscription by Customer ───");
  console.log("[Track:getSub] URL:", url);
  console.log("[Track:getSub] Method: GET");
  console.log("[Track:getSub] Headers:", JSON.stringify({
    "Content-Type": headers["Content-Type"],
    Authorization: headers.Authorization ? `Bearer ${headers.Authorization.replace("Bearer ", "").slice(0, 20)}...` : "NOT SET",
  }));

  const res = await fetch(url, { headers });

  console.log("[Track:getSub] Response status:", res.status);
  console.log("[Track:getSub] Response headers content-type:", res.headers.get("content-type"));

  if (!res.ok) {
    const body = await res.text();
    console.log("[Track:getSub] Response body (error):", body.slice(0, 500));
    console.log("[Track:getSub] FAILED — returning null (no subscription found)");
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  console.log("[Track:getSub] Response body:", JSON.stringify(data).slice(0, 800));

  // The response shape is { success: true, data: { _id, planId, entitlements, ... } }
  const sub = (data.data ?? data) as Record<string, unknown>;
  const subscriptionId = (sub._id ?? sub.id) as string | undefined;
  const planId = sub.planId as string | undefined;
  const entitlements = sub.entitlements as Record<string, unknown> | undefined;
  const creditAllowance = (entitlements?.creditAllowance as number) ?? 0;

  console.log("[Track:getSub] Parsed:", {
    subscriptionId: subscriptionId ?? "MISSING",
    planId: planId ?? "MISSING",
    creditAllowance,
    entitlements: entitlements ? JSON.stringify(entitlements).slice(0, 300) : "MISSING",
  });

  if (!subscriptionId || !planId) {
    console.log("[Track:getSub] No valid subscription in response for workspace:", workspaceId);
    return null;
  }

  console.log("[Track:getSub] ─── SUCCESS ───");
  return { subscriptionId, planId, creditAllowance };
}

/**
 * Fetch a plan from tiny-track to get its base creditAllowance.
 */
async function getPlanCreditAllowance(planId: string): Promise<number> {
  const url = `${TRACK_BASE}/api/subscription/plans/${planId}`;
  const headers = authHeaders();

  console.log("[Track:getPlan] ─── GET Plan ───");
  console.log("[Track:getPlan] URL:", url);
  console.log("[Track:getPlan] Method: GET");
  console.log("[Track:getPlan] Headers:", JSON.stringify({
    "Content-Type": headers["Content-Type"],
    Authorization: headers.Authorization ? `Bearer ${headers.Authorization.replace("Bearer ", "").slice(0, 20)}...` : "NOT SET",
  }));

  const res = await fetch(url, { headers });

  console.log("[Track:getPlan] Response status:", res.status);
  console.log("[Track:getPlan] Response headers content-type:", res.headers.get("content-type"));

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

/**
 * Update a subscription's entitlements.creditAllowance in tiny-track.
 */
async function updateSubscriptionCreditAllowance(
  subscriptionId: string,
  newCreditAllowance: number
): Promise<void> {
  const url = `${TRACK_BASE}/api/subscription/${subscriptionId}`;
  const headers = authHeaders();
  const requestBody = {
    entitlements: {
      creditAllowance: newCreditAllowance,
    },
  };

  console.log("[Track:updateSub] ─── PUT Update Subscription ───");
  console.log("[Track:updateSub] URL:", url);
  console.log("[Track:updateSub] Method: PUT");
  console.log("[Track:updateSub] Headers:", JSON.stringify({
    "Content-Type": headers["Content-Type"],
    Authorization: headers.Authorization ? `Bearer ${headers.Authorization.replace("Bearer ", "").slice(0, 20)}...` : "NOT SET",
  }));
  console.log("[Track:updateSub] Request body:", JSON.stringify(requestBody));

  const res = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(requestBody),
  });

  console.log("[Track:updateSub] Response status:", res.status);
  console.log("[Track:updateSub] Response headers content-type:", res.headers.get("content-type"));

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

/**
 * Cancel a subscription in tiny-track (used when AppSumo deactivates/refunds a license).
 * Uses cancelType "immediate" so credits stop right away.
 */
export async function cancelSubscription(
  workspaceId: string,
  reason: string
): Promise<void> {
  console.log("[Track:cancel] ═══════════════════════════════════════");
  console.log("[Track:cancel] Cancelling subscription");
  console.log("[Track:cancel] Workspace (customerId):", workspaceId);
  console.log("[Track:cancel] Reason:", reason);
  logConfig();

  if (!TRACK_TOKEN) {
    console.error("[Track:cancel] TRACK_API_TOKEN not configured — skipping subscription cancel");
    throw new TrackError("TRACK_API_TOKEN not configured");
  }

  // 1. Find the subscription by customer (workspace) ID
  console.log("[Track:cancel] Step 1/2: Looking up subscription...");
  const sub = await getSubscriptionByCustomer(workspaceId);
  if (!sub) {
    console.log("[Track:cancel] No subscription found for workspace:", workspaceId, "— nothing to cancel");
    console.log("[Track:cancel] ═══════════════════════════════════════");
    return;
  }
  console.log("[Track:cancel] Found subscription:", sub.subscriptionId, "| plan:", sub.planId, "| creditAllowance:", sub.creditAllowance);

  // 2. Cancel the subscription immediately
  const url = `${TRACK_BASE}/api/subscription/${sub.subscriptionId}/cancel`;
  const headers = authHeaders();
  const requestBody = {
    reason,
    cancelType: "immediate",
  };

  console.log("[Track:cancel] Step 2/2: Cancelling subscription...");
  console.log("[Track:cancel] URL:", url);
  console.log("[Track:cancel] Method: POST");
  console.log("[Track:cancel] Headers:", JSON.stringify({
    "Content-Type": headers["Content-Type"],
    Authorization: headers.Authorization ? `Bearer ${headers.Authorization.replace("Bearer ", "").slice(0, 20)}...` : "NOT SET",
  }));
  console.log("[Track:cancel] Request body:", JSON.stringify(requestBody));

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  console.log("[Track:cancel] Response status:", res.status);
  console.log("[Track:cancel] Response headers content-type:", res.headers.get("content-type"));

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

/**
 * Update the monthly credit allowance for a workspace after an AppSumo add-on change.
 *
 * Flow:
 * 1. Fetch the subscription by workspace (customer) ID
 * 2. Fetch the base plan to get its creditAllowance
 * 3. Calculate new total: basePlanCredits + (unitQuantity × 50,000)
 * 4. Update the subscription's entitlements.creditAllowance
 * 5. Tiny-track's cron automatically applies this on the next monthly reset
 */
export async function updateAddOnCredits(
  workspaceId: string,
  unitQuantity: number,
  tier: number
): Promise<void> {
  console.log("[Track:addOn] ═══════════════════════════════════════");
  console.log("[Track:addOn] Updating add-on credit allowance");
  console.log("[Track:addOn] Workspace:", workspaceId);
  console.log("[Track:addOn] Unit quantity:", unitQuantity, "(each =", CREDITS_PER_UNIT, "credits/month)");
  console.log("[Track:addOn] Tier:", tier);
  logConfig();

  if (!TRACK_TOKEN) {
    console.error("[Track:addOn] TRACK_API_TOKEN not configured — skipping");
    throw new TrackError("TRACK_API_TOKEN not configured");
  }

  // 1. Get current subscription
  console.log("[Track:addOn] Step 1/3: Looking up subscription...");
  const sub = await getSubscriptionByCustomer(workspaceId);
  if (!sub) {
    console.error("[Track:addOn] No subscription found for workspace:", workspaceId);
    throw new TrackError(`No subscription found for workspace ${workspaceId}`);
  }

  // 2. Get the base plan's creditAllowance
  console.log("[Track:addOn] Step 2/3: Fetching base plan...");
  const baseCreditAllowance = await getPlanCreditAllowance(sub.planId);

  // 3. Calculate new total
  const addOnCredits = unitQuantity * CREDITS_PER_UNIT;
  const newCreditAllowance = baseCreditAllowance + addOnCredits;
  console.log("[Track:addOn] Step 3/3: Updating subscription...");
  console.log("[Track:addOn] Credit calculation:", {
    basePlanCredits: baseCreditAllowance,
    addOnUnits: unitQuantity,
    addOnCredits: `${unitQuantity} × ${CREDITS_PER_UNIT} = ${addOnCredits}`,
    newTotalAllowance: newCreditAllowance,
  });

  // 4. Update the subscription
  await updateSubscriptionCreditAllowance(sub.subscriptionId, newCreditAllowance);

  console.log("[Track:addOn] ═══════════════════════════════════════");
  console.log("[Track:addOn] SUCCESS — monthly credit allowance updated to", newCreditAllowance);
}
