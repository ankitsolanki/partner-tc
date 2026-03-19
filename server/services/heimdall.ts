import { randomBytes } from "crypto";

const HEIMDALL_BASE = process.env.HEIMDALL_API_URL || "https://heimdallapi.tinycommand.com";

const PLAN_ID_MAP: Record<number, string> = {
  1: "e602e61d-7eec-45f0-8a17-405173947090",
  2: "82480e8b-8b70-4939-bf0f-6b50b069bb88",
  3: "d80c78c8-1634-4548-9eab-88daf6dc225c",
  4: "737aaec7-380d-4279-8b49-16c651f10d17",
};

const PLAN_TYPE_MAP: Record<number, string> = {
  1: "appsumo_tier_1",
  2: "appsumo_tier_2",
  3: "appsumo_tier_3",
  4: "appsumo_tier_4",
};

export class HeimdallError extends Error {
  step: string;
  constructor(step: string, message: string) {
    super(message);
    this.name = "HeimdallError";
    this.step = step;
  }
}

export interface ProvisioningResult {
  heimdallUserId: string;
  heimdallWorkspaceId: string;
  isNewUser: boolean;
}

// ─── Step 1: Register user on Keycloak ────────────────────────────────────────
async function registerKeycloakUser(
  email: string,
  firstName: string,
  lastName: string,
  password: string
): Promise<{ alreadyExisted: boolean }> {
  const url = `${HEIMDALL_BASE}/service/public/v0/external/keycloak/admin/register-user`;

  console.log("[Heimdall:1-register] ─── Registering user on Keycloak ───");
  console.log("[Heimdall:1-register] URL:", url);
  console.log("[Heimdall:1-register] Email:", email);
  console.log("[Heimdall:1-register] Name:", firstName, lastName);

  const requestBody = {
    email,
    firstName,
    lastName,
    enabled: true,
    emailVerified: false,
    credentials: [
      {
        type: "password",
        value: password,
        temporary: false,
      },
    ],
  };
  console.log("[Heimdall:1-register] Request body (password redacted):", JSON.stringify({ ...requestBody, credentials: "[REDACTED]" }));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  console.log("[Heimdall:1-register] Response status:", res.status);

  if (res.status === 409) {
    console.log("[Heimdall:1-register] User already exists on Keycloak (HTTP 409) — continuing");
    return { alreadyExisted: true };
  }

  const responseBody = await res.text();
  console.log("[Heimdall:1-register] Response body:", responseBody);

  // Heimdall wraps errors in HTTP 200 with status:"failed"
  try {
    const parsed = JSON.parse(responseBody);
    if (parsed.status === "failed") {
      const errorMsg = parsed.result?.error?.errorMessage || parsed.result?.message || "";
      console.log("[Heimdall:1-register] Heimdall returned status:failed. Error:", errorMsg);
      if (errorMsg.toLowerCase().includes("user exists") || parsed.result?.error?.status_code === 409) {
        console.log("[Heimdall:1-register] User already exists (detected from response body) — continuing");
        return { alreadyExisted: true };
      }
      throw new HeimdallError("register", `Keycloak register failed: ${errorMsg}`);
    }
  } catch (e) {
    if (e instanceof HeimdallError) throw e;
    // Not JSON or parse error — continue
  }

  if (!res.ok) {
    console.error("[Heimdall:1-register] FAILED:", res.status, responseBody);
    throw new HeimdallError("register", `Failed to register user on Keycloak: ${res.status}`);
  }

  console.log("[Heimdall:1-register] SUCCESS — user created");
  return { alreadyExisted: false };
}

// ─── Step 2: Add/upsert user in Heimdall MongoDB ─────────────────────────────
export async function addHeimdallUser(
  email: string,
  firstName: string,
  lastName: string
): Promise<{ token: string; userId: string }> {
  const url = `${HEIMDALL_BASE}/service/v0/user/add`;

  console.log("[Heimdall:2-addUser] ─── Adding user to Heimdall MongoDB ───");
  console.log("[Heimdall:2-addUser] URL:", url);

  const requestBody = {
    email_id: email,
    name: `${firstName} ${lastName}`,
    first_name: firstName,
    last_name: lastName,
  };
  console.log("[Heimdall:2-addUser] Request body:", JSON.stringify(requestBody));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  console.log("[Heimdall:2-addUser] Response status:", res.status);

  if (!res.ok) {
    const body = await res.text();
    console.error("[Heimdall:2-addUser] FAILED:", res.status, body);
    throw new HeimdallError("add_user", `Failed to add user to Heimdall: ${res.status} — ${body}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  console.log("[Heimdall:2-addUser] Response keys:", Object.keys(data));
  console.log("[Heimdall:2-addUser] Full response:", JSON.stringify(data).slice(0, 500));

  const result = data.result as Record<string, unknown> | undefined;

  console.log("[Heimdall:2-addUser] Result object keys:", result ? Object.keys(result) : "NO RESULT");

  // Token can be at data.token OR data.result.token (Heimdall nests it inside result)
  const token = (data.token ?? result?.token) as string | undefined;
  const userId = (result?._id ?? result?.id ?? data._id ?? data.id) as string | undefined;

  console.log("[Heimdall:2-addUser] Token present:", !!token, "| found at:", data.token ? "data.token" : result?.token ? "result.token" : "NOWHERE");
  console.log("[Heimdall:2-addUser] Extracted userId:", userId);

  if (!token) {
    console.error("[Heimdall:2-addUser] No token in response! Full data:", JSON.stringify(data));
    throw new HeimdallError("add_user", "No token returned from Heimdall user/add");
  }

  if (!userId) {
    console.error("[Heimdall:2-addUser] No user ID in response! Full data:", JSON.stringify(data));
    throw new HeimdallError("add_user", "No user ID returned from Heimdall user/add");
  }

  console.log("[Heimdall:2-addUser] SUCCESS:", { userId, email, tokenLength: token.length });
  return { token, userId };
}

// ─── Step 3: Find root workspace ──────────────────────────────────────────────
async function findRootWorkspace(
  ownerId: string,
  token: string
): Promise<string | null> {
  const params = new URLSearchParams({ owner_id: ownerId, return_root: "true" });
  const url = `${HEIMDALL_BASE}/service/v0/workspace/find/one?${params.toString()}`;

  console.log("[Heimdall:3-findWorkspace] ─── Finding root workspace ───");
  console.log("[Heimdall:3-findWorkspace] URL:", url);
  console.log("[Heimdall:3-findWorkspace] Owner ID:", ownerId);
  console.log("[Heimdall:3-findWorkspace] Token (first 20):", token.slice(0, 20) + "...");

  const res = await fetch(url, {
    method: "GET",
    headers: { token },
  });

  console.log("[Heimdall:3-findWorkspace] Response status:", res.status);

  if (!res.ok) {
    const body = await res.text();
    console.log("[Heimdall:3-findWorkspace] Not OK:", res.status, body);
    if (res.status === 404) {
      console.log("[Heimdall:3-findWorkspace] No workspace found (404) — will create new");
      return null;
    }
    console.error("[Heimdall:3-findWorkspace] Unexpected error — will create new workspace");
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  const result = data.result as Record<string, unknown> | undefined;
  console.log("[Heimdall:3-findWorkspace] Response keys:", Object.keys(data));
  console.log("[Heimdall:3-findWorkspace] Full response:", JSON.stringify(data).slice(0, 500));

  // Heimdall returns 200 with status:"failed" when no workspace found
  if (data.status === "failed") {
    console.log("[Heimdall:3-findWorkspace] Heimdall returned status:failed —", result?.message || "no workspace");
    return null;
  }

  const workspaceId = (result?._id ?? result?.id ?? data._id ?? data.id) as string | undefined;

  if (!workspaceId) {
    console.log("[Heimdall:3-findWorkspace] No workspace ID in response — will create new");
    return null;
  }

  console.log("[Heimdall:3-findWorkspace] SUCCESS — found workspace:", workspaceId);
  return workspaceId;
}

// ─── Step 4: Add workspace with plan ──────────────────────────────────────────
async function addWorkspacePlan(
  token: string,
  params: {
    workspaceId: string | null;
    ownerId: string;
    workspaceName: string;
    licenseKey: string;
    planId: string;
    planType: string;
  }
): Promise<string> {
  const url = `${HEIMDALL_BASE}/service/v0/workspace/add`;

  console.log("[Heimdall:4-addWorkspace] ─── Adding workspace/plan ───");
  console.log("[Heimdall:4-addWorkspace] URL:", url);
  console.log("[Heimdall:4-addWorkspace] Mode:", params.workspaceId ? "UPDATE existing" : "CREATE new");

  const body: Record<string, unknown> = {
    owner_id: params.ownerId,
    name: params.workspaceName,
    license_code: params.licenseKey,
    license_provider: "appsumo",
    plan_id: params.planId,
    type: params.planType,
  };

  if (params.workspaceId) {
    body._id = params.workspaceId;
  }

  console.log("[Heimdall:4-addWorkspace] Request body:", JSON.stringify(body));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify(body),
  });

  console.log("[Heimdall:4-addWorkspace] Response status:", res.status);

  if (!res.ok) {
    const resBody = await res.text();
    console.error("[Heimdall:4-addWorkspace] FAILED:", res.status, resBody);
    throw new HeimdallError("add_workspace", `Failed to add workspace/plan: ${res.status} — ${resBody}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const result = data.result as Record<string, unknown> | undefined;
  console.log("[Heimdall:4-addWorkspace] Response keys:", Object.keys(data));
  console.log("[Heimdall:4-addWorkspace] Full response:", JSON.stringify(data).slice(0, 500));

  if (data.status === "failed") {
    const errMsg = (result?.message as string) || "Unknown error";
    console.error("[Heimdall:4-addWorkspace] Heimdall returned status:failed:", errMsg);
    throw new HeimdallError("add_workspace", `Heimdall workspace/add failed: ${errMsg}`);
  }

  // Workspace ID is nested inside result
  const workspaceId = (result?._id ?? result?.id ?? data._id ?? data.id) as string | undefined;

  if (!workspaceId) {
    console.error("[Heimdall:4-addWorkspace] No workspace ID in response:", JSON.stringify(data));
    throw new HeimdallError("add_workspace", "No workspace ID returned from Heimdall");
  }

  console.log("[Heimdall:4-addWorkspace] SUCCESS — workspace:", workspaceId);
  return workspaceId;
}

// ─── Step 5: Trigger forgot password email ────────────────────────────────────
async function triggerForgotPassword(email: string): Promise<void> {
  const url = `${HEIMDALL_BASE}/service/public/v0/user/forgot/password`;

  console.log("[Heimdall:5-forgotPwd] ─── Triggering forgot password ───");
  console.log("[Heimdall:5-forgotPwd] URL:", url);
  console.log("[Heimdall:5-forgotPwd] Email:", email);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email_id: email }),
  });

  console.log("[Heimdall:5-forgotPwd] Response status:", res.status);

  if (!res.ok) {
    const body = await res.text();
    console.error("[Heimdall:5-forgotPwd] FAILED (non-critical):", res.status, body);
  } else {
    const body = await res.text();
    console.log("[Heimdall:5-forgotPwd] SUCCESS:", body.slice(0, 200));
  }
}

// ─── Service token (for webhook-triggered plan updates) ───────────────────────
export async function getServiceToken(): Promise<string> {
  const url = `${HEIMDALL_BASE}/service/v0/get/signed/token`;

  console.log("[Heimdall:serviceToken] Getting service token from:", url);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      app_id: "digihealth-admin-token-creator",
      secret: "hockeystick",
    },
  });

  console.log("[Heimdall:serviceToken] Response status:", res.status);

  if (!res.ok) {
    const body = await res.text();
    console.error("[Heimdall:serviceToken] FAILED:", res.status, body);
    throw new HeimdallError("service_token", `Failed to get service token: ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const result = data.result as Record<string, unknown> | undefined;
  const token = (data.token ?? result?.token ?? data.access_token ?? result?.access_token) as string | undefined;

  if (!token) {
    console.error("[Heimdall:serviceToken] No token in response:", JSON.stringify(data));
    throw new HeimdallError("service_token", "No token in service token response");
  }

  console.log("[Heimdall:serviceToken] SUCCESS — token length:", token.length, "| found at:", data.token ? "data.token" : "result.token");
  return token;
}

// ─── Update workspace plan (for webhooks) ─────────────────────────────────────
// Service token doesn't have workspace permissions, so we get a user token
// via user/add (upsert) using the redeemer's email, then use that to update.
export async function updateWorkspacePlanForUser(
  workspaceId: string,
  tier: number,
  licenseKey: string,
  redeemerEmail: string
): Promise<void> {
  console.log("[Heimdall:updatePlan] ─── Updating workspace plan ───");
  console.log("[Heimdall:updatePlan] Workspace:", workspaceId);
  console.log("[Heimdall:updatePlan] Tier:", tier, "| License:", licenseKey.slice(0, 8) + "...");
  console.log("[Heimdall:updatePlan] Redeemer email:", redeemerEmail);

  const planId = PLAN_ID_MAP[tier];
  const planType = PLAN_TYPE_MAP[tier];
  if (!planId || !planType) {
    console.error("[Heimdall:updatePlan] Unknown tier:", tier);
    return;
  }

  // Get a user token by calling user/add (upsert — won't create a new user)
  console.log("[Heimdall:updatePlan] Getting user token via user/add...");
  const { token } = await addHeimdallUser(redeemerEmail, "", "");
  console.log("[Heimdall:updatePlan] Got user token (length:", token.length, ")");

  const url = `${HEIMDALL_BASE}/service/v0/workspace/add`;
  const requestBody = {
    _id: workspaceId,
    license_code: licenseKey,
    license_provider: "appsumo",
    plan_id: planId,
    type: planType,
  };
  console.log("[Heimdall:updatePlan] Request body:", JSON.stringify(requestBody));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify(requestBody),
  });

  console.log("[Heimdall:updatePlan] Response status:", res.status);

  if (!res.ok) {
    const body = await res.text();
    console.error("[Heimdall:updatePlan] HTTP FAILED:", res.status, body);
    throw new HeimdallError("update_plan", `Failed to update workspace plan: ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  console.log("[Heimdall:updatePlan] Response:", JSON.stringify(data).slice(0, 500));

  if (data.status === "failed") {
    const result = data.result as Record<string, unknown> | undefined;
    const errMsg = (result?.message as string) || "Unknown error";
    console.error("[Heimdall:updatePlan] Heimdall returned status:failed:", errMsg);
    throw new HeimdallError("update_plan", `Heimdall workspace update failed: ${errMsg}`);
  }

  console.log("[Heimdall:updatePlan] SUCCESS — workspace plan updated:", { workspaceId, tier, planId });
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────
export async function provisionAccount(
  email: string,
  firstName: string,
  lastName: string,
  tier: number,
  licenseKey: string,
  password: string
): Promise<ProvisioningResult> {
  console.log("[Heimdall:provision] ════════════════════════════════════════");
  console.log("[Heimdall:provision] Starting account provisioning");
  console.log("[Heimdall:provision] Email:", email);
  console.log("[Heimdall:provision] Name:", firstName, lastName);
  console.log("[Heimdall:provision] Tier:", tier);
  console.log("[Heimdall:provision] License:", licenseKey.slice(0, 8) + "...");
  console.log("[Heimdall:provision] Password provided: YES (length:", password.length, ")");
  console.log("[Heimdall:provision] HEIMDALL_BASE:", HEIMDALL_BASE);
  console.log("[Heimdall:provision] ════════════════════════════════════════");

  const planId = PLAN_ID_MAP[tier];
  const planType = PLAN_TYPE_MAP[tier];
  if (!planId || !planType) {
    throw new HeimdallError("validation", `Unknown tier: ${tier}`);
  }
  console.log("[Heimdall:provision] Plan mapping:", { planId, planType });

  // Step 1: Register on Keycloak (using user-provided password)
  console.log("[Heimdall:provision] >>> Step 1/5: Register on Keycloak");
  const { alreadyExisted } = await registerKeycloakUser(email, firstName, lastName, password);
  console.log("[Heimdall:provision] <<< Step 1 done. alreadyExisted:", alreadyExisted);

  // Step 2: Add/upsert in Heimdall MongoDB
  console.log("[Heimdall:provision] >>> Step 2/5: Add user to Heimdall");
  const { token, userId } = await addHeimdallUser(email, firstName, lastName);
  console.log("[Heimdall:provision] <<< Step 2 done. userId:", userId);

  // Step 3: Find existing root workspace
  console.log("[Heimdall:provision] >>> Step 3/5: Find root workspace");
  const existingWorkspaceId = await findRootWorkspace(userId, token);
  console.log("[Heimdall:provision] <<< Step 3 done. existingWorkspaceId:", existingWorkspaceId ?? "NONE");

  // Step 4: Add/update workspace with plan
  console.log("[Heimdall:provision] >>> Step 4/5: Add workspace/plan");
  const workspaceName = firstName
    ? `${firstName}'s Workspace`
    : "Your Workspace";
  console.log("[Heimdall:provision] Workspace name:", workspaceName);

  const workspaceId = await addWorkspacePlan(token, {
    workspaceId: existingWorkspaceId,
    ownerId: userId,
    workspaceName,
    licenseKey,
    planId,
    planType,
  });
  console.log("[Heimdall:provision] <<< Step 4 done. workspaceId:", workspaceId);

  // Step 5: No longer needed — user provides their own password in the signup form
  console.log("[Heimdall:provision] >>> Step 5/5: SKIPPED (user set password in signup form)");

  console.log("[Heimdall:provision] ════════════════════════════════════════");
  console.log("[Heimdall:provision] PROVISIONING COMPLETE");
  console.log("[Heimdall:provision] userId:", userId);
  console.log("[Heimdall:provision] workspaceId:", workspaceId);
  console.log("[Heimdall:provision] isNewUser:", !alreadyExisted);
  console.log("[Heimdall:provision] ════════════════════════════════════════");

  return {
    heimdallUserId: userId,
    heimdallWorkspaceId: workspaceId,
    isNewUser: !alreadyExisted,
  };
}
