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

  console.log("[Heimdall] Registering user on Keycloak:", email);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
    }),
  });

  if (res.status === 409) {
    console.log("[Heimdall] User already exists on Keycloak:", email);
    return { alreadyExisted: true };
  }

  if (!res.ok) {
    const body = await res.text();
    console.error("[Heimdall] Keycloak register failed:", res.status, body);
    throw new HeimdallError("register", `Failed to register user on Keycloak: ${res.status}`);
  }

  console.log("[Heimdall] User registered on Keycloak:", email);
  return { alreadyExisted: false };
}

// ─── Step 2: Add/upsert user in Heimdall MongoDB ─────────────────────────────
async function addHeimdallUser(
  email: string,
  firstName: string,
  lastName: string
): Promise<{ token: string; userId: string }> {
  const url = `${HEIMDALL_BASE}/service/v0/user/add`;

  console.log("[Heimdall] Adding user to Heimdall:", email);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email_id: email,
      name: `${firstName} ${lastName}`,
      first_name: firstName,
      last_name: lastName,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[Heimdall] user/add failed:", res.status, body);
    throw new HeimdallError("add_user", `Failed to add user to Heimdall: ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const token = data.token as string;
  const result = data.result as Record<string, unknown> | undefined;
  const userId = (result?._id ?? result?.id ?? data._id ?? data.id) as string | undefined;

  if (!token) {
    console.error("[Heimdall] No token in user/add response:", data);
    throw new HeimdallError("add_user", "No token returned from Heimdall user/add");
  }

  if (!userId) {
    console.error("[Heimdall] No user ID in user/add response:", data);
    throw new HeimdallError("add_user", "No user ID returned from Heimdall user/add");
  }

  console.log("[Heimdall] User added/upserted:", { userId, email });
  return { token, userId };
}

// ─── Step 3: Find root workspace ──────────────────────────────────────────────
async function findRootWorkspace(
  ownerId: string,
  token: string
): Promise<string | null> {
  const params = new URLSearchParams({ owner_id: ownerId, return_root: "true" });
  const url = `${HEIMDALL_BASE}/service/v0/workspace/find/one?${params.toString()}`;

  console.log("[Heimdall] Finding root workspace for owner:", ownerId);

  const res = await fetch(url, {
    method: "GET",
    headers: { token },
  });

  if (!res.ok) {
    if (res.status === 404) {
      console.log("[Heimdall] No workspace found for owner:", ownerId);
      return null;
    }
    const body = await res.text();
    console.error("[Heimdall] workspace/find/one failed:", res.status, body);
    // Don't throw — we'll create a new workspace
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  const workspaceId = (data._id ?? data.id) as string | undefined;

  if (!workspaceId) {
    console.log("[Heimdall] Workspace response has no ID:", data);
    return null;
  }

  console.log("[Heimdall] Found root workspace:", workspaceId);
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

  console.log("[Heimdall] Adding workspace/plan:", {
    workspaceId: params.workspaceId ?? "NEW",
    planId: params.planId,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const resBody = await res.text();
    console.error("[Heimdall] workspace/add failed:", res.status, resBody);
    throw new HeimdallError("add_workspace", `Failed to add workspace/plan: ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const workspaceId = (data._id ?? data.id) as string | undefined;

  if (!workspaceId) {
    console.error("[Heimdall] No workspace ID in add response:", data);
    throw new HeimdallError("add_workspace", "No workspace ID returned from Heimdall");
  }

  console.log("[Heimdall] Workspace/plan created/updated:", workspaceId);
  return workspaceId;
}

// ─── Step 5: Trigger forgot password email ────────────────────────────────────
async function triggerForgotPassword(email: string): Promise<void> {
  const url = `${HEIMDALL_BASE}/service/public/v0/user/forgot/password`;

  console.log("[Heimdall] Triggering forgot password for:", email);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email_id: email }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[Heimdall] forgot/password failed:", res.status, body);
    // Non-critical — don't throw, just log
  } else {
    console.log("[Heimdall] Forgot password email sent for:", email);
  }
}

// ─── Service token (for webhook-triggered plan updates) ───────────────────────
export async function getServiceToken(): Promise<string> {
  const url = `${HEIMDALL_BASE}/service/v0/get/signed/token`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      app_id: "digihealth-admin-token-creator",
      secret: "hockeystick",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[Heimdall] get/signed/token failed:", res.status, body);
    throw new HeimdallError("service_token", `Failed to get service token: ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const token = (data.token ?? data.access_token) as string;

  if (!token) {
    throw new HeimdallError("service_token", "No token in service token response");
  }

  return token;
}

// ─── Update workspace plan via service token (for webhooks) ───────────────────
export async function updateWorkspacePlanViaService(
  workspaceId: string,
  tier: number,
  licenseKey: string
): Promise<void> {
  const planId = PLAN_ID_MAP[tier];
  const planType = PLAN_TYPE_MAP[tier];
  if (!planId || !planType) {
    console.error("[Heimdall] Unknown tier for plan update:", tier);
    return;
  }

  const token = await getServiceToken();
  const url = `${HEIMDALL_BASE}/service/v0/workspace/add`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({
      _id: workspaceId,
      license_code: licenseKey,
      license_provider: "appsumo",
      plan_id: planId,
      type: planType,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[Heimdall] Service workspace/add failed:", res.status, body);
    throw new HeimdallError("update_plan", `Failed to update workspace plan: ${res.status}`);
  }

  console.log("[Heimdall] Workspace plan updated via service token:", { workspaceId, tier });
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────
export async function provisionAccount(
  email: string,
  firstName: string,
  lastName: string,
  tier: number,
  licenseKey: string
): Promise<ProvisioningResult> {
  const planId = PLAN_ID_MAP[tier];
  const planType = PLAN_TYPE_MAP[tier];
  if (!planId || !planType) {
    throw new HeimdallError("validation", `Unknown tier: ${tier}`);
  }

  // Generate a random password for the Keycloak account
  const password = randomBytes(18).toString("base64url");

  // Step 1: Register on Keycloak
  const { alreadyExisted } = await registerKeycloakUser(email, firstName, lastName, password);

  // Step 2: Add/upsert in Heimdall MongoDB
  const { token, userId } = await addHeimdallUser(email, firstName, lastName);

  // Step 3: Find existing root workspace
  const existingWorkspaceId = await findRootWorkspace(userId, token);

  // Step 4: Add/update workspace with plan
  const workspaceName = firstName
    ? `${firstName}'s Workspace`
    : "Your Workspace";

  const workspaceId = await addWorkspacePlan(token, {
    workspaceId: existingWorkspaceId,
    ownerId: userId,
    workspaceName,
    licenseKey,
    planId,
    planType,
  });

  // Step 5: For new users, send forgot password email so they can set their own
  if (!alreadyExisted) {
    await triggerForgotPassword(email);
  }

  return {
    heimdallUserId: userId,
    heimdallWorkspaceId: workspaceId,
    isNewUser: !alreadyExisted,
  };
}
