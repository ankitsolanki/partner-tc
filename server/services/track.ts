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

/**
 * Fetch the active subscription for a workspace (customer) from tiny-track.
 * Returns the subscription object including entitlements and planId.
 */
async function getSubscriptionByCustomer(
  workspaceId: string
): Promise<{ subscriptionId: string; planId: string; creditAllowance: number } | null> {
  const url = `${TRACK_BASE}/api/subscription/customer/${workspaceId}`;
  console.log("[Track:getSub] GET", url);

  const res = await fetch(url, { headers: authHeaders() });
  console.log("[Track:getSub] Response status:", res.status);

  if (!res.ok) {
    const body = await res.text();
    console.log("[Track:getSub] Failed:", res.status, body.slice(0, 300));
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  console.log("[Track:getSub] Response:", JSON.stringify(data).slice(0, 500));

  // The response shape is { success: true, data: { _id, planId, entitlements, ... } }
  const sub = (data.data ?? data) as Record<string, unknown>;
  const subscriptionId = (sub._id ?? sub.id) as string | undefined;
  const planId = sub.planId as string | undefined;
  const entitlements = sub.entitlements as Record<string, unknown> | undefined;
  const creditAllowance = (entitlements?.creditAllowance as number) ?? 0;

  if (!subscriptionId || !planId) {
    console.log("[Track:getSub] No subscription found for workspace:", workspaceId);
    return null;
  }

  console.log("[Track:getSub] Found subscription:", { subscriptionId, planId, creditAllowance });
  return { subscriptionId, planId, creditAllowance };
}

/**
 * Fetch a plan from tiny-track to get its base creditAllowance.
 */
async function getPlanCreditAllowance(planId: string): Promise<number> {
  const url = `${TRACK_BASE}/api/subscription/plans/${planId}`;
  console.log("[Track:getPlan] GET", url);

  const res = await fetch(url, { headers: authHeaders() });
  console.log("[Track:getPlan] Response status:", res.status);

  if (!res.ok) {
    const body = await res.text();
    console.error("[Track:getPlan] Failed:", res.status, body.slice(0, 300));
    throw new TrackError(`Failed to fetch plan ${planId}: HTTP ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const plan = (data.data ?? data) as Record<string, unknown>;
  const creditAllowance = (plan.creditAllowance as number) ?? 0;

  console.log("[Track:getPlan] Plan creditAllowance:", creditAllowance);
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
  const body = {
    entitlements: {
      creditAllowance: newCreditAllowance,
    },
  };

  console.log("[Track:updateSub] PUT", url);
  console.log("[Track:updateSub] Body:", JSON.stringify(body));

  const res = await fetch(url, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  console.log("[Track:updateSub] Response status:", res.status);

  if (!res.ok) {
    const resBody = await res.text();
    console.error("[Track:updateSub] Failed:", res.status, resBody.slice(0, 500));
    throw new TrackError(`Failed to update subscription: HTTP ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  console.log("[Track:updateSub] Response:", JSON.stringify(data).slice(0, 500));

  if (data.success === false) {
    throw new TrackError(`Subscription update failed: ${(data.message as string) || "unknown error"}`);
  }

  console.log("[Track:updateSub] SUCCESS — creditAllowance set to", newCreditAllowance);
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
 *
 * @param workspaceId  Heimdall workspace ID = customerId in tiny-track
 * @param unitQuantity Number of add-on units (each = 50,000 credits/month)
 * @param tier         For logging context
 */
export async function updateAddOnCredits(
  workspaceId: string,
  unitQuantity: number,
  tier: number
): Promise<void> {
  console.log("[Track:addOn] ─── Updating add-on credit allowance ───");
  console.log("[Track:addOn] Workspace:", workspaceId);
  console.log("[Track:addOn] Unit quantity:", unitQuantity, "(each =", CREDITS_PER_UNIT, "credits/month)");
  console.log("[Track:addOn] Tier:", tier);

  if (!TRACK_TOKEN) {
    console.error("[Track:addOn] TRACK_API_TOKEN not configured — skipping");
    throw new TrackError("TRACK_API_TOKEN not configured");
  }

  // 1. Get current subscription
  const sub = await getSubscriptionByCustomer(workspaceId);
  if (!sub) {
    console.error("[Track:addOn] No subscription found for workspace:", workspaceId);
    throw new TrackError(`No subscription found for workspace ${workspaceId}`);
  }

  // 2. Get the base plan's creditAllowance
  const baseCreditAllowance = await getPlanCreditAllowance(sub.planId);

  // 3. Calculate new total
  const addOnCredits = unitQuantity * CREDITS_PER_UNIT;
  const newCreditAllowance = baseCreditAllowance + addOnCredits;
  console.log("[Track:addOn] Credit calculation:", {
    basePlan: baseCreditAllowance,
    addOn: `${unitQuantity} × ${CREDITS_PER_UNIT} = ${addOnCredits}`,
    newTotal: newCreditAllowance,
  });

  // 4. Update the subscription
  await updateSubscriptionCreditAllowance(sub.subscriptionId, newCreditAllowance);

  console.log("[Track:addOn] ─── SUCCESS — monthly credit allowance updated to", newCreditAllowance, "───");
}
